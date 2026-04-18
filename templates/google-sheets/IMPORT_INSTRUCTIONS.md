# Google Sheets + Drive Setup (29 BIS)

## 1) Crear un spreadsheet nuevo
Nombre sugerido: `29BIS - Pedidos y Precios`

## 2) Importar las plantillas CSV como hojas
En Google Sheets: `Archivo > Importar > Subir`.

Importar cada archivo como **hoja nueva**:
- `orders_template.csv` -> renombrar hoja a `orders`
- `prices_template.csv` -> renombrar hoja a `prices`
- `meta_template.csv` -> renombrar hoja a `meta`

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

## 5) Estructura final de hojas
- `orders`: pedidos entrantes + links de archivos en Drive (`file_urls`) + IDs (`file_ids`) + cantidad de archivos.
- `prices`: tabla editable de precios y disponibilidad (`active` TRUE/FALSE).
- `meta`: catalogos de estados.

## 6) Notas importantes
- `order_number` lo genera Apps Script automaticamente.
- Si en `prices` ponen `active = FALSE`, esa opcion se puede deshabilitar en frontend.
- Los archivos se guardan en Drive con prefijo de numero de pedido para encontrarlos rapido.
