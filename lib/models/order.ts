import type {
  Order,
  OrderPaymentStatus,
  OrderState,
  OrderType,
  StoredOrder,
} from "@/lib/types/order";

export const ORDER_TRANSITIONS: Record<
  OrderState,
  OrderState[]
> = {
  PENDIENTE: ["APROBADO", "CANCELADO", "ERROR"],
  APROBADO: ["FACTURADO", "CANCELADO", "ERROR"],
  FACTURADO: ["PREPARANDO", "CANCELADO", "ERROR"],
  PREPARANDO: ["LISTO_PARA_RETIRO", "ENVIADO", "CANCELADO", "ERROR"],
  LISTO_PARA_RETIRO: ["ENTREGADO", "CANCELADO", "ERROR"],
  ENVIADO: ["ENTREGADO", "CANCELADO", "ERROR"],
  ENTREGADO: [],
  CANCELADO: [],
  ERROR: [],
};

export const EMAIL_TRIGGER_STATES: OrderState[] = [
  "FACTURADO",
  "LISTO_PARA_RETIRO",
  "ENVIADO",
];

export class OrderNotFoundError extends Error {
  constructor(orderId: number | string) {
    super(`No se encontró el pedido ${orderId}.`);
    this.name = "OrderNotFoundError";
  }
}

export class InvalidOrderTransitionError extends Error {
  constructor(from: OrderState, to: OrderState) {
    super(`No se puede pasar de ${from} a ${to}.`);
    this.name = "InvalidOrderTransitionError";
  }
}

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

export function isFinalOrderState(state: OrderState) {
  return state === "ENTREGADO" || state === "CANCELADO" || state === "ERROR";
}

export function canTransitionOrder(from: OrderState, to: OrderState) {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function deriveNextOrderState(order: Pick<Order, "estado" | "tipo_pedido">) {
  switch (order.estado) {
    case "PENDIENTE":
      return "APROBADO";
    case "APROBADO":
      return "FACTURADO";
    case "FACTURADO":
      return "PREPARANDO";
    case "PREPARANDO":
      return order.tipo_pedido === "retiro" ? "LISTO_PARA_RETIRO" : "ENVIADO";
    case "LISTO_PARA_RETIRO":
    case "ENVIADO":
      return "ENTREGADO";
    default:
      throw new InvalidOrderTransitionError(order.estado, order.estado);
  }
}

export function mapMercadoPagoStatusToOrderPaymentStatus(
  paymentStatus: string | null | undefined,
): OrderPaymentStatus {
  switch ((paymentStatus || "").trim().toLowerCase()) {
    case "approved":
      return "aprobado";
    case "rejected":
    case "cancelled":
    case "charged_back":
    case "refunded":
      return "rechazado";
    default:
      return "pendiente";
  }
}

export function buildOrderNumber() {
  const now = new Date();
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WEB-${yyyymmdd}-${suffix}`;
}

export function buildQrPayload(order: Order) {
  return JSON.stringify({
    orderId: order.id,
    numeroPedido: order.numero_pedido,
    cliente: order.nombre_cliente,
    tipoPedido: order.tipo_pedido,
  });
}

export function shouldSendEmailForState(order: StoredOrder, state: OrderState) {
  if (state === "FACTURADO") {
    return !order.email_facturado_enviado_at;
  }

  if (state === "LISTO_PARA_RETIRO") {
    return !order.email_listo_enviado_at;
  }

  if (state === "ENVIADO") {
    return !order.email_enviado_enviado_at;
  }

  return false;
}

export function getEmailSentAtField(state: OrderState) {
  switch (state) {
    case "FACTURADO":
      return "email_facturado_enviado_at";
    case "LISTO_PARA_RETIRO":
      return "email_listo_enviado_at";
    case "ENVIADO":
      return "email_enviado_enviado_at";
    default:
      return null;
  }
}

export function normalizeOrderType(value: string | null | undefined): OrderType {
  return (value || "").trim().toLowerCase() === "envio" ? "envio" : "retiro";
}

export function formatOrderAsLegacySummary(order: Order, itemCount = 0) {
  return {
    ...order,
    tc: "WEB",
    idComprobante: order.numero_pedido,
    internalId: order.id,
    total: order.monto_total,
    itemCount,
  };
}

