import "server-only";
import { getConnection } from "@/lib/db";
import { buildOrderNumber } from "@/lib/models/order";
import type {
  CreateOrderInput,
  OrderStatusLog,
  StoredOrder,
  UpdateOrderInput,
} from "@/lib/types/order";

const ORDERS_TABLE = "dbo.WEB_V_MV_PEDIDOS";

type OrderRow = {
  ID: number;
  NUMERO_PEDIDO: string;
  NOMBRE_CLIENTE: string;
  EMAIL_CLIENTE: string;
  TELEFONO_CLIENTE: string;
  MONTO_TOTAL: number;
  ESTADO_PAGO: string;
  ID_PAGO: string | null;
  TIPO_PEDIDO: string;
  ESTADO: string;
  CODIGO_QR: string | null;
  NUMERO_SEGUIMIENTO: string | null;
  DIRECCION: string | null;
  DETALLE_JSON: string | null;
  EMAIL_FACTURADO_ENVIADO_AT: Date | null;
  EMAIL_LISTO_ENVIADO_AT: Date | null;
  EMAIL_ENVIADO_ENVIADO_AT: Date | null;
  FECHA_CREACION: Date;
  FECHA_ACTUALIZACION: Date;
};

function toIsoString(value: Date | null) {
  return value ? new Date(value).toISOString() : null;
}

function parseMetadata(raw: string | null) {
  if (!raw) return {};

  try {
    return JSON.parse(raw) as StoredOrder["metadata"];
  } catch {
    return {};
  }
}

function mapOrderRow(row: OrderRow): StoredOrder {
  return {
    id: row.ID,
    numero_pedido: row.NUMERO_PEDIDO,
    nombre_cliente: row.NOMBRE_CLIENTE,
    email_cliente: row.EMAIL_CLIENTE,
    telefono_cliente: row.TELEFONO_CLIENTE,
    monto_total: Number(row.MONTO_TOTAL || 0),
    estado_pago: row.ESTADO_PAGO as StoredOrder["estado_pago"],
    id_pago: row.ID_PAGO,
    tipo_pedido: row.TIPO_PEDIDO as StoredOrder["tipo_pedido"],
    estado: row.ESTADO as StoredOrder["estado"],
    codigo_qr: row.CODIGO_QR,
    numero_seguimiento: row.NUMERO_SEGUIMIENTO,
    direccion: row.DIRECCION,
    fecha_creacion: new Date(row.FECHA_CREACION).toISOString(),
    fecha_actualizacion: new Date(row.FECHA_ACTUALIZACION).toISOString(),
    metadata: parseMetadata(row.DETALLE_JSON),
    email_facturado_enviado_at: toIsoString(row.EMAIL_FACTURADO_ENVIADO_AT),
    email_listo_enviado_at: toIsoString(row.EMAIL_LISTO_ENVIADO_AT),
    email_enviado_enviado_at: toIsoString(row.EMAIL_ENVIADO_ENVIADO_AT),
  };
}

async function ensureSchema() {
  const pool = await getConnection();

  await pool.request().query(`
    IF OBJECT_ID('${ORDERS_TABLE}', 'U') IS NULL
    BEGIN
      CREATE TABLE ${ORDERS_TABLE} (
        ID bigint IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        NUMERO_PEDIDO nvarchar(32) NOT NULL,
        NOMBRE_CLIENTE nvarchar(160) NOT NULL,
        EMAIL_CLIENTE nvarchar(160) NOT NULL,
        TELEFONO_CLIENTE nvarchar(40) NOT NULL,
        MONTO_TOTAL decimal(18, 2) NOT NULL,
        ESTADO_PAGO nvarchar(20) NOT NULL,
        ID_PAGO nvarchar(64) NULL,
        TIPO_PEDIDO nvarchar(20) NOT NULL,
        ESTADO nvarchar(30) NOT NULL,
        CODIGO_QR nvarchar(max) NULL,
        NUMERO_SEGUIMIENTO nvarchar(120) NULL,
        DIRECCION nvarchar(250) NULL,
        DETALLE_JSON nvarchar(max) NULL,
        EMAIL_FACTURADO_ENVIADO_AT datetime2 NULL,
        EMAIL_LISTO_ENVIADO_AT datetime2 NULL,
        EMAIL_ENVIADO_ENVIADO_AT datetime2 NULL,
        FECHA_CREACION datetime2 NOT NULL CONSTRAINT DF_WEB_V_MV_PEDIDOS_FECHA_CREACION DEFAULT SYSDATETIME(),
        FECHA_ACTUALIZACION datetime2 NOT NULL CONSTRAINT DF_WEB_V_MV_PEDIDOS_FECHA_ACTUALIZACION DEFAULT SYSDATETIME()
      );
    END;

    IF COL_LENGTH('${ORDERS_TABLE}', 'DETALLE_JSON') IS NULL
    BEGIN
      ALTER TABLE ${ORDERS_TABLE} ADD DETALLE_JSON nvarchar(max) NULL;
    END;

    IF COL_LENGTH('${ORDERS_TABLE}', 'EMAIL_FACTURADO_ENVIADO_AT') IS NULL
    BEGIN
      ALTER TABLE ${ORDERS_TABLE} ADD EMAIL_FACTURADO_ENVIADO_AT datetime2 NULL;
    END;

    IF COL_LENGTH('${ORDERS_TABLE}', 'EMAIL_LISTO_ENVIADO_AT') IS NULL
    BEGIN
      ALTER TABLE ${ORDERS_TABLE} ADD EMAIL_LISTO_ENVIADO_AT datetime2 NULL;
    END;

    IF COL_LENGTH('${ORDERS_TABLE}', 'EMAIL_ENVIADO_ENVIADO_AT') IS NULL
    BEGIN
      ALTER TABLE ${ORDERS_TABLE} ADD EMAIL_ENVIADO_ENVIADO_AT datetime2 NULL;
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'IX_WEB_V_MV_PEDIDOS_NUMERO_PEDIDO'
        AND object_id = OBJECT_ID('${ORDERS_TABLE}')
    )
    BEGIN
      CREATE UNIQUE INDEX IX_WEB_V_MV_PEDIDOS_NUMERO_PEDIDO
      ON ${ORDERS_TABLE} (NUMERO_PEDIDO);
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'IX_WEB_V_MV_PEDIDOS_ID_PAGO'
        AND object_id = OBJECT_ID('${ORDERS_TABLE}')
    )
    BEGIN
      CREATE INDEX IX_WEB_V_MV_PEDIDOS_ID_PAGO
      ON ${ORDERS_TABLE} (ID_PAGO);
    END;
  `);
}

function setInput(
  request: import("mssql").Request,
  values: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(values)) {
    request.input(key, value);
  }
}

export async function getById(id: number) {
  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  request.input("id", id);
  const result = await request.query<OrderRow>(`
    SELECT TOP (1) *
    FROM ${ORDERS_TABLE} WITH (NOLOCK)
    WHERE ID = @id;
  `);

  return result.recordset[0] ? mapOrderRow(result.recordset[0]) : null;
}

export async function getAll() {
  await ensureSchema();
  const pool = await getConnection();
  const result = await pool.request().query<OrderRow>(`
    SELECT *
    FROM ${ORDERS_TABLE} WITH (NOLOCK)
    ORDER BY FECHA_CREACION DESC, ID DESC;
  `);

  return result.recordset.map(mapOrderRow);
}

async function getSingleByWhere(
  whereClause: string,
  params: Record<string, unknown>,
) {
  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  setInput(request, params);
  const result = await request.query<OrderRow>(`
    SELECT TOP (1) *
    FROM ${ORDERS_TABLE} WITH (NOLOCK)
    WHERE ${whereClause}
    ORDER BY FECHA_CREACION DESC, ID DESC;
  `);

  return result.recordset[0] ? mapOrderRow(result.recordset[0]) : null;
}

export async function getByPaymentId(paymentId: string) {
  return getSingleByWhere("ID_PAGO = @paymentId", {
    paymentId: paymentId.trim(),
  });
}

export async function getByPreferenceId(preferenceId: string) {
  return getSingleByWhere(
    "JSON_VALUE(DETALLE_JSON, '$.preferenceId') = @preferenceId",
    {
      preferenceId: preferenceId.trim(),
    },
  );
}

export async function getByExternalReference(externalReference: string) {
  return getSingleByWhere(
    "JSON_VALUE(DETALLE_JSON, '$.externalReference') = @externalReference OR NUMERO_PEDIDO = @externalReference",
    {
      externalReference: externalReference.trim(),
    },
  );
}

export async function create(input: CreateOrderInput) {
  await ensureSchema();
  const pool = await getConnection();
  const numeroPedido = buildOrderNumber();
  const request = pool.request();
  setInput(request, {
    numeroPedido,
    nombreCliente: input.nombre_cliente.trim(),
    emailCliente: input.email_cliente.trim(),
    telefonoCliente: input.telefono_cliente.trim(),
    montoTotal: input.monto_total,
    estadoPago: input.estado_pago || "pendiente",
    idPago: input.id_pago || null,
    tipoPedido: input.tipo_pedido,
    estado: input.estado || "PENDIENTE",
    codigoQr: null,
    numeroSeguimiento: input.numero_seguimiento || null,
    direccion: input.direccion || null,
    detalleJson: JSON.stringify(input.metadata || {}),
  });

  const result = await request.query<OrderRow>(`
    INSERT INTO ${ORDERS_TABLE} (
      NUMERO_PEDIDO,
      NOMBRE_CLIENTE,
      EMAIL_CLIENTE,
      TELEFONO_CLIENTE,
      MONTO_TOTAL,
      ESTADO_PAGO,
      ID_PAGO,
      TIPO_PEDIDO,
      ESTADO,
      CODIGO_QR,
      NUMERO_SEGUIMIENTO,
      DIRECCION,
      DETALLE_JSON
    )
    OUTPUT INSERTED.*
    VALUES (
      @numeroPedido,
      @nombreCliente,
      @emailCliente,
      @telefonoCliente,
      @montoTotal,
      @estadoPago,
      @idPago,
      @tipoPedido,
      @estado,
      @codigoQr,
      @numeroSeguimiento,
      @direccion,
      @detalleJson
    );
  `);

  return mapOrderRow(result.recordset[0]);
}

export async function update(id: number, input: UpdateOrderInput) {
  await ensureSchema();
  const entries: Array<[string, unknown]> = [];

  if (input.nombre_cliente !== undefined) entries.push(["NOMBRE_CLIENTE", input.nombre_cliente.trim()]);
  if (input.email_cliente !== undefined) entries.push(["EMAIL_CLIENTE", input.email_cliente.trim()]);
  if (input.telefono_cliente !== undefined) entries.push(["TELEFONO_CLIENTE", input.telefono_cliente.trim()]);
  if (input.monto_total !== undefined) entries.push(["MONTO_TOTAL", input.monto_total]);
  if (input.estado_pago !== undefined) entries.push(["ESTADO_PAGO", input.estado_pago]);
  if (input.id_pago !== undefined) entries.push(["ID_PAGO", input.id_pago]);
  if (input.tipo_pedido !== undefined) entries.push(["TIPO_PEDIDO", input.tipo_pedido]);
  if (input.estado !== undefined) entries.push(["ESTADO", input.estado]);
  if (input.codigo_qr !== undefined) entries.push(["CODIGO_QR", input.codigo_qr]);
  if (input.numero_seguimiento !== undefined) entries.push(["NUMERO_SEGUIMIENTO", input.numero_seguimiento]);
  if (input.direccion !== undefined) entries.push(["DIRECCION", input.direccion]);
  if (input.metadata !== undefined) entries.push(["DETALLE_JSON", JSON.stringify(input.metadata || {})]);
  if (input.email_facturado_enviado_at !== undefined) entries.push(["EMAIL_FACTURADO_ENVIADO_AT", input.email_facturado_enviado_at ? new Date(input.email_facturado_enviado_at) : null]);
  if (input.email_listo_enviado_at !== undefined) entries.push(["EMAIL_LISTO_ENVIADO_AT", input.email_listo_enviado_at ? new Date(input.email_listo_enviado_at) : null]);
  if (input.email_enviado_enviado_at !== undefined) entries.push(["EMAIL_ENVIADO_ENVIADO_AT", input.email_enviado_enviado_at ? new Date(input.email_enviado_enviado_at) : null]);

  if (entries.length === 0) {
    return getById(id);
  }

  const pool = await getConnection();
  const request = pool.request();
  request.input("id", id);

  const setClauses = entries.map(([column], index) => {
    const param = `value${index}`;
    request.input(param, entries[index][1]);
    return `${column} = @${param}`;
  });

  const result = await request.query<OrderRow>(`
    UPDATE ${ORDERS_TABLE}
    SET ${setClauses.join(", ")},
        FECHA_ACTUALIZACION = SYSDATETIME()
    OUTPUT INSERTED.*
    WHERE ID = @id;
  `);

  return result.recordset[0] ? mapOrderRow(result.recordset[0]) : null;
}

export async function logStatusChange(
  orderId: number,
  estadoAnterior: StoredOrder["estado"] | null,
  estadoNuevo: StoredOrder["estado"],
) {
  return {
    id: 0,
    orderId,
    estadoAnterior,
    estadoNuevo,
    fecha: new Date().toISOString(),
  } satisfies OrderStatusLog;
}

export async function getLogsByOrderId(_orderId: number) {
  return [] as OrderStatusLog[];
}
