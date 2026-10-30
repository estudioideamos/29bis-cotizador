// ============================================================
// SERVICIOS ADICIONALES DEL COTIZADOR
// Para cambiar un precio o un plazo, editá solamente los números de este archivo.
// (Los plazos "days" son días hábiles de producción.)
// ============================================================
window.SERVICES_DATA = {
  services: {
    anillado: {
      label: "Anillado",
      machine: "laser",
      sizes: ["A4"],
      price: 5000,            // por trabajo
      days: 1,
      priceHint: "$5.000 por trabajo",
      info: "Incluye anillo doble alambre y tapas plásticas. Si querés tapas en papel grueso, imprimilas en tu archivo y podés laminarlas."
    },
    empanelado: {
      label: "Empanelado",
      machine: "plotter",
      noCustomSize: true,     // en tamaño personalizado: consultar
      days: 2,
      priceHint: "desde $10.000 por m²",
      info: "Se cobra por m² según el soporte. Para tamaños personalizados, consultanos por WhatsApp.",
      supports: {
        carton_corrugado: { label: "Cartón corrugado", pricePerM2: 10000 },
        carton_pluma: { label: "Cartón pluma", pricePerM2: 25000 }
      },
      sizeAreaM2: {
        A2: 0.42 * 0.594,
        A1: 0.594 * 0.841,
        A0: 0.841 * 1.189,
        "35x50": 0.35 * 0.5,
        "50x70": 0.5 * 0.7,
        "70x100": 0.7 * 1.0
      }
    },
    laminado: {
      label: "Laminado",
      machine: "laser",
      sizes: ["A4", "A3", "SA3"],
      days: 1,
      priceHint: "desde $500 por hoja",
      info: "Se cobra por hoja. Brillante o mate, mismo precio.",
      priceBySize: {          // por hoja
        A4: { sf: 500, df: 800 },
        A3: { sf: 900, df: 1500 },
        SA3: { sf: 900, df: 1500 }
      }
    },
    abrochado: {
      label: "Abrochado",
      machine: "laser",
      sizes: ["A4", "A3", "SA3"],
      maxSheetsAcaballado: 40,   // el abrochado al medio (acaballado) se hace hasta 40 hojas
      price: 1500,            // por trabajo
      days: 1,
      priceHint: "$1.500 por trabajo",
      info: ""
    },
    refilado: {
      label: "Refilado",
      machine: "laser",
      sizes: ["A4", "A3", "SA3"],
      pricePerSheet: 300,     // por hoja suelta
      priceWithAbrochado: 1500, // si va junto con abrochado: precio total del refilado
      days: 1,
      priceHint: "$300 por hoja ($1.500 si va con abrochado)",
      info: ""
    },
    troquelado: {
      label: "Troquelado",
      machine: "laser",
      sizes: ["A4", "SA3"],
      papers: ["autoadhesivo_obra", "autoadhesivo_brillo"],
      days: 3,
      daysOver: { sheets: 10, days: 5 },   // más de 10 hojas: 1 semana (5 días hábiles)
      priceHint: "desde $1.500 por hoja",
      // Cuando esté lista la publicación de Instagram, pegá su link entre las comillas.
      // Mientras esté vacío, el botón "Ver cómo preparar el archivo" no se muestra.
      helpUrl: "https://www.instagram.com/p/DfF8Srpgen0/?obrf=MWE5NGVtcGEzcnMwag==",
      fileNote: "Para troquelar necesitamos un archivo de Illustrator (.ai) con lo que se imprime en una capa y la silueta de corte en otra capa.",
      discount: { minSheets: 10, rate: 0.3 },   // 30% desde 10 hojas del mismo diseño
      info: "Solo en autoadhesivos. Con más de 10 hojas la demora es de 1 semana. Desde 10 hojas del mismo diseño tenés 30% de descuento.",
      priceBySize: { A4: 1500, SA3: 2500 }  // por hoja
    }
  },

  // Servicios que se pueden pedir juntos en un mismo trabajo (el resto no se combina).
  compat: [
    ["anillado", "laminado"],
    ["abrochado", "laminado"],
    ["abrochado", "refilado"],
    ["refilado", "laminado"],
    ["laminado", "troquelado"]
  ]
};
