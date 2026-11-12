window.APP_CONFIG = {
  // Opciones: "local" o "remote-json"
  pricesMode: "remote-json",

  // Si pricesMode = "remote-json", consulta Apps Script con ?action=prices
  pricesJsonUrl: "https://script.google.com/macros/s/AKfycbzzESSETeRakNDaKDdlC4uYH-j8OiQWvxrEgxQNXFtljJ7wA_Tvwixs7K7HRp-MFOdLQQ/exec?action=prices",

  // Web App de Apps Script para guardar pedidos en Google Sheets
  // y subir archivos adjuntos a Google Drive.
  // Ejemplo: https://script.google.com/macros/s/AKfycb.../exec
  ordersWebhookUrl: "https://script.google.com/macros/s/AKfycbzzESSETeRakNDaKDdlC4uYH-j8OiQWvxrEgxQNXFtljJ7wA_Tvwixs7K7HRp-MFOdLQQ/exec",

  // Botón de pago con Mercado Pago. Para apagarlo rápido: poné false.
  mercadoPagoEnabled: true,

  // Stock por papel: true = disponible, false = sin stock
  // Ejemplo: { "plotter_cartulina_170": false, "opp": false }
  paperAvailabilityOverrides: {},

  // WhatsApp para consultas de tamaño personalizado de plotter
  // Formato internacional sin '+' ni espacios. Ejemplo: "5491122334455"
  whatsappNumber: "543417466857",
  whatsappMessage: "Hola! Quiero cotizar un pedido en tamaño personalizado.",

  // Recargo por pedido urgente: porcentaje sobre el total y monto mínimo en pesos.
  urgentSurcharge: { rate: 0.2, min: 1000 },

  // Papeles que necesitan días hábiles de producción (no se pueden pedir para el mismo día ni urgentes).
  paperLeadDays: { plotter_fotografico_180: 1 },

  // Medidas permitidas para el tamaño personalizado de plotter (en metros, por lado).
  customSizeLimits: { minM: 0.30, maxM: 3 },

  // Configuración de retiro (opciones cerradas en el front)
  pickupSchedule: {
    // 0=domingo, 1=lunes, ... 6=sábado
    allowedWeekdays: [1, 2, 3, 4, 5],
    // Días que el local está cerrado (feriados o cierres propios), formato "AAAA-MM-DD".
    // No cuentan como días hábiles y no se ofrecen horarios de retiro.
    closedDates: [
      "2026-11-23", "2026-12-07", "2026-12-08", "2026-12-25", "2026-12-31", "2027-01-01"
    ],
    // Pedidos hechos a partir de esta hora (o en un día cerrado) empiezan a contarse desde el día hábil siguiente.
    cutoffHour: 18,
    // Horarios habilitados (24 hs)
    slots: [
      "07:30", "08:00", "08:30", "09:00", "09:30",
      "10:00", "10:30", "11:00", "11:30", "12:00",
      "12:30", "13:00", "13:30", "14:00", "14:30",
      "15:00", "15:30", "16:00", "16:30", "17:00",
      "17:30", "18:00", "18:30", "19:00", "19:30"
    ],
    // Días futuros que se muestran
    daysAhead: 21,
    // Minutos mínimos entre el momento del pedido y el horario de retiro elegido
    // (para que nadie use un horario inmediato como si fuera urgente sin pagar el recargo)
    minLeadMinutes: 20
  }
};
