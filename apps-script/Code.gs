/**
 * Google Apps Script para:
 * 1) Guardar pedidos por POST.
 * 2) Subir uno o varios archivos del pedido a Google Drive.
 *
 * Configuración:
 * - SHEET_ID: ID del Spreadsheet.
 * - DRIVE_FOLDER_ID: ID de la carpeta destino en Drive para los archivos.
 */

const SHEET_ID = "REEMPLAZAR_CON_ID_DE_TU_SPREADSHEET";
const ORDERS_SHEET = "orders";
const DRIVE_FOLDER_ID = "REEMPLAZAR_CON_ID_DE_CARPETA_DRIVE";

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

    return jsonResponse({
      ok: true,
      message: "Pedido guardado con archivos en Drive.",
      orderNumber: orderNumber,
      fileUrls: fileUrls
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      message: "Error al guardar pedido.",
      detail: String(err)
    });
  }
}

function uploadFilesToDrive_(uploadedFiles, orderNumber) {
  if (!uploadedFiles || !uploadedFiles.length) {
    return [];
  }
  if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID.indexOf("REEMPLAZAR_") === 0) {
    throw new Error("Configurá DRIVE_FOLDER_ID antes de usar subida de archivos.");
  }

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const safeOrderNumber = String(orderNumber || "pedido").replace(/[^\w-]/g, "_");
  const output = [];

  uploadedFiles.forEach((fileObj, index) => {
    const base64 = String(fileObj.base64 || "").trim();
    const name = String(fileObj.name || `archivo_${index + 1}`);
    const mimeType = String(fileObj.mimeType || "application/octet-stream");
    if (!base64) {
      return;
    }

    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, `${safeOrderNumber}__${name}`);
    const created = folder.createFile(blob);

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

function summarizeItems_(items, key) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return "";
  }
  return list.map((item, i) => {
    if (key === "machine") {
      return `Trabajo ${i + 1}: ${(item.machine && item.machine.label) || ""}`;
    }
    if (key === "paper") {
      return `Trabajo ${i + 1}: ${(item.paper && item.paper.label) || ""}`;
    }
    if (key === "size") {
      return `Trabajo ${i + 1}: ${(item.size && item.size.label) || ""}`;
    }
    if (key === "sides") {
      return `Trabajo ${i + 1}: ${(item.sides && item.sides.label) || "N/A"}`;
    }
    return "";
  }).join(" || ");
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

function ensureOrdersHeader_(sheet) {
  if (sheet.getLastRow() > 0) {
    return;
  }
  sheet.appendRow([
    "created_at",
    "order_number",
    "customer_name",
    "customer_phone",
    "customer_email",
    "machine",
    "paper",
    "size",
    "custom_width_m",
    "custom_height_m",
    "custom_area_m2",
    "sides",
    "coverage_distribution",
    "total_sheets",
    "subtotal",
    "discount_rate",
    "discount_amount",
    "total",
    "payment_method",
    "payment_status",
    "production_status",
    "pickup_datetime",
    "urgent",
    "file_names",
    "file_urls",
    "file_ids",
    "file_count",
    "notes",
    "raw_payload"
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
