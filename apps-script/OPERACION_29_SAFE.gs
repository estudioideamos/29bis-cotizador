/**
 * 29 BIS - OPERACION editable + sync con orders
 *
 * Objetivo:
 * - Hoja "operacion" editable por operador (sin QUERY que se rompa).
 * - El operador cambia "Estado pago" y "Estado pedido" en "operacion".
 * - Se sincroniza automáticamente en "orders".
 *
 * Instalación:
 * 1) Copiar este archivo al proyecto Apps Script.
 * 2) Guardar.
 * 3) Ejecutar una vez: setupOperacionEditable()
 * 4) Luego usar menu "29 BIS Gestion" -> "Actualizar hoja operacion"
 */

const OP_SHEET_NAME = "operacion";
const OP_HEADER = [
  "N° pedido",         // A
  "Fecha",             // B
  "Cliente",           // C
  "Telefono",          // D
  "DNI",               // E
  "Email",             // F
  "Tipo impresion",    // G
  "Tipo papel",        // H
  "Tamano",            // I
  "Faz",               // J
  "Nombre archivos",   // K
  "Adjuntos",          // L
  "Estado pago",       // M (editable)
  "Estado pedido",     // N (editable)
  "Total",             // O
  "Retiro",            // P
  "Urgente",           // Q
  "Observaciones",     // R
  "_row_orders"        // S (helper oculta)
];

// columnas en "operacion" (1-based)
const OP_COL_ORDER_NUMBER = 1; // A
const OP_COL_STATUS_PAGO = 13; // M
const OP_COL_STATUS_PEDIDO = 14; // N
const OP_COL_HELPER_ROW = 19; // S
const OP_ARCHIVE_SHEET = "orders_archivo";

// columnas en "orders" (1-based)
const OR_COL_ORDER_NUMBER = 2; // B
const OR_COL_STATUS_PAGO = 20; // T
const OR_COL_STATUS_PEDIDO = 21; // U
const OR_COL_FECHA_CAMBIO_ESTADO = 32; // AF

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("29 BIS Gestion")
    .addItem("Configurar operacion editable (una vez)", "setupOperacionEditable")
    .addItem("Configurar dropdown stock en prices", "configurarDropdownStockPrices29")
    .addItem("Actualizar hoja operacion", "refreshOperacionEditable")
    .addSeparator()
    .addItem("Eliminar pedido seleccionado (seguro)", "deleteSelectedOrderSafely")
    .addToUi();
}

function setupOperacionEditable() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const op = getOrCreateSheet_(ss, OP_SHEET_NAME);

  // Limpiar y reconstruir
  op.clear();
  const maxRows = op.getMaxRows();
  const maxCols = op.getMaxColumns();
  if (maxRows > 0 && maxCols > 0) {
    op.getRange(1, 1, maxRows, maxCols).clearDataValidations();
  }
  op.getRange(1, 1, 1, OP_HEADER.length).setValues([OP_HEADER]);
  op.setFrozenRows(1);

  // Estilo header premium
  const headerRange = op.getRange(1, 1, 1, OP_HEADER.length);
  headerRange.setBackground("#1c1c1a");
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");

  // Ocultar helper
  op.hideColumns(OP_COL_HELPER_ROW);

  // anchos sugeridos
  const widths = [180, 150, 220, 130, 120, 220, 200, 170, 110, 120, 220, 140, 130, 150, 110, 140, 90, 260, 80];
  widths.forEach((w, i) => op.setColumnWidth(i + 1, w));

  // Validaciones dropdown estados
  applyStatusValidations_(op, 2, 1200);

  // Formato columnas clave
  op.getRange("O:O").setNumberFormat("$ #,##0");
  op.getRange("B:B").setHorizontalAlignment("left");
  op.getRange("C:C").setHorizontalAlignment("left");
  op.getRange("L:L").setWrap(true);
  op.getRange("R:R").setWrap(true);

  refreshOperacionEditable();
}

function refreshOperacionEditable() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orders = ss.getSheetByName(ORDERS_SHEET);
    const op = getOrCreateSheet_(ss, OP_SHEET_NAME);

    if (!orders) {
      throw new Error(`No existe la hoja "${ORDERS_SHEET}".`);
    }

    const last = orders.getLastRow();
    if (last < 2) {
      clearOperacionBody_(op);
      return;
    }

    const data = orders.getRange(2, 1, last - 1, Math.max(orders.getLastColumn(), 34)).getValues();
    const out = [];

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const orderNumber = safe_(r[1]); // B
      if (!orderNumber) continue;

      out.push([
        displayOrderNumber_(orderNumber), // A N° pedido
        safe_(r[0]),          // B Fecha
        safe_(r[2]),          // C Cliente
        safe_(r[3]),          // D Telefono
        safe_(r[4]),          // E DNI
        safe_(r[5]),          // F Email
        safe_(r[6]),          // G Tipo impresion
        safe_(r[7]),          // H Tipo papel
        safe_(r[8]),          // I Tamano
        safe_(r[12]),         // J Faz
        safe_(r[24]),         // K Nombre archivos (Y)
        buildAdjuntosFormula_(r[25]), // L Adjuntos (Z)
        safe_(r[20]),         // M Estado pago (U)
        safe_(r[21]),         // N Estado pedido (V)
        num_(r[18]),          // O Total (S)
        safe_(r[22]),         // P Retiro (W)
        safe_(r[23]),         // Q Urgente (X)
        safe_(r[28]),         // R Observaciones (AC)
        i + 2                 // S helper -> row real en orders
      ]);
    }

    // Orden por fecha desc usando fecha en texto dd/MM/yyyy HH:mm o Date
    out.sort((a, b) => parseMixedDate_(b[1]) - parseMixedDate_(a[1]));

    clearOperacionBody_(op);
    if (out.length) {
      op.getRange(2, 1, out.length, OP_HEADER.length).setValues(out);
      applyStatusValidations_(op, 2, Math.max(1200, out.length + 20));
    }
  } finally {
    lock.releaseLock();
  }
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (!sh || sh.getName() !== OP_SHEET_NAME) return;
  if (e.range.getRow() < 2) return;

  const col = e.range.getColumn();
  if (col !== OP_COL_STATUS_PAGO && col !== OP_COL_STATUS_PEDIDO) return;

  const row = e.range.getRow();
  const orderNumber = String(sh.getRange(row, OP_COL_ORDER_NUMBER).getValue() || "").trim();
  if (!orderNumber) return;

  const helperOrderRow = Number(sh.getRange(row, OP_COL_HELPER_ROW).getValue() || 0);
  const newValue = String(e.range.getValue() || "").trim();

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orders = ss.getSheetByName(ORDERS_SHEET);
  if (!orders) return;

  let targetOrderRow = helperOrderRow;

  // fallback por numero de pedido por si no existe helper
  if (!targetOrderRow || targetOrderRow < 2) {
    const finder = findOrderRowByNumber_(orders, orderNumber);
    if (!finder) return;
    targetOrderRow = finder.getRow();
  }

  if (col === OP_COL_STATUS_PAGO) {
    orders.getRange(targetOrderRow, OR_COL_STATUS_PAGO).setValue(newValue);
  } else if (col === OP_COL_STATUS_PEDIDO) {
    orders.getRange(targetOrderRow, OR_COL_STATUS_PEDIDO).setValue(newValue);
  }

  orders.getRange(targetOrderRow, OR_COL_FECHA_CAMBIO_ESTADO).setValue(formatDateTimeAr_(new Date()));
}

function deleteSelectedOrderSafely() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const op = ss.getSheetByName(OP_SHEET_NAME);
  const orders = ss.getSheetByName(ORDERS_SHEET);

  if (!op || !orders) {
    ui.alert("No se encontraron las hojas necesarias (operacion/orders).");
    return;
  }

  const active = op.getActiveRange();
  if (!active) {
    ui.alert("Seleccioná una celda de la fila del pedido que querés eliminar.");
    return;
  }

  const row = active.getRow();
  if (row < 2) {
    ui.alert("Seleccioná una fila de datos (no el encabezado).");
    return;
  }

  const orderNumber = String(op.getRange(row, OP_COL_ORDER_NUMBER).getValue() || "").trim();
  if (!orderNumber) {
    ui.alert("La fila seleccionada no tiene número de pedido.");
    return;
  }

  const response = ui.alert(
    "Eliminar pedido (seguro)",
    `Se archivará y eliminará de "orders" el pedido:\n${orderNumber}\n\n¿Querés continuar?`,
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) {
    return;
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    let targetOrderRow = Number(op.getRange(row, OP_COL_HELPER_ROW).getValue() || 0);

    if (!targetOrderRow || targetOrderRow < 2) {
      const finder = findOrderRowByNumber_(orders, orderNumber);
      if (!finder) {
        ui.alert(`No se encontró el pedido ${orderNumber} en orders.`);
        return;
      }
      targetOrderRow = finder.getRow();
    }

    const rowValues = orders.getRange(targetOrderRow, 1, 1, orders.getLastColumn()).getValues()[0];
    const archive = getOrCreateArchiveFromOrders_(ss, orders);
    archive.getRange(archive.getLastRow() + 1, 1, 1, rowValues.length).setValues([rowValues]);

    orders.deleteRow(targetOrderRow);
    refreshOperacionEditable();

    ui.alert(`Pedido ${orderNumber} archivado y eliminado correctamente.`);
  } finally {
    lock.releaseLock();
  }
}

function applyStatusValidations_(sheet, startRow, endRow) {
  const pagoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Pendiente", "Pagado"], true)
    .setAllowInvalid(false)
    .build();

  const pedidoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["En revisión", "En preparación", "Listo para retirar"], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(startRow, OP_COL_STATUS_PAGO, endRow - startRow + 1, 1).setDataValidation(pagoRule);
  sheet.getRange(startRow, OP_COL_STATUS_PEDIDO, endRow - startRow + 1, 1).setDataValidation(pedidoRule);
}

function clearOperacionBody_(sheet) {
  const maxRows = sheet.getMaxRows();
  const maxCols = Math.max(sheet.getMaxColumns(), OP_HEADER.length);
  if (maxRows > 1) {
    const body = sheet.getRange(2, 1, maxRows - 1, maxCols);
    body.clearContent();
    body.clearDataValidations();
  }
}

function parseMixedDate_(value) {
  if (!value) return new Date(0);
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) return value;
  const txt = String(value).trim();
  const m = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (m) {
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), 0, 0);
  }
  const d = new Date(txt);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function safe_(v) {
  if (v == null) {
    return "";
  }

  if (Object.prototype.toString.call(v) === "[object Date]") {
    return v;
  }

  return truncateCellText_(String(v), 45000);
}

function buildAdjuntosFormula_(rawLinkValue) {
  const text = String(rawLinkValue == null ? "" : rawLinkValue).trim();
  if (!text) {
    return "";
  }

  // Si hay varios links viejos separados por "|", toma el primero.
  const first = text.split("|")[0].trim();
  if (!first) {
    return "";
  }

  // Mostrar texto corto en vez de URL larga.
  const safeUrl = truncateCellText_(first.replace(/"/g, '""'), 40000);
  return `=HYPERLINK("${safeUrl}","Abrir adjuntos")`;
}

function num_(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function truncateCellText_(value, maxLen) {
  const text = String(value || "");
  const limit = Number(maxLen) || 45000;
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function displayOrderNumber_(value) {
  return String(value || "").replace(/^29BIS-/i, "");
}

function findOrderRowByNumber_(ordersSheet, orderNumberDisplay) {
  const target = String(orderNumberDisplay || "").trim();
  if (!target) {
    return null;
  }

  const range = ordersSheet.getRange(2, OR_COL_ORDER_NUMBER, Math.max(ordersSheet.getLastRow() - 1, 1), 1);

  const exact = range.createTextFinder(target).matchEntireCell(true).findNext();
  if (exact) {
    return exact;
  }

  const prefixed = /^29BIS-/i.test(target) ? target : `29BIS-${target}`;
  return range.createTextFinder(prefixed).matchEntireCell(true).findNext();
}

function getOrCreateArchiveFromOrders_(ss, ordersSheet) {
  let archive = ss.getSheetByName(OP_ARCHIVE_SHEET);
  if (archive) {
    return archive;
  }

  archive = ss.insertSheet(OP_ARCHIVE_SHEET);
  const lastCol = ordersSheet.getLastColumn();
  const header = ordersSheet.getRange(1, 1, 1, lastCol).getValues();
  archive.getRange(1, 1, 1, lastCol).setValues(header);
  archive.setFrozenRows(1);
  ordersSheet.getRange(1, 1, 1, lastCol).copyTo(archive.getRange(1, 1, 1, lastCol), { formatOnly: true });
  return archive;
}

function configurarDropdownStockPrices29() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const prices = ss.getSheetByName("prices");
  if (!prices) {
    ui.alert('No se encontró la hoja "prices".');
    return;
  }

  const lastCol = prices.getLastColumn();
  if (lastCol < 1) {
    ui.alert('La hoja "prices" no tiene encabezados.');
    return;
  }

  const headers = prices.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h || "").trim().toLowerCase());
  let colDisponible = headers.indexOf("disponible") + 1;

  // Fallback por si el encabezado no está normalizado.
  if (!colDisponible) {
    for (let c = 0; c < headers.length; c++) {
      if (headers[c].indexOf("disponible") !== -1 || headers[c] === "active") {
        colDisponible = c + 1;
        break;
      }
    }
  }

  if (!colDisponible) {
    ui.alert('No se encontró la columna "disponible" en prices.');
    return;
  }

  const maxRows = prices.getMaxRows();
  if (maxRows < 2) {
    ui.alert('No hay filas para aplicar validación en prices.');
    return;
  }

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["TRUE", "FALSE"], true)
    .setAllowInvalid(false)
    .build();

  const range = prices.getRange(2, colDisponible, maxRows - 1, 1);
  range.setDataValidation(rule);
  range.setHorizontalAlignment("center");

  ui.alert('Listo. La columna "disponible" en prices ahora tiene dropdown TRUE/FALSE.');
}
