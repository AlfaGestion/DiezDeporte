import { getNextActionLabel, getOrderViewBucket } from "@/lib/models/order";
import type {
  AdminOrderBucket,
  AdminOrderRecord,
  AdminOrdersSnapshot,
} from "@/lib/types";
import type {
  OrderListView,
  OrderPaymentStatus,
  OrderState,
  OrderType,
  StoredOrder,
} from "@/lib/types/order";

export const ADMIN_ORDER_VIEWS: OrderListView[] = [
  "pedidos",
  "pendientes",
  "procesados",
  "pendientes_retiro",
  "finalizados",
];

export function normalizeAdminOrderView(value: string | null | undefined) {
  return ADMIN_ORDER_VIEWS.includes((value || "") as OrderListView)
    ? ((value || "") as OrderListView)
    : "pedidos";
}

export function getAdminOrderViewLabel(view: AdminOrderBucket) {
  switch (view) {
    case "pedidos":
      return "Pedidos";
    case "pendientes":
      return "Pendientes";
    case "procesados":
      return "Procesados";
    case "pendientes_retiro":
      return "Pendientes de retirar";
    case "finalizados":
      return "Finalizados";
    case "cancelados":
      return "Cancelados";
    case "error":
      return "Error";
    default:
      return view;
  }
}

export function getOrderStateLabel(state: OrderState) {
  switch (state) {
    case "PENDIENTE":
      return "Pendiente";
    case "APROBADO":
      return "Aprobado";
    case "FACTURADO":
      return "Facturado";
    case "PREPARANDO":
      return "Preparando";
    case "LISTO_PARA_RETIRO":
      return "Listo para retirar";
    case "ENVIADO":
      return "Enviado";
    case "ENTREGADO":
      return "Entregado";
    case "CANCELADO":
      return "Cancelado";
    case "ERROR":
      return "Error";
    default:
      return state;
  }
}

export function getOrderStateShortCode(state: OrderState) {
  switch (state) {
    case "PENDIENTE":
      return "PTE";
    case "APROBADO":
      return "APR";
    case "FACTURADO":
      return "FAC";
    case "PREPARANDO":
      return "PRE";
    case "LISTO_PARA_RETIRO":
      return "RTR";
    case "ENVIADO":
      return "ENV";
    case "ENTREGADO":
      return "FIN";
    case "CANCELADO":
      return "CAN";
    case "ERROR":
      return "ERR";
    default:
      return state;
  }
}

export function getOrderStateThemeKey(state: OrderState) {
  switch (state) {
    case "PENDIENTE":
      return "pendiente";
    case "APROBADO":
      return "aprobado";
    case "FACTURADO":
      return "facturado";
    case "PREPARANDO":
      return "preparando";
    case "LISTO_PARA_RETIRO":
      return "listo-retiro";
    case "ENVIADO":
      return "enviado";
    case "ENTREGADO":
      return "entregado";
    case "CANCELADO":
      return "cancelado";
    case "ERROR":
      return "error";
    default:
      return "pendiente";
  }
}

export function getOrderStateTone(state: OrderState) {
  switch (state) {
    case "ENTREGADO":
    case "LISTO_PARA_RETIRO":
    case "ENVIADO":
      return "success";
    case "FACTURADO":
    case "PREPARANDO":
    case "APROBADO":
      return "accent";
    case "CANCELADO":
    case "ERROR":
      return "danger";
    default:
      return "warning";
  }
}

export function getOrderTypeLabel(orderType: OrderType) {
  return orderType === "retiro" ? "Retiro" : "Envio";
}

export function getPickupStatusLabel(redeemed: boolean) {
  return redeemed ? "Retirado" : "Pendiente de retiro";
}

export function getPaymentStatusLabel(paymentStatus: OrderPaymentStatus) {
  switch (paymentStatus) {
    case "aprobado":
      return "Aprobado";
    case "rechazado":
      return "Rechazado";
    default:
      return "Pendiente";
  }
}

export function getPaymentStatusTone(paymentStatus: OrderPaymentStatus) {
  switch (paymentStatus) {
    case "aprobado":
      return "approved";
    case "rechazado":
      return "rejected";
    default:
      return "pending";
  }
}

export function getLogOriginLabel(origin: "admin" | "webhook" | "sistema") {
  switch (origin) {
    case "admin":
      return "Admin";
    case "webhook":
      return "Webhook";
    default:
      return "Sistema";
  }
}

export function toAdminOrderRecord(order: StoredOrder): AdminOrderRecord {
  const itemCount =
    order.resolved_item_count ??
    (order.metadata.items?.reduce((sum, item) => sum + item.quantity, 0) || 0);

  return {
    id: order.id,
    orderNumber: order.numero_pedido,
    externalReference: order.metadata.externalReference || order.numero_pedido,
    orderState: order.estado,
    orderType: order.tipo_pedido,
    paymentStatus: order.estado_pago,
    paymentStatusDetail: order.metadata.paymentStatusDetail || null,
    paymentId: order.id_pago,
    preferenceId: order.metadata.preferenceId || null,
    total: order.monto_total,
    itemCount,
    customerName: order.nombre_cliente,
    customerEmail: order.email_cliente,
    customerPhone: order.telefono_cliente,
    customerAddress: order.metadata.customerAddress || order.direccion || "",
    customerCity: order.metadata.customerCity || "",
    customerProvince: order.metadata.customerProvince || "",
    customerPostalCode: order.metadata.customerPostalCode || "",
    notes: order.metadata.customerNotes || "",
    items: order.metadata.items || [],
    trackingNumber: order.numero_seguimiento,
    qrCode: order.codigo_qr,
    pickupCode: order.metadata.pickupCode || null,
    pickupRedeemed: order.retirado === "SI",
    pickupRedeemedAt: order.fecha_hora_retiro,
    pickupRedeemedBy: order.nombre_apellido_retiro,
    createdAt: order.fecha_creacion,
    updatedAt: order.fecha_actualizacion,
    nextActionLabel: getNextActionLabel(order),
    bucket: getOrderViewBucket(order.estado),
    requiresAttention:
      order.estado === "PENDIENTE" ||
      order.estado === "APROBADO" ||
      order.estado === "ERROR" ||
      order.estado_pago === "rechazado",
    paymentMethodId: order.metadata.paymentMethodId || null,
    paymentTypeId: order.metadata.paymentTypeId || null,
  };
}

export function buildAdminOrdersSnapshot(input: {
  orders: StoredOrder[];
  allOrders?: StoredOrder[];
}): AdminOrdersSnapshot {
  const summarySource = input.allOrders || input.orders;
  const summary: AdminOrdersSnapshot["summary"] = {
    total: summarySource.length,
    pedidos: summarySource.length,
    pendientes: 0,
    procesados: 0,
    pendientes_retiro: 0,
    finalizados: 0,
    cancelados: 0,
    error: 0,
  };

  for (const order of summarySource) {
    const bucket = getOrderViewBucket(order.estado);
    summary[bucket] += 1;
  }

  return {
    orders: input.orders.map(toAdminOrderRecord),
    summary,
  };
}
