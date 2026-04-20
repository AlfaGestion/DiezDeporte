import "server-only";
import { getProductsByIds } from "@/lib/catalog";
import {
  buildQrPayload,
  canTransitionOrder,
  deriveNextOrderState,
  getEmailSentAtField,
  InvalidOrderTransitionError,
  normalizeOrderType,
  OrderNotFoundError,
  OrderValidationError,
  shouldSendEmailForState,
} from "@/lib/models/order";
import * as orderRepository from "@/lib/repositories/orderRepository";
import { sendOrderStatusEmail } from "@/lib/services/emailService";
import type {
  CreateOrderInput,
  Order,
  OrderState,
  StoredOrder,
  UpdateOrderInput,
} from "@/lib/types/order";
import type { CreateOrderPayload } from "@/lib/types";

export type CheckoutOrderDraft = {
  input: CreateOrderInput;
  paymentItems: Array<{
    title: string;
    quantity: number;
    unitPrice: number;
    currency: string;
  }>;
  itemCount: number;
};

function ensureOrderCreateInput(input: CreateOrderInput) {
  if (!input.nombre_cliente.trim()) {
    throw new OrderValidationError("El nombre del cliente es obligatorio.");
  }

  if (!input.email_cliente.trim()) {
    throw new OrderValidationError("El email del cliente es obligatorio.");
  }

  if (!input.telefono_cliente.trim()) {
    throw new OrderValidationError("El teléfono del cliente es obligatorio.");
  }

  if (!Number.isFinite(input.monto_total) || input.monto_total <= 0) {
    throw new OrderValidationError("El monto total del pedido es inválido.");
  }
}

function buildQrCode(order: Order) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QRCode = require("qrcode") as {
      toDataURL: (value: string, options?: Record<string, unknown>) => Promise<string>;
    };

    return QRCode.toDataURL(buildQrPayload(order), {
      margin: 1,
      width: 320,
    });
  } catch (error) {
    console.warn("QR library unavailable", error);
    return Promise.resolve(null);
  }
}

export async function buildCheckoutOrderDraft(
  payload: CreateOrderPayload,
): Promise<CheckoutOrderDraft> {
  if (!payload.items.length) {
    throw new OrderValidationError("El pedido no tiene artículos.");
  }

  const products = await getProductsByIds(payload.items.map((item) => item.productId));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const missingProduct = payload.items.find((item) => !productMap.has(item.productId.trim()));

  if (missingProduct) {
    throw new OrderValidationError(
      `No se encontró el artículo ${missingProduct.productId}.`,
    );
  }

  const paymentItems = payload.items.map((item) => {
    const product = productMap.get(item.productId.trim());

    if (!product) {
      throw new OrderValidationError(`No se encontró el artículo ${item.productId}.`);
    }

    return {
      title: product.description,
      quantity: item.quantity,
      unitPrice: product.price,
      currency: product.currency || "ARS",
    };
  });

  const montoTotal = paymentItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const itemCount = payload.items.reduce((sum, item) => sum + item.quantity, 0);
  const tipoPedido = normalizeOrderType(payload.customer.deliveryMethod);

  return {
    input: {
      nombre_cliente: payload.customer.fullName,
      email_cliente: payload.customer.email,
      telefono_cliente: payload.customer.phone,
      monto_total: montoTotal,
      tipo_pedido: tipoPedido,
      direccion: payload.customer.address || null,
      metadata: {
        items: payload.items,
        customerAddress: payload.customer.address || null,
        customerCity: payload.customer.city || null,
        customerProvince: payload.customer.province || null,
        customerPostalCode: payload.customer.postalCode || null,
        customerNotes: payload.customer.notes || null,
        deliveryMethod: payload.customer.deliveryMethod || null,
        paymentMethod: payload.customer.paymentMethod || null,
      },
    },
    paymentItems,
    itemCount,
  };
}

async function runTransitionSideEffects(order: StoredOrder, nextState: OrderState) {
  let patchedOrder = order;

  if (nextState === "LISTO_PARA_RETIRO" && !order.codigo_qr) {
    const qrCode = await buildQrCode(order);

    if (qrCode) {
      const updated = await orderRepository.update(order.id, {
        codigo_qr: qrCode,
      });

      if (updated) {
        patchedOrder = updated;
      }
    }
  }

  if (shouldSendEmailForState(patchedOrder, nextState)) {
    await sendOrderStatusEmail(patchedOrder, nextState);
    const sentAtField = getEmailSentAtField(nextState);

    if (sentAtField) {
      const updated = await orderRepository.update(order.id, {
        [sentAtField]: new Date().toISOString(),
      } as UpdateOrderInput);

      if (updated) {
        patchedOrder = updated;
      }
    }
  }

  return patchedOrder;
}

export async function getOrderById(orderId: number) {
  const order = await orderRepository.getById(orderId);

  if (!order) {
    throw new OrderNotFoundError(orderId);
  }

  return order;
}

export async function getOrders() {
  return orderRepository.getAll();
}

export async function createOrder(input: CreateOrderInput) {
  ensureOrderCreateInput(input);
  const order = await orderRepository.create({
    ...input,
    estado: input.estado || "PENDIENTE",
    estado_pago: input.estado_pago || "pendiente",
  });

  await orderRepository.logStatusChange(order.id, null, order.estado);
  return order;
}

export async function createOrderFromCheckoutPayload(payload: CreateOrderPayload) {
  const draft = await buildCheckoutOrderDraft(payload);
  return createOrder(draft.input);
}

export async function updateOrderState(orderId: number, nextState: OrderState) {
  const order = await getOrderById(orderId);

  if (order.estado === nextState) {
    return order;
  }

  if (!canTransitionOrder(order.estado, nextState)) {
    throw new InvalidOrderTransitionError(order.estado, nextState);
  }

  if (nextState === "FACTURADO" && order.estado_pago !== "aprobado") {
    throw new OrderValidationError("No se puede facturar un pedido con pago no aprobado.");
  }

  if (nextState === "LISTO_PARA_RETIRO" && order.tipo_pedido !== "retiro") {
    throw new InvalidOrderTransitionError(order.estado, nextState);
  }

  if (nextState === "ENVIADO" && order.tipo_pedido !== "envio") {
    throw new InvalidOrderTransitionError(order.estado, nextState);
  }

  const updated = await orderRepository.update(order.id, {
    estado: nextState,
  });

  if (!updated) {
    throw new OrderNotFoundError(orderId);
  }

  await orderRepository.logStatusChange(order.id, order.estado, nextState);
  return runTransitionSideEffects(updated, nextState);
}

export async function avanzarEstadoPedido(orderId: number) {
  const order = await getOrderById(orderId);
  const nextState = deriveNextOrderState(order);
  return updateOrderState(orderId, nextState);
}

export async function assignTrackingNumber(orderId: number, trackingNumber: string) {
  const order = await getOrderById(orderId);
  const updated = await orderRepository.update(order.id, {
    numero_seguimiento: trackingNumber.trim() || null,
  });

  if (!updated) {
    throw new OrderNotFoundError(orderId);
  }

  return updated;
}

export async function markOrderPaymentStatus(
  orderId: number,
  paymentStatus: StoredOrder["estado_pago"],
  paymentId: string | null,
  metadataPatch?: StoredOrder["metadata"],
) {
  const order = await getOrderById(orderId);
  const updated = await orderRepository.update(order.id, {
    estado_pago: paymentStatus,
    id_pago: paymentId,
    metadata: metadataPatch ? { ...order.metadata, ...metadataPatch } : order.metadata,
  });

  if (!updated) {
    throw new OrderNotFoundError(orderId);
  }

  return updated;
}

export async function registerMercadoPagoApproval(input: {
  orderId: number;
  paymentId: string;
  metadataPatch?: StoredOrder["metadata"];
}) {
  let order = await markOrderPaymentStatus(
    input.orderId,
    "aprobado",
    input.paymentId,
    input.metadataPatch,
  );

  if (order.estado === "PENDIENTE") {
    order = await updateOrderState(order.id, "APROBADO");
  }

  if (order.estado === "APROBADO") {
    order = await updateOrderState(order.id, "FACTURADO");
  }

  return order;
}

export async function seedSampleOrders() {
  const existing = await orderRepository.getAll();

  if (existing.length > 0) {
    return existing;
  }

  const retiro = await createOrder({
    nombre_cliente: "Cliente Retiro",
    email_cliente: "retiro@example.com",
    telefono_cliente: "2944000001",
    monto_total: 120000,
    tipo_pedido: "retiro",
    direccion: null,
    estado_pago: "aprobado",
  });

  await updateOrderState(retiro.id, "APROBADO");
  await updateOrderState(retiro.id, "FACTURADO");
  await updateOrderState(retiro.id, "PREPARANDO");
  await updateOrderState(retiro.id, "LISTO_PARA_RETIRO");

  const envio = await createOrder({
    nombre_cliente: "Cliente Envío",
    email_cliente: "envio@example.com",
    telefono_cliente: "2944000002",
    monto_total: 98500,
    tipo_pedido: "envio",
    direccion: "Av. Sarmiento 123",
    estado_pago: "aprobado",
  });

  await updateOrderState(envio.id, "APROBADO");
  await updateOrderState(envio.id, "FACTURADO");
  await updateOrderState(envio.id, "PREPARANDO");
  await assignTrackingNumber(envio.id, "TRK-000123");
  await updateOrderState(envio.id, "ENVIADO");

  await createOrder({
    nombre_cliente: "Cliente Pendiente",
    email_cliente: "pendiente@example.com",
    telefono_cliente: "2944000003",
    monto_total: 45200,
    tipo_pedido: "retiro",
    direccion: null,
    estado_pago: "pendiente",
  });

  return orderRepository.getAll();
}
