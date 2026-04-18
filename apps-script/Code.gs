/**
 * Google Apps Script para:
 * 1) Guardar pedidos por POST.
 * 2) Subir uno o varios archivos del pedido a Google Drive.
 *
 * Configuración:
 * - SHEET_ID: ID del Spreadsheet.
 * - DRIVE_FOLDER_ID: ID de la carpeta destino en Drive para los archivos.
 */

const SHEET_ID = "12rXU8RzKk3FvV7mxF7fGCjLlpecQmXr8zazRj3cEbPQ";
const ORDERS_SHEET = "orders";
const DRIVE_FOLDER_ID = "1FSVN4ads-CID2H19JN2u3H2EfnNetCWk";

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = getOrCreateSheet_(ss, ORDERS_SHEET);
    ensureOrdersHeader_(sh);

    const orderNumber = buildOrderNumber_(sh);
    const uploaded = uploadFilesToDrive_(body.uploadedFiles || [], orderNumber);
    const fileNames = uploaded.map((f) => f.name);
    const fileUrls = uploaded.map((f) => f.url);
    const fileIds = uploaded.map((f) => f.id);

    const firstItem = getFirstOrderItem_(body.orderItems);
    const customSize = firstItem && firstItem.customSize ? firstItem.customSize : null;

    sh.appendRow([
      body.createdAt || new Date().toISOString(),
      orderNumber,
      body.customer && body.customer.name ? body.customer.name : "",
      body.customer && body.customer.phone ? body.customer.phone : "",
      body.customer && body.customer.email ? body.customer.email : "",
      body.machine && body.machine.label ? body.machine.label : summarizeItems_(body.orderItems, "machine"),
      body.paper && body.paper.label ? body.paper.label : summarizeItems_(body.orderItems, "paper"),
      body.size && body.size.label ? body.size.label : summarizeItems_(body.orderItems, "size"),
      customSize && customSize.widthM ? customSize.widthM : "",
      customSize && customSize.heightM ? customSize.heightM : "",
      customSize && customSize.areaM2 ? customSize.areaM2 : "",
      body.sides && body.sides.label ? body.sides.label : summarizeItems_(body.orderItems, "sides"),
      JSON.stringify(getCoverageDistribution_(body)),
      body.pricing && body.pricing.totalSheets ? body.pricing.totalSheets : 0,
      body.pricing && body.pricing.subtotal ? body.pricing.subtotal : 0,
      body.pricing && body.pricing.discountRate ? body.pricing.discountRate : 0,
      body.pricing && body.pricing.discountAmount ? body.pricing.discountAmount : 0,
      body.pricing && body.pricing.total ? body.pricing.total : 0,
      body.payment && body.payment.label ? body.payment.label : "",
      "Pendiente",
      "Recibido",
      body.pickupDateTime || "",
      body.urgent ? "SI" : "NO",
      fileNames.join(" | "),
      fileUrls.join(" | "),
      fileIds.join(" | "),
      uploaded.length,
      body.notes || "",
      JSON.stringify(body)
    ]);

    const mailSent = sendOrderConfirmationEmail_(body, orderNumber);

    return jsonResponse({
      ok: true,
      message: "Pedido registrado correctamente.",
      orderNumber: orderNumber,
      fileUrls: fileUrls,
      mailSent: mailSent
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      message: "Error al guardar pedido.",
      detail: String(err)
    });
  }
}

function sendOrderConfirmationEmail_(body, orderNumber) {
  const customer = body && body.customer ? body.customer : {};
  const email = String(customer.email || "").trim();
  if (!email) {
    return false;
  }

  const customerName = String(customer.name || "Cliente").trim();
  const total = body && body.pricing && body.pricing.total ? body.pricing.total : 0;
  const totalSheets = body && body.pricing && body.pricing.totalSheets ? body.pricing.totalSheets : 0;
  const paymentLabel = body && body.payment && body.payment.label ? body.payment.label : "-";
  const pickup = body && body.pickupDateTime ? body.pickupDateTime : "Sin fecha/hora (trabajo urgente)";
  const fileNames = Array.isArray(body.fileNames) ? body.fileNames : [];
  const filesText = fileNames.length ? fileNames.join(", ") : "Sin detalle";

  const subject = `29 BIS - Confirmacion de pedido ${orderNumber}`;
  const textBody = [
    `Hola ${customerName},`,
    "",
    "Recibimos tu pedido correctamente.",
    `Numero de pedido: ${orderNumber}`,
    "",
    "Resumen:",
    `- Hojas totales: ${totalSheets}`,
    `- Total estimado: $ ${formatNumber_(total)}`,
    `- Forma de pago: ${paymentLabel}`,
    `- Retiro: ${pickup}`,
    `- Archivos: ${filesText}`,
    "",
    "Si abonaste por transferencia, envia el comprobante a pedidos@29bis.com.ar indicando el numero de pedido.",
    "",
    "Gracias por elegir 29 BIS."
  ].join("\n");

  const htmlBody = [
    `<p>Hola <strong>${escapeHtml_(customerName)}</strong>,</p>`,
    "<p>Recibimos tu pedido correctamente.</p>",
    `<p><strong>Numero de pedido:</strong> ${escapeHtml_(orderNumber)}</p>`,
    "<p><strong>Resumen:</strong></p>",
    "<ul>",
    `<li>Hojas totales: ${escapeHtml_(String(totalSheets))}</li>`,
    `<li>Total estimado: $ ${escapeHtml_(formatNumber_(total))}</li>`,
    `<li>Forma de pago: ${escapeHtml_(paymentLabel)}</li>`,
    `<li>Retiro: ${escapeHtml_(pickup)}</li>`,
    `<li>Archivos: ${escapeHtml_(filesText)}</li>`,
    "</ul>",
    "<p>Si abonaste por transferencia, envia el comprobante a <strong>pedidos@29bis.com.ar</strong> indicando el numero de pedido.</p>",
    "<p>Gracias por elegir 29 BIS.</p>"
  ].join("");

  try {
    GmailApp.sendEmail(email, subject, textBody, { htmlBody: htmlBody });
    return true;
  } catch (err) {
    return false;
  }
}

function uploadFilesToDrive_(uploadedFiles, orderNumber) {
  if (!uploadedFiles || !uploadedFiles.length) {
    return [];
  }
  if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID.indexOf("REEMPLAZAR_") === 0) {
    throw new Error("Configurá DRIVE_FOLDER_ID antes de usar subida de archivos.");
  }

  const rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const safeOrderNumber = String(orderNumber || "pedido").replace(/[^\w-]/g, "_");
  const monthFolderName = buildMonthFolderName_(orderNumber);
  const monthFolder = getOrCreateSubfolder_(rootFolder, monthFolderName);
  const orderFolder = getOrCreateSubfolder_(monthFolder, safeOrderNumber);
  const output = [];

  uploadedFiles.forEach((fileObj, index) => {
    const base64 = String(fileObj.base64 || "").trim();
    const name = String(fileObj.name || `archivo_${index + 1}`);
    const mimeType = String(fileObj.mimeType || "application/octet-stream");
    if (!base64) {
      return;
    }

    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, name);
    const created = orderFolder.createFile(blob);

    output.push({
      id: created.getId(),
      url: created.getUrl(),
      name: name,
      mimeType: mimeType,
      sizeBytes: Number(fileObj.sizeBytes || 0)
    });
  });

  return output;
}

function getOrCreateSubfolder_(parentFolder, folderName) {
  const existing = parentFolder.getFoldersByName(folderName);
  if (existing.hasNext()) {
    return existing.next();
  }
  return parentFolder.createFolder(folderName);
}

function buildMonthFolderName_(orderNumber) {
  const raw = String(orderNumber || "");
  const match = raw.match(/29BIS-(\d{4})(\d{2})\d{2}-\d+/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
}

function summarizeItems_(items, key) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return "";
  }
  const values = list.map((item) => {
    if (key === "machine") {
      return (item.machine && item.machine.label) || "";
    }
    if (key === "paper") {
      return (item.paper && item.paper.label) || "";
    }
    if (key === "size") {
      return (item.size && item.size.label) || "";
    }
    if (key === "sides") {
      return (item.sides && item.sides.label) || "N/A";
    }
    return "";
  }).filter((v) => String(v || "").trim());

  return uniqueValues_(values).join(" | ");
}

function getFirstOrderItem_(items) {
  if (!Array.isArray(items) || !items.length) {
    return null;
  }
  return items[0];
}

function getCoverageDistribution_(body) {
  if (Array.isArray(body.coverageDistribution) && body.coverageDistribution.length) {
    return body.coverageDistribution;
  }
  if (!Array.isArray(body.orderItems)) {
    return [];
  }
  const rows = [];
  body.orderItems.forEach((item, i) => {
    const dist = Array.isArray(item.coverageDistribution) ? item.coverageDistribution : [];
    dist.forEach((d) => {
      rows.push({
        work: i + 1,
        coverage: d.coverage || "",
        label: d.label || "",
        sheets: Number(d.sheets || 0)
      });
    });
  });
  return rows;
}

function buildOrderNumber_(sheet) {
  const next = Math.max(2, sheet.getLastRow() + 1) - 1;
  return `29BIS-${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd")}-${pad_(next, 4)}`;
}

function pad_(num, size) {
  let value = String(num);
  while (value.length < size) {
    value = `0${value}`;
  }
  return value;
}

function formatNumber_(value) {
  return String(Math.round(Number(value || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureOrdersHeader_(sheet) {
  if (sheet.getLastRow() > 0) {
    return;
  }
  sheet.appendRow([
    "fecha y hora de creacion",
    "numero de pedido",
    "nombre del cliente",
    "telefono",
    "email",
    "tipo de impresion",
    "tipo de papel",
    "tamano",
    "ancho personalizado (m)",
    "alto personalizado (m)",
    "area personalizada (m2)",
    "faz",
    "distribucion de cobertura",
    "cantidad total de hojas",
    "subtotal",
    "porcentaje de descuento",
    "monto de descuento",
    "total",
    "forma de pago",
    "estado de pago",
    "estado de produccion",
    "fecha y hora de retiro",
    "es urgente",
    "nombre de archivos",
    "links de archivos",
    "ids de archivos",
    "cantidad de archivos",
    "observaciones",
    "datos tecnicos",
    "prioridad interna",
    "asignado a",
    "fecha cambio de estado",
    "cliente notificado"
  ]);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet_(ss, name) {
  const existing = ss.getSheetByName(name);
  return existing || ss.insertSheet(name);
}

function uniqueValues_(values) {
  const seen = {};
  const output = [];
  (values || []).forEach((raw) => {
    const value = String(raw || "").trim();
    if (!value) {
      return;
    }
    const key = value.toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      output.push(value);
    }
  });
  return output;
}
