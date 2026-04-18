window.PRICING_DATA = {
  machines: {
    laser: {
      label: "Láser (Canon C710)",
      description: "Impresión comercial general: tarjetas, folletos, trípticos, flyers.",
      papers: [
        "obra_80",
        "chambril_90",
        "chambril_150",
        "chambril_180",
        "chambril_240",
        "ilustracion_115",
        "ilustracion_150",
        "ilustracion_210",
        "ilustracion_300",
        "kraft_125",
        "autoadhesivo_obra",
        "autoadhesivo_brillo",
        "vegetal",
        "opp",
        "cartulina_encapada_280"
      ]
    },
    plotter: {
      label: "Plotter (Canon iPF830)",
      description: "Resolución 2400x1200 ppp, ancho máximo 105cm.",
      papers: [
        "plotter_obra_90",
        "plotter_cartulina_130",
        "plotter_cartulina_170",
        "plotter_fotografico_180",
        "plotter_vegetal",
        "plotter_poliester_100"
      ]
    }
  },

  papers: {
    obra_80: { label: "Obra 80gr", type: "laser-common" },
    chambril_90: { label: "Chambril 90gr", type: "laser-special" },
    chambril_150: { label: "Chambril 150gr", type: "laser-special" },
    chambril_180: { label: "Chambril 180gr", type: "laser-special" },
    chambril_240: { label: "Chambril 240gr", type: "laser-special" },
    ilustracion_115: { label: "Ilustración 115gr", type: "laser-special" },
    ilustracion_150: { label: "Ilustración 150gr", type: "laser-special" },
    ilustracion_210: { label: "Ilustración 210gr", type: "laser-special" },
    ilustracion_300: { label: "Ilustración 300gr", type: "laser-special" },
    kraft_125: { label: "Kraft 125gr", type: "laser-special" },
    autoadhesivo_obra: { label: "Autoadhesivo obra", type: "laser-special" },
    autoadhesivo_brillo: { label: "Autoadhesivo brillo (ilustración)", type: "laser-special" },
    vegetal: { label: "Vegetal", type: "laser-special-plotter-shared" },
    opp: { label: "OPP", type: "laser-special" },
    cartulina_encapada_280: { label: "Cartulina encapada 280gr", type: "laser-special" },

    plotter_obra_90: { label: "Obra 90gr", type: "plotter" },
    plotter_cartulina_130: { label: "Cartulina 130gr", type: "plotter" },
    plotter_cartulina_170: { label: "Cartulina 170gr", type: "plotter" },
    plotter_fotografico_180: { label: "Fotográfico 180gr", type: "plotter" },
    plotter_vegetal: { label: "Vegetal 90gr", type: "plotter" },
    plotter_poliester_100: { label: "Poliéster 100 mic", type: "plotter" }
  },

  laser: {
    common: {
      sizes: ["A4", "A3"],
      coverage: ["lineas", "mixto", "pleno"],
      prices: {
        A4: {
          lineas: { sf: 600, df: 1100 },
          mixto: { sf: 800, df: 1400 },
          pleno: { sf: 1100, df: 2000 }
        },
        A3: {
          lineas: { sf: 1300, df: 2300 },
          mixto: { sf: 1600, df: 2800 },
          pleno: { sf: 2100, df: 4000 }
        }
      }
    },
    special: {
      sizesByPaper: {
        default: ["A4", "SA3"],
        onlySA3: ["opp", "cartulina_encapada_280"]
      },
      prices: {
        A4: {
          chambril_90: { sf: 1700, df: 2300 },
          ilustracion_115: { sf: 1700, df: 2300 },
          chambril_150: { sf: 1800, df: 2400 },
          ilustracion_150: { sf: 1800, df: 2400 },
          chambril_180: { sf: 2000, df: 2500 },
          ilustracion_210: { sf: 2000, df: 2500 },
          chambril_240: { sf: 2400, df: 2900 },
          ilustracion_300: { sf: 2400, df: 2900 },
          kraft_125: { sf: 2300, df: 3100 },
          vegetal: { sf: 2500, df: null },
          autoadhesivo_obra: { sf: 2100, df: null },
          autoadhesivo_brillo: { sf: 2100, df: null },
          opp: { sf: null, df: null },
          cartulina_encapada_280: { sf: null, df: null }
        },
        SA3: {
          chambril_90: { sf: 2600, df: 3400 },
          ilustracion_115: { sf: 2600, df: 3400 },
          chambril_150: { sf: 3000, df: 4000 },
          ilustracion_150: { sf: 3000, df: 4000 },
          chambril_180: { sf: 3400, df: 4300 },
          ilustracion_210: { sf: 3400, df: 4300 },
          chambril_240: { sf: 4000, df: 4800 },
          ilustracion_300: { sf: 4000, df: 4800 },
          kraft_125: { sf: 3900, df: 4700 },
          vegetal: { sf: 4900, df: null },
          autoadhesivo_obra: { sf: 4100, df: null },
          autoadhesivo_brillo: { sf: 4100, df: null },
          opp: { sf: 13900, df: null },
          cartulina_encapada_280: { sf: 5400, df: 7600 }
        }
      }
    },
    discounts: [
      { minSheets: 100, rate: 0.6 },
      { minSheets: 50, rate: 0.4 },
      { minSheets: 10, rate: 0.25 }
    ]
  },

  plotter: {
    sizes: ["A2", "A1", "A0", "35x50", "50x70", "70x100", "100x100_personalizado"],
    coverage: ["lineas", "mixto", "pleno"],
    prices: {
      A2: {
        plotter_obra_90: { lineas: 1900, mixto: 2800, pleno: 4590 },
        plotter_cartulina_130: { lineas: 3850, mixto: 4750, pleno: 6530 },
        plotter_cartulina_170: { lineas: 4460, mixto: 5360, pleno: 7140 },
        plotter_fotografico_180: { lineas: 9500, mixto: 10400, pleno: 12180 },
        plotter_vegetal: { lineas: 4890, mixto: 5780, pleno: 7560 },
        plotter_poliester_100: { lineas: 14960, mixto: 15860, pleno: 17640 }
      },
      A1: {
        plotter_obra_90: { lineas: 3120, mixto: 4910, pleno: 8470 },
        plotter_cartulina_130: { lineas: 5900, mixto: 7690, pleno: 11250 },
        plotter_cartulina_170: { lineas: 6770, mixto: 8560, pleno: 12120 },
        plotter_fotografico_180: { lineas: 13970, mixto: 15760, pleno: 19320 },
        plotter_vegetal: { lineas: 7370, mixto: 9160, pleno: 12720 },
        plotter_poliester_100: { lineas: 21770, mixto: 23560, pleno: 27120 }
      },
      A0: {
        plotter_obra_90: { lineas: 6230, mixto: 9830, pleno: 16950 },
        plotter_cartulina_130: { lineas: 11800, mixto: 15390, pleno: 22510 },
        plotter_cartulina_170: { lineas: 13540, mixto: 17130, pleno: 24250 },
        plotter_fotografico_180: { lineas: 27940, mixto: 31530, pleno: 38650 },
        plotter_vegetal: { lineas: 14740, mixto: 18330, pleno: 25450 },
        plotter_poliester_100: { lineas: 43540, mixto: 47130, pleno: 54250 }
      },
      "35x50": {
        plotter_obra_90: { lineas: 1500, mixto: 2120, pleno: 3350 },
        plotter_cartulina_130: { lineas: 3120, mixto: 3740, pleno: 4980 },
        plotter_cartulina_170: { lineas: 3630, mixto: 4250, pleno: 5480 },
        plotter_fotografico_180: { lineas: 7820, mixto: 8450, pleno: 9680 },
        plotter_vegetal: { lineas: 3970, mixto: 4600, pleno: 5830 },
        plotter_poliester_100: { lineas: 12370, mixto: 13000, pleno: 14230 }
      },
      "50x70": {
        plotter_obra_90: { lineas: 2410, mixto: 3650, pleno: 6130 },
        plotter_cartulina_130: { lineas: 4720, mixto: 5970, pleno: 8450 },
        plotter_cartulina_170: { lineas: 5450, mixto: 6700, pleno: 9170 },
        plotter_fotografico_180: { lineas: 11450, mixto: 12700, pleno: 15170 },
        plotter_vegetal: { lineas: 5950, mixto: 7200, pleno: 9670 },
        plotter_poliester_100: { lineas: 17950, mixto: 19200, pleno: 21670 }
      },
      "70x100": {
        plotter_obra_90: { lineas: 3940, mixto: 6430, pleno: 11380 },
        plotter_cartulina_130: { lineas: 7180, mixto: 9680, pleno: 14630 },
        plotter_cartulina_170: { lineas: 8200, mixto: 10700, pleno: 15640 },
        plotter_fotografico_180: { lineas: 16600, mixto: 19100, pleno: 24040 },
        plotter_vegetal: { lineas: 8900, mixto: 11400, pleno: 16340 },
        plotter_poliester_100: { lineas: 25700, mixto: 28200, pleno: 33140 }
      },
      "100x100_personalizado": {
        plotter_obra_90: { lineas: 5630, mixto: 9200, pleno: 16260 },
        plotter_cartulina_130: { lineas: 10270, mixto: 13830, pleno: 20900 },
        plotter_cartulina_170: { lineas: 11720, mixto: 15280, pleno: 22350 },
        plotter_fotografico_180: { lineas: 23720, mixto: 27280, pleno: 33450 },
        plotter_vegetal: { lineas: 12720, mixto: 16280, pleno: 23350 },
        plotter_poliester_100: { lineas: 36720, mixto: 40280, pleno: 47350 }
      }
    }
  },

  labels: {
    coverage: {
      lineas: "Líneas",
      mixto: "Mixto / Medio",
      pleno: "Pleno"
    },
    sizes: {
      A2: "A2",
      A1: "A1",
      A0: "A0",
      A4: "A4",
      A3: "A3",
      SA3: "SA3",
      "35x50": "35 x 50",
      "50x70": "50 x 70",
      "70x100": "70 x 100",
      "100x100_personalizado": "Personalizado (por m²)"
    },
    sides: {
      sf: "Simple faz",
      df: "Doble faz"
    }
  }
};
