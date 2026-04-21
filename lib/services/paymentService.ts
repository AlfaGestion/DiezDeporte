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
  OrderValidationError,
} from "@/lib/models/order";
import {
  getByExternalReference,
  getById as getOrderRepositoryById,
  getByPaymentId,
  getByPreferenceId,
  update as updateOrderRepository,
} from "@/lib/repositories/orderRepository";
import { syncCommercialDocumentHeader } from "@/lib/repositories/commercialDocumentRepository";
import {
  buildCheckoutOrderDraft,
  cancelExpiredPendingOrders,
  createOrder,
  ensurePickupAssets,
  markOrderPaymentStatus,
  registerMercadoPagoApproval,
  sendOrderReceivedEmailIfNeeded,
} from "@/lib/services/orderService";
import { sendPaymentInitFailureEmail } from "@/lib/services/emailService";
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
    checkoutUrl: hydratedOrder.metadata.lastCheckoutUrl || null,
    finalizationError:
      hydratedOrder.estado === "ERROR"
        ? "El pedido requiere revision manual."
        : hydratedOrder.metadata.paymentInitStatus === "failed"
          ? hydratedOrder.metadata.paymentInitErrorMessage || "No se pudo iniciar el pago."
          : null,
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

function getNextPaymentAttemptCount(order: StoredOrder) {
  const current = Number(order.metadata.paymentRetryCount || 0);
  return Number.isFinite(current) && current > 0 ? current + 1 : 1;
}

function buildPaymentInitMetadataPatch(
  order: StoredOrder,
  input: {
    status: "ok" | "failed";
    externalReference: string;
    preferenceId?: string | null;
    checkoutUrl?: string | null;
    errorMessage?: string | null;
  },
) {
  return {
    ...order.metadata,
    externalReference: input.externalReference,
    preferenceId: input.preferenceId || order.metadata.preferenceId || null,
    lastCheckoutUrl: input.checkoutUrl || null,
    paymentMethod: "Mercado Pago",
    paymentInitStatus: input.status,
    paymentInitErrorMessage: input.errorMessage || null,
    paymentRetryCount: getNextPaymentAttemptCount(order),
    lastPaymentInitAttemptAt: new Date().toISOString(),
    fallbackPickupLocalPaymentEligible: input.status === "failed",
  } satisfies StoredOrder["metadata"];
}

function buildPaymentItemsFromOrder(order: StoredOrder) {
  const items = order.metadata.items || [];

  if (items.length === 0) {
    throw new OrderValidationError(
      "El pedido no tiene articulos registrados para volver a iniciar el pago.",
    );
  }

  return items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 0));
    const subtotal = Number(item.subtotal || 0);
    const unitPrice =
      Number(item.unitPrice || 0) || (subtotal > 0 ? subtotal / quantity : 0);

    return {
      id: item.productId,
      title: item.productName || item.productId,
      description: item.productName || item.productId,
      quantity,
      unitPrice,
      currency: item.currency || "ARS",
    };
  });
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
      ...buildPaymentInitMetadataPatch(order, {
        status: "ok",
        externalReference,
        preferenceId: preference.preferenceId,
        checkoutUrl: preference.checkoutUrl,
      }),
    });
    await sendOrderReceivedEmailIfNeeded(order.id);

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
    const errorMessage =
      error instanceof Error ? error.message : "No se pudo iniciar Mercado Pago.";
    const updatedOrder = await markOrderPaymentStatus(order.id, "pendiente", null, {
      ...buildPaymentInitMetadataPatch(order, {
        status: "failed",
        externalReference,
        errorMessage,
      }),
    });
    const settings = await getServerSettings();

    if (settings.enviarEmailSiFallaInicioPago) {
      await sendPaymentInitFailureEmail(updatedOrder).catch((emailError) => {
        console.error("No se pudo enviar el email por fallo de inicio de pago", emailError);
      });
    }

    throw error;
  }
}

export async function retryMercadoPagoOrder(input: {
  orderId: number;
  requestUrl?: string;
}): Promise<PaymentPreferenceResponse> {
  const order = await getOrderRepositoryById(input.orderId);

  if (!order) {
    throw new OrderNotFoundError(input.orderId);
  }

  if (["CANCELADO", "ENTREGADO"].includes(order.estado)) {
    throw new OrderValidationError("Ese pedido ya no admite reintentos de pago.");
  }

  const settings = await getServerSettings();
  const currentAttempts = Number(order.metadata.paymentRetryCount || 0);

  if (currentAttempts >= settings.maxReintentosInicioPago) {
    throw new OrderValidationError(
      "Se alcanzo el maximo configurado de reintentos para iniciar el pago.",
    );
  }

  try {
    const preference = await createMercadoPagoPreference({
      requestUrl: input.requestUrl,
      pendingOrderId: order.id,
      externalReference: order.metadata.externalReference || order.numero_pedido,
      customer: {
        fullName: order.nombre_cliente,
        email: order.email_cliente,
      },
      items: buildPaymentItemsFromOrder(order),
    });

    const updatedOrder = await markOrderPaymentStatus(order.id, "pendiente", null, {
      ...buildPaymentInitMetadataPatch(order, {
        status: "ok",
        externalReference: order.metadata.externalReference || order.numero_pedido,
        preferenceId: preference.preferenceId,
        checkoutUrl: preference.checkoutUrl,
      }),
    });

    return {
      pendingOrderId: updatedOrder.id,
      externalReference: updatedOrder.metadata.externalReference || updatedOrder.numero_pedido,
      preferenceId: preference.preferenceId,
      checkoutUrl: preference.checkoutUrl,
      total: updatedOrder.monto_total,
      itemCount:
        updatedOrder.metadata.items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
      status: "pending",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "No se pudo iniciar Mercado Pago.";
    const updatedOrder = await markOrderPaymentStatus(order.id, "pendiente", null, {
      ...buildPaymentInitMetadataPatch(order, {
        status: "failed",
        externalReference: order.metadata.externalReference || order.numero_pedido,
        errorMessage,
      }),
    });

    if (settings.enviarEmailSiFallaInicioPago) {
      await sendPaymentInitFailureEmail(updatedOrder).catch((emailError) => {
        console.error("No se pudo enviar el email por fallo de reintento de pago", emailError);
      });
    }

    throw error;
  }
}

export async function enablePickupLocalPaymentFallback(orderId: number) {
  const order = await getOrderRepositoryById(orderId);

  if (!order) {
    throw new OrderNotFoundError(orderId);
  }

  const settings = await getServerSettings();

  if (!settings.permitirRetiroYPagoLocalSiFallaMP) {
    throw new OrderValidationError(
      "La alternativa de retiro y pago local no esta habilitada en la configuracion.",
    );
  }

  const reservedUntil = new Date();
  reservedUntil.setHours(
    reservedUntil.getHours() + Math.max(1, settings.horasReservaStockPagoPendiente),
  );

  const updated = await updateOrderRepository(order.id, {
    tipo_pedido: "retiro",
    direccion: null,
    estado_pago: "pendiente",
    id_pago: order.id_pago,
    metadata: {
      ...order.metadata,
      deliveryMethod: "Retiro en local",
      paymentMethod: "Pago en local",
      fallbackPickupLocalPaymentEligible: true,
      fallbackPickupLocalPaymentActivatedAt: new Date().toISOString(),
      fallbackPickupLocalPaymentReservedUntil: reservedUntil.toISOString(),
    },
  });

  if (updated) {
    await syncCommercialDocumentHeader(updated).catch(() => false);
  }

  return updated || order;
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
