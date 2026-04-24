# Diez Deportes Shop

Tienda web base hecha con `Next.js + TypeScript + SQL Server` para vender articulos leyendo desde `V_MA_ARTICULOS`, iniciando pagos por Mercado Pago y grabando pedidos aprobados en:

- `V_MV_Cpte`
- `V_MV_CpteInsumos`
- `V_MV_Stock`
- `WEB_V_MV_PEDIDOS`

## Que incluye

- catalogo con busqueda
- carrito persistido en navegador
- checkout simple para cliente final
- preferencia, webhook y estado de Mercado Pago
- persistencia de pedidos web pendientes en SQL Server
- flujo operativo de pedidos con estados controlados
- grabacion transaccional del pedido cuando el pago queda aprobado
- panel admin para configuracion y seguimiento de pedidos web
- webhook de Mercado Pago con actualización idempotente del pedido
- emails automáticos para facturación, retiro y envío
- QR automático para retiros
- stock por deposito
- configuracion operativa en `TA_CONFIGURACION` con fallback por `.env`
- opcion de reutilizar imagenes publicas desde Odoo

## Variables necesarias

Copiar `.env.example` a `.env` y completar:

- conexion SQL Server
- `ADMIN_SESSION_SECRET` para firmar la sesion del panel admin
- deposito de stock
- `TC`, sucursal y letra del comprobante
- `APP_MP_ACCESS_TOKEN` y `APP_PUBLIC_BASE_URL` para Mercado Pago si no los van a cargar desde `/admin`
- `SMTP_*` si quieren envío real de emails; si no, el sistema registra el intento sin cortar el flujo
- cuenta cliente por defecto si no usan `CUENTACONSUMIDORFINAL` en `TA_CONFIGURACION`
- `ODOO_SHOP_URL` si quieren tomar imagenes y logos del shop actual
- `APP_PRODUCT_IMAGE_UPLOAD_DIRECTORY` si guardan imagenes en carpeta local/UNC, o `APP_PRODUCT_IMAGE_FTP_*` si las suben por FTP

## Correr

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

Panel admin: `http://localhost:3000/admin`

## Exponer por internet

Para usarlo con `ngrok` o un tunel similar, conviene levantarlo en modo preview:

```bash
npm run preview
```

Despues apuntar el tunel al puerto `3000`.

`next dev` sirve para trabajo local, pero por tuneles puede fallar la parte interactiva del cliente por el websocket de HMR.

## Notas de integracion

- El catalogo usa la columna de precio indicada en `APP_PRICE_COLUMN` sobre `V_MA_ARTICULOS`.
- Si ese precio ya incluye IVA, dejar `APP_PRICES_INCLUDE_TAX=true`.
- El sistema intenta usar `dbo.FN_OBTIENE_PROXIMO_NUMERO_CPTE`. Si no existe, genera el siguiente numero leyendo `V_MV_Cpte`.
- Si tu base ya tiene triggers que generan movimientos de stock, poner `APP_WRITE_STOCK_MOVEMENTS=false` para evitar duplicados.
- Si queres grabar los pagos web con otro `TC`, definir `APP_MP_ORDER_TC`.
- `APP_PUBLIC_BASE_URL` debe apuntar a la URL publica real para que vuelvan bien el webhook y las pantallas de retorno.
- El panel admin guarda sus valores en `dbo.TA_CONFIGURACION` usando `GRUPO='TiendaWeb'`. El token de Mercado Pago se guarda con `CLAVE='Token'`.
- Los usuarios del panel admin se guardan en `dbo.TA_UsuariosWeb`. La tabla se crea sola al primer acceso, migra `TA_UsuarioWeb` si existia y asegura el acceso inicial del panel.
- `IDPROVINCIA` no se infiere automaticamente desde texto libre del checkout. El dato de provincia se guarda en observaciones.
- Si `ODOO_SYNC_IMAGES=true`, la app lee las imagenes publicas del shop Odoo y las vincula por codigo de articulo.
- Los pedidos web ahora viven en `dbo.WEB_V_MV_PEDIDOS`. Si existen tablas anteriores, la app migra los registros al nuevo esquema compartido.
- `POST /api/orders/:id/advance` resuelve la transición siguiente desde `orderService`.
- `PATCH /api/orders/:id/estado` permite mover el pedido de forma controlada sin duplicar lógica en la ruta.
- `GET /api/orders?seed=true` crea datos de prueba básicos si la tabla todavía está vacía.

## Pendientes recomendados

- login de clientes
- alta/edicion de clientes reales en `VT_CLIENTES`
- panel de administracion
- imagenes optimizadas y familias/rubros avanzados
