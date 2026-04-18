# Google Sheets + Drive Setup (29 BIS)

## 1) Crear un spreadsheet nuevo
Nombre sugerido: `29BIS - Pedidos y Precios`

## 2) Importar las plantillas CSV como hojas
En Google Sheets: `Archivo > Importar > Subir`.

Importar cada archivo como **hoja nueva**:
- `orders_template.csv` -> renombrar hoja a `orders`
- `prices_template.csv` -> renombrar hoja a `prices`
- `meta_template.csv` -> renombrar hoja a `meta`

Opcional recomendado:
- crear una hoja nueva llamada `dashboard` (o dejar que la cree el script premium automaticamente)

## 3) Configurar listas desplegables en `orders`
Validacion de datos:

- `payment_status` (columna `T`)
  - `Pendiente`
  - `Pagado`

- `production_status` (columna `U`)
  - `Recibido`
  - `En revision`
  - `En produccion`
  - `Listo para retirar`
  - `Entregado`
  - `Cancelado`

- `internal_priority` (columna `AD`)
  - `Baja`
  - `Media`
  - `Alta`

- `customer_notified` (columna `AG`)
  - `No`
  - `Si`

Tip: podrian usar rangos en `meta` o cargar estas listas manualmente.

## 4) Configurar Apps Script
En la carpeta `apps-script`, abrir `Code.gs` y completar:

- `SHEET_ID` con el ID del spreadsheet.
- `DRIVE_FOLDER_ID` con el ID de la carpeta de Google Drive donde se guardaran los archivos cargados por el cliente.

### Permisos recomendados del Web App
- Deploy as Web App.
- Execute as: **Me** (la cuenta del cliente).
- Who has access: **Anyone** (o Anyone with the link).

Esto permite que:
- El formulario envie el pedido.
- Apps Script cree los archivos en Drive con la cuenta del cliente.
- Se guarden los links en `orders.file_urls`.

## 5) Aplicar look & feel premium (recomendado)
En `Extensiones > Apps Script` del mismo spreadsheet:

1. Crear un archivo de script nuevo (por ejemplo `PREMIUM_SETUP.gs`).
2. Copiar y pegar el contenido de `templates/google-sheets/PREMIUM_SETUP.gs`.
3. Guardar y ejecutar `apply29BISPremiumSheets`.
4. Aceptar permisos.

Esto deja:
- headers premium alineados a paleta 29 BIS
- columnas optimizadas
- validaciones y formatos de moneda/fecha
- formato condicional por estado
- hoja `dashboard` con indicadores de gestion
- hoja `operacion` (vista simple para uso diario) con columnas autoajustadas

## 6) Estructura final de hojas
- `orders`: pedidos entrantes + links de archivos en Drive (`file_urls`) + IDs (`file_ids`) + cantidad de archivos.
- `prices`: tabla editable de precios y disponibilidad (`active` TRUE/FALSE).
- `meta`: catalogos de estados.
- `dashboard`: panel visual de control operativo.
- `operacion`: vista operativa simple para chequear cliente, archivos y estados.

## 7) Notas importantes
- `order_number` lo genera Apps Script automaticamente.
- Si en `prices` ponen `active = FALSE`, esa opcion se puede deshabilitar en frontend.
- Los archivos se guardan en Drive con prefijo de numero de pedido para encontrarlos rapido.
