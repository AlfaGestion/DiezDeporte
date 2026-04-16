# Diez Deportes Shop

Tienda web base hecha con `Next.js + TypeScript + SQL Server` para vender artículos leyendo desde `V_MA_ARTICULOS` y grabando pedidos en:

- `V_MV_Cpte`
- `V_MV_CpteInsumos`
- `V_MV_Stock`

## Qué incluye

- catálogo con búsqueda
- carrito persistido en navegador
- checkout simple para cliente final
- grabación transaccional del pedido
- stock por depósito
- configuración por `.env`

## Variables necesarias

Copiar `.env.example` a `.env` y completar:

- conexión SQL Server
- depósito de stock
- `TC`, sucursal y letra del comprobante
- cuenta cliente por defecto si no usan `CUENTACONSUMIDORFINAL` en `TA_CONFIGURACION`

## Correr

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Notas de integración

- El catálogo usa la columna de precio indicada en `APP_PRICE_COLUMN` sobre `V_MA_ARTICULOS`.
- Si ese precio ya incluye IVA, dejar `APP_PRICES_INCLUDE_TAX=true`.
- El sistema intenta usar `dbo.FN_OBTIENE_PROXIMO_NUMERO_CPTE`. Si no existe, genera el siguiente número leyendo `V_MV_Cpte`.
- Si tu base ya tiene triggers que generan movimientos de stock, poner `APP_WRITE_STOCK_MOVEMENTS=false` para evitar duplicados.
- `IDPROVINCIA` no se infiere automáticamente desde texto libre del checkout. El dato de provincia se guarda en observaciones.

## Pendientes recomendados

- pasarela de pago
- login de clientes
- alta/edición de clientes reales en `VT_CLIENTES`
- panel de administración
- imágenes optimizadas y familias/rubros avanzados
