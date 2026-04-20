import "server-only";
import { randomUUID } from "node:crypto";
import type { ConnectionPool, Transaction } from "mssql";
import {
  createMercadoPagoPreference,
  getMercadoPagoPayment,
} from "@/lib/mercado-pago";
import { getConnection, sql } from "@/lib/db";
import { createOrderWithExecutor, quoteOrderPayload } from "@/lib/orders";
import { getServerSettings } from "@/lib/store-config";
import type {
  AdminOrderRecord,
  AdminOrdersSnapshot,
  AdminOrderStatusFilter,
  CreateOrderPayload,
  OrderSummary,
  PaymentFlowStatus,
  PaymentPreferenceResponse,
  PaymentStatusResult,
} from "@/lib/types";

type Executor = ConnectionPool | Transaction;

type PendingOrderRow = {
  ID: number;
  EXTERNAL_REFERENCE: string;
  STATUS: PaymentFlowStatus;
  PREFERENCE_ID: string | null;
  PAYMENT_ID: string | null;
  MERCHANT_ORDER_ID: string | null;
  PAYMENT_STATUS: string | null;
  PAYMENT_STATUS_DETAIL: string | null;
  PAYMENT_METHOD_ID: string | null;
  PAYMENT_TYPE_ID: string | null;
  CHECKOUT_URL: string | null;
  TOTAL: number;
  ITEM_COUNT: number;
  CURRENCY: string | null;
  CUSTOMER_NAME: string | null;
  CUSTOMER_EMAIL: string | null;
  CUSTOMER_PHONE: string | null;
  PAYLOAD_JSON: string;
  PREFERENCE_REQUEST_JSON: string | null;
  PREFERENCE_RESPONSE_JSON: string | null;
  PAYMENT_RESPONSE_JSON: string | null;
  FINAL_ORDER_TC: string | null;
  FINAL_ORDER_IDCOMPROBANTE: string | null;
  FINAL_ORDER_INTERNAL_ID: number | null;
  FINAL_ORDER_TOTAL: number | null;
  FINAL_ORDER_ITEM_COUNT: number | null;
  LAST_ERROR: string | null;
  CREATED_AT: Date;
  UPDATED_AT: Date;
  APPROVED_AT: Date | null;
  FINALIZED_AT: Date | null;
  LAST_SYNC_AT: Date | null;
};

type PendingOrderLookup = {
  pendingOrderId?: number | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  externalReference?: string | null;
};

function createRequest(executor: Executor) {
  if ("begin" in executor) {
    return new sql.Request(executor);
  }

  return executor.request();
}

function setInput(
  request: ReturnType<typeof createRequest>,
  name: string,
  value: unknown,
) {
  request.input(name, value);
}

function serializeJson(value: unknown) {
  return JSON.stringify(value);
}

function forceMercadoPagoPayload(
  payload: CreateOrderPayload,
): CreateOrderPayload {
  return {
    customer: {
      ...payload.customer,
      paymentMethod: "Mercado Pago",
    },
    items: payload.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
  };
}

function toIsoString(value: Date | null) {
  return value ? new Date(value).toISOString() : "";
}

function pendingOrderColumns() {
  return `
    ID,
    EXTERNAL_REFERENCE,
    STATUS,
    PREFERENCE_ID,
    PAYMENT_ID,
    MERCHANT_ORDER_ID,
    PAYMENT_STATUS,
    PAYMENT_STATUS_DETAIL,
    PAYMENT_METHOD_ID,
    PAYMENT_TYPE_ID,
    CHECKOUT_URL,
    TOTAL,
    ITEM_COUNT,
    CURRENCY,
    CUSTOMER_NAME,
    CUSTOMER_EMAIL,
    CUSTOMER_PHONE,
    PAYLOAD_JSON,
    PREFERENCE_REQUEST_JSON,
    PREFERENCE_RESPONSE_JSON,
    PAYMENT_RESPONSE_JSON,
    FINAL_ORDER_TC,
    FINAL_ORDER_IDCOMPROBANTE,
    FINAL_ORDER_INTERNAL_ID,
    FINAL_ORDER_TOTAL,
    FINAL_ORDER_ITEM_COUNT,
    LAST_ERROR,
    CREATED_AT,
    UPDATED_AT,
    APPROVED_AT,
    FINALIZED_AT,
    LAST_SYNC_AT
  `;
}

async function ensurePendingOrdersTable(executor: Executor) {
  await createRequest(executor).query(`
    IF OBJECT_ID('dbo.TA_WEB_PEDIDOS_MP', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.TA_WEB_PEDIDOS_MP (
        ID bigint IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        EXTERNAL_REFERENCE nvarchar(64) NOT NULL,
        STATUS nvarchar(20) NOT NULL,
        PREFERENCE_ID nvarchar(128) NULL,
        PAYMENT_ID nvarchar(64) NULL,
        MERCHANT_ORDER_ID nvarchar(64) NULL,
        PAYMENT_STATUS nvarchar(40) NULL,
        PAYMENT_STATUS_DETAIL nvarchar(120) NULL,
        PAYMENT_METHOD_ID nvarchar(80) NULL,
        PAYMENT_TYPE_ID nvarchar(80) NULL,
        CHECKOUT_URL nvarchar(500) NULL,
        TOTAL decimal(18, 2) NOT NULL,
        ITEM_COUNT int NOT NULL,
        CURRENCY nvarchar(8) NULL,
        CUSTOMER_NAME nvarchar(120) NULL,
        CUSTOMER_EMAIL nvarchar(160) NULL,
        CUSTOMER_PHONE nvarchar(40) NULL,
        PAYLOAD_JSON nvarchar(max) NOT NULL,
        PREFERENCE_REQUEST_JSON nvarchar(max) NULL,
        PREFERENCE_RESPONSE_JSON nvarchar(max) NULL,
        PAYMENT_RESPONSE_JSON nvarchar(max) NULL,
        FINAL_ORDER_TC nvarchar(8) NULL,
        FINAL_ORDER_IDCOMPROBANTE nvarchar(32) NULL,
        FINAL_ORDER_INTERNAL_ID bigint NULL,
        FINAL_ORDER_TOTAL decimal(18, 2) NULL,
        FINAL_ORDER_ITEM_COUNT int NULL,
        LAST_ERROR nvarchar(500) NULL,
        CREATED_AT datetime2 NOT NULL CONSTRAINT DF_TA_WEB_PEDIDOS_MP_CREATED_AT DEFAULT SYSDATETIME(),
        UPDATED_AT datetime2 NOT NULL CONSTRAINT DF_TA_WEB_PEDIDOS_MP_UPDATED_AT DEFAULT SYSDATETIME(),
        APPROVED_AT datetime2 NULL,
        FINALIZED_AT datetime2 NULL,
        LAST_SYNC_AT datetime2 NULL
      );
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'IX_TA_WEB_PEDIDOS_MP_EXTERNAL_REFERENCE'
        AND object_id = OBJECT_ID('dbo.TA_WEB_PEDIDOS_MP')
    )
    BEGIN
      CREATE UNIQUE INDEX IX_TA_WEB_PEDIDOS_MP_EXTERNAL_REFERENCE
      ON dbo.TA_WEB_PEDIDOS_MP (EXTERNAL_REFERENCE);
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'IX_TA_WEB_PEDIDOS_MP_PREFERENCE_ID'
        AND object_id = OBJECT_ID('dbo.TA_WEB_PEDIDOS_MP')
    )
    BEGIN
      CREATE INDEX IX_TA_WEB_PEDIDOS_MP_PREFERENCE_ID
      ON dbo.TA_WEB_PEDIDOS_MP (PREFERENCE_ID);
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'IX_TA_WEB_PEDIDOS_MP_PAYMENT_ID'
        AND object_id = OBJECT_ID('dbo.TA_WEB_PEDIDOS_MP')
    )
    BEGIN
      CREATE INDEX IX_TA_WEB_PEDIDOS_MP_PAYMENT_ID
      ON dbo.TA_WEB_PEDIDOS_MP (PAYMENT_ID);
    END;
  `);
}

function buildExternalReference() {
  return `DD-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

async function insertPendingOrder(
  executor: Executor,
  payload: CreateOrderPayload,
  total: number,
  itemCount: number,
  currency: string,
  externalReference: string,
) {
  const request = createRequest(executor);
  setInput(request, "externalReference", externalReference);
  setInput(request, "status", "pending");
  setInput(request, "total", total);
  setInput(request, "itemCount", itemCount);
  setInput(request, "currency", currency);
  setInput(request, "customerName", payload.customer.fullName.trim() || null);
  setInput(request, "customerEmail", payload.customer.email.trim() || null);
  setInput(request, "customerPhone", payload.customer.phone.trim() || null);
  setInput(request, "payloadJson", serializeJson(payload));

  const result = await request.query<{ ID: number }>(`
    INSERT INTO dbo.TA_WEB_PEDIDOS_MP (
      EXTERNAL_REFERENCE,
      STATUS,
      TOTAL,
      ITEM_COUNT,
      CURRENCY,
      CUSTOMER_NAME,
      CUSTOMER_EMAIL,
      CUSTOMER_PHONE,
      PAYLOAD_JSON
    )
    OUTPUT INSERTED.ID
    VALUES (
      @externalReference,
      @status,
      @total,
      @itemCount,
      @currency,
      @customerName,
      @customerEmail,
      @customerPhone,
      @payloadJson
    );
  `);

  return result.recordset[0]?.ID ?? 0;
}

async function updatePendingOrderFields(
  executor: Executor,
  pendingOrderId: number,
  fields: Record<string, unknown>,
) {
  const entries = Object.entries(fields);
  if (entries.length === 0) return;

  const request = createRequest(executor);
  setInput(request, "pendingOrderId", pendingOrderId);

  const assignments = entries.map(([column], index) => {
    const paramName = `value${index}`;
    setInput(request, paramName, fields[column]);
    return `${column} = @${paramName}`;
  });

  assignments.push("UPDATED_AT = SYSDATETIME()");

  await request.query(`
    UPDATE dbo.TA_WEB_PEDIDOS_MP
    SET ${assignments.join(", ")}
    WHERE ID = @pendingOrderId;
  `);
}

async function findPendingOrder(
  lookup: PendingOrderLookup,
  executor?: Executor,
  options: { lock?: boolean } = {},
) {
  const connection = executor || (await getConnection());
  await ensurePendingOrdersTable(connection);

  const request = createRequest(connection);
  const tableHint = options.lock ? " WITH (UPDLOCK, HOLDLOCK, ROWLOCK)" : "";

  if (lookup.pendingOrderId) {
    setInput(request, "pendingOrderId", lookup.pendingOrderId);

    const result = await request.query<PendingOrderRow>(`
      SELECT TOP (1) ${pendingOrderColumns()}
      FROM dbo.TA_WEB_PEDIDOS_MP${tableHint}
      WHERE ID = @pendingOrderId;
    `);

    return result.recordset[0] ?? null;
  }

  if (lookup.paymentId?.trim()) {
    setInput(request, "paymentId", lookup.paymentId.trim());

    const result = await request.query<PendingOrderRow>(`
      SELECT TOP (1) ${pendingOrderColumns()}
      FROM dbo.TA_WEB_PEDIDOS_MP${tableHint}
      WHERE PAYMENT_ID = @paymentId
      ORDER BY ID DESC;
    `);

    return result.recordset[0] ?? null;
  }

  if (lookup.preferenceId?.trim()) {
    setInput(request, "preferenceId", lookup.preferenceId.trim());

    const result = await request.query<PendingOrderRow>(`
      SELECT TOP (1) ${pendingOrderColumns()}
      FROM dbo.TA_WEB_PEDIDOS_MP${tableHint}
      WHERE PREFERENCE_ID = @preferenceId
      ORDER BY ID DESC;
    `);

    return result.recordset[0] ?? null;
  }

  if (lookup.externalReference?.trim()) {
    setInput(request, "externalReference", lookup.externalReference.trim());

    const result = await request.query<PendingOrderRow>(`
      SELECT TOP (1) ${pendingOrderColumns()}
      FROM dbo.TA_WEB_PEDIDOS_MP${tableHint}
      WHERE EXTERNAL_REFERENCE = @externalReference
      ORDER BY ID DESC;
    `);

    return result.recordset[0] ?? null;
  }

  return null;
}

function mapOrderSummary(row: PendingOrderRow): OrderSummary | null {
  if (!row.FINAL_ORDER_TC || !row.FINAL_ORDER_IDCOMPROBANTE) {
    return null;
  }

  return {
    tc: row.FINAL_ORDER_TC,
    idComprobante: row.FINAL_ORDER_IDCOMPROBANTE,
    internalId: row.FINAL_ORDER_INTERNAL_ID,
    total: Number(row.FINAL_ORDER_TOTAL || 0),
    itemCount: Number(row.FINAL_ORDER_ITEM_COUNT || 0),
  };
}

function mapPendingOrderStatus(row: PendingOrderRow): PaymentStatusResult {
  return {
    pendingOrderId: row.ID,
    externalReference: row.EXTERNAL_REFERENCE,
    status: row.FINALIZED_AT ? "finalized" : row.STATUS,
    paymentStatus: row.PAYMENT_STATUS,
    paymentStatusDetail: row.PAYMENT_STATUS_DETAIL,
    paymentId: row.PAYMENT_ID,
    preferenceId: row.PREFERENCE_ID,
    merchantOrderId: row.MERCHANT_ORDER_ID,
    total: Number(row.TOTAL || 0),
    itemCount: Number(row.ITEM_COUNT || 0),
    checkoutUrl: row.CHECKOUT_URL,
    finalizationError: row.LAST_ERROR,
    customerName: row.CUSTOMER_NAME || "",
    customerEmail: row.CUSTOMER_EMAIL || "",
    createdAt: toIsoString(row.CREATED_AT),
    updatedAt: toIsoString(row.UPDATED_AT),
    order: mapOrderSummary(row),
  };
}

function parsePendingOrderPayload(payloadJson: string) {
  try {
    return JSON.parse(payloadJson) as CreateOrderPayload;
  } catch {
    return null;
  }
}

function mapAdminOrderRecord(row: PendingOrderRow): AdminOrderRecord {
  const payload = parsePendingOrderPayload(row.PAYLOAD_JSON);
  const customer = payload?.customer;

  return {
    ...mapPendingOrderStatus(row),
    customerPhone: row.CUSTOMER_PHONE || customer?.phone || "",
    customerAddress: customer?.address || "",
    customerCity: customer?.city || "",
    customerProvince: customer?.province || "",
    customerPostalCode: customer?.postalCode || "",
    deliveryMethod: customer?.deliveryMethod || "",
    notes: customer?.notes || "",
    items:
      payload?.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })) || [],
    approvedAt: toIsoString(row.APPROVED_AT),
    finalizedAt: toIsoString(row.FINALIZED_AT),
    lastSyncAt: toIsoString(row.LAST_SYNC_AT),
    paymentMethodId: row.PAYMENT_METHOD_ID,
    paymentTypeId: row.PAYMENT_TYPE_ID,
  };
}

function deriveStatusFromPayment(
  paymentStatus: string | null,
  currentStatus: PaymentFlowStatus,
) {
  if (currentStatus === "error" || currentStatus === "processing") {
    return currentStatus;
  }

  switch ((paymentStatus || "").trim().toLowerCase()) {
    case "approved":
      return "approved";
    case "rejected":
    case "charged_back":
      return "rejected";
    case "cancelled":
    case "refunded":
      return "cancelled";
    case "pending":
    case "in_process":
    case "in_mediation":
    case "authorized":
      return "pending";
    default:
      return currentStatus || "pending";
  }
}

function isProcessingStale(row: PendingOrderRow) {
  if (row.STATUS !== "processing") return false;
  const updatedAt = new Date(row.UPDATED_AT).getTime();
  return Number.isFinite(updatedAt) && Date.now() - updatedAt > 2 * 60 * 1000;
}

function canFinalizeApprovedOrder(row: PendingOrderRow) {
  return (
    (row.PAYMENT_STATUS || "").trim().toLowerCase() === "approved" &&
    !row.FINALIZED_AT &&
    !row.FINAL_ORDER_IDCOMPROBANTE
  );
}

function parseStoredPayload(payloadJson: string) {
  const parsed = JSON.parse(payloadJson) as CreateOrderPayload;
  return forceMercadoPagoPayload(parsed);
}

async function finalizeApprovedOrder(row: PendingOrderRow) {
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    await ensurePendingOrdersTable(transaction);

    const lockedRow = await findPendingOrder(
      { pendingOrderId: row.ID },
      transaction,
      { lock: true },
    );

    if (!lockedRow) {
      throw new Error("No se encontro el pedido pendiente para finalizar.");
    }

    if (lockedRow.FINALIZED_AT || lockedRow.FINAL_ORDER_IDCOMPROBANTE) {
      await transaction.commit();
      return lockedRow;
    }

    if (lockedRow.STATUS === "processing" && !isProcessingStale(lockedRow)) {
      await transaction.commit();
      return lockedRow;
    }

    await updatePendingOrderFields(transaction, lockedRow.ID, {
      STATUS: "processing",
      LAST_ERROR: null,
    });

    const settings = await getServerSettings();

    const order = await createOrderWithExecutor(
      transaction,
      parseStoredPayload(row.PAYLOAD_JSON),
      {
        orderTc: settings.mercadoPagoOrderTc || undefined,
        orderUser: `${settings.orderUser || "web-shop"}-mp`,
      },
    );

    await updatePendingOrderFields(transaction, row.ID, {
      STATUS: "finalized",
      FINAL_ORDER_TC: order.tc,
      FINAL_ORDER_IDCOMPROBANTE: order.idComprobante,
      FINAL_ORDER_INTERNAL_ID: order.internalId,
      FINAL_ORDER_TOTAL: order.total,
      FINAL_ORDER_ITEM_COUNT: order.itemCount,
      FINALIZED_AT: new Date(),
      APPROVED_AT: row.APPROVED_AT || new Date(),
      LAST_ERROR: null,
    });

    await transaction.commit();
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("Pending order finalization rollback failed", rollbackError);
    }

    await updatePendingOrderFields(pool, row.ID, {
      STATUS: "error",
      LAST_ERROR:
        error instanceof Error
          ? error.message
          : "No se pudo finalizar el pedido aprobado.",
      APPROVED_AT: row.APPROVED_AT || new Date(),
    });
  }

  return findPendingOrder({ pendingOrderId: row.ID }, pool);
}

async function syncPaymentStatus(row: PendingOrderRow, paymentId: string) {
  try {
    const payment = await getMercadoPagoPayment(paymentId);
    const paymentStatus = payment.status?.trim() || row.PAYMENT_STATUS || null;
    const derivedStatus = deriveStatusFromPayment(paymentStatus, row.STATUS);

    await updatePendingOrderFields(await getConnection(), row.ID, {
      STATUS: row.FINALIZED_AT ? "finalized" : derivedStatus,
      PAYMENT_ID: String(payment.id || paymentId),
      PREFERENCE_ID: payment.preference_id?.trim() || row.PREFERENCE_ID,
      MERCHANT_ORDER_ID: payment.merchant_order_id
        ? String(payment.merchant_order_id).trim()
        : row.MERCHANT_ORDER_ID,
      PAYMENT_STATUS: paymentStatus,
      PAYMENT_STATUS_DETAIL: payment.status_detail?.trim() || null,
      PAYMENT_METHOD_ID: payment.payment_method_id?.trim() || null,
      PAYMENT_TYPE_ID: payment.payment_type_id?.trim() || null,
      PAYMENT_RESPONSE_JSON: serializeJson(payment),
      LAST_SYNC_AT: new Date(),
      APPROVED_AT:
        paymentStatus === "approved" ? row.APPROVED_AT || new Date() : row.APPROVED_AT,
      LAST_ERROR: row.STATUS === "error" ? row.LAST_ERROR : null,
    });
  } catch (error) {
    console.error("Mercado Pago payment sync failed", error);

    await updatePendingOrderFields(await getConnection(), row.ID, {
      LAST_ERROR: row.FINALIZED_AT
        ? null
        : error instanceof Error
          ? error.message
          : "No se pudo consultar el estado de Mercado Pago.",
      LAST_SYNC_AT: new Date(),
    });
  }

  const refreshed = await findPendingOrder({ pendingOrderId: row.ID });
  if (!refreshed) {
    return null;
  }

  if (canFinalizeApprovedOrder(refreshed)) {
    return finalizeApprovedOrder(refreshed);
  }

  return refreshed;
}

export async function createPendingMercadoPagoOrder(input: {
  payload: CreateOrderPayload;
  requestUrl?: string;
}): Promise<PaymentPreferenceResponse> {
  const payload = forceMercadoPagoPayload(input.payload);
  const quote = await quoteOrderPayload(payload);

  if (quote.total <= 0) {
    throw new Error("El pedido debe tener un total mayor a cero para pagar.");
  }

  const pool = await getConnection();
  await ensurePendingOrdersTable(pool);

  const externalReference = buildExternalReference();
  const pendingOrderId = await insertPendingOrder(
    pool,
    payload,
    quote.total,
    quote.itemCount,
    quote.currency,
    externalReference,
  );

  if (!pendingOrderId) {
    throw new Error("No se pudo guardar el pedido web pendiente.");
  }

  try {
    const preference = await createMercadoPagoPreference({
      requestUrl: input.requestUrl,
      pendingOrderId,
      externalReference,
      customer: {
        fullName: payload.customer.fullName,
        email: payload.customer.email,
      },
      items: quote.lines.map((line) => ({
        title: line.product.description,
        quantity: line.quantity,
        unitPrice: line.product.price,
        currency: line.product.currency,
      })),
    });

    await updatePendingOrderFields(pool, pendingOrderId, {
      PREFERENCE_ID: preference.preferenceId,
      CHECKOUT_URL: preference.checkoutUrl,
      PREFERENCE_REQUEST_JSON: serializeJson(preference.requestBody),
      PREFERENCE_RESPONSE_JSON: serializeJson(preference.responseBody),
      LAST_ERROR: null,
    });

    return {
      pendingOrderId,
      externalReference,
      preferenceId: preference.preferenceId,
      checkoutUrl: preference.checkoutUrl,
      total: quote.total,
      itemCount: quote.itemCount,
      status: "pending",
    };
  } catch (error) {
    await updatePendingOrderFields(pool, pendingOrderId, {
      STATUS: "error",
      LAST_ERROR:
        error instanceof Error
          ? error.message
          : "No se pudo crear la preferencia de Mercado Pago.",
    });

    throw error;
  }
}

export async function resolvePendingPaymentStatus(
  lookup: PendingOrderLookup,
): Promise<PaymentStatusResult | null> {
  const row = await findPendingOrder(lookup);
  if (!row) {
    return null;
  }

  let resolvedRow: PendingOrderRow | null = row;
  const paymentId = lookup.paymentId?.trim() || row.PAYMENT_ID?.trim() || "";

  if (paymentId) {
    resolvedRow = await syncPaymentStatus(row, paymentId);
  } else if (canFinalizeApprovedOrder(row)) {
    resolvedRow = await finalizeApprovedOrder(row);
  }

  if (!resolvedRow) {
    return null;
  }

  return mapPendingOrderStatus(resolvedRow);
}

export async function handleMercadoPagoWebhook(input: {
  pendingOrderId?: number | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  externalReference?: string | null;
}) {
  const status = await resolvePendingPaymentStatus({
    pendingOrderId: input.pendingOrderId,
    paymentId: input.paymentId,
    preferenceId: input.preferenceId,
    externalReference: input.externalReference,
  });

  return status;
}

export async function listAdminPendingOrders(input?: {
  status?: AdminOrderStatusFilter;
  limit?: number;
}): Promise<AdminOrdersSnapshot> {
  const pool = await getConnection();
  await ensurePendingOrdersTable(pool);

  const safeLimit = Math.max(1, Math.min(200, Math.trunc(input?.limit || 60)));
  const request = createRequest(pool);
  const summaryRequest = createRequest(pool);
  const statusFilter = input?.status || "orders";

  if (statusFilter !== "orders") {
    setInput(request, "status", statusFilter);
  }

  const rows = await request.query<PendingOrderRow>(`
    SELECT TOP (${safeLimit}) ${pendingOrderColumns()}
    FROM dbo.TA_WEB_PEDIDOS_MP WITH (NOLOCK)
    ${
      statusFilter === "orders"
        ? "WHERE STATUS <> 'error'"
        : statusFilter === "error"
        ? "WHERE STATUS = @status"
        : "WHERE STATUS = @status"
    }
    ORDER BY CREATED_AT DESC, ID DESC;
  `);

  const summaryRows = await summaryRequest.query<{
    STATUS: PaymentFlowStatus;
    TOTAL: number;
  }>(`
    SELECT STATUS, COUNT(*) AS TOTAL
    FROM dbo.TA_WEB_PEDIDOS_MP WITH (NOLOCK)
    GROUP BY STATUS;
  `);

  const summary: AdminOrdersSnapshot["summary"] = {
    total: 0,
    pending: 0,
    processing: 0,
    approved: 0,
    finalized: 0,
    rejected: 0,
    cancelled: 0,
    error: 0,
  };

  for (const row of summaryRows.recordset) {
    summary.total += Number(row.TOTAL || 0);

    if (row.STATUS in summary) {
      summary[row.STATUS] = Number(row.TOTAL || 0);
    }
  }

  return {
    orders: rows.recordset.map(mapAdminOrderRecord),
    summary,
  };
}
