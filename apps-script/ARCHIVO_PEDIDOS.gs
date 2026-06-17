/**
 * 29 BIS - Archivo mensual de pedidos entregados
 *
 * Objetivo:
 * - Mover automáticamente desde "orders" hacia "orders_archivo"
 *   los pedidos con estado de producción "Entregado"
 *   cuya fecha de creación pertenezca a meses anteriores al actual.
 *
 * Uso rápido:
 * 1) Ejecutar: archiveDeliveredOrdersMonthly()
 * 2) (Opcional) Ejecutar una vez: createMonthlyArchiveTrigger()
 *    para que se archive de forma automática 1 vez por mes.
 */

const ARCHIVE_SOURCE_SHEET = "orders";
const ARCHIVE_TARGET_SHEET = "orders_archivo";
const ARCHIVE_STATUS_LABEL = "entregado";

function archiveDeliveredOrdersMonthly() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const source = ss.getSheetByName(ARCHIVE_SOURCE_SHEET);
  if (!source) {
    throw new Error(`No existe la hoja "${ARCHIVE_SOURCE_SHEET}".`);
  }

  const values = source.getDataRange().getValues();
  if (!values || values.length < 2) {
    return { moved: 0, message: "No hay pedidos para archivar." };
  }

  const header = values[0];
  const normalizedHeader = header.map(normalizeArchiveHeader_);
  const idxCreatedAt = findArchiveHeaderIndex_(normalizedHeader, ["fecha de creacion", "fecha y hora de creacion"]);
  const idxProduction = findArchiveHeaderIndex_(normalizedHeader, ["estado pedido", "estado de produccion"]);

  if (idxCreatedAt === -1 || idxProduction === -1) {
    throw new Error('No se encontraron columnas requeridas para archivado: fecha de creacion y/o estado pedido.');
  }

  const target = getOrCreateArchiveSheet_(ss, source, header);
  const firstDayCurrentMonth = getFirstDayOfCurrentMonth_();

  const rowsToArchive = [];
  const sourceRowNumbers = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const status = normalizeArchiveHeader_(row[idxProduction]);
    if (!matchesArchiveStatus_(status)) {
      continue;
    }

    const createdAt = parseOrderDate_(row[idxCreatedAt]);
    if (!createdAt) {
      continue;
    }

    // Se archiva si el pedido es de un mes anterior al actual.
    if (createdAt < firstDayCurrentMonth) {
      rowsToArchive.push(row);
      sourceRowNumbers.push(i + 1); // +1 por encabezado
    }
  }

  if (!rowsToArchive.length) {
    return { moved: 0, message: "No hay pedidos entregados de meses anteriores para archivar." };
  }

  prependArchiveRows_(target, rowsToArchive);

  // Eliminar desde abajo hacia arriba para no desplazar índices.
  sourceRowNumbers.sort((a, b) => b - a).forEach((rowNum) => source.deleteRow(rowNum));

  return {
    moved: rowsToArchive.length,
    message: `Se archivaron ${rowsToArchive.length} pedido(s) en "${ARCHIVE_TARGET_SHEET}".`
  };
}

function createMonthlyArchiveTrigger() {
  const fnName = "archiveDeliveredOrdersMonthly";
  const existing = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === fnName);
  if (existing) {
    return "Ya existe un trigger mensual para archiveDeliveredOrdersMonthly.";
  }

  ScriptApp.newTrigger(fnName)
    .timeBased()
    .onMonthDay(1)
    .atHour(3)
    .create();

  return "Trigger mensual creado: día 1 de cada mes a las 03:00.";
}

function deleteMonthlyArchiveTriggers() {
  const fnName = "archiveDeliveredOrdersMonthly";
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === fnName) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  return `Triggers eliminados: ${removed}.`;
}

function previewArchiveDeliveredOrdersMonthly() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const source = ss.getSheetByName(ARCHIVE_SOURCE_SHEET);
  if (!source) {
    throw new Error(`No existe la hoja "${ARCHIVE_SOURCE_SHEET}".`);
  }

  const values = source.getDataRange().getValues();
  if (!values || values.length < 2) {
    return { candidates: 0, sample: [] };
  }

  const header = values[0];
  const normalizedHeader = header.map(normalizeArchiveHeader_);
  const idxCreatedAt = findArchiveHeaderIndex_(normalizedHeader, ["fecha de creacion", "fecha y hora de creacion"]);
  const idxProduction = findArchiveHeaderIndex_(normalizedHeader, ["estado pedido", "estado de produccion"]);
  const idxOrder = findArchiveHeaderIndex_(normalizedHeader, ["n° pedido", "numero de pedido", "n pedido"]);

  if (idxCreatedAt === -1 || idxProduction === -1) {
    throw new Error('No se encontraron columnas requeridas para preview.');
  }

  const firstDayCurrentMonth = getFirstDayOfCurrentMonth_();
  const sample = [];
  let count = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const status = normalizeArchiveHeader_(row[idxProduction]);
    if (!matchesArchiveStatus_(status)) {
      continue;
    }
    const createdAt = parseOrderDate_(row[idxCreatedAt]);
    if (!createdAt) {
      continue;
    }
    if (createdAt < firstDayCurrentMonth) {
      count++;
      if (sample.length < 10) {
        sample.push({
          numero_pedido: idxOrder >= 0 ? row[idxOrder] : "",
          fecha_creacion: row[idxCreatedAt],
          estado_produccion: row[idxProduction]
        });
      }
    }
  }

  return { candidates: count, sample };
}

function getOrCreateArchiveSheet_(ss, sourceSheet, header) {
  let target = ss.getSheetByName(ARCHIVE_TARGET_SHEET);
  if (!target) {
    target = ss.insertSheet(ARCHIVE_TARGET_SHEET);
  }

  syncArchiveSchema_(target, sourceSheet, header);
  return target;
}

function syncArchiveSchema_(target, sourceSheet, header) {
  const requiredCols = Array.isArray(header) ? header.length : 0;
  if (requiredCols < 1) {
    return;
  }

  const currentCols = target.getMaxColumns();
  if (currentCols < requiredCols) {
    target.insertColumnsAfter(currentCols, requiredCols - currentCols);
  }

  target.getRange(1, 1, 1, requiredCols).setValues([header]);
  target.setFrozenRows(1);
  sourceSheet.getRange(1, 1, 1, requiredCols).copyTo(target.getRange(1, 1, 1, requiredCols), { formatOnly: true });
}

function normalizeArchiveHeader_(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findArchiveHeaderIndex_(headers, aliases) {
  const normalizedAliases = (aliases || []).map(normalizeArchiveHeader_);
  for (let i = 0; i < headers.length; i++) {
    const current = normalizeArchiveHeader_(headers[i]);
    if (normalizedAliases.includes(current)) {
      return i;
    }
  }
  return -1;
}

function matchesArchiveStatus_(status) {
  return [ARCHIVE_STATUS_LABEL, "para archivar", "archivar"].includes(normalizeArchiveHeader_(status));
}

function prependArchiveRows_(target, rows) {
  const cleanRows = Array.isArray(rows) ? rows.filter((row) => Array.isArray(row) && row.length) : [];
  if (!cleanRows.length) {
    return;
  }

  const lastCol = Math.max(target.getLastColumn(), cleanRows[0].length);
  const lastRow = target.getLastRow();
  const existingRows = lastRow > 1
    ? target.getRange(2, 1, lastRow - 1, lastCol).getValues()
    : [];
  const mergedRows = [...cleanRows, ...existingRows]
    .filter(hasArchiveMonthlyData_)
    .sort(compareArchiveMonthlyRowsNewestFirst_);

  if (lastRow > 1) {
    target.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    target.getRange(2, 1, lastRow - 1, lastCol).clearFormat();
  }

  target.getRange(2, 1, mergedRows.length, lastCol).setValues(
    mergedRows.map((row) => normalizeArchiveMonthlyRowWidth_(row, lastCol))
  );
  target.getRange(2, 1, mergedRows.length, lastCol).clearFormat();
}

function hasArchiveMonthlyData_(row) {
  return (row || []).some((cell) => {
    if (cell == null) {
      return false;
    }
    if (Object.prototype.toString.call(cell) === "[object Date]") {
      return !isNaN(cell.getTime());
    }
    if (typeof cell === "number") {
      return cell !== 0;
    }
    if (typeof cell === "boolean") {
      return true;
    }
    return String(cell).trim() !== "";
  });
}

function normalizeArchiveMonthlyRowWidth_(row, width) {
  const source = Array.isArray(row) ? row.slice(0, width) : [];
  while (source.length < width) {
    source.push("");
  }
  return source;
}

function compareArchiveMonthlyRowsNewestFirst_(rowA, rowB) {
  const keyA = getArchiveMonthlyOrderNumberSortKey_(rowA);
  const keyB = getArchiveMonthlyOrderNumberSortKey_(rowB);
  if (keyA && keyB && keyA !== keyB) {
    return keyA > keyB ? -1 : 1;
  }

  const dateA = getArchiveMonthlyDateSortValue_(rowA);
  const dateB = getArchiveMonthlyDateSortValue_(rowB);
  if (dateA !== dateB) {
    return dateB - dateA;
  }

  return 0;
}

function getArchiveMonthlyOrderNumberSortKey_(row) {
  const raw = Array.isArray(row) ? row[1] : "";
  return String(raw || "")
    .trim()
    .replace(/^29BIS-/i, "");
}

function getArchiveMonthlyDateSortValue_(row) {
  const raw = Array.isArray(row) ? row[0] : "";
  const parsed = parseOrderDate_(raw);
  return parsed ? parsed.getTime() : 0;
}

function getFirstDayOfCurrentMonth_() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function parseOrderDate_(value) {
  if (!value) {
    return null;
  }

  // Caso Date nativo
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  // Formato esperado: dd/MM/yyyy HH:mm
  const ar = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (ar) {
    const day = Number(ar[1]);
    const month = Number(ar[2]) - 1;
    const year = Number(ar[3]);
    const hh = Number(ar[4] || 0);
    const mm = Number(ar[5] || 0);
    const d = new Date(year, month, day, hh, mm, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback para ISO u otros formatos parseables.
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}
