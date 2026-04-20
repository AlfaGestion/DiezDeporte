import "server-only";
import {
  createMercadoPagoOrder,
  processMercadoPagoWebhook,
  resolveMercadoPagoPaymentStatus,
} from "@/lib/services/paymentService";
import { getOrders } from "@/lib/services/orderService";
import type {
  AdminOrderRecord,
  AdminOrdersSnapshot,
  AdminOrderStatusFilter,
  CreateOrderPayload,
  PaymentFlowStatus,
} from "@/lib/types";

function mapAdminStatusFilter(
  order: Awaited<ReturnType<typeof getOrders>>[number],
): PaymentFlowStatus {
  if (order.estado === "ERROR") return "error";
  if (order.estado === "CANCELADO") return "cancelled";
  if (order.estado_pago === "rechazado") return "rejected";
  if (order.estado === "PROCESANDO") return "processing";
  if (order.estado === "APROBADO") return "approved";
  if (
    ["FACTURADO", "PREPARANDO", "LISTO_PARA_RETIRO", "ENVIADO", "ENTREGADO"].includes(
      order.estado,
    )
  ) {
    return "finalized";
  }

  return "pending";
}

function mapAdminRecord(
  order: Awaited<ReturnType<typeof getOrders>>[number],
): AdminOrderRecord {
  const itemCount =
    order.metadata.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return {
    pendingOrderId: order.id,
    externalReference: order.metadata.externalReference || order.numero_pedido,
    status: mapAdminStatusFilter(order),
    orderNumber: order.numero_pedido,
    orderState: order.estado,
    paymentStatus: order.estado_pago,
    paymentStatusDetail: order.metadata.paymentStatusDetail || null,
    paymentId: order.id_pago,
    preferenceId: order.metadata.preferenceId || null,
    merchantOrderId: null,
    total: order.monto_total,
    itemCount,
    checkoutUrl: null,
    finalizationError:
      order.estado === "ERROR" ? "Pedido en estado ERROR." : null,
    customerName: order.nombre_cliente,
    customerEmail: order.email_cliente,
    createdAt: order.fecha_creacion,
    updatedAt: order.fecha_actualizacion,
    order:
      ["FACTURADO", "PREPARANDO", "LISTO_PARA_RETIRO", "ENVIADO", "ENTREGADO"].includes(
        order.estado,
      )
        ? {
            tc: "WEB",
            idComprobante: order.numero_pedido,
            internalId: order.id,
            total: order.monto_total,
            itemCount,
          }
        : null,
    customerPhone: order.telefono_cliente,
    customerAddress: order.metadata.customerAddress || order.direccion || "",
    customerCity: order.metadata.customerCity || "",
    customerProvince: order.metadata.customerProvince || "",
    customerPostalCode: order.metadata.customerPostalCode || "",
    deliveryMethod: order.metadata.deliveryMethod || order.tipo_pedido,
    notes: order.metadata.customerNotes || "",
    items: order.metadata.items || [],
    trackingNumber: order.numero_seguimiento,
    qrCode: order.codigo_qr,
    approvedAt: order.estado_pago === "aprobado" ? order.fecha_actualizacion : "",
    finalizedAt:
      ["FACTURADO", "PREPARANDO", "LISTO_PARA_RETIRO", "ENVIADO", "ENTREGADO"].includes(
        order.estado,
      )
        ? order.fecha_actualizacion
        : "",
    lastSyncAt: order.fecha_actualizacion,
    paymentMethodId: order.metadata.paymentMethodId || null,
    paymentTypeId: order.metadata.paymentTypeId || null,
  };
}

export async function createPendingMercadoPagoOrder(input: {
  payload: CreateOrderPayload;
  requestUrl?: string;
}) {
  return createMercadoPagoOrder(input);
}

export async function resolvePendingPaymentStatus(input: {
  pendingOrderId?: number | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  externalReference?: string | null;
}) {
  return resolveMercadoPagoPaymentStatus(input);
}

export async function handleMercadoPagoWebhook(input: {
  pendingOrderId?: number | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  externalReference?: string | null;
}) {
  return processMercadoPagoWebhook(input);
}

export async function listAdminPendingOrders(input?: {
  status?: AdminOrderStatusFilter;
  limit?: number;
}): Promise<AdminOrdersSnapshot> {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(input?.limit || 60)));
  const allOrders = await getOrders();
  const filteredStatus = input?.status || "orders";
  const mapped = allOrders.map(mapAdminRecord);
  const filtered =
    filteredStatus === "orders"
      ? mapped
      : mapped.filter((order) => order.status === filteredStatus);

  const summary: AdminOrdersSnapshot["summary"] = {
    total: mapped.length,
    pending: 0,
    processing: 0,
    approved: 0,
    finalized: 0,
    rejected: 0,
    cancelled: 0,
    error: 0,
  };

  for (const order of mapped) {
    summary[order.status] += 1;
  }

  return {
    orders: filtered.slice(0, safeLimit),
    summary,
  };
}
