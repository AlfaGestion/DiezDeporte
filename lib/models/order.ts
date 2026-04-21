import {
  ORDER_LIST_VIEWS,
  ORDER_PAYMENT_STATES,
  ORDER_STATES,
  ORDER_TYPES,
} from "@/lib/types/order";
import { normalizeBranch, normalizeNumber } from "@/lib/commerce";
import type {
  Order,
  OrderFilters,
  OrderListView,
  OrderPaymentStatus,
  OrderState,
  OrderType,
  StoredOrder,
} from "@/lib/types/order";

export const ORDER_TRANSITIONS: Record<OrderState, OrderState[]> = {
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

export const ORDER_VIEW_STATES: Record<
  Exclude<OrderListView, "pedidos">,
  OrderState[]
> = {
  pendientes: ["PENDIENTE", "APROBADO"],
  procesados: ["FACTURADO", "PREPARANDO", "ENVIADO"],
  pendientes_retiro: ["LISTO_PARA_RETIRO"],
  finalizados: ["ENTREGADO"],
};

export const EMAIL_TRIGGER_STATES: OrderState[] = [
  "FACTURADO",
  "LISTO_PARA_RETIRO",
  "ENVIADO",
];

type NormalizeOrderFiltersInput = {
  estado?: string | null;
  estado_pago?: string | null;
  tipo_pedido?: string | null;
  vista?: string | null;
  q?: string | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  limit?: number | string | null;
};

export class OrderNotFoundError extends Error {
  constructor(orderId: number | string) {
    super(`No se encontro el pedido ${orderId}.`);
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

function normalizeString(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

function normalizeDateString(value: string | null | undefined) {
  const trimmed = normalizeString(value);
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : trimmed;
}

function normalizeLimit(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(1, Math.min(200, Math.trunc(value))) : null;
  }

  const parsed = Number(value || "");
  return Number.isFinite(parsed) ? Math.max(1, Math.min(200, Math.trunc(parsed))) : null;
}

export function isOrderState(value: string | null | undefined): value is OrderState {
  return ORDER_STATES.includes((value || "") as OrderState);
}

export function isOrderPaymentStatus(
  value: string | null | undefined,
): value is OrderPaymentStatus {
  return ORDER_PAYMENT_STATES.includes((value || "") as OrderPaymentStatus);
}

export function isOrderType(value: string | null | undefined): value is OrderType {
  return ORDER_TYPES.includes((value || "") as OrderType);
}

export function isOrderListView(value: string | null | undefined): value is OrderListView {
  return ORDER_LIST_VIEWS.includes((value || "") as OrderListView);
}

export function normalizeOrderFilters(
  input: NormalizeOrderFiltersInput,
): OrderFilters {
  return {
    estado: isOrderState(input.estado) ? input.estado : null,
    estado_pago: isOrderPaymentStatus(input.estado_pago) ? input.estado_pago : null,
    tipo_pedido: isOrderType(input.tipo_pedido) ? input.tipo_pedido : null,
    vista: isOrderListView(input.vista) ? input.vista : null,
    q: normalizeString(input.q),
    fecha_desde: normalizeDateString(input.fecha_desde),
    fecha_hasta: normalizeDateString(input.fecha_hasta),
    limit: normalizeLimit(input.limit),
  };
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

export function getStatesForOrderView(view: OrderListView | null | undefined) {
  if (!view || view === "pedidos") {
    return null;
  }

  return ORDER_VIEW_STATES[view];
}

export function getOrderViewBucket(state: OrderState) {
  switch (state) {
    case "PENDIENTE":
    case "APROBADO":
      return "pendientes" as const;
    case "FACTURADO":
    case "PREPARANDO":
    case "ENVIADO":
      return "procesados" as const;
    case "LISTO_PARA_RETIRO":
      return "pendientes_retiro" as const;
    case "ENTREGADO":
      return "finalizados" as const;
    case "CANCELADO":
      return "cancelados" as const;
    case "ERROR":
      return "error" as const;
    default:
      return "pedidos" as const;
  }
}

export function getNextActionLabel(order: Pick<Order, "estado" | "tipo_pedido">) {
  switch (order.estado) {
    case "PENDIENTE":
      return "Aprobar";
    case "APROBADO":
      return "Facturar";
    case "FACTURADO":
      return "Preparar";
    case "PREPARANDO":
      return order.tipo_pedido === "retiro" ? "Listo para retirar" : "Enviar";
    case "LISTO_PARA_RETIRO":
      return "Registrar retiro";
    case "ENVIADO":
      return "Finalizar";
    default:
      return null;
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

export function buildOrderDocumentNumber(orderId: number, branch?: string | null) {
  return `${normalizeBranch(branch || "0")}${normalizeNumber(orderId)}`;
}

function buildRandomPickupSuffix() {
  return Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(2, 6).toUpperCase();
}

export function buildPickupCode(documentNumber?: string | null) {
  const digits = String(documentNumber || "").replace(/\D/g, "");
  const comprobanteTail = digits ? digits.slice(-4).padStart(4, "0") : "0000";
  return `WEB-${comprobanteTail}-${buildRandomPickupSuffix()}`;
}

export function buildQrPayload(
  _order: Pick<Order, "id" | "numero_pedido" | "nombre_cliente" | "tipo_pedido">,
  pickupCode: string | null,
) {
  return (pickupCode || "").trim();
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

export function formatOrderAsLegacySummary(
  order: Order,
  itemCount = 0,
  options?: {
    tc?: string | null;
    branch?: string | null;
    documentNumber?: string | null;
  },
) {
  return {
    ...order,
    tc: (options?.tc || "WEB").trim() || "WEB",
    idComprobante:
      (options?.documentNumber || "").trim() ||
      buildOrderDocumentNumber(order.id, options?.branch),
    internalId: order.id,
    total: order.monto_total,
    itemCount,
  };
}
