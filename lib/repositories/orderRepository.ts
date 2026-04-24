import "server-only";
import { getConnection } from "@/lib/db";
import { buildOrderNumber, getStatesForOrderView } from "@/lib/models/order";
import type {
  CreateOrderInput,
  OrderDocumentItem,
  OrderFilters,
  OrderStatusLog,
  StoredOrder,
  UpdateOrderInput,
} from "@/lib/types/order";
import type { AdminOrderWatchSnapshot } from "@/lib/types";

const ORDERS_TABLE = "dbo.WEB_V_MV_PEDIDOS";
const ORDER_LOGS_TABLE = "dbo.WEB_V_MV_PEDIDOS_LOGS";
const ORDER_SCHEMA_VERSION = 2;

declare global {
  var __diezDeportesOrderSchemaReady:
    | { version: number; promise: Promise<void> }
    | undefined;
}

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
  RETIRADO: string | null;
  FECHA_HORA_RETIRO: Date | null;
  NOMBRE_APELLIDO: string | null;
  NOMBRE_RETIRO: string | null;
  APELLIDO_RETIRO: string | null;
  DNI_RETIRO: string | null;
  OBSERVACION_RETIRO: string | null;
  DETALLE_JSON: string | null;
  EMAIL_FACTURADO_ENVIADO_AT: Date | null;
  EMAIL_LISTO_ENVIADO_AT: Date | null;
  EMAIL_ENVIADO_ENVIADO_AT: Date | null;
  EMAIL_PEDIDO_RECIBIDO_ENVIADO_AT: Date | null;
  FECHA_CREACION: Date;
  FECHA_ACTUALIZACION: Date;
};

type RedeemOrderRow = OrderRow & {
  ESTADO_ANTERIOR: string | null;
};

type OrderLogRow = {
  ID: number;
  ORDER_ID: number;
  ESTADO_ANTERIOR: string | null;
  ESTADO_NUEVO: string;
  ORIGEN_CAMBIO: string;
  FECHA: Date;
};

type OrderDocumentItemRow = {
  ID: number | null;
  TC: string;
  IDCOMPROBANTE: string;
  IDARTICULO: string;
  DESCRIPCION: string;
  CANTIDAD: number | null;
  IMPORTE: number | null;
  TOTAL: number | null;
  SECUENCIA: number | null;
};

type OrderDocumentItemStatsRow = {
  IDCOMPROBANTE: string;
  TOTAL_ITEMS: number | null;
  LINE_COUNT: number | null;
};

type OrderWatchTotalRow = {
  TOTAL_ORDERS: number | null;
};

type OrderWatchLatestRow = {
  ID: number | null;
  NUMERO_PEDIDO: string | null;
  NOMBRE_CLIENTE: string | null;
  FECHA_CREACION: Date | null;
};

function toIsoString(value: Date | null) {
  return value ? new Date(value).toISOString() : null;
}

function parseMetadata(raw: string | null) {
  if (!raw) {
    return {};
  }

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
    retirado: row.RETIRADO === "SI" ? "SI" : "NO",
    fecha_hora_retiro: toIsoString(row.FECHA_HORA_RETIRO),
    nombre_apellido_retiro: row.NOMBRE_APELLIDO?.trim() || null,
    nombre_retiro: row.NOMBRE_RETIRO?.trim() || null,
    apellido_retiro: row.APELLIDO_RETIRO?.trim() || null,
    dni_retiro: row.DNI_RETIRO?.trim() || null,
    observacion_retiro: row.OBSERVACION_RETIRO?.trim() || null,
    fecha_creacion: new Date(row.FECHA_CREACION).toISOString(),
    fecha_actualizacion: new Date(row.FECHA_ACTUALIZACION).toISOString(),
    metadata: parseMetadata(row.DETALLE_JSON),
    email_facturado_enviado_at: toIsoString(row.EMAIL_FACTURADO_ENVIADO_AT),
    email_listo_enviado_at: toIsoString(row.EMAIL_LISTO_ENVIADO_AT),
    email_enviado_enviado_at: toIsoString(row.EMAIL_ENVIADO_ENVIADO_AT),
    email_pedido_recibido_enviado_at: toIsoString(
      row.EMAIL_PEDIDO_RECIBIDO_ENVIADO_AT,
    ),
  };
}

function mapOrderLogRow(row: OrderLogRow): OrderStatusLog {
  return {
    id: row.ID,
    orderId: row.ORDER_ID,
    estadoAnterior: row.ESTADO_ANTERIOR as OrderStatusLog["estadoAnterior"],
    estadoNuevo: row.ESTADO_NUEVO as OrderStatusLog["estadoNuevo"],
    fecha: new Date(row.FECHA).toISOString(),
    origen: row.ORIGEN_CAMBIO as OrderStatusLog["origen"],
  };
}

function mapOrderDocumentItemRow(row: OrderDocumentItemRow): OrderDocumentItem {
  return {
    id: row.ID ? Number(row.ID) : null,
    tc: row.TC?.trim() || "",
    idComprobante: row.IDCOMPROBANTE?.trim() || "",
    sequence: Number(row.SECUENCIA || 0),
    articleId: row.IDARTICULO || "",
    description: row.DESCRIPCION?.trim() || "",
    quantity: Number(row.CANTIDAD || 0),
    unitPrice: Number(row.IMPORTE || 0),
    total: Number(row.TOTAL || 0),
  };
}

function setInput(
  request: import("mssql").Request,
  values: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(values)) {
    request.input(key, value);
  }
}

function buildDateStart(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function buildDateEndExclusive(value: string) {
  const date = buildDateStart(value);
  date.setDate(date.getDate() + 1);
  return date;
}

async function ensureSchema() {
  if (
    global.__diezDeportesOrderSchemaReady &&
    global.__diezDeportesOrderSchemaReady.version === ORDER_SCHEMA_VERSION
  ) {
    return global.__diezDeportesOrderSchemaReady.promise;
  }

  const promise = (async () => {
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
          RETIRADO nvarchar(2) NOT NULL CONSTRAINT DF_WEB_V_MV_PEDIDOS_RETIRADO DEFAULT 'NO',
          FECHA_HORA_RETIRO datetime2 NULL,
          NOMBRE_APELLIDO nvarchar(160) NULL,
          NOMBRE_RETIRO nvarchar(80) NULL,
          APELLIDO_RETIRO nvarchar(80) NULL,
          DNI_RETIRO nvarchar(40) NULL,
          OBSERVACION_RETIRO nvarchar(250) NULL,
          DETALLE_JSON nvarchar(max) NULL,
          EMAIL_FACTURADO_ENVIADO_AT datetime2 NULL,
          EMAIL_LISTO_ENVIADO_AT datetime2 NULL,
          EMAIL_ENVIADO_ENVIADO_AT datetime2 NULL,
          EMAIL_PEDIDO_RECIBIDO_ENVIADO_AT datetime2 NULL,
          FECHA_CREACION datetime2 NOT NULL CONSTRAINT DF_WEB_V_MV_PEDIDOS_FECHA_CREACION DEFAULT SYSDATETIME(),
          FECHA_ACTUALIZACION datetime2 NOT NULL CONSTRAINT DF_WEB_V_MV_PEDIDOS_FECHA_ACTUALIZACION DEFAULT SYSDATETIME()
        );
      END;

      IF OBJECT_ID('${ORDER_LOGS_TABLE}', 'U') IS NULL
      BEGIN
        CREATE TABLE ${ORDER_LOGS_TABLE} (
          ID bigint IDENTITY(1, 1) NOT NULL PRIMARY KEY,
          ORDER_ID bigint NOT NULL,
          ESTADO_ANTERIOR nvarchar(30) NULL,
          ESTADO_NUEVO nvarchar(30) NOT NULL,
          ORIGEN_CAMBIO nvarchar(20) NOT NULL,
          FECHA datetime2 NOT NULL CONSTRAINT DF_WEB_V_MV_PEDIDOS_LOGS_FECHA DEFAULT SYSDATETIME()
        );
      END;

      IF COL_LENGTH('${ORDERS_TABLE}', 'DETALLE_JSON') IS NULL
      BEGIN
        ALTER TABLE ${ORDERS_TABLE} ADD DETALLE_JSON nvarchar(max) NULL;
      END;

      IF COL_LENGTH('${ORDERS_TABLE}', 'RETIRADO') IS NULL
      BEGIN
        ALTER TABLE ${ORDERS_TABLE} ADD RETIRADO nvarchar(2) NOT NULL CONSTRAINT DF_WEB_V_MV_PEDIDOS_RETIRADO DEFAULT 'NO';
      END;

      IF COL_LENGTH('${ORDERS_TABLE}', 'FECHA_HORA_RETIRO') IS NULL
      BEGIN
        ALTER TABLE ${ORDERS_TABLE} ADD FECHA_HORA_RETIRO datetime2 NULL;
      END;

      IF COL_LENGTH('${ORDERS_TABLE}', 'NOMBRE_APELLIDO') IS NULL
      BEGIN
        ALTER TABLE ${ORDERS_TABLE} ADD NOMBRE_APELLIDO nvarchar(160) NULL;
      END;

      IF COL_LENGTH('${ORDERS_TABLE}', 'NOMBRE_RETIRO') IS NULL
      BEGIN
        ALTER TABLE ${ORDERS_TABLE} ADD NOMBRE_RETIRO nvarchar(80) NULL;
      END;

      IF COL_LENGTH('${ORDERS_TABLE}', 'APELLIDO_RETIRO') IS NULL
      BEGIN
        ALTER TABLE ${ORDERS_TABLE} ADD APELLIDO_RETIRO nvarchar(80) NULL;
      END;

      IF COL_LENGTH('${ORDERS_TABLE}', 'DNI_RETIRO') IS NULL
      BEGIN
        ALTER TABLE ${ORDERS_TABLE} ADD DNI_RETIRO nvarchar(40) NULL;
      END;

      IF COL_LENGTH('${ORDERS_TABLE}', 'OBSERVACION_RETIRO') IS NULL
      BEGIN
        ALTER TABLE ${ORDERS_TABLE} ADD OBSERVACION_RETIRO nvarchar(250) NULL;
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

      IF COL_LENGTH('${ORDERS_TABLE}', 'EMAIL_PEDIDO_RECIBIDO_ENVIADO_AT') IS NULL
      BEGIN
        ALTER TABLE ${ORDERS_TABLE} ADD EMAIL_PEDIDO_RECIBIDO_ENVIADO_AT datetime2 NULL;
      END;

      IF COL_LENGTH('${ORDER_LOGS_TABLE}', 'ORIGEN_CAMBIO') IS NULL
      BEGIN
        ALTER TABLE ${ORDER_LOGS_TABLE} ADD ORIGEN_CAMBIO nvarchar(20) NOT NULL CONSTRAINT DF_WEB_V_MV_PEDIDOS_LOGS_ORIGEN DEFAULT 'sistema';
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

      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_WEB_V_MV_PEDIDOS_ESTADO'
          AND object_id = OBJECT_ID('${ORDERS_TABLE}')
      )
      BEGIN
        CREATE INDEX IX_WEB_V_MV_PEDIDOS_ESTADO
        ON ${ORDERS_TABLE} (ESTADO, ESTADO_PAGO, FECHA_CREACION DESC);
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_WEB_V_MV_PEDIDOS_LOGS_ORDER_ID'
          AND object_id = OBJECT_ID('${ORDER_LOGS_TABLE}')
      )
      BEGIN
        CREATE INDEX IX_WEB_V_MV_PEDIDOS_LOGS_ORDER_ID
        ON ${ORDER_LOGS_TABLE} (ORDER_ID, FECHA DESC, ID DESC);
      END;
    `);
  })().catch((error) => {
    global.__diezDeportesOrderSchemaReady = undefined;
    throw error;
  });

  global.__diezDeportesOrderSchemaReady = {
    version: ORDER_SCHEMA_VERSION,
    promise,
  };

  return promise;
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
  return getFiltered({ limit: null });
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

export async function getFiltered(filters: OrderFilters) {
  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  const whereClauses = ["1 = 1"];
  const statesForView = getStatesForOrderView(filters.vista);
  const safeLimit =
    typeof filters.limit === "number" && Number.isFinite(filters.limit)
      ? Math.max(1, Math.min(2000, Math.trunc(filters.limit)))
      : null;

  if (filters.estado) {
    request.input("estado", filters.estado);
    whereClauses.push("ESTADO = @estado");
  }

  if (filters.estado_pago) {
    request.input("estadoPago", filters.estado_pago);
    whereClauses.push("ESTADO_PAGO = @estadoPago");
  }

  if (filters.tipo_pedido) {
    request.input("tipoPedido", filters.tipo_pedido);
    whereClauses.push("TIPO_PEDIDO = @tipoPedido");
  }

  if (statesForView?.length) {
    const viewParams = statesForView.map((state, index) => {
      const paramName = `vistaEstado${index}`;
      request.input(paramName, state);
      return `@${paramName}`;
    });

    whereClauses.push(`ESTADO IN (${viewParams.join(", ")})`);
  }

  if (filters.q) {
    request.input("q", `%${filters.q}%`);
    whereClauses.push(
      "(NUMERO_PEDIDO LIKE @q OR NOMBRE_CLIENTE LIKE @q OR EMAIL_CLIENTE LIKE @q)",
    );
  }

  if (filters.fecha_desde) {
    request.input("fechaDesde", buildDateStart(filters.fecha_desde));
    whereClauses.push("FECHA_CREACION >= @fechaDesde");
  }

  if (filters.fecha_hasta) {
    request.input("fechaHasta", buildDateEndExclusive(filters.fecha_hasta));
    whereClauses.push("FECHA_CREACION < @fechaHasta");
  }

  const result = await request.query<OrderRow>(`
    SELECT ${safeLimit ? `TOP (${safeLimit})` : ""} *
    FROM ${ORDERS_TABLE} WITH (NOLOCK)
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY FECHA_CREACION DESC, ID DESC;
  `);

  return result.recordset.map(mapOrderRow);
}

export async function getWatchSnapshot(): Promise<AdminOrderWatchSnapshot> {
  await ensureSchema();
  const pool = await getConnection();
  const result = await pool.request().query<OrderWatchTotalRow | OrderWatchLatestRow>(`
    SELECT COUNT_BIG(1) AS TOTAL_ORDERS
    FROM ${ORDERS_TABLE} WITH (NOLOCK);

    SELECT TOP (1)
      ID,
      NUMERO_PEDIDO,
      NOMBRE_CLIENTE,
      FECHA_CREACION
    FROM ${ORDERS_TABLE} WITH (NOLOCK)
    ORDER BY FECHA_CREACION DESC, ID DESC;
  `);

  const totalRow = result.recordsets[0]?.[0] as OrderWatchTotalRow | undefined;
  const latestRow = result.recordsets[1]?.[0] as OrderWatchLatestRow | undefined;

  return {
    totalOrders: Number(totalRow?.TOTAL_ORDERS || 0),
    latestOrderId:
      latestRow?.ID && Number.isFinite(Number(latestRow.ID))
        ? Number(latestRow.ID)
        : null,
    latestOrderNumber: latestRow?.NUMERO_PEDIDO?.trim() || null,
    latestCustomerName: latestRow?.NOMBRE_CLIENTE?.trim() || null,
    latestCreatedAt: latestRow?.FECHA_CREACION
      ? new Date(latestRow.FECHA_CREACION).toISOString()
      : null,
  };
}

export async function getExpiredPending(ttlMinutes: number) {
  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  request.input(
    "ttlMinutes",
    Math.max(1, Math.min(43200, Math.trunc(Number(ttlMinutes) || 0))),
  );
  const result = await request.query<OrderRow>(`
    SELECT *
    FROM ${ORDERS_TABLE} WITH (NOLOCK)
    WHERE ESTADO = 'PENDIENTE'
      AND ESTADO_PAGO = 'pendiente'
      AND FECHA_CREACION <= DATEADD(MINUTE, -@ttlMinutes, SYSDATETIME())
    ORDER BY FECHA_CREACION DESC, ID DESC;
  `);

  return result.recordset.map(mapOrderRow);
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

export async function getByPickupCode(pickupCode: string) {
  return getSingleByWhere(
    "TIPO_PEDIDO = 'retiro' AND JSON_VALUE(DETALLE_JSON, '$.pickupCode') = @pickupCode",
    {
      pickupCode: pickupCode.trim(),
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

  if (input.nombre_cliente !== undefined) {
    entries.push(["NOMBRE_CLIENTE", input.nombre_cliente.trim()]);
  }
  if (input.numero_pedido !== undefined) {
    entries.push(["NUMERO_PEDIDO", input.numero_pedido.trim()]);
  }
  if (input.email_cliente !== undefined) {
    entries.push(["EMAIL_CLIENTE", input.email_cliente.trim()]);
  }
  if (input.telefono_cliente !== undefined) {
    entries.push(["TELEFONO_CLIENTE", input.telefono_cliente.trim()]);
  }
  if (input.monto_total !== undefined) {
    entries.push(["MONTO_TOTAL", input.monto_total]);
  }
  if (input.estado_pago !== undefined) {
    entries.push(["ESTADO_PAGO", input.estado_pago]);
  }
  if (input.id_pago !== undefined) {
    entries.push(["ID_PAGO", input.id_pago]);
  }
  if (input.tipo_pedido !== undefined) {
    entries.push(["TIPO_PEDIDO", input.tipo_pedido]);
  }
  if (input.estado !== undefined) {
    entries.push(["ESTADO", input.estado]);
  }
  if (input.codigo_qr !== undefined) {
    entries.push(["CODIGO_QR", input.codigo_qr]);
  }
  if (input.numero_seguimiento !== undefined) {
    entries.push(["NUMERO_SEGUIMIENTO", input.numero_seguimiento]);
  }
  if (input.direccion !== undefined) {
    entries.push(["DIRECCION", input.direccion]);
  }
  if (input.retirado !== undefined) {
    entries.push(["RETIRADO", input.retirado]);
  }
  if (input.fecha_hora_retiro !== undefined) {
    entries.push([
      "FECHA_HORA_RETIRO",
      input.fecha_hora_retiro ? new Date(input.fecha_hora_retiro) : null,
    ]);
  }
  if (input.nombre_apellido_retiro !== undefined) {
    entries.push(["NOMBRE_APELLIDO", input.nombre_apellido_retiro?.trim() || null]);
  }
  if (input.nombre_retiro !== undefined) {
    entries.push(["NOMBRE_RETIRO", input.nombre_retiro?.trim() || null]);
  }
  if (input.apellido_retiro !== undefined) {
    entries.push(["APELLIDO_RETIRO", input.apellido_retiro?.trim() || null]);
  }
  if (input.dni_retiro !== undefined) {
    entries.push(["DNI_RETIRO", input.dni_retiro?.trim() || null]);
  }
  if (input.observacion_retiro !== undefined) {
    entries.push(["OBSERVACION_RETIRO", input.observacion_retiro?.trim() || null]);
  }
  if (input.metadata !== undefined) {
    entries.push(["DETALLE_JSON", JSON.stringify(input.metadata || {})]);
  }
  if (input.email_facturado_enviado_at !== undefined) {
    entries.push([
      "EMAIL_FACTURADO_ENVIADO_AT",
      input.email_facturado_enviado_at
        ? new Date(input.email_facturado_enviado_at)
        : null,
    ]);
  }
  if (input.email_listo_enviado_at !== undefined) {
    entries.push([
      "EMAIL_LISTO_ENVIADO_AT",
      input.email_listo_enviado_at ? new Date(input.email_listo_enviado_at) : null,
    ]);
  }
  if (input.email_enviado_enviado_at !== undefined) {
    entries.push([
      "EMAIL_ENVIADO_ENVIADO_AT",
      input.email_enviado_enviado_at
        ? new Date(input.email_enviado_enviado_at)
        : null,
    ]);
  }
  if (input.email_pedido_recibido_enviado_at !== undefined) {
    entries.push([
      "EMAIL_PEDIDO_RECIBIDO_ENVIADO_AT",
      input.email_pedido_recibido_enviado_at
        ? new Date(input.email_pedido_recibido_enviado_at)
        : null,
    ]);
  }

  if (entries.length === 0) {
    return getById(id);
  }

  const pool = await getConnection();
  const request = pool.request();
  request.input("id", id);

  const setClauses = entries.map(([column], index) => {
    const paramName = `value${index}`;
    request.input(paramName, entries[index][1]);
    return `${column} = @${paramName}`;
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
  origen: OrderStatusLog["origen"],
) {
  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  setInput(request, {
    orderId,
    estadoAnterior,
    estadoNuevo,
    origen,
  });

  const result = await request.query<OrderLogRow>(`
    INSERT INTO ${ORDER_LOGS_TABLE} (
      ORDER_ID,
      ESTADO_ANTERIOR,
      ESTADO_NUEVO,
      ORIGEN_CAMBIO
    )
    OUTPUT INSERTED.*
    VALUES (
      @orderId,
      @estadoAnterior,
      @estadoNuevo,
      @origen
    );
  `);

  return mapOrderLogRow(result.recordset[0]);
}

export async function getLogsByOrderId(orderId: number) {
  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  request.input("orderId", orderId);
  const result = await request.query<OrderLogRow>(`
    SELECT *
    FROM ${ORDER_LOGS_TABLE} WITH (NOLOCK)
    WHERE ORDER_ID = @orderId
    ORDER BY FECHA DESC, ID DESC;
  `);

  return result.recordset.map(mapOrderLogRow);
}

export async function getDocumentItemsByComprobante(input: {
  tc: string;
  idComprobante: string;
}) {
  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  setInput(request, {
    tc: input.tc.trim(),
    idComprobante: input.idComprobante.trim(),
  });
  const result = await request.query<OrderDocumentItemRow>(`
    IF OBJECT_ID('dbo.V_MV_CpteInsumos') IS NOT NULL
    BEGIN
      SELECT
        ID,
        LTRIM(RTRIM(ISNULL(TC, ''))) AS TC,
        LTRIM(RTRIM(ISNULL(IDCOMPROBANTE, ''))) AS IDCOMPROBANTE,
        ISNULL(IDARTICULO, '') AS IDARTICULO,
        ISNULL(DESCRIPCION, '') AS DESCRIPCION,
        CANTIDAD,
        IMPORTE,
        TOTAL,
        SECUENCIA
      FROM dbo.V_MV_CpteInsumos WITH (NOLOCK)
      WHERE LTRIM(RTRIM(ISNULL(TC, ''))) = @tc
        AND LTRIM(RTRIM(ISNULL(IDCOMPROBANTE, ''))) = @idComprobante
      ORDER BY ISNULL(SECUENCIA, 0), ISNULL(ID, 0);
    END
    ELSE
    BEGIN
      SELECT
        CAST(NULL AS int) AS ID,
        CAST('' AS nvarchar(20)) AS TC,
        CAST('' AS nvarchar(40)) AS IDCOMPROBANTE,
        CAST('' AS nvarchar(120)) AS IDARTICULO,
        CAST('' AS nvarchar(255)) AS DESCRIPCION,
        CAST(0 AS float) AS CANTIDAD,
        CAST(0 AS money) AS IMPORTE,
        CAST(0 AS money) AS TOTAL,
        CAST(0 AS int) AS SECUENCIA
      WHERE 1 = 0;
    END
  `);

  return result.recordset.map(mapOrderDocumentItemRow);
}

export async function getDocumentItemsByNumber(idComprobante: string) {
  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  request.input("idComprobante", idComprobante.trim());
  const result = await request.query<OrderDocumentItemRow>(`
    IF OBJECT_ID('dbo.V_MV_CpteInsumos') IS NOT NULL
    BEGIN
      SELECT
        ID,
        LTRIM(RTRIM(ISNULL(TC, ''))) AS TC,
        LTRIM(RTRIM(ISNULL(IDCOMPROBANTE, ''))) AS IDCOMPROBANTE,
        ISNULL(IDARTICULO, '') AS IDARTICULO,
        ISNULL(DESCRIPCION, '') AS DESCRIPCION,
        CANTIDAD,
        IMPORTE,
        TOTAL,
        SECUENCIA
      FROM dbo.V_MV_CpteInsumos WITH (NOLOCK)
      WHERE LTRIM(RTRIM(ISNULL(IDCOMPROBANTE, ''))) = @idComprobante
      ORDER BY ISNULL(SECUENCIA, 0), ISNULL(ID, 0);
    END
    ELSE
    BEGIN
      SELECT
        CAST(NULL AS int) AS ID,
        CAST('' AS nvarchar(20)) AS TC,
        CAST('' AS nvarchar(40)) AS IDCOMPROBANTE,
        CAST('' AS nvarchar(120)) AS IDARTICULO,
        CAST('' AS nvarchar(255)) AS DESCRIPCION,
        CAST(0 AS float) AS CANTIDAD,
        CAST(0 AS money) AS IMPORTE,
        CAST(0 AS money) AS TOTAL,
        CAST(0 AS int) AS SECUENCIA
      WHERE 1 = 0;
    END
  `);

  return result.recordset.map(mapOrderDocumentItemRow);
}

export async function getDocumentItemStatsByOrderNumbers(orderNumbers: string[]) {
  const normalizedOrderNumbers = Array.from(
    new Set(orderNumbers.map((value) => value.trim()).filter(Boolean)),
  );

  if (normalizedOrderNumbers.length === 0) {
    return new Map<string, { itemCount: number; lineCount: number }>();
  }

  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  const placeholders = normalizedOrderNumbers.map((orderNumber, index) => {
    const parameterName = `orderNumber${index}`;
    request.input(parameterName, orderNumber);
    return `@${parameterName}`;
  });

  const result = await request.query<OrderDocumentItemStatsRow>(`
    IF OBJECT_ID('dbo.V_MV_CpteInsumos') IS NOT NULL
    BEGIN
      SELECT
        LTRIM(RTRIM(ISNULL(IDCOMPROBANTE, ''))) AS IDCOMPROBANTE,
        SUM(ISNULL(CANTIDAD, 0)) AS TOTAL_ITEMS,
        COUNT(*) AS LINE_COUNT
      FROM dbo.V_MV_CpteInsumos WITH (NOLOCK)
      WHERE LTRIM(RTRIM(ISNULL(IDCOMPROBANTE, ''))) IN (${placeholders.join(", ")})
      GROUP BY LTRIM(RTRIM(ISNULL(IDCOMPROBANTE, '')));
    END
    ELSE
    BEGIN
      SELECT
        CAST('' AS nvarchar(40)) AS IDCOMPROBANTE,
        CAST(0 AS float) AS TOTAL_ITEMS,
        CAST(0 AS int) AS LINE_COUNT
      WHERE 1 = 0;
    END
  `);

  return new Map(
    result.recordset.map((row) => [
      row.IDCOMPROBANTE.trim(),
      {
        itemCount: Number(row.TOTAL_ITEMS || 0),
        lineCount: Number(row.LINE_COUNT || 0),
      },
    ]),
  );
}

export async function markPickupAsRedeemed(input: {
  orderId: number;
  nombre: string | null;
  apellido: string | null;
  dni: string | null;
  observacion: string | null;
  nombreApellido: string | null;
}) {
  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  request.input("id", input.orderId);
  request.input("nombre", input.nombre?.trim() || null);
  request.input("apellido", input.apellido?.trim() || null);
  request.input("dni", input.dni?.trim() || null);
  request.input("observacion", input.observacion?.trim() || null);
  request.input("nombreApellido", input.nombreApellido?.trim() || null);
  const result = await request.query<RedeemOrderRow>(`
    UPDATE ${ORDERS_TABLE}
    SET
      RETIRADO = 'SI',
      FECHA_HORA_RETIRO = SYSDATETIME(),
      NOMBRE_RETIRO = @nombre,
      APELLIDO_RETIRO = @apellido,
      DNI_RETIRO = @dni,
      OBSERVACION_RETIRO = @observacion,
      NOMBRE_APELLIDO = @nombreApellido,
      ESTADO = 'ENTREGADO',
      FECHA_ACTUALIZACION = SYSDATETIME()
    OUTPUT DELETED.ESTADO AS ESTADO_ANTERIOR, INSERTED.*
    WHERE ID = @id
      AND TIPO_PEDIDO = 'retiro'
      AND ISNULL(RETIRADO, 'NO') <> 'SI';
  `);

  if (!result.recordset[0]) {
    return null;
  }

  return {
    order: mapOrderRow(result.recordset[0]),
    estadoAnterior: (result.recordset[0].ESTADO_ANTERIOR || null) as StoredOrder["estado"] | null,
  };
}
