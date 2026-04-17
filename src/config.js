window.APP_CONFIG = {
  // Opciones: "local" o "remote-json"
  pricesMode: "local",

  // Si pricesMode = "remote-json", el JSON debe tener la misma estructura que PRICING_DATA
  pricesJsonUrl: "",

  // Web App de Apps Script para guardar pedidos en Google Sheets.
  // Ejemplo: https://script.google.com/macros/s/AKfycb.../exec
  ordersWebhookUrl: ""
};
