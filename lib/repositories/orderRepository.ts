import "server-only";
import {
  escapeLikePattern,
  executeStatement,
  normalizeDbDate,
  queryOne,
  queryRows,
  withTransaction,
} from "@/lib/db";
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

const ORDERS_TABLE = "dbo_WEB_V_MV_PEDIDOS";
const ORDER_LOGS_TABLE = "dbo_WEB_V_MV_PEDIDOS_LOGS";

declare global {
  var __diezDeportesOrderSchemaReady: Promise<void> | undefined;
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
  FECHA_HORA_RETIRO: Date | string | null;
  NOMBRE_APELLIDO: string | null;
  NOMBRE_RETIRO: string | null;
  APELLIDO_RETIRO: string | null;
  DNI_RETIRO: string | null;
  OBSERVACION_RETIRO: string | null;
  DETALLE_JSON: string | null;
  EMAIL_FACTURADO_ENVIADO_AT: Date | string | null;
  EMAIL_LISTO_ENVIADO_AT: Date | string | null;
  EMAIL_ENVIADO_ENVIADO_AT: Date | string | null;
  EMAIL_PEDIDO_RECIBIDO_ENVIADO_AT: Date | string | null;
  FECHA_CREACION: Date | string;
  FECHA_ACTUALIZACION: Date | string;
};

type OrderLogRow = {
  ID: number;
  ORDER_ID: number;
  ESTADO_ANTERIOR: string | null;
  ESTADO_NUEVO: string;
  ORIGEN_CAMBIO: string;
  FECHA: Date | string;
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
  FECHA_CREACION: Date | string | null;
};

function toIsoString(value: Date | string | null) {
  return normalizeDbDate(value)?.toISOString() || null;
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
    fecha_creacion: normalizeDbDate(row.FECHA_CREACION)?.toISOString() || "",
    fecha_actualizacion: normalizeDbDate(row.FECHA_ACTUALIZACION)?.toISOString() || "",
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
    fecha: normalizeDbDate(row.FECHA)?.toISOString() || "",
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
  if (global.__diezDeportesOrderSchemaReady) {
    return global.__diezDeportesOrderSchemaReady;
  }

  global.__diezDeportesOrderSchemaReady = (async () => {
    await executeStatement(`
      CREATE TABLE IF NOT EXISTS ${ORDERS_TABLE} (
        ID BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        NUMERO_PEDIDO VARCHAR(32) NOT NULL,
        NOMBRE_CLIENTE VARCHAR(160) NOT NULL,
        EMAIL_CLIENTE VARCHAR(160) NOT NULL,
        TELEFONO_CLIENTE VARCHAR(40) NOT NULL,
        MONTO_TOTAL DECIMAL(18, 2) NOT NULL,
        ESTADO_PAGO VARCHAR(20) NOT NULL,
        ID_PAGO VARCHAR(64) NULL,
        TIPO_PEDIDO VARCHAR(20) NOT NULL,
        ESTADO VARCHAR(30) NOT NULL,
        CODIGO_QR LONGTEXT NULL,
        NUMERO_SEGUIMIENTO VARCHAR(120) NULL,
        DIRECCION VARCHAR(250) NULL,
        DETALLE_JSON LONGTEXT NULL,
        EMAIL_FACTURADO_ENVIADO_AT DATETIME NULL,
        EMAIL_LISTO_ENVIADO_AT DATETIME NULL,
        EMAIL_ENVIADO_ENVIADO_AT DATETIME NULL,
        FECHA_CREACION DATETIME NOT NULL,
        FECHA_ACTUALIZACION DATETIME NOT NULL,
        RETIRADO VARCHAR(2) NOT NULL DEFAULT 'NO',
        FECHA_HORA_RETIRO DATETIME NULL,
        NOMBRE_APELLIDO VARCHAR(160) NULL,
        NOMBRE_RETIRO VARCHAR(80) NULL,
        APELLIDO_RETIRO VARCHAR(80) NULL,
        DNI_RETIRO VARCHAR(40) NULL,
        OBSERVACION_RETIRO VARCHAR(250) NULL,
        EMAIL_PEDIDO_RECIBIDO_ENVIADO_AT DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await executeStatement(`
      CREATE TABLE IF NOT EXISTS ${ORDER_LOGS_TABLE} (
        ID BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        ORDER_ID BIGINT NOT NULL,
        ESTADO_ANTERIOR VARCHAR(30) NULL,
        ESTADO_NUEVO VARCHAR(30) NOT NULL,
        ORIGEN_CAMBIO VARCHAR(20) NOT NULL,
        FECHA DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  })().catch((error) => {
    global.__diezDeportesOrderSchemaReady = undefined;
    throw error;
  });

  return global.__diezDeportesOrderSchemaReady;
}

export async function getById(id: number) {
  await ensureSchema();
  const row = await queryOne<OrderRow>(
    `
      SELECT *
      FROM ${ORDERS_TABLE}
      WHERE ID = :id
      LIMIT 1;
    `,
    { id },
  );

  return row ? mapOrderRow(row) : null;
}

export async function getAll() {
  return getFiltered({ limit: null });
}

async function getSingleByWhere(
  whereClause: string,
  params: Record<string, unknown>,
) {
  await ensureSchema();
  const row = await queryOne<OrderRow>(
    `
      SELECT *
      FROM ${ORDERS_TABLE}
      WHERE ${whereClause}
      ORDER BY FECHA_CREACION DESC, ID DESC
      LIMIT 1;
    `,
    params,
  );

  return row ? mapOrderRow(row) : null;
}

export async function getFiltered(filters: OrderFilters) {
  await ensureSchema();
  const whereClauses = ["1 = 1"];
  const params: Record<string, unknown> = {};
  const statesForView = getStatesForOrderView(filters.vista);
  const safeLimit =
    typeof filters.limit === "number" && Number.isFinite(filters.limit)
      ? Math.max(1, Math.min(2000, Math.trunc(filters.limit)))
      : null;

  if (filters.estado) {
    params.estado = filters.estado;
    whereClauses.push("ESTADO = :estado");
  }

  if (filters.estado_pago) {
    params.estadoPago = filters.estado_pago;
    whereClauses.push("ESTADO_PAGO = :estadoPago");
  }

  if (filters.tipo_pedido) {
    params.tipoPedido = filters.tipo_pedido;
    whereClauses.push("TIPO_PEDIDO = :tipoPedido");
  }

  if (statesForView?.length) {
    const statePlaceholders = statesForView.map((state, index) => {
      const key = `vistaEstado${index}`;
      params[key] = state;
      return `:${key}`;
    });

    whereClauses.push(`ESTADO IN (${statePlaceholders.join(", ")})`);
  }

  if (filters.q) {
    params.q = `%${escapeLikePattern(filters.q)}%`;
    whereClauses.push(
      "(NUMERO_PEDIDO LIKE :q ESCAPE '\\' OR NOMBRE_CLIENTE LIKE :q ESCAPE '\\' OR EMAIL_CLIENTE LIKE :q ESCAPE '\\')",
    );
  }

  if (filters.fecha_desde) {
    params.fechaDesde = buildDateStart(filters.fecha_desde);
    whereClauses.push("FECHA_CREACION >= :fechaDesde");
  }

  if (filters.fecha_hasta) {
    params.fechaHasta = buildDateEndExclusive(filters.fecha_hasta);
    whereClauses.push("FECHA_CREACION < :fechaHasta");
  }

  const rows = await queryRows<OrderRow>(
    `
      SELECT *
      FROM ${ORDERS_TABLE}
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY FECHA_CREACION DESC, ID DESC
      ${safeLimit ? `LIMIT ${safeLimit}` : ""};
    `,
    params,
  );

  return rows.map(mapOrderRow);
}

export async function getWatchSnapshot(): Promise<AdminOrderWatchSnapshot> {
  await ensureSchema();
  const [totalRow, latestRow] = await Promise.all([
    queryOne<OrderWatchTotalRow>(`
      SELECT COUNT(*) AS TOTAL_ORDERS
      FROM ${ORDERS_TABLE};
    `),
    queryOne<OrderWatchLatestRow>(`
      SELECT
        ID,
        NUMERO_PEDIDO,
        NOMBRE_CLIENTE,
        FECHA_CREACION
      FROM ${ORDERS_TABLE}
      ORDER BY FECHA_CREACION DESC, ID DESC
      LIMIT 1;
    `),
  ]);

  return {
    totalOrders: Number(totalRow?.TOTAL_ORDERS || 0),
    latestOrderId:
      latestRow?.ID && Number.isFinite(Number(latestRow.ID))
        ? Number(latestRow.ID)
        : null,
    latestOrderNumber: latestRow?.NUMERO_PEDIDO?.trim() || null,
    latestCustomerName: latestRow?.NOMBRE_CLIENTE?.trim() || null,
    latestCreatedAt: toIsoString(latestRow?.FECHA_CREACION || null),
  };
}

export async function getExpiredPending(ttlMinutes: number) {
  await ensureSchema();
  const ttl = Math.max(1, Math.min(43200, Math.trunc(Number(ttlMinutes) || 0)));
  const cutoffDate = new Date(Date.now() - ttl * 60 * 1000);
  const rows = await queryRows<OrderRow>(
    `
      SELECT *
      FROM ${ORDERS_TABLE}
      WHERE ESTADO = 'PENDIENTE'
        AND ESTADO_PAGO = 'pendiente'
        AND FECHA_CREACION <= :cutoffDate
      ORDER BY FECHA_CREACION DESC, ID DESC;
    `,
    { cutoffDate },
  );

  return rows.map(mapOrderRow);
}

export async function getByPaymentId(paymentId: string) {
  return getSingleByWhere("ID_PAGO = :paymentId", {
    paymentId: paymentId.trim(),
  });
}

export async function getByPreferenceId(preferenceId: string) {
  return getSingleByWhere(
    "DETALLE_JSON LIKE :preferencePattern ESCAPE '\\'",
    {
      preferencePattern: `%\"preferenceId\":\"${escapeLikePattern(preferenceId.trim())}\"%`,
    },
  );
}

export async function getByExternalReference(externalReference: string) {
  const normalized = externalReference.trim();
  return getSingleByWhere(
    "(DETALLE_JSON LIKE :externalPattern ESCAPE '\\' OR NUMERO_PEDIDO = :externalReference)",
    {
      externalPattern: `%\"externalReference\":\"${escapeLikePattern(normalized)}\"%`,
      externalReference: normalized,
    },
  );
}

export async function getByPickupCode(pickupCode: string) {
  return getSingleByWhere(
    "TIPO_PEDIDO = 'retiro' AND DETALLE_JSON LIKE :pickupPattern ESCAPE '\\'",
    {
      pickupPattern: `%\"pickupCode\":\"${escapeLikePattern(pickupCode.trim())}\"%`,
    },
  );
}

export async function create(input: CreateOrderInput) {
  await ensureSchema();
  const numeroPedido = buildOrderNumber();
  const result = await executeStatement(
    `
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
        DETALLE_JSON,
        FECHA_CREACION,
        FECHA_ACTUALIZACION
      )
      VALUES (
        :numeroPedido,
        :nombreCliente,
        :emailCliente,
        :telefonoCliente,
        :montoTotal,
        :estadoPago,
        :idPago,
        :tipoPedido,
        :estado,
        :codigoQr,
        :numeroSeguimiento,
        :direccion,
        :detalleJson,
        NOW(),
        NOW()
      );
    `,
    {
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
    },
  );

  return getById(Number(result.insertId || 0)) as Promise<StoredOrder>;
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

  const params: Record<string, unknown> = { id };
  const setClauses = entries.map(([column, value], index) => {
    const paramName = `value${index}`;
    params[paramName] = value;
    return `${column} = :${paramName}`;
  });

  await executeStatement(
    `
      UPDATE ${ORDERS_TABLE}
      SET ${setClauses.join(", ")},
          FECHA_ACTUALIZACION = NOW()
      WHERE ID = :id;
    `,
    params,
  );

  return getById(id);
}

export async function logStatusChange(
  orderId: number,
  estadoAnterior: StoredOrder["estado"] | null,
  estadoNuevo: StoredOrder["estado"],
  origen: OrderStatusLog["origen"],
) {
  await ensureSchema();
  const result = await executeStatement(
    `
      INSERT INTO ${ORDER_LOGS_TABLE} (
        ORDER_ID,
        ESTADO_ANTERIOR,
        ESTADO_NUEVO,
        ORIGEN_CAMBIO,
        FECHA
      )
      VALUES (
        :orderId,
        :estadoAnterior,
        :estadoNuevo,
        :origen,
        NOW()
      );
    `,
    {
      orderId,
      estadoAnterior,
      estadoNuevo,
      origen,
    },
  );

  const row = await queryOne<OrderLogRow>(
    `
      SELECT *
      FROM ${ORDER_LOGS_TABLE}
      WHERE ID = :id
      LIMIT 1;
    `,
    { id: Number(result.insertId || 0) },
  );

  return mapOrderLogRow(row as OrderLogRow);
}

export async function getLogsByOrderId(orderId: number) {
  await ensureSchema();
  const rows = await queryRows<OrderLogRow>(
    `
      SELECT *
      FROM ${ORDER_LOGS_TABLE}
      WHERE ORDER_ID = :orderId
      ORDER BY FECHA DESC, ID DESC;
    `,
    { orderId },
  );

  return rows.map(mapOrderLogRow);
}

export async function getDocumentItemsByComprobante(input: {
  tc: string;
  idComprobante: string;
}) {
  await ensureSchema();
  const rows = await queryRows<OrderDocumentItemRow>(
    `
      SELECT
        ID,
        TRIM(COALESCE(TC, '')) AS TC,
        TRIM(COALESCE(IDCOMPROBANTE, '')) AS IDCOMPROBANTE,
        TRIM(COALESCE(IDARTICULO, '')) AS IDARTICULO,
        COALESCE(DESCRIPCION, '') AS DESCRIPCION,
        CANTIDAD,
        IMPORTE,
        TOTAL,
        SECUENCIA
      FROM dbo_V_MV_CpteInsumos
      WHERE TRIM(COALESCE(TC, '')) = :tc
        AND TRIM(COALESCE(IDCOMPROBANTE, '')) = :idComprobante
      ORDER BY COALESCE(SECUENCIA, 0), COALESCE(ID, 0);
    `,
    {
      tc: input.tc.trim(),
      idComprobante: input.idComprobante.trim(),
    },
  );

  return rows.map(mapOrderDocumentItemRow);
}

export async function getDocumentItemsByNumber(idComprobante: string) {
  await ensureSchema();
  const rows = await queryRows<OrderDocumentItemRow>(
    `
      SELECT
        ID,
        TRIM(COALESCE(TC, '')) AS TC,
        TRIM(COALESCE(IDCOMPROBANTE, '')) AS IDCOMPROBANTE,
        TRIM(COALESCE(IDARTICULO, '')) AS IDARTICULO,
        COALESCE(DESCRIPCION, '') AS DESCRIPCION,
        CANTIDAD,
        IMPORTE,
        TOTAL,
        SECUENCIA
      FROM dbo_V_MV_CpteInsumos
      WHERE TRIM(COALESCE(IDCOMPROBANTE, '')) = :idComprobante
      ORDER BY COALESCE(SECUENCIA, 0), COALESCE(ID, 0);
    `,
    {
      idComprobante: idComprobante.trim(),
    },
  );

  return rows.map(mapOrderDocumentItemRow);
}

export async function getDocumentItemStatsByOrderNumbers(orderNumbers: string[]) {
  const normalizedOrderNumbers = Array.from(
    new Set(orderNumbers.map((value) => value.trim()).filter(Boolean)),
  );

  if (normalizedOrderNumbers.length === 0) {
    return new Map<string, { itemCount: number; lineCount: number }>();
  }

  await ensureSchema();
  const params = Object.fromEntries(
    normalizedOrderNumbers.map((value, index) => [`orderNumber${index}`, value]),
  );
  const placeholders = normalizedOrderNumbers
    .map((_, index) => `:orderNumber${index}`)
    .join(", ");
  const rows = await queryRows<OrderDocumentItemStatsRow>(
    `
      SELECT
        TRIM(COALESCE(IDCOMPROBANTE, '')) AS IDCOMPROBANTE,
        SUM(COALESCE(CANTIDAD, 0)) AS TOTAL_ITEMS,
        COUNT(*) AS LINE_COUNT
      FROM dbo_V_MV_CpteInsumos
      WHERE TRIM(COALESCE(IDCOMPROBANTE, '')) IN (${placeholders})
      GROUP BY TRIM(COALESCE(IDCOMPROBANTE, ''));
    `,
    params,
  );

  return new Map(
    rows.map((row) => [
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

  return withTransaction(async (transaction) => {
    const currentRow = await queryOne<OrderRow>(
      `
        SELECT *
        FROM ${ORDERS_TABLE}
        WHERE ID = :id
          AND TIPO_PEDIDO = 'retiro'
          AND COALESCE(RETIRADO, 'NO') <> 'SI'
        FOR UPDATE;
      `,
      { id: input.orderId },
      transaction,
    );

    if (!currentRow) {
      return null;
    }

    await executeStatement(
      `
        UPDATE ${ORDERS_TABLE}
        SET
          RETIRADO = 'SI',
          FECHA_HORA_RETIRO = NOW(),
          NOMBRE_RETIRO = :nombre,
          APELLIDO_RETIRO = :apellido,
          DNI_RETIRO = :dni,
          OBSERVACION_RETIRO = :observacion,
          NOMBRE_APELLIDO = :nombreApellido,
          ESTADO = 'ENTREGADO',
          FECHA_ACTUALIZACION = NOW()
        WHERE ID = :id;
      `,
      {
        id: input.orderId,
        nombre: input.nombre?.trim() || null,
        apellido: input.apellido?.trim() || null,
        dni: input.dni?.trim() || null,
        observacion: input.observacion?.trim() || null,
        nombreApellido: input.nombreApellido?.trim() || null,
      },
      transaction,
    );

    const updatedRow = await queryOne<OrderRow>(
      `
        SELECT *
        FROM ${ORDERS_TABLE}
        WHERE ID = :id
        LIMIT 1;
      `,
      { id: input.orderId },
      transaction,
    );

    if (!updatedRow) {
      return null;
    }

    return {
      order: mapOrderRow(updatedRow),
      estadoAnterior: (currentRow.ESTADO || null) as StoredOrder["estado"] | null,
    };
  });
}
