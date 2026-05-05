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
  "Cobertura",         // K
  "Nombre archivos",   // L
  "Adjuntos",          // M
  "Observaciones",     // N
  "Forma de pago",     // O
  "Estado pago",       // P (editable)
  "Estado pedido",     // Q (editable)
  "Total",             // R
  "Fecha y hora de retiro", // S
  "Urgente",           // T
  "_row_orders"        // U (helper oculta)
];

// columnas en "operacion" (1-based)
const OP_COL_ORDER_NUMBER = 1; // A
const OP_COL_PAYMENT_METHOD = 15; // O
const OP_COL_STATUS_PAGO = 16; // P
const OP_COL_STATUS_PEDIDO = 17; // Q
const OP_COL_HELPER_ROW = 21; // U
const OP_ARCHIVE_SHEET = "orders_archivo";
const MANUAL_URL_29BIS = "https://estudioideamos.github.io/29bis-cotizador/MANUAL_29BIS_SHEETS.html";

// columnas en "orders" (1-based)
const OR_COL_ORDER_NUMBER = 2; // B
const OR_COL_STATUS_PAGO = 21; // U
const OR_COL_STATUS_PEDIDO = 22; // V
const OR_COL_FECHA_CAMBIO_ESTADO = 33; // AG

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("29 BIS Gestion")
    .addItem("Abrir manual de uso", "openManual29Bis")
    .addSeparator()
    .addItem("Actualizar hoja operacion", "refreshOperacionEditable")
    .addItem("Archivar por rango de filas...", "archiveSelectedOrders29")
    .addItem("Eliminar por rango de filas...", "deleteOrdersByRowRange29")
    .addToUi();

  try {
    applyPricesLayout29();
  } catch (err) {
    console.log(`No se pudo aplicar el layout de prices al abrir: ${err}`);
  }
}

function openManual29Bis() {
  const html = HtmlService.createHtmlOutput(`
    <div style="font-family:Segoe UI,Tahoma,Arial,sans-serif;padding:20px 18px;color:#1c1c1a;">
      <h2 style="margin:0 0 10px;font-size:22px;">Manual de uso</h2>
      <p style="margin:0 0 16px;line-height:1.5;">
        Abrí el manual actualizado de la planilla desde este botón.
      </p>
      <a
        href="${MANUAL_URL_29BIS}"
        target="_blank"
        style="display:inline-block;background:#d93d79;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:700;"
      >
        Abrir manual
      </a>
      <p style="margin:14px 0 0;font-size:12px;color:#666;">
        Si no abre en una pestaña nueva, copiá este link:
      </p>
      <p style="margin:6px 0 0;font-size:12px;word-break:break-all;color:#444;">
        ${MANUAL_URL_29BIS}
      </p>
    </div>
  `)
    .setWidth(460)
    .setHeight(250);

  SpreadsheetApp.getUi().showModalDialog(html, "Manual 29 BIS");
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
  applyOperacionLayout_(op);

  refreshOperacionEditable();
}

function refreshOperacionEditable() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orders = ss.getSheetByName(ORDERS_SHEET);
    const op = getOrCreateSheet_(ss, OP_SHEET_NAME);
    applyOperacionLayout_(op);

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

      const adjuntosUrl = buildAdjuntosUrl_(r[25]);

      out.push({
        fecha: safe_(r[0]),
        adjuntosUrl: adjuntosUrl,
        values: [
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
          formatCoverageForOperacion_(r[13]), // K Cobertura (N)
          safe_(r[24]),         // L Nombre archivos (Y)
          adjuntosUrl ? "Ver adjuntos" : "", // M Adjuntos (Z)
          safe_(r[28]),         // N Observaciones (AC)
          safe_(r[19]),         // O Forma de pago (T)
          safe_(r[20]),         // P Estado pago (U)
          safe_(r[21]),         // Q Estado pedido (V)
          num_(r[18]),          // R Total (S)
          safe_(r[22]),         // S Retiro (W)
          safe_(r[23]),         // T Urgente (X)
          i + 2                 // U helper -> row real en orders
        ]
      });
    }

    out.sort((a, b) => parseMixedDate_(b.fecha) - parseMixedDate_(a.fecha));

    clearOperacionBody_(op);
    if (out.length) {
      const values = out.map((item) => item.values);
      const adjuntosLinks = out.map((item) => item.adjuntosUrl);

      op.getRange(2, 1, values.length, OP_HEADER.length).setValues(values);
      applyAdjuntosRichLinks_(op, adjuntosLinks);
      applyAlternatingRowStyles_(op, values.length);
      applyStatusValidations_(op, 2, Math.max(1200, values.length + 20));
    }
  } finally {
    lock.releaseLock();
  }
}

function applyOperacionLayout_(op) {
  if (op.getMaxColumns() < OP_HEADER.length) {
    op.insertColumnsAfter(op.getMaxColumns(), OP_HEADER.length - op.getMaxColumns());
  }

  op.getRange(1, 1, 1, OP_HEADER.length).setValues([OP_HEADER]);
  op.setFrozenRows(1);
  op.setRowHeight(1, 46);

  const headerRange = op.getRange(1, 1, 1, OP_HEADER.length);
  headerRange.setBackground("#2d2b29");
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  headerRange.setWrap(true);
  headerRange.setVerticalAlignment("middle");
  headerRange.setHorizontalAlignment("center");
  op.getRange(1, 1, 1, 2).setBackground("#82bfb7");
  op.getRange(1, 3, 1, 4).setBackground("#d93d79");
  op.getRange(1, 15, 1, 4).setBackground("#fab948");
  op.getRange(1, 19, 1, 2).setBackground("#6f8fc7");
  protectHeaderRow_(op);

  op.showColumns(1, OP_COL_HELPER_ROW - 1);
  op.hideColumns(OP_COL_HELPER_ROW);

  const widths = [180, 150, 220, 130, 120, 220, 200, 170, 110, 120, 300, 220, 150, 340, 170, 130, 150, 120, 210, 100, 80];
  widths.forEach((w, i) => op.setColumnWidth(i + 1, w));

  applyStatusValidations_(op, 2, 1200);

  op.getRange("R:R").setNumberFormat("$ #,##0");
  op.getRange("S:S").setNumberFormat("d/m/yyyy hh:mm");
  op.getRange("B:B").setHorizontalAlignment("left");
  op.getRange("C:C").setHorizontalAlignment("left");
  op.getRange("K:K").setWrap(true);
  op.getRange("M:M").setWrap(true);
  op.getRange("N:N").setWrap(true);
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

  const targets = getSelectedOrderTargets_(op);
  if (!targets.length) {
    ui.alert("Selecciona una celda de una fila de datos para eliminar.");
    return;
  }

  const target = targets[0];
  const orderNumber = String(target.displayNumber || "").trim();

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
    let targetOrderRow = Number(target.helperRow || 0);

    if (!targetOrderRow || targetOrderRow < 2) {
      const finder = findOrderRowByNumber_(orders, orderNumber);
      if (!finder) {
        ui.alert(`No se encontro el pedido ${orderNumber} en orders.`);
        return;
      }
      targetOrderRow = finder.getRow();
    }

    const rowValues = orders.getRange(targetOrderRow, 1, 1, orders.getLastColumn()).getValues()[0];
    const archiveRow = sanitizeRowForSheet_(rowValues);
    const archive = getOrCreateArchiveFromOrders_(ss, orders);
    archive.getRange(archive.getLastRow() + 1, 1, 1, archiveRow.length).setValues([archiveRow]);

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

  const response = ui.prompt(
    "Archivar por rango de filas",
    'Escribi el rango de filas de "operacion" que queres archivar. Ejemplo: 4-10',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const raw = String(response.getResponseText() || "").trim();
  const match = raw.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) {
    ui.alert('Formato invalido. Usa por ejemplo: 4-10');
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
    "Archivar pedidos seleccionados",
    `Se archivaran y eliminaran ${targets.length} pedido(s) del rango ${startRow}-${endRow}. ¿Queres continuar?`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) {
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
      const archiveRow = sanitizeRowForSheet_(rowValues);
      archive.getRange(archive.getLastRow() + 1, 1, 1, archiveRow.length).setValues([archiveRow]);
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
  const uiSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const activeSheet = uiSpreadsheet ? uiSpreadsheet.getActiveSheet() : null;
  const activeSheetName = activeSheet ? activeSheet.getName() : "";
  const op = ss.getSheetByName(OP_SHEET_NAME);
  const orders = ss.getSheetByName(ORDERS_SHEET);
  const archive = ss.getSheetByName(OP_ARCHIVE_SHEET);

  if (!activeSheet || !orders) {
    ui.alert("No se encontraron las hojas necesarias.");
    return;
  }

  const isOperacion = activeSheetName === OP_SHEET_NAME;
  const isArchive = activeSheetName === OP_ARCHIVE_SHEET;
  if (!isOperacion && !isArchive) {
    ui.alert('Esta opcion solo funciona desde las hojas "operacion" o "orders_archivo".');
    return;
  }
  if (isOperacion && !op) {
    ui.alert('No se encontró la hoja "operacion".');
    return;
  }
  if (isArchive && !archive) {
    ui.alert('No se encontró la hoja "orders_archivo".');
    return;
  }

  const response = ui.prompt(
    "Eliminar por rango de filas",
    `Escribi el rango de filas de "${activeSheetName}" que queres eliminar. Ejemplo: 12-28`,
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
  const archiveRowsToDelete = [];

  if (isOperacion) {
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
  } else {
    for (let rowNumber = startRow; rowNumber <= endRow; rowNumber++) {
      const displayNumber = String(archive.getRange(rowNumber, 2).getDisplayValue() || "").trim();
      if (!displayNumber) {
        continue;
      }
      archiveRowsToDelete.push(rowNumber);
    }

    if (!archiveRowsToDelete.length) {
      ui.alert("No se detectaron pedidos validos en ese rango.");
      return;
    }
  }

  const confirm = ui.alert(
    "Eliminar pedidos por rango",
    `Se eliminaran definitivamente ${isOperacion ? targets.length : archiveRowsToDelete.length} pedido(s) de las filas ${startRow}-${endRow} en "${activeSheetName}". Esta accion no los archiva. ¿Queres continuar?`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) {
    return;
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    if (isOperacion) {
      const rowsToDelete = resolveOrderRows_(orders, targets);
      rowsToDelete
        .sort((a, b) => b - a)
        .forEach((rowNumber) => {
          const rowValues = orders.getRange(rowNumber, 1, 1, orders.getLastColumn()).getValues()[0];
          trashDriveAssetsForOrderRow_(rowValues);
          orders.deleteRow(rowNumber);
        });

      refreshOperacionEditable();
      ui.alert(`Listo. Se eliminaron ${rowsToDelete.length} pedido(s) y sus adjuntos fueron enviados a la papelera de Drive.`);
      return;
    }

    archiveRowsToDelete
      .sort((a, b) => b - a)
      .forEach((rowNumber) => {
        const rowValues = archive.getRange(rowNumber, 1, 1, archive.getLastColumn()).getValues()[0];
        trashDriveAssetsForOrderRow_(rowValues);
        archive.deleteRow(rowNumber);
      });

    ui.alert(`Listo. Se eliminaron ${archiveRowsToDelete.length} pedido(s) de archivo y sus adjuntos fueron enviados a la papelera de Drive.`);
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
    .requireValueInList(["En revisión", "En preparación", "Listo para retirar"], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(startRow, OP_COL_STATUS_PAGO, endRow - startRow + 1, 1).setDataValidation(pagoRule);
  sheet.getRange(startRow, OP_COL_STATUS_PEDIDO, endRow - startRow + 1, 1).setDataValidation(pedidoRule);
}

function applyAlternatingRowStyles_(sheet, rowCount) {
  if (!rowCount) {
    return;
  }

  const visibleCols = OP_COL_HELPER_ROW - 1;
  const values = [];
  for (let i = 0; i < rowCount; i++) {
    const color = i % 2 === 0 ? "#ffffff" : "#f7f6f3";
    values.push(new Array(visibleCols).fill(color));
  }

  sheet.getRange(2, 1, rowCount, visibleCols).setBackgrounds(values);
}

function getSelectedOrderTargets_(opSheet) {
  const rangeList = opSheet.getActiveRangeList();
  const activeRange = opSheet.getActiveRange();
  const currentCell = opSheet.getCurrentCell();
  const ranges = rangeList
    ? rangeList.getRanges()
    : (activeRange ? [activeRange] : (currentCell ? [currentCell] : []));
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
  if (!uniqueRows.length && currentCell && currentCell.getRow() >= 2) {
    uniqueRows.push(currentCell.getRow());
  }
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

function formatCoverageForOperacion_(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) {
    return "";
  }

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return text;
    }

    const parts = parsed.map((item) => {
      const label = String((item && (item.label || item.coverage)) || "").trim();
      const sheets = Number(item && item.sheets);
      if (!label) {
        return "";
      }
      if (!isNaN(sheets) && sheets > 0) {
        return `${label}: ${sheets}`;
      }
      return label;
    }).filter(Boolean);

    return parts.join(" | ");
  } catch (err) {
    return text;
  }
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

  sheet.getRange(2, 13, richValues.length, 1).setRichTextValues(richValues);
}

function truncateCellText_(value, maxLen) {
  const text = String(value || "");
  const limit = Number(maxLen) || 45000;
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 1))}...`;
}

function sanitizeRowForSheet_(rowValues) {
  return (rowValues || []).map((value) => {
    if (value == null) {
      return "";
    }
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    return truncateCellText_(String(value), 45000);
  });
}

function trashDriveAssetsForOrderRow_(rowValues) {
  const row = Array.isArray(rowValues) ? rowValues : [];
  const linksRaw = String(row[25] == null ? "" : row[25]).trim();
  const fileIdsRaw = String(row[26] == null ? "" : row[26]).trim();
  const fileIds = fileIdsRaw
    .split("|")
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  for (let i = 0; i < fileIds.length; i++) {
    try {
      DriveApp.getFileById(fileIds[i]).setTrashed(true);
    } catch (err) {
      console.log(`No se pudo mandar a papelera el archivo ${fileIds[i]}: ${err}`);
    }
  }

  const folderId = extractDriveFolderId_(linksRaw);
  if (!folderId) {
    return;
  }

  try {
    DriveApp.getFolderById(folderId).setTrashed(true);
  } catch (err) {
    console.log(`No se pudo mandar a papelera la carpeta ${folderId}: ${err}`);
  }
}

function extractDriveFolderId_(value) {
  const text = String(value || "").trim();
  if (!text || text.indexOf("/folders/") === -1) {
    return "";
  }

  const match = text.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? String(match[1] || "").trim() : "";
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
  if (typeof styleOrdersHeader_ === "function") {
    styleOrdersHeader_(archiveSheet);
  }
  protectHeaderRow_(archiveSheet);
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
  applyPricesLayout29();

  ui.alert('Listo. La columna "disponible" en prices ahora tiene dropdown TRUE/FALSE.');
}

function applyPricesLayout29() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const prices = ss.getSheetByName("prices");
  if (!prices) {
    return;
  }

  const lastCol = prices.getLastColumn();
  if (lastCol < 1) {
    return;
  }

  prices.setFrozenRows(1);
  prices.setRowHeight(1, 52);

  const headerRange = prices.getRange(1, 1, 1, lastCol);
  headerRange
    .setBackground("#2d2b29")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setWrap(true)
    .setVerticalAlignment("middle")
    .setHorizontalAlignment("center");
  protectHeaderRow_(prices);

  const headers = prices.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h || "").trim().toLowerCase());
  const colPrecio = findPricesHeaderIndex_(headers, ["precio unitario", "price"]) + 1;
  const colDisponible = findPricesHeaderIndex_(headers, ["disponible", "active"]) + 1;

  if (colPrecio > 0) {
    prices.getRange(1, colPrecio).setBackground("#fab948");
    prices.setColumnWidth(colPrecio, 170);
  }
  if (colDisponible > 0) {
    prices.getRange(1, colDisponible).setBackground("#fab948");
    prices.setColumnWidth(colDisponible, 120);
    if (prices.getMaxRows() > 1) {
      prices.getRange(2, colDisponible, prices.getMaxRows() - 1, 1).setHorizontalAlignment("center");
    }
  }

  const widths = [190, 180, 190, 170, 190, 140, 170, 140];
  widths.forEach((width, index) => {
    if (index + 1 <= lastCol) {
      prices.setColumnWidth(index + 1, width);
    }
  });
}

function findPricesHeaderIndex_(headers, aliases) {
  const normalizedAliases = (aliases || []).map((value) => String(value || "").trim().toLowerCase());
  for (let i = 0; i < headers.length; i++) {
    const header = String(headers[i] || "").trim().toLowerCase();
    if (normalizedAliases.includes(header)) {
      return i;
    }
    for (let j = 0; j < normalizedAliases.length; j++) {
      if (header.indexOf(normalizedAliases[j]) !== -1) {
        return i;
      }
    }
  }
  return -1;
}

function protectHeaderRow_(sheet) {
  if (!sheet) {
    return;
  }

  const maxCols = Math.max(sheet.getLastColumn(), sheet.getMaxColumns(), 1);
  const targetRange = sheet.getRange(1, 1, 1, maxCols);
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);

  protections.forEach((protection) => {
    try {
      const range = protection.getRange();
      if (
        range &&
        range.getSheet().getSheetId() === sheet.getSheetId() &&
        range.getRow() === 1 &&
        range.getNumRows() === 1
      ) {
        protection.remove();
      }
    } catch (err) {
      console.log(`No se pudo limpiar una proteccion previa del encabezado en ${sheet.getName()}: ${err}`);
    }
  });

  const protection = targetRange.protect().setDescription(`Encabezado protegido - ${sheet.getName()}`);
  const me = Session.getEffectiveUser();
  const myEmail = me ? String(me.getEmail() || "").trim() : "";

  if (myEmail) {
    const keepEditors = protection.getEditors().filter((editor) => String(editor.getEmail() || "").trim() === myEmail);
    protection.removeEditors(protection.getEditors().filter((editor) => String(editor.getEmail() || "").trim() !== myEmail));
    if (!keepEditors.length) {
      protection.addEditor(myEmail);
    }
  }

  if (protection.canDomainEdit()) {
    protection.setDomainEdit(false);
  }
  protection.setWarningOnly(false);
}
