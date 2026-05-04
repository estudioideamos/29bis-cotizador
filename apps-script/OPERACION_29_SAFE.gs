/**
 * 29 BIS - OPERACION editable + sync con orders
 *
 * Objetivo:
 * - Hoja "operacion" editable por operador (sin QUERY que se rompa).
 * - El operador cambia "Estado pago" y "Estado pedido" en "operacion".
 * - Se sincroniza automaticamente en "orders".
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
  "Observaciones",     // M
  "Estado pago",       // N (editable)
  "Estado pedido",     // O (editable)
  "Total",             // P
  "Retiro",            // Q
  "Urgente",           // R
  "_row_orders"        // S (helper oculta)
];

// columnas en "operacion" (1-based)
const OP_COL_ORDER_NUMBER = 1; // A
const OP_COL_STATUS_PAGO = 14; // N
const OP_COL_STATUS_PEDIDO = 15; // O
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
    .addItem("Sincronizar schema de orders_archivo", "setupArchiveSchema29")
    .addSeparator()
    .addItem("Archivar filas seleccionadas", "archiveSelectedOrders29")
    .addItem("Eliminar filas seleccionadas (sin archivar)", "deleteSelectedOrdersWithoutArchive29")
    .addItem("Eliminar por rango de filas...", "deleteOrdersByRowRange29")
    .addItem("Eliminar pedido seleccionado (seguro)", "deleteSelectedOrderSafely")
    .addToUi();
}

function setupOperacionEditable() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const op = getOrCreateSheet_(ss, OP_SHEET_NAME);

  op.clear();
  const maxRows = op.getMaxRows();
  const maxCols = op.getMaxColumns();
  if (maxRows > 0 && maxCols > 0) {
    op.getRange(1, 1, maxRows, maxCols).clearDataValidations();
  }
  op.getRange(1, 1, 1, OP_HEADER.length).setValues([OP_HEADER]);
  op.setFrozenRows(1);

  const headerRange = op.getRange(1, 1, 1, OP_HEADER.length);
  headerRange.setBackground("#1c1c1a");
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");

  op.hideColumns(OP_COL_HELPER_ROW);

  const widths = [180, 150, 220, 130, 120, 220, 200, 170, 110, 120, 220, 140, 260, 130, 150, 110, 140, 90, 80];
  widths.forEach((w, i) => op.setColumnWidth(i + 1, w));

  applyStatusValidations_(op, 2, 1200);

  op.getRange("P:P").setNumberFormat("$ #,##0");
  op.getRange("B:B").setHorizontalAlignment("left");
  op.getRange("C:C").setHorizontalAlignment("left");
  op.getRange("L:L").setWrap(true);
  op.getRange("M:M").setWrap(true);

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
    const adjuntosLinks = [];

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const orderNumber = safe_(r[1]); // B
      if (!orderNumber) continue;

      const adjuntosUrl = buildAdjuntosUrl_(r[25]);

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
        adjuntosUrl ? "Ver adjuntos" : "", // L Adjuntos (Z)
        safe_(r[28]),         // M Observaciones (AC)
        safe_(r[20]),         // N Estado pago (U)
        safe_(r[21]),         // O Estado pedido (V)
        num_(r[18]),          // P Total (S)
        safe_(r[22]),         // Q Retiro (W)
        safe_(r[23]),         // R Urgente (X)
        i + 2                 // S helper -> row real en orders
      ]);

      adjuntosLinks.push(adjuntosUrl);
    }

    out.sort((a, b) => parseMixedDate_(b[1]) - parseMixedDate_(a[1]));

    clearOperacionBody_(op);
    if (out.length) {
      op.getRange(2, 1, out.length, OP_HEADER.length).setValues(out);
      applyAdjuntosRichLinks_(op, adjuntosLinks);
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
    ui.alert("Selecciona una celda de la fila del pedido que queres eliminar.");
    return;
  }

  const row = active.getRow();
  if (row < 2) {
    ui.alert("Selecciona una fila de datos (no el encabezado).");
    return;
  }

  const orderNumber = String(op.getRange(row, OP_COL_ORDER_NUMBER).getValue() || "").trim();
  if (!orderNumber) {
    ui.alert("La fila seleccionada no tiene numero de pedido.");
    return;
  }

  const response = ui.alert(
    "Eliminar pedido (seguro)",
    `Se archivara y eliminara de \"orders\" el pedido:\n${orderNumber}\n\n¿Queres continuar?`,
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
        ui.alert(`No se encontro el pedido ${orderNumber} en orders.`);
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

// Compatibilidad con menus viejos que todavia apuntan a este nombre.
function eliminarPedidoSeleccionado29() {
  deleteSelectedOrderSafely();
}

function archiveSelectedOrders29() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const op = ss.getSheetByName(OP_SHEET_NAME);
  const orders = ss.getSheetByName(ORDERS_SHEET);

  if (!op || !orders) {
    ui.alert("No se encontraron las hojas necesarias (operacion/orders).");
    return;
  }

  const targets = getSelectedOrderTargets_(op);

  if (!targets.length) {
    ui.alert("No se detectaron pedidos validos en la seleccion.");
    return;
  }

  const response = ui.alert(
    "Archivar pedidos seleccionados",
    `Se archivaran y eliminaran de "orders" ${targets.length} pedido(s). ¿Queres continuar?`,
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) {
    return;
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const archive = getOrCreateArchiveFromOrders_(ss, orders);
    const rowsToDelete = resolveOrderRows_(orders, targets);

    for (let i = 0; i < rowsToDelete.length; i++) {
      const orderRow = rowsToDelete[i];
      const rowValues = orders.getRange(orderRow, 1, 1, orders.getLastColumn()).getValues()[0];
      archive.getRange(archive.getLastRow() + 1, 1, 1, rowValues.length).setValues([rowValues]);
    }

    rowsToDelete
      .sort((a, b) => b - a)
      .forEach((rowNumber) => orders.deleteRow(rowNumber));

    refreshOperacionEditable();
    ui.alert(`Listo. Se archivaron ${rowsToDelete.length} pedido(s).`);
  } finally {
    lock.releaseLock();
  }
}

function deleteSelectedOrdersWithoutArchive29() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const op = ss.getSheetByName(OP_SHEET_NAME);
  const orders = ss.getSheetByName(ORDERS_SHEET);

  if (!op || !orders) {
    ui.alert("No se encontraron las hojas necesarias (operacion/orders).");
    return;
  }

  const targets = getSelectedOrderTargets_(op);
  if (!targets.length) {
    ui.alert("No se detectaron pedidos validos en la seleccion.");
    return;
  }

  const response = ui.alert(
    "Eliminar pedidos seleccionados",
    `Se eliminaran definitivamente ${targets.length} pedido(s) de "orders". Esta accion no los archiva. ¿Queres continuar?`,
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) {
    return;
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const rowsToDelete = resolveOrderRows_(orders, targets);
    rowsToDelete
      .sort((a, b) => b - a)
      .forEach((rowNumber) => orders.deleteRow(rowNumber));

    refreshOperacionEditable();
    ui.alert(`Listo. Se eliminaron ${rowsToDelete.length} pedido(s).`);
  } finally {
    lock.releaseLock();
  }
}

function deleteOrdersByRowRange29() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const op = ss.getSheetByName(OP_SHEET_NAME);
  const orders = ss.getSheetByName(ORDERS_SHEET);

  if (!op || !orders) {
    ui.alert("No se encontraron las hojas necesarias (operacion/orders).");
    return;
  }

  const response = ui.prompt(
    "Eliminar por rango de filas",
    'Escribi el rango de filas de "operacion" que queres eliminar. Ejemplo: 12-28',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const raw = String(response.getResponseText() || "").trim();
  const match = raw.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) {
    ui.alert('Formato invalido. Usa por ejemplo: 12-28');
    return;
  }

  const startRow = Math.max(2, Number(match[1]));
  const endRow = Math.max(2, Number(match[2]));
  if (!startRow || !endRow || endRow < startRow) {
    ui.alert("El rango ingresado no es valido.");
    return;
  }

  const targets = [];
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber++) {
    const displayNumber = String(op.getRange(rowNumber, OP_COL_ORDER_NUMBER).getDisplayValue() || "").trim();
    const helperRow = Number(op.getRange(rowNumber, OP_COL_HELPER_ROW).getValue() || 0);
    if (!displayNumber) {
      continue;
    }
    targets.push({
      displayNumber: displayNumber,
      helperRow: helperRow
    });
  }

  if (!targets.length) {
    ui.alert("No se detectaron pedidos validos en ese rango.");
    return;
  }

  const confirm = ui.alert(
    "Eliminar pedidos por rango",
    `Se eliminaran definitivamente ${targets.length} pedido(s) de las filas ${startRow}-${endRow}. Esta accion no los archiva. ¿Queres continuar?`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) {
    return;
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const rowsToDelete = resolveOrderRows_(orders, targets);
    rowsToDelete
      .sort((a, b) => b - a)
      .forEach((rowNumber) => orders.deleteRow(rowNumber));

    refreshOperacionEditable();
    ui.alert(`Listo. Se eliminaron ${rowsToDelete.length} pedido(s).`);
  } finally {
    lock.releaseLock();
  }
}

function setupArchiveSchema29() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orders = ss.getSheetByName(ORDERS_SHEET);
  if (!orders) {
    throw new Error(`No existe la hoja "${ORDERS_SHEET}".`);
  }

  getOrCreateArchiveFromOrders_(ss, orders);
}

function applyStatusValidations_(sheet, startRow, endRow) {
  const pagoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Pendiente", "Pagado"], true)
    .setAllowInvalid(false)
    .build();

  const pedidoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["En revision", "En preparacion", "Listo para retirar"], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(startRow, OP_COL_STATUS_PAGO, endRow - startRow + 1, 1).setDataValidation(pagoRule);
  sheet.getRange(startRow, OP_COL_STATUS_PEDIDO, endRow - startRow + 1, 1).setDataValidation(pedidoRule);
}

function getSelectedOrderTargets_(opSheet) {
  const rangeList = opSheet.getActiveRangeList();
  const ranges = rangeList ? rangeList.getRanges() : (opSheet.getActiveRange() ? [opSheet.getActiveRange()] : []);
  if (!ranges.length) {
    return [];
  }

  const rowNumbers = [];

  for (let r = 0; r < ranges.length; r++) {
    const range = ranges[r];
    const startRow = Math.max(2, range.getRow());
    const endRow = range.getLastRow();
    if (endRow < 2) {
      continue;
    }

    for (let row = startRow; row <= endRow; row++) {
      rowNumbers.push(row);
    }
  }

  const uniqueRows = Array.from(new Set(rowNumbers)).sort((a, b) => a - b);
  const targets = [];

  for (let i = 0; i < uniqueRows.length; i++) {
    const rowNumber = uniqueRows[i];
    const displayNumber = String(opSheet.getRange(rowNumber, OP_COL_ORDER_NUMBER).getDisplayValue() || "").trim();
    const helperRow = Number(opSheet.getRange(rowNumber, OP_COL_HELPER_ROW).getValue() || 0);
    if (!displayNumber) {
      continue;
    }

    targets.push({
      displayNumber: displayNumber,
      helperRow: helperRow
    });
  }

  return targets;
}

function resolveOrderRows_(ordersSheet, targets) {
  const rowsToDelete = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    let orderRow = target.helperRow;

    if (!orderRow || orderRow < 2) {
      const finder = findOrderRowByNumber_(ordersSheet, target.displayNumber);
      if (!finder) {
        continue;
      }
      orderRow = finder.getRow();
    }

    rowsToDelete.push(orderRow);
  }

  return Array.from(new Set(rowsToDelete));
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

function buildAdjuntosUrl_(rawLinkValue) {
  const text = String(rawLinkValue == null ? "" : rawLinkValue).trim();
  if (!text) {
    return "";
  }

  const first = text.split("|")[0].trim();
  if (!first) {
    return "";
  }

  return truncateCellText_(first, 40000);
}

function num_(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function applyAdjuntosRichLinks_(sheet, links) {
  if (!links || !links.length) {
    return;
  }

  const richValues = links.map((url) => {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) {
      return [SpreadsheetApp.newRichTextValue().setText("").build()];
    }

    return [
      SpreadsheetApp.newRichTextValue()
        .setText("Ver adjuntos")
        .setLinkUrl(cleanUrl)
        .build()
    ];
  });

  sheet.getRange(2, 12, richValues.length, 1).setRichTextValues(richValues);
}

function truncateCellText_(value, maxLen) {
  const text = String(value || "");
  const limit = Number(maxLen) || 45000;
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 1))}...`;
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
  const lastCol = ordersSheet.getLastColumn();
  const header = ordersSheet.getRange(1, 1, 1, lastCol).getValues();

  if (!archive) {
    archive = ss.insertSheet(OP_ARCHIVE_SHEET);
  }

  syncArchiveSchemaFromOrders_(archive, ordersSheet, header, lastCol);
  return archive;
}

function syncArchiveSchemaFromOrders_(archiveSheet, ordersSheet, headerValues, lastCol) {
  const archiveCols = archiveSheet.getMaxColumns();
  if (archiveCols < lastCol) {
    archiveSheet.insertColumnsAfter(archiveCols, lastCol - archiveCols);
  }

  archiveSheet.getRange(1, 1, 1, lastCol).setValues(headerValues);
  archiveSheet.setFrozenRows(1);
  ordersSheet.getRange(1, 1, 1, lastCol).copyTo(archiveSheet.getRange(1, 1, 1, lastCol), { formatOnly: true });
}

function configurarDropdownStockPrices29() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const prices = ss.getSheetByName("prices");
  if (!prices) {
    ui.alert('No se encontro la hoja "prices".');
    return;
  }

  const lastCol = prices.getLastColumn();
  if (lastCol < 1) {
    ui.alert('La hoja "prices" no tiene encabezados.');
    return;
  }

  const headers = prices.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h || "").trim().toLowerCase());
  let colDisponible = headers.indexOf("disponible") + 1;

  if (!colDisponible) {
    for (let c = 0; c < headers.length; c++) {
      if (headers[c].indexOf("disponible") !== -1 || headers[c] === "active") {
        colDisponible = c + 1;
        break;
      }
    }
  }

  if (!colDisponible) {
    ui.alert('No se encontro la columna "disponible" en prices.');
    return;
  }

  const maxRows = prices.getMaxRows();
  if (maxRows < 2) {
    ui.alert('No hay filas para aplicar validacion en prices.');
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
