window.APP_CONFIG = {
  // Opciones: "local" o "remote-json"
  pricesMode: "remote-json",

  // Si pricesMode = "remote-json", consulta Apps Script con ?action=prices
  pricesJsonUrl: "https://script.google.com/macros/s/AKfycbwKbtDBiQv7gk31fNzfZlCf6cPDb3o_9SkokmdB_zQhC41GmAeROw83o9BGenyuk8MwfA/exec?action=prices",

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
  whatsappMessage: "Hola! Quiero cotizar un pedido en tamaño personalizado.",

  // Configuración de retiro (opciones cerradas en el front)
  pickupSchedule: {
    // 0=domingo, 1=lunes, ... 6=sábado
    allowedWeekdays: [1, 2, 3, 4, 5],
    // Horarios habilitados (24 hs)
    slots: [
      "07:30", "08:00", "08:30", "09:00", "09:30",
      "10:00", "10:30", "11:00", "11:30", "12:00",
      "12:30", "13:00", "13:30", "14:00", "14:30",
      "15:00", "15:30", "16:00", "16:30", "17:00",
      "17:30", "18:00", "18:30", "19:00", "19:30"
    ],
    // Días futuros que se muestran
    daysAhead: 21
  }
};
