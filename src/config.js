window.APP_CONFIG = {
  // Opciones: "local" o "remote-json"
  pricesMode: "local",

  // Si pricesMode = "remote-json", el JSON debe tener la misma estructura que PRICING_DATA
  pricesJsonUrl: "",

  // Web App de Apps Script para guardar pedidos en Google Sheets
  // y subir archivos adjuntos a Google Drive.
  // Ejemplo: https://script.google.com/macros/s/AKfycb.../exec
  ordersWebhookUrl: "https://script.google.com/macros/s/AKfycbwKbtDBiQv7gk31fNzfZlCf6cPDb3o_9SkokmdB_zQhC41GmAeROw83o9BGenyuk8MwfA/exec",

  // Stock por papel: true = disponible, false = sin stock
  // Ejemplo: { "plotter_cartulina_170": false, "opp": false }
  paperAvailabilityOverrides: {},

  // WhatsApp para consultas de tamaño personalizado de plotter
  // Formato internacional sin '+' ni espacios. Ejemplo: "5491122334455"
  whatsappNumber: "543417466857",
  whatsappMessage: "Hola! Quiero cotizar un pedido en tamaño personalizado."
};
