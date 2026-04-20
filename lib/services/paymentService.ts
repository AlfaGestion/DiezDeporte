import "server-only";
import { getMercadoPagoPayment } from "@/lib/mercado-pago";
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
  createOrder,
  markOrderPaymentStatus,
  registerMercadoPagoApproval,
  updateOrderState,
} from "@/lib/services/orderService";
import type { CreateOrderPayload, PaymentPreferenceResponse, PaymentStatusResult } from "@/lib/types";
import type { StoredOrder } from "@/lib/types/order";
import { createMercadoPagoPreference } from "@/lib/mercado-pago";

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
  if (order.estado === "ERROR") return "error";
  if (order.estado === "CANCELADO") return "cancelled";
  if (order.estado_pago === "rechazado") return "rejected";
  if (order.estado === "APROBADO") return "approved";
  if (["FACTURADO", "PREPARANDO", "LISTO_PARA_RETIRO", "ENVIADO", "ENTREGADO"].includes(order.estado)) {
    return "finalized";
  }

  return "pending";
}

function toPaymentStatusResult(order: StoredOrder): PaymentStatusResult {
  const itemCount = order.metadata.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const hasOperationalOrder = ["FACTURADO", "PREPARANDO", "LISTO_PARA_RETIRO", "ENVIADO", "ENTREGADO"].includes(order.estado);

  return {
    pendingOrderId: order.id,
    externalReference: order.metadata.externalReference || order.numero_pedido,
    status: toPaymentFlowStatus(order),
    paymentStatus: order.estado_pago,
    paymentStatusDetail: order.metadata.paymentStatusDetail || null,
    paymentId: order.id_pago,
    preferenceId: order.metadata.preferenceId || null,
    merchantOrderId: null,
    total: order.monto_total,
    itemCount,
    checkoutUrl: null,
    finalizationError: order.estado === "ERROR" ? "El pedido quedó en estado ERROR." : null,
    customerName: order.nombre_cliente,
    customerEmail: order.email_cliente,
    createdAt: order.fecha_creacion,
    updatedAt: order.fecha_actualizacion,
    order: hasOperationalOrder ? formatOrderAsLegacySummary(order, itemCount) : null,
  };
}

export async function createMercadoPagoOrder(input: {
  payload: CreateOrderPayload;
  requestUrl?: string;
}): Promise<PaymentPreferenceResponse> {
  const draft = await buildCheckoutOrderDraft(input.payload);
  const order = await createOrder(draft.input);
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
    await updateOrderState(order.id, "ERROR");
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
    throw new OrderNotFoundError(input.pendingOrderId || input.paymentId || "desconocido");
  }

  const paymentId = String(payment?.id || input.paymentId || order.id_pago || "").trim() || null;
  const paymentStatus = mapMercadoPagoStatusToOrderPaymentStatus(payment?.status || order.estado_pago);
  const metadataPatch = {
    ...order.metadata,
    preferenceId: payment?.preference_id?.trim() || input.preferenceId || order.metadata.preferenceId || null,
    externalReference: payment?.external_reference?.trim() || input.externalReference || order.metadata.externalReference || order.numero_pedido,
    paymentStatusDetail: payment?.status_detail?.trim() || null,
    paymentTypeId: payment?.payment_type_id?.trim() || null,
    paymentMethodId: payment?.payment_method_id?.trim() || null,
    lastPaymentPayload: payment ? JSON.stringify(payment) : order.metadata.lastPaymentPayload || null,
  };

  if (paymentStatus === "aprobado" && paymentId) {
    const updated = await registerMercadoPagoApproval({
      orderId: order.id,
      paymentId,
      metadataPatch,
    });

    return toPaymentStatusResult(updated);
  }

  const updated = await markOrderPaymentStatus(order.id, paymentStatus, paymentId, metadataPatch);
  return toPaymentStatusResult(updated);
}

export async function resolveMercadoPagoPaymentStatus(input: {
  pendingOrderId?: number | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  externalReference?: string | null;
}) {
  const order = await findOrderByLookup(input);

  if (!order) {
    return null;
  }

  if (input.paymentId?.trim() || order.id_pago) {
    return processMercadoPagoWebhook({
      pendingOrderId: order.id,
      paymentId: input.paymentId || order.id_pago,
      preferenceId: input.preferenceId || order.metadata.preferenceId || null,
      externalReference: input.externalReference || order.metadata.externalReference || null,
    });
  }

  return toPaymentStatusResult(order);
}
