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

const ORDERS_TABLE = "dbo.WEB_V_MV_PEDIDOS";
const ORDER_LOGS_TABLE = "dbo.WEB_V_MV_PEDIDOS_LOGS";

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
    fecha_creacion: new Date(row.FECHA_CREACION).toISOString(),
    fecha_actualizacion: new Date(row.FECHA_ACTUALIZACION).toISOString(),
    metadata: parseMetadata(row.DETALLE_JSON),
    email_facturado_enviado_at: toIsoString(row.EMAIL_FACTURADO_ENVIADO_AT),
    email_listo_enviado_at: toIsoString(row.EMAIL_LISTO_ENVIADO_AT),
    email_enviado_enviado_at: toIsoString(row.EMAIL_ENVIADO_ENVIADO_AT),
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
    articleId: row.IDARTICULO?.trim() || "",
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

  if (input.nombre_cliente !== undefined) {
    entries.push(["NOMBRE_CLIENTE", input.nombre_cliente.trim()]);
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
        LTRIM(RTRIM(ISNULL(IDARTICULO, ''))) AS IDARTICULO,
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
        LTRIM(RTRIM(ISNULL(IDARTICULO, ''))) AS IDARTICULO,
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
