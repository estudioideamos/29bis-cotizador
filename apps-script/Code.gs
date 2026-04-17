/**
 * Google Apps Script para:
 * 1) Exponer precios por GET (opcional).
 * 2) Guardar pedidos por POST.
 *
 * Estructura sugerida en Google Sheets:
 * - Hoja "orders": para pedidos.
 * - Hoja "prices_json": celda A1 con el JSON completo de precios (opcional).
 */

const SHEET_ID = "REEMPLAZAR_CON_ID_DE_TU_SPREADSHEET";
const ORDERS_SHEET = "orders";
const PRICES_SHEET = "prices_json";

function doGet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(PRICES_SHEET);
  if (!sh) {
    return jsonResponse({ ok: false, message: "No existe la hoja prices_json." });
  }

  const raw = String(sh.getRange("A1").getValue() || "").trim();
  if (!raw) {
    return jsonResponse({ ok: false, message: "La celda A1 está vacía." });
  }

  try {
    const parsed = JSON.parse(raw);
    return jsonResponse(parsed);
  } catch (err) {
    return jsonResponse({ ok: false, message: "JSON inválido en A1.", detail: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = getOrCreateSheet_(ss, ORDERS_SHEET);

    if (sh.getLastRow() === 0) {
      sh.appendRow([
        "createdAt",
        "orderId",
        "customerName",
        "phone",
        "email",
        "machine",
        "paper",
        "size",
        "sides",
        "totalSheets",
        "subtotal",
        "discountRate",
        "discountAmount",
        "total",
        "pickupDateTime",
        "urgent",
        "coverageDistribution",
        "notes",
        "fileName",
        "rawPayload"
      ]);
    }

    sh.appendRow([
      body.createdAt || "",
      body.orderId || "",
      body.customer?.name || "",
      body.customer?.phone || "",
      body.customer?.email || "",
      body.machine?.label || "",
      body.paper?.label || "",
      body.size?.label || "",
      body.sides?.label || "",
      body.pricing?.totalSheets || 0,
      body.pricing?.subtotal || 0,
      body.pricing?.discountRate || 0,
      body.pricing?.discountAmount || 0,
      body.pricing?.total || 0,
      body.pickupDateTime || "",
      body.urgent ? "SI" : "NO",
      JSON.stringify(body.coverageDistribution || []),
      body.notes || "",
      body.fileName || "",
      JSON.stringify(body)
    ]);

    return jsonResponse({ ok: true, message: "Pedido guardado." });
  } catch (err) {
    return jsonResponse({ ok: false, message: "Error al guardar pedido.", detail: String(err) });
  }
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
