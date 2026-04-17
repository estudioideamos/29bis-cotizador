# 29 BIS - Cotizador de Imprenta

Proyecto independiente para cotización y toma de pedidos de impresiones (separado de IVESS).

## Estructura

- `index.html`: interfaz del cotizador.
- `styles.css`: diseño visual.
- `src/pricing-data.js`: todos los precios y reglas.
- `src/main.js`: lógica de formulario, cálculo y envío.
- `src/config.js`: configuración de integración.
- `apps-script/Code.gs`: backend opcional para Google Sheets.

## Cómo editar precios rápido (sin tocar lógica)

1. Abrí `src/pricing-data.js`.
2. Modificá solo los valores numéricos.
3. Guardá y publicá.

Toda la app toma los precios desde ese archivo.

## Opción recomendada para cliente no técnico: Google Sheets

### A. Guardar pedidos en Google Sheets

1. Crear un Spreadsheet.
2. Crear un proyecto Apps Script y pegar `apps-script/Code.gs`.
3. Reemplazar `SHEET_ID`.
4. Publicar como **Web App** (acceso: Anyone).
5. Copiar la URL `/exec`.
6. En `src/config.js`, completar:

```js
window.APP_CONFIG = {
  pricesMode: "local",
  pricesJsonUrl: "",
  ordersWebhookUrl: "TU_URL_DE_WEB_APP"
};
```

### B. También editar precios desde Google Sheets

1. En el mismo Spreadsheet crear la hoja `prices_json`.
2. En `A1`, pegar el JSON completo de precios (misma estructura que `PRICING_DATA`).
3. En `src/config.js`:

```js
window.APP_CONFIG = {
  pricesMode: "remote-json",
  pricesJsonUrl: "TU_URL_DE_WEB_APP",
  ordersWebhookUrl: "TU_URL_DE_WEB_APP"
};
```

El frontend hará `GET` para precios y `POST` para pedidos.

## Notas de negocio implementadas

- Máquina: láser o plotter.
- Papel: lista completa separada (incluye chambril e ilustración como opciones distintas).
- Tamaños condicionados por máquina/papel.
- Simple/Doble faz solo en láser.
- Cobertura (líneas/mixto/pleno) para:
  - Láser + obra 80gr.
  - Plotter (todos los papeles).
- Carga de hojas por cobertura en filas separadas.
- Descuento por cantidad (solo láser):
  - 10+ hojas: 25%
  - 50+ hojas: 40%
  - 100+ hojas: 60%
- Fecha/hora retiro opcional con aviso de urgencia.

## Subir a un repo GitHub separado

En esta carpeta:

```bash
git init
git add .
git commit -m "Inicial: cotizador 29 BIS"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO_29BIS.git
git push -u origin main
```

Así queda completamente separado del proyecto IVESS.
