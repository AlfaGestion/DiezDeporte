import "server-only";
import {
  createMercadoPagoPreference,
  getMercadoPagoPayment,
} from "@/lib/mercado-pago";
import { getServerSettings } from "@/lib/store-config";
import {
  formatOrderAsLegacySummary,
  mapMercadoPagoStatusToOrderPaymentStatus,
  OrderNotFoundError,
} from "@/lib/models/order";
import {
  getByExternalReference,
  getById as getOrderRepositoryById,
  getByPaymentId,
  getByPreferenceId,
} from "@/lib/repositories/orderRepository";
import {
  buildCheckoutOrderDraft,
  cancelExpiredPendingOrders,
  createOrder,
  ensurePickupAssets,
  markOrderPaymentStatus,
  registerMercadoPagoApproval,
  updateOrderStatus,
} from "@/lib/services/orderService";
import type {
  CreateOrderPayload,
  PaymentPreferenceResponse,
  PaymentStatusResult,
} from "@/lib/types";
import type { StoredOrder } from "@/lib/types/order";

async function findOrderByLookup(lookup: {
  pendingOrderId?: number | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  externalReference?: string | null;
}) {
  if (lookup.pendingOrderId) {
    return getOrderRepositoryById(lookup.pendingOrderId);
  }

  if (lookup.paymentId?.trim()) {
    return getByPaymentId(lookup.paymentId.trim());
  }

  if (lookup.preferenceId?.trim()) {
    return getByPreferenceId(lookup.preferenceId.trim());
  }

  if (lookup.externalReference?.trim()) {
    return getByExternalReference(lookup.externalReference.trim());
  }

  return null;
}

function toPaymentFlowStatus(order: StoredOrder): PaymentStatusResult["status"] {
  if (order.estado === "ERROR") {
    return "error";
  }

  if (order.estado === "CANCELADO") {
    return "cancelled";
  }

  if (order.estado_pago === "rechazado") {
    return "rejected";
  }

  if (order.estado === "APROBADO") {
    return "approved";
  }

  if (
    ["FACTURADO", "PREPARANDO", "LISTO_PARA_RETIRO", "ENVIADO", "ENTREGADO"].includes(
      order.estado,
    )
  ) {
    return "finalized";
  }

  return "pending";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

async function buildPickupReadyUrl(order: StoredOrder) {
  const baseUrl = trimTrailingSlash((await getServerSettings()).mercadoPagoPublicBaseUrl || "");

  if (!baseUrl) {
    return null;
  }

  const externalReference = order.metadata.externalReference || order.numero_pedido;
  return `${baseUrl}/pedido?externalReference=${encodeURIComponent(externalReference)}`;
}

async function toPaymentStatusResult(order: StoredOrder): Promise<PaymentStatusResult> {
  const hydratedOrder =
    order.tipo_pedido === "retiro"
      ? await ensurePickupAssets(order)
      : order;
  const settings = await getServerSettings();
  const itemCount =
    hydratedOrder.metadata.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const hasOperationalOrder = [
    "FACTURADO",
    "PREPARANDO",
    "LISTO_PARA_RETIRO",
    "ENVIADO",
    "ENTREGADO",
  ].includes(hydratedOrder.estado);
  const pickupReadyUrl =
    hydratedOrder.tipo_pedido === "retiro" ? await buildPickupReadyUrl(hydratedOrder) : null;

  return {
    pendingOrderId: hydratedOrder.id,
    externalReference: hydratedOrder.metadata.externalReference || hydratedOrder.numero_pedido,
    status: toPaymentFlowStatus(hydratedOrder),
    paymentStatus: hydratedOrder.estado_pago,
    paymentStatusDetail: hydratedOrder.metadata.paymentStatusDetail || null,
    paymentId: hydratedOrder.id_pago,
    preferenceId: hydratedOrder.metadata.preferenceId || null,
    merchantOrderId: null,
    total: hydratedOrder.monto_total,
    itemCount,
    checkoutUrl: null,
    finalizationError:
      hydratedOrder.estado === "ERROR" ? "El pedido requiere revision manual." : null,
    customerName: hydratedOrder.nombre_cliente,
    customerEmail: hydratedOrder.email_cliente,
    createdAt: hydratedOrder.fecha_creacion,
    updatedAt: hydratedOrder.fecha_actualizacion,
    order: hasOperationalOrder
      ? formatOrderAsLegacySummary(hydratedOrder, itemCount, {
          tc: hydratedOrder.metadata.documentTc || settings.mercadoPagoOrderTc || settings.orderTc || "WEB",
          branch: settings.orderBranch,
          documentNumber: hydratedOrder.metadata.documentNumber || null,
        })
      : null,
    orderState: hydratedOrder.estado,
    orderType: hydratedOrder.tipo_pedido,
    pickupCode: hydratedOrder.metadata.pickupCode || null,
    qrCode: hydratedOrder.codigo_qr,
    pickupReadyUrl,
  };
}

function buildMetadataPatch(
  order: StoredOrder,
  input: {
    payment:
      | Awaited<ReturnType<typeof getMercadoPagoPayment>>
      | null;
    preferenceId?: string | null;
    externalReference?: string | null;
  },
) {
  return {
    ...order.metadata,
    preferenceId:
      input.payment?.preference_id?.trim() ||
      input.preferenceId ||
      order.metadata.preferenceId ||
      null,
    externalReference:
      input.payment?.external_reference?.trim() ||
      input.externalReference ||
      order.metadata.externalReference ||
      order.numero_pedido,
    paymentStatusDetail: input.payment?.status_detail?.trim() || null,
    paymentTypeId: input.payment?.payment_type_id?.trim() || null,
    paymentMethodId: input.payment?.payment_method_id?.trim() || null,
    lastPaymentPayload: input.payment
      ? JSON.stringify(input.payment)
      : order.metadata.lastPaymentPayload || null,
  } satisfies StoredOrder["metadata"];
}

export async function createMercadoPagoOrder(input: {
  payload: CreateOrderPayload;
  requestUrl?: string;
}): Promise<PaymentPreferenceResponse> {
  const draft = await buildCheckoutOrderDraft(input.payload);
  const order = await createOrder(draft.input, { origin: "sistema" });
  const externalReference = order.numero_pedido;

  try {
    const preference = await createMercadoPagoPreference({
      requestUrl: input.requestUrl,
      pendingOrderId: order.id,
      externalReference,
      customer: {
        fullName: order.nombre_cliente,
        email: order.email_cliente,
      },
      items: draft.paymentItems,
    });

    await markOrderPaymentStatus(order.id, "pendiente", null, {
      ...order.metadata,
      preferenceId: preference.preferenceId,
      externalReference,
      paymentMethod: "Mercado Pago",
    });

    return {
      pendingOrderId: order.id,
      externalReference,
      preferenceId: preference.preferenceId,
      checkoutUrl: preference.checkoutUrl,
      total: order.monto_total,
      itemCount: draft.itemCount,
      status: "pending",
    };
  } catch (error) {
    await updateOrderStatus(order.id, "ERROR", { origin: "sistema" });
    throw error;
  }
}

export async function processMercadoPagoWebhook(input: {
  pendingOrderId?: number | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  externalReference?: string | null;
}) {
  let payment:
    | Awaited<ReturnType<typeof getMercadoPagoPayment>>
    | null = null;

  if (input.paymentId?.trim()) {
    payment = await getMercadoPagoPayment(input.paymentId.trim());
  }

  const order = await findOrderByLookup({
    pendingOrderId: input.pendingOrderId,
    paymentId: input.paymentId,
    preferenceId: input.preferenceId || payment?.preference_id || null,
    externalReference: input.externalReference || payment?.external_reference || null,
  });

  if (!order) {
    throw new OrderNotFoundError(
      input.pendingOrderId || input.paymentId || "desconocido",
    );
  }

  const paymentId =
    String(payment?.id || input.paymentId || order.id_pago || "").trim() || null;
  const paymentStatus = mapMercadoPagoStatusToOrderPaymentStatus(
    payment?.status || order.estado_pago,
  );
  const metadataPatch = buildMetadataPatch(order, {
    payment,
    preferenceId: input.preferenceId,
    externalReference: input.externalReference,
  });

  if (paymentStatus === "aprobado" && paymentId) {
    const updated = await registerMercadoPagoApproval({
      orderId: order.id,
      paymentId,
      metadataPatch,
    });

    return toPaymentStatusResult(updated);
  }

  if (order.estado_pago === "aprobado") {
    return toPaymentStatusResult(order);
  }

  const updated = await markOrderPaymentStatus(
    order.id,
    paymentStatus,
    paymentId,
    metadataPatch,
  );

  return toPaymentStatusResult(updated);
}

export async function resolveMercadoPagoPaymentStatus(input: {
  pendingOrderId?: number | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  externalReference?: string | null;
}) {
  await cancelExpiredPendingOrders();
  const order = await findOrderByLookup(input);

  if (!order) {
    return null;
  }

  if (input.paymentId?.trim() || order.id_pago) {
    return processMercadoPagoWebhook({
      pendingOrderId: order.id,
      paymentId: input.paymentId || order.id_pago,
      preferenceId: input.preferenceId || order.metadata.preferenceId || null,
      externalReference:
        input.externalReference || order.metadata.externalReference || null,
    });
  }

  return toPaymentStatusResult(order);
}
