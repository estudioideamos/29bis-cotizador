/**
 * Google Apps Script para:
 * 1) Guardar pedidos por POST.
 * 2) Subir uno o varios archivos del pedido a Google Drive.
 *
 * ConfiguraciÃ³n:
 * - SHEET_ID: ID del Spreadsheet.
 * - DRIVE_FOLDER_ID: ID de la carpeta destino en Drive para los archivos.
 */

const SHEET_ID = "12rXU8RzKk3FvV7mxF7fGCjLlpecQmXr8zazRj3cEbPQ";
const ORDERS_SHEET = "orders";
const DRIVE_FOLDER_ID = "1FSVN4ads-CID2H19JN2u3H2EfnNetCWk";

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const customerEmail = String(body && body.customer && body.customer.email ? body.customer.email : "").trim();
    if (!customerEmail) {
      return jsonResponse({
        ok: false,
        message: "El email del cliente es obligatorio."
      });
    }
    if (!isValidEmail_(customerEmail)) {
      return jsonResponse({
        ok: false,
        message: `El email ingresado no es vÃ¡lido: ${customerEmail}`
      });
    }

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
    const createdAtDisplay = formatDateTimeAr_(body.createdAt) || formatDateTimeAr_(new Date()) || new Date().toISOString();
    const pickupDateTimeDisplay = formatDateTimeAr_(body.pickupDateTime);

    const mailResult = sendOrderConfirmationEmail_(body, orderNumber);

    sh.appendRow([
      createdAtDisplay,
      orderNumber,
      body.customer && body.customer.name ? body.customer.name : "",
      body.customer && body.customer.phone ? body.customer.phone : "",
      customerEmail,
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
      pickupDateTimeDisplay || "",
      body.urgent ? "SI" : "NO",
      fileNames.join(" | "),
      fileUrls.join(" | "),
      fileIds.join(" | "),
      uploaded.length,
      body.notes || "",
      JSON.stringify(body),
      mailResult.ok ? "SI" : "NO",
      mailResult.error || ""
    ]);

    return jsonResponse({
      ok: true,
      message: "Pedido registrado correctamente.",
      orderNumber: orderNumber,
      fileUrls: fileUrls,
      mailSent: mailResult.ok,
      mailError: mailResult.error || ""
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
    return { ok: false, error: "El pedido no tiene email." };
  }
  if (!isValidEmail_(email)) {
    return { ok: false, error: `Email inválido en pedido: ${email}` };
  }

  const customerName = String(customer.name || "Cliente").trim();
  const total = body && body.pricing && body.pricing.total ? body.pricing.total : 0;
  const totalSheets = body && body.pricing && body.pricing.totalSheets ? body.pricing.totalSheets : 0;
  const paymentLabel = body && body.payment && body.payment.label ? body.payment.label : "-";
  const pickup = body && body.pickupDateTime
    ? (formatDateTimeAr_(body.pickupDateTime) || "Sin fecha/hora (trabajo urgente)")
    : "Sin fecha/hora (trabajo urgente)";
  const fileNames = Array.isArray(body.fileNames) ? body.fileNames : [];
  const filesText = fileNames.length ? fileNames.join(", ") : "Sin detalle";
  const filesSummaryText = summarizeFileNamesForEmail_(fileNames);

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
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0;padding:24px;background:#f7f6f3;">',
    '<tr><td align="center">',
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="width:640px;max-width:640px;background:#ffffff;border:1px solid #ece7dd;overflow:hidden;">',
    "<tr>",
    '<td style="padding:22px 24px;background:#1c1c1a;">',
    '<img src="https://ideamos.ar/imprenta/wp-content/uploads/2026/03/logo-dark-29-bis.png" alt="29 BIS" width="130" style="display:block;width:130px;max-width:130px;height:auto;border:0;outline:none;text-decoration:none;">',
    '<p style="margin:10px 0 0 0;color:#f8f8f8;font-family:Arial,sans-serif;font-size:13px;line-height:1.4;">Confirmación de pedido</p>',
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:26px 24px 12px 24px;">',
    `<p style="margin:0 0 12px 0;color:#1c1c1a;font-family:Arial,sans-serif;font-size:18px;line-height:1.4;word-break:break-word;overflow-wrap:anywhere;">Hola <strong>${escapeHtml_(customerName)}</strong>,</p>`,
    '<p style="margin:0;color:#3b3b38;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;word-break:break-word;overflow-wrap:anywhere;">Recibimos tu pedido correctamente. Ya está ingresado en nuestro flujo de producción.</p>',
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:0 24px 10px 24px;">',
    '<div style="border:1px solid #f1b8cf;background:#fff5f9;padding:14px 16px;">',
    '<p style="margin:0 0 6px 0;color:#7a2b4f;font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;">Número de pedido</p>',
    `<p style="margin:0;color:#e84883;font-family:Arial,sans-serif;font-size:24px;font-weight:700;line-height:1.2;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml_(orderNumber)}</p>`,
    "</div>",
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:6px 24px 6px 24px;">',
    '<p style="margin:0 0 10px 0;color:#1c1c1a;font-family:Arial,sans-serif;font-size:16px;font-weight:700;">Resumen del pedido</p>',
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">',
    `<tr><td style="padding:8px 0;border-bottom:1px solid #f0ece5;color:#6a6966;font-family:Arial,sans-serif;font-size:14px;">Hojas totales</td><td align="right" style="padding:8px 0;border-bottom:1px solid #f0ece5;color:#1c1c1a;font-family:Arial,sans-serif;font-size:14px;font-weight:700;">${escapeHtml_(String(totalSheets))}</td></tr>`,
    `<tr><td style="padding:8px 0;border-bottom:1px solid #f0ece5;color:#6a6966;font-family:Arial,sans-serif;font-size:14px;">Total estimado</td><td align="right" style="padding:8px 0;border-bottom:1px solid #f0ece5;color:#e84883;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">$ ${escapeHtml_(formatNumber_(total))}</td></tr>`,
    `<tr><td style="padding:8px 0;border-bottom:1px solid #f0ece5;color:#6a6966;font-family:Arial,sans-serif;font-size:14px;">Forma de pago</td><td align="right" style="padding:8px 0;border-bottom:1px solid #f0ece5;color:#1c1c1a;font-family:Arial,sans-serif;font-size:14px;font-weight:700;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml_(paymentLabel)}</td></tr>`,
    `<tr><td style="padding:8px 0;border-bottom:1px solid #f0ece5;color:#6a6966;font-family:Arial,sans-serif;font-size:14px;">Retiro</td><td align="right" style="padding:8px 0;border-bottom:1px solid #f0ece5;color:#1c1c1a;font-family:Arial,sans-serif;font-size:14px;font-weight:700;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml_(pickup)}</td></tr>`,
    `<tr><td style="padding:8px 0;color:#6a6966;font-family:Arial,sans-serif;font-size:14px;">Archivos</td><td align="right" style="padding:8px 0;color:#1c1c1a;font-family:Arial,sans-serif;font-size:14px;font-weight:700;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml_(filesSummaryText)}</td></tr>`,
    "</table>",
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:12px 24px 22px 24px;">',
    '<div style="border:1px solid #f5d38a;background:#fff8e9;padding:12px 14px;">',
    '<p style="margin:0;color:#6e4b0f;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;word-break:break-word;overflow-wrap:anywhere;">Si abonaste por transferencia, enviá el comprobante a <strong>pedidos@29bis.com.ar</strong> indicando tu número de pedido.</p>',
    "</div>",
    '<p style="margin:14px 0 0 0;color:#3b3b38;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">Gracias por elegir 29 BIS.</p>',
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:14px 24px;background:#f7f6f3;border-top:1px solid #ece7dd;">',
    '<p style="margin:0;color:#6a6966;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;">©2026 29 BIS · Creado con ❤️ por <a href="https://ideamos.com.ar" style="color:#e84883;text-decoration:none;font-weight:700;word-break:break-word;overflow-wrap:anywhere;">Estudio Ideamos</a></p>',
    "</td>",
    "</tr>",
    "</table>",
    "</td></tr>",
    "</table>"
  ].join("");

  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: textBody,
      htmlBody: htmlBody,
      name: "29 BIS"
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function summarizeFileNamesForEmail_(fileNames) {
  const list = Array.isArray(fileNames) ? fileNames.filter(Boolean) : [];
  if (!list.length) {
    return "Sin detalle";
  }
  const preview = list.slice(0, 3).join(", ");
  if (list.length <= 3) {
    return preview;
  }
  return `${preview} (+${list.length - 3} archivo(s) más)`;
}
function isValidEmail_(email) {
  const value = String(email || "").trim();
  // ValidaciÃ³n pragmÃ¡tica para evitar fallos de MailApp por direcciones mal formadas.
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
}

function formatDateTimeAr_(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return "";
  }
  return Utilities.formatDate(date, "America/Argentina/Buenos_Aires", "dd/MM/yyyy HH:mm");
}

function uploadFilesToDrive_(uploadedFiles, orderNumber) {
  if (!uploadedFiles || !uploadedFiles.length) {
    return [];
  }
  if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID.indexOf("REEMPLAZAR_") === 0) {
    throw new Error("ConfigurÃ¡ DRIVE_FOLDER_ID antes de usar subida de archivos.");
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
    "cliente notificado",
    "mail enviado",
    "detalle error mail"
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

