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
const PRICES_SHEET = "prices";
const ORDERS_HEADER = [
  "fecha_creacion",
  "numero_pedido",
  "nombre_cliente",
  "telefono_cliente",
  "dni_cliente",
  "email_cliente",
  "tipo_impresion",
  "tipo_papel",
  "tamano",
  "ancho_personalizado_m",
  "alto_personalizado_m",
  "area_personalizada_m2",
  "faz",
  "distribucion_cobertura",
  "cantidad_hojas_total",
  "subtotal",
  "tasa_descuento",
  "monto_descuento",
  "total",
  "metodo_pago",
  "estado_pago",
  "estado_pedido",
  "fecha_hora_retiro",
  "urgente",
  "nombres_archivos",
  "links_archivos",
  "ids_archivos",
  "cantidad_archivos",
  "observaciones",
  "payload_crudo",
  "prioridad_interna",
  "asignado_a",
  "fecha_cambio_estado",
  "cliente_notificado",
  "mail_enviado",
  "detalle_error_mail"
];

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "").trim().toLowerCase();

    if (action === "prices") {
      return jsonResponse(buildPricesPayload_());
    }

    return jsonResponse({
      ok: true,
      message: "API 29 BIS activa",
      actions: ["prices"]
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      message: "Error en GET.",
      detail: String(err)
    });
  }
}

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
    ensureOrdersSchema_(sh);

    const orderNumber = buildOrderNumber_(sh);
    const uploadedResult = uploadFilesToDrive_(body.uploadedFiles || [], orderNumber);
    const uploaded = uploadedResult.files || [];
    const folderUrl = String(uploadedResult.folderUrl || "").trim();
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
      body.customer && body.customer.dni ? body.customer.dni : "",
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
      "En revisión",
      pickupDateTimeDisplay || "",
      body.urgent ? "SI" : "NO",
      fileNames.join(" | "),
      folderUrl || fileUrls.join(" | "),
      fileIds.join(" | "),
      uploaded.length,
      body.notes || "",
      JSON.stringify(body),
      "",
      "",
      "",
      "",
      mailResult.ok ? "SI" : "NO",
      mailResult.error || ""
    ]);

    refreshOperacionAfterOrder_();

    return jsonResponse({
      ok: true,
      message: "Pedido registrado correctamente.",
      orderNumber: orderNumber,
      fileUrls: fileUrls,
      folderUrl: folderUrl,
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

function refreshOperacionAfterOrder_() {
  try {
    if (typeof refreshOperacionEditable === "function") {
      refreshOperacionEditable();
    }
  } catch (err) {
    console.log(`No se pudo refrescar la hoja operacion automaticamente: ${err}`);
  }
}

function buildPricesPayload_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(PRICES_SHEET);
  if (!sh) {
    throw new Error(`No existe la hoja "${PRICES_SHEET}".`);
  }

  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) {
    return {
      ok: true,
      mode: "price-rows",
      priceRows: [],
      paperAvailability: {},
      updatedAt: new Date().toISOString()
    };
  }

  const header = values[0].map((h) => normalizeHeader_(h));
  const idxMachine = findHeaderIndex_(header, ["tipo de impresion", "machine"]);
  const idxPaperKey = findHeaderIndex_(header, ["papel (codigo)", "paper_key"]);
  const idxSizeKey = findHeaderIndex_(header, ["tamano (codigo)", "size_key"]);
  const idxCoverageKey = findHeaderIndex_(header, ["cobertura (codigo)", "coverage_key"]);
  const idxSideKey = findHeaderIndex_(header, ["faz (codigo)", "side_key"]);
  const idxPrice = findHeaderIndex_(header, ["precio unitario", "price"]);
  const idxActive = findHeaderIndex_(header, ["disponible", "active"]);

  if (idxMachine === -1 || idxPaperKey === -1 || idxSizeKey === -1 || idxPrice === -1) {
    throw new Error("La hoja prices no tiene los encabezados mínimos requeridos.");
  }

  const priceRows = [];
  const availability = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const machine = normalizeMachine_(row[idxMachine]);
    const paperKey = String(row[idxPaperKey] || "").trim();
    const sizeKey = String(row[idxSizeKey] || "").trim();
    const coverageKey = idxCoverageKey >= 0 ? String(row[idxCoverageKey] || "").trim() : "";
    const sideKey = idxSideKey >= 0 ? String(row[idxSideKey] || "").trim() : "";
    const price = parsePriceNumber_(row[idxPrice]);
    const active = idxActive >= 0 ? normalizeBoolean_(row[idxActive], true) : true;

    if (!machine || !paperKey || !sizeKey || price == null) {
      continue;
    }

    priceRows.push({
      machine: machine,
      paper_key: paperKey,
      size_key: sizeKey,
      coverage_key: coverageKey,
      side_key: sideKey,
      price: price,
      active: active
    });

    // Si al menos una fila de ese papel está activa, se considera disponible.
    if (!Object.prototype.hasOwnProperty.call(availability, paperKey)) {
      availability[paperKey] = active;
    } else {
      availability[paperKey] = Boolean(availability[paperKey] || active);
    }
  }

  return {
    ok: true,
    mode: "price-rows",
    priceRows: priceRows,
    paperAvailability: availability,
    updatedAt: new Date().toISOString()
  };
}

function normalizeHeader_(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findHeaderIndex_(headers, candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    for (let j = 0; j < list.length; j++) {
      const c = normalizeHeader_(list[j]);
      if (h === c) {
        return i;
      }
    }
  }
  return -1;
}

function normalizeMachine_(value) {
  const text = normalizeHeader_(value);
  if (text.indexOf("plotter") !== -1) {
    return "plotter";
  }
  if (text.indexOf("laser") !== -1 || text.indexOf("láser") !== -1) {
    return "laser";
  }
  return "";
}

function parsePriceNumber_(value) {
  if (typeof value === "number") {
    return isNaN(value) ? null : Number(value);
  }
  const cleaned = String(value || "")
    .replace(/\s/g, "")
    .replace(/\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

function normalizeBoolean_(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const text = String(value || "").trim().toLowerCase();
  if (["true", "1", "si", "sí", "yes"].includes(text)) {
    return true;
  }
  if (["false", "0", "no"].includes(text)) {
    return false;
  }
  return fallback;
}

function sendOrderConfirmationEmail_(body, orderNumber) {
  const TRACKING_URL = "https://docs.google.com/spreadsheets/d/1DuwnM8yVw1_DM3xEHJ7NSWXpS-a9G4wSeP7bMGjJeIY/edit?usp=drivesdk";
  const orderNumberDisplay = normalizeOrderNumberForDisplay_(orderNumber);
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
  const paymentKey = body && body.payment && body.payment.key ? String(body.payment.key) : "";
  const isTransferPayment = paymentKey === "transferencia" || /transferencia/i.test(paymentLabel);
  const pickup = body && body.pickupDateTime
    ? (formatDateTimeAr_(body.pickupDateTime) || "Sin fecha/hora (trabajo urgente)")
    : "Sin fecha/hora (trabajo urgente)";
  const fileNames = Array.isArray(body.fileNames) ? body.fileNames : [];
  const filesText = fileNames.length ? fileNames.join(", ") : "Sin detalle";
  const filesSummaryText = summarizeFileNamesForEmail_(fileNames);

  const subject = `29 BIS - Confirmacion de pedido ${orderNumberDisplay}`;
  const textBody = [
    `Hola ${customerName},`,
    "",
    "Recibimos tu pedido correctamente.",
    `Numero de pedido: ${orderNumberDisplay}`,
    "",
    "Resumen:",
    `- Hojas totales: ${totalSheets}`,
    `- Total estimado: $ ${formatNumber_(total)}`,
    `- Forma de pago: ${paymentLabel}`,
    `- Retiro: ${pickup}`,
    `- Archivos: ${filesText}`,
    "",
    ...(isTransferPayment
      ? [
        "ALIAS: 29bis.ploteos",
        "Para impactar el pago, enviar el comprobante de transferencia a pedidos@29bis.com.ar con el numero de pedido."
      ]
      : []),
    "",
    "Hacele seguimiento a tu pedido en vivo aca:",
    TRACKING_URL,
    "",
    "Gracias por elegir 29 BIS."
  ].join("\n");

  const htmlBody = [
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0;padding:24px;background:#f7f6f3;">',
    '<tr><td align="center">',
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="width:640px;max-width:640px;background:#ffffff;border:1px solid #ece7dd;overflow:hidden;">',
    "<tr>",
    '<td style="padding:22px 24px;background:#ffffff;border-bottom:1px solid #ece7dd;">',
    '<img src="https://estudioideamos.github.io/29bis-cotizador/assets/logo-29bis-dark.png" alt="29 BIS" width="130" style="display:block;width:130px;max-width:130px;height:auto;border:0;outline:none;text-decoration:none;">',
    '<p style="margin:10px 0 0 0;color:#1c1c1a;font-family:Arial,sans-serif;font-size:13px;line-height:1.4;">Confirmación de pedido</p>',
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
    `<p style="margin:0;color:#e84883;font-family:Arial,sans-serif;font-size:24px;font-weight:700;line-height:1.2;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml_(orderNumberDisplay)}</p>`,
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
    ...(isTransferPayment
      ? [
        '<div style="border:1px solid #f5d38a;background:#fff8e9;padding:12px 14px;">',
        '<p style="margin:0 0 6px 0;color:#6e4b0f;font-family:Arial,sans-serif;font-size:13px;letter-spacing:0.4px;text-transform:uppercase;"><strong>ALIAS: 29bis.ploteos</strong></p>',
        '<p style="margin:0;color:#6e4b0f;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;word-break:break-word;overflow-wrap:anywhere;">Para impactar el pago, enviar el comprobante de transferencia a <strong>pedidos@29bis.com.ar</strong> con el número de pedido.</p>',
        "</div>"
      ]
      : []),
    '<div style="margin-top:14px;border:1px solid #f1b8cf;background:#fff5f9;padding:12px 14px;">',
    '<p style="margin:0 0 8px 0;color:#7a2b4f;font-family:Arial,sans-serif;font-size:13px;font-weight:700;">Hacele seguimiento a tu pedido en vivo:</p>',
    `<a href="${TRACKING_URL}" target="_blank" style="display:inline-block;background:#e84883;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:700;padding:10px 14px;border-radius:8px;">Ver seguimiento en vivo</a>`,
    "</div>",
    '<p style="margin:14px 0 0 0;color:#3b3b38;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">Gracias por elegir 29 BIS.</p>',
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:14px 24px;background:#f7f6f3;border-top:1px solid #ece7dd;">',
    '<p style="margin:0;color:#6a6966;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;">©2026 29 BIS · Creado con ?? por <a href="https://ideamos.com.ar" style="color:#e84883;text-decoration:none;font-weight:700;word-break:break-word;overflow-wrap:anywhere;">Estudio Ideamos</a></p>',
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
    return { files: [], folderUrl: "" };
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

  return {
    files: output,
    folderUrl: orderFolder.getUrl()
  };
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
  const match = raw.match(/(\d{4})(\d{2})\d{2}-\d+/);
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
  return `${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd")}-${pad_(next, 4)}`;
}

function normalizeOrderNumberForDisplay_(orderNumber) {
  return String(orderNumber || "").replace(/^29BIS-/i, "");
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
  sheet.appendRow(ORDERS_HEADER);
}

function ensureOrdersSchema_(sheet) {
  if (sheet.getMaxColumns() < ORDERS_HEADER.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), ORDERS_HEADER.length - sheet.getMaxColumns());
  }

  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, ORDERS_HEADER.length).setValues([ORDERS_HEADER]);
    return;
  }

  sheet.getRange(1, 1, 1, ORDERS_HEADER.length).setValues([ORDERS_HEADER]);
}

function setupOrdersSchema29() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = getOrCreateSheet_(ss, ORDERS_SHEET);
  ensureOrdersHeader_(sh);
  ensureOrdersSchema_(sh);
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


