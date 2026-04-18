/**
 * 29 BIS - Premium Google Sheets setup
 * Ejecutar apply29BISPremiumSheets() una vez luego de importar CSVs.
 * Recomendado desde la cuenta del cliente: 29bisploteos@gmail.com
 */

function apply29BISPremiumSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orders = ss.getSheetByName("orders");
  const prices = ss.getSheetByName("prices");
  const meta = ss.getSheetByName("meta");
  const dashboard = getOrCreateSheet_(ss, "dashboard");

  if (!orders || !prices || !meta) {
    throw new Error("Faltan hojas requeridas: orders, prices, meta.");
  }

  styleOrders_(orders);
  stylePrices_(prices);
  styleMeta_(meta);
  buildDashboard_(dashboard);
}

function styleOrders_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 33);
  const lastRow = Math.max(sheet.getLastRow(), 2);

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, lastCol)
    .setBackground("#1c1c1a")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange(2, 1, lastRow - 1, lastCol).setFontFamily("Arial");
  sheet.getRange(2, 1, lastRow - 1, lastCol).setVerticalAlignment("middle");

  sheet.getRange("A:A").setNumberFormat("dd/mm/yyyy hh:mm");
  sheet.getRange("V:V").setNumberFormat("dd/mm/yyyy hh:mm");
  sheet.getRange("O:R").setNumberFormat("\"$\" #,##0");
  sheet.getRange("P:P").setNumberFormat("0%");
  sheet.getRange("X:Z").setWrap(true);
  sheet.getRange("AF:AF").setNumberFormat("dd/mm/yyyy hh:mm");

  sheet.setColumnWidths(1, 1, 170);   // created_at
  sheet.setColumnWidths(2, 1, 170);   // order_number
  sheet.setColumnWidths(3, 3, 170);   // customer block
  sheet.setColumnWidths(6, 3, 150);   // machine/paper/size
  sheet.setColumnWidths(9, 3, 120);   // custom sizes
  sheet.setColumnWidths(12, 1, 110);  // sides
  sheet.setColumnWidths(13, 1, 220);  // coverage
  sheet.setColumnWidths(14, 5, 120);  // totals
  sheet.setColumnWidths(19, 3, 155);  // payment/prod
  sheet.setColumnWidths(22, 1, 170);  // pickup
  sheet.setColumnWidths(23, 1, 95);   // urgent
  sheet.setColumnWidths(24, 4, 230);  // files
  sheet.setColumnWidths(28, 2, 210);  // notes/raw
  sheet.setColumnWidths(30, 4, 160);  // internal fields

  applyAlternatingRows_(sheet, 2, 1, lastRow - 1, lastCol, "#ffffff", "#fdfaf5");
  applyOrdersConditionalFormatting_(sheet);
  applyOrdersDropdowns_(sheet);
}

function stylePrices_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 8);
  const lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, lastCol)
    .setBackground("#1c1c1a")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  applyAlternatingRows_(sheet, 2, 1, lastRow - 1, lastCol, "#ffffff", "#f9fcfb");
  sheet.getRange("G:G").setNumberFormat("\"$\" #,##0");
  sheet.setColumnWidths(1, 8, 170);
}

function styleMeta_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 4);
  const lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, lastCol)
    .setBackground("#1c1c1a")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  applyAlternatingRows_(sheet, 2, 1, lastRow - 1, lastCol, "#ffffff", "#fff8ef");
  sheet.setColumnWidths(1, 1, 150);
  sheet.setColumnWidths(2, 1, 180);
  sheet.setColumnWidths(3, 1, 120);
  sheet.setColumnWidths(4, 1, 95);
}

function buildDashboard_(sheet) {
  sheet.clear({ contentsOnly: true, formatOnly: true });
  sheet.setHiddenGridlines(true);
  sheet.setColumnWidths(1, 6, 190);
  sheet.setRowHeights(1, 20, 34);

  sheet.getRange("A1:F1")
    .merge()
    .setValue("29 BIS - Panel de Gestion")
    .setFontSize(18)
    .setFontWeight("bold")
    .setBackground("#1c1c1a")
    .setFontColor("#ffffff")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  const cards = [
    { cell: "A3", label: "Pedidos totales", formula: '=COUNTA(orders!B2:B)' },
    { cell: "C3", label: "Pagados", formula: '=COUNTIF(orders!T2:T,"Pagado")' },
    { cell: "E3", label: "Pendientes de pago", formula: '=COUNTIF(orders!T2:T,"Pendiente")' },
    { cell: "A7", label: "En produccion", formula: '=COUNTIF(orders!U2:U,"En produccion")' },
    { cell: "C7", label: "Listos para retirar", formula: '=COUNTIF(orders!U2:U,"Listo para retirar")' },
    { cell: "E7", label: "Facturacion total", formula: '=SUM(orders!R2:R)', money: true }
  ];

  cards.forEach((card) => {
    const start = card.cell;
    const row = Number(start.match(/\d+/)[0]);
    const col = start.charCodeAt(0) - 64;
    sheet.getRange(row, col, 1, 2).merge()
      .setValue(card.label)
      .setBackground("#fff4e5")
      .setFontWeight("bold")
      .setFontColor("#1c1c1a")
      .setHorizontalAlignment("left")
      .setVerticalAlignment("middle");
    sheet.getRange(row + 1, col, 1, 2).merge().setFormula(card.formula)
      .setBackground("#ffffff")
      .setFontSize(18)
      .setFontWeight("bold")
      .setFontColor("#e84883")
      .setHorizontalAlignment("left")
      .setVerticalAlignment("middle");
    if (card.money) {
      sheet.getRange(row + 1, col, 1, 2).setNumberFormat("\"$\" #,##0");
    }
    sheet.getRange(row, col, 2, 2).setBorder(true, true, true, true, false, false, "#e8d8c5", SpreadsheetApp.BorderStyle.SOLID);
  });

  sheet.getRange("A12:F12")
    .merge()
    .setValue("Ultimos pedidos")
    .setBackground("#82bfb7")
    .setFontColor("#1c1c1a")
    .setFontWeight("bold")
    .setHorizontalAlignment("left");

  sheet.getRange("A13:F20").setFormula('=QUERY(orders!A:U,"select B,C,T,U,R where B is not null order by A desc limit 8",0)');
  sheet.getRange("A13:F13")
    .setBackground("#1c1c1a")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  sheet.getRange("E:E").setNumberFormat("\"$\" #,##0");
}

function applyAlternatingRows_(sheet, startRow, startCol, numRows, numCols, colorA, colorB) {
  if (numRows <= 0 || numCols <= 0) {
    return;
  }
  const range = sheet.getRange(startRow, startCol, numRows, numCols);
  const banding = range.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
  banding.setFirstRowColor(colorA);
  banding.setSecondRowColor(colorB);
  banding.setHeaderRowColor("#1c1c1a");
}

function applyOrdersDropdowns_(sheet) {
  const paymentRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Pendiente", "Pagado"], true)
    .setAllowInvalid(false)
    .build();
  const productionRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Recibido", "En revision", "En produccion", "Listo para retirar", "Entregado", "Cancelado"], true)
    .setAllowInvalid(false)
    .build();
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Baja", "Media", "Alta"], true)
    .setAllowInvalid(false)
    .build();
  const notifiedRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["No", "Si"], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange("T2:T").setDataValidation(paymentRule);
  sheet.getRange("U2:U").setDataValidation(productionRule);
  sheet.getRange("AD2:AD").setDataValidation(priorityRule);
  sheet.getRange("AG2:AG").setDataValidation(notifiedRule);
}

function applyOrdersConditionalFormatting_(sheet) {
  const rules = sheet.getConditionalFormatRules();
  const paymentRange = sheet.getRange("T2:T");
  const productionRange = sheet.getRange("U2:U");
  const priorityRange = sheet.getRange("AD2:AD");

  rules.push(
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Pendiente").setBackground("#fff5df").setFontColor("#7d5600").setRanges([paymentRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Pagado").setBackground("#e8f8f5").setFontColor("#1b6e54").setRanges([paymentRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("En produccion").setBackground("#ffe8f1").setFontColor("#9f1e58").setRanges([productionRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Listo para retirar").setBackground("#e7f7f4").setFontColor("#1f5f59").setRanges([productionRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Alta").setBackground("#ffe5ec").setFontColor("#9e1f57").setRanges([priorityRange]).build()
  );

  sheet.setConditionalFormatRules(rules);
}

function getOrCreateSheet_(ss, name) {
  const existing = ss.getSheetByName(name);
  return existing || ss.insertSheet(name);
}
