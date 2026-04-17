# Diez Deportes Shop

Tienda web base hecha con `Next.js + TypeScript + SQL Server` para vender articulos leyendo desde `V_MA_ARTICULOS` y grabando pedidos en:

- `V_MV_Cpte`
- `V_MV_CpteInsumos`
- `V_MV_Stock`

## Que incluye

- catalogo con busqueda
- carrito persistido en navegador
- checkout simple para cliente final
- grabacion transaccional del pedido
- stock por deposito
- configuracion por `.env`
- opcion de reutilizar imagenes publicas desde Odoo

## Variables necesarias

Copiar `.env.example` a `.env` y completar:

- conexion SQL Server
- deposito de stock
- `TC`, sucursal y letra del comprobante
- cuenta cliente por defecto si no usan `CUENTACONSUMIDORFINAL` en `TA_CONFIGURACION`
- `ODOO_SHOP_URL` si quieren tomar imagenes y logos del shop actual

## Correr

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

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
- `IDPROVINCIA` no se infiere automaticamente desde texto libre del checkout. El dato de provincia se guarda en observaciones.
- Si `ODOO_SYNC_IMAGES=true`, la app lee las imagenes publicas del shop Odoo y las vincula por codigo de articulo.

## Pendientes recomendados

- pasarela de pago
- login de clientes
- alta/edicion de clientes reales en `VT_CLIENTES`
- panel de administracion
- imagenes optimizadas y familias/rubros avanzados
