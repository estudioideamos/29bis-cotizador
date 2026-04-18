window.APP_CONFIG = {
  // Opciones: "local" o "remote-json"
  pricesMode: "local",

  // Si pricesMode = "remote-json", el JSON debe tener la misma estructura que PRICING_DATA
  pricesJsonUrl: "",

  // Web App de Apps Script para guardar pedidos en Google Sheets.
  // Ejemplo: https://script.google.com/macros/s/AKfycb.../exec
  ordersWebhookUrl: "",

  // Stock por papel: true = disponible, false = sin stock
  // Ejemplo: { "plotter_cartulina_170": false, "opp": false }
  paperAvailabilityOverrides: {},

  // WhatsApp para consultas de tamaño personalizado de plotter
  // Formato internacional sin '+' ni espacios. Ejemplo: "5491122334455"
  whatsappNumber: "",
  whatsappMessage: "Hola! Necesito cotizar una impresión en tamaño personalizado."
};
