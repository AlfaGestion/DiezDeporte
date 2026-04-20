import "server-only";
import { getProductsByIds } from "@/lib/catalog";
import {
  buildOrderDocumentNumber,
  buildPickupCode,
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
import { createCommercialDocument } from "@/lib/repositories/commercialDocumentRepository";
import { sendOrderStatusEmail } from "@/lib/services/emailService";
import { getServerSettings } from "@/lib/store-config";
import type { CreateOrderPayload } from "@/lib/types";
import { normalizeNumber } from "@/lib/commerce";
import type {
  CreateOrderInput,
  Order,
  OrderChangeOrigin,
  OrderDetail,
  OrderDocumentItem,
  OrderFilters,
  OrderState,
  StoredOrder,
  UpdateOrderInput,
} from "@/lib/types/order";

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

type OrderTransitionOptions = {
  origin?: OrderChangeOrigin;
};

function ensureOrderCreateInput(input: CreateOrderInput) {
  if (!input.nombre_cliente.trim()) {
    throw new OrderValidationError("El nombre del cliente es obligatorio.");
  }

  if (!input.email_cliente.trim()) {
    throw new OrderValidationError("El email del cliente es obligatorio.");
  }

  if (!input.telefono_cliente.trim()) {
    throw new OrderValidationError("El telefono del cliente es obligatorio.");
  }

  if (!Number.isFinite(input.monto_total) || input.monto_total <= 0) {
    throw new OrderValidationError("El monto total del pedido es invalido.");
  }
}

async function buildQrCode(order: Order, pickupCode: string | null) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QRCode = require("qrcode") as {
      toDataURL: (value: string, options?: Record<string, unknown>) => Promise<string>;
    };

    return await QRCode.toDataURL(buildQrPayload(order, pickupCode), {
      margin: 1,
      width: 320,
    });
  } catch (error) {
    console.warn("QR library unavailable", error);
    return null;
  }
}

async function ensurePickupAssets(order: StoredOrder) {
  if (order.tipo_pedido !== "retiro") {
    return order;
  }

  const documentNumber =
    order.metadata.documentNumber ||
    buildOrderDocumentNumber(order.id);
  const expectedPrefix = `WEB-${String(documentNumber).replace(/\D/g, "").slice(-4).padStart(4, "0")}-`;
  const currentPickupCode = (order.metadata.pickupCode || "").trim();
  const hasValidPickupCode =
    /^WEB-\d{4}-[A-Z0-9]{4}$/.test(currentPickupCode) &&
    currentPickupCode.startsWith(expectedPrefix);
  const pickupCode = hasValidPickupCode
    ? currentPickupCode
    : buildPickupCode(documentNumber);
  const needsNewPickupCode = !hasValidPickupCode;
  const qrCode =
    order.codigo_qr && !needsNewPickupCode
      ? order.codigo_qr
      : await buildQrCode(order, pickupCode);
  const nextMetadata =
    order.metadata.pickupCode === pickupCode
      ? order.metadata
      : { ...order.metadata, pickupCode };

  if (nextMetadata === order.metadata && qrCode === order.codigo_qr) {
    return order;
  }

  const updated = await orderRepository.update(order.id, {
    codigo_qr: qrCode,
    metadata: nextMetadata,
  });

  return updated || order;
}

async function runTransitionSideEffects(order: StoredOrder, nextState: OrderState) {
  let patchedOrder = order;

  if (nextState === "LISTO_PARA_RETIRO") {
    patchedOrder = await ensurePickupAssets(patchedOrder);
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

async function ensureCommercialDocument(order: StoredOrder) {
  if (order.metadata.documentInternalId && order.metadata.documentNumber && order.metadata.documentTc) {
    return order;
  }

  const itemInputs = order.metadata.items || [];

  if (itemInputs.length === 0) {
    throw new OrderValidationError("El pedido no tiene articulos para grabar el comprobante.");
  }

  const products = await getProductsByIds(itemInputs.map((item) => item.productId));
  const productMap = new Map(products.map((product) => [product.id.trim(), product]));
  const missingProduct = itemInputs.find((item) => !productMap.has(item.productId.trim()));

  if (missingProduct) {
    throw new OrderValidationError(
      `No se encontro el articulo ${missingProduct.productId} para grabar el comprobante.`,
    );
  }

  const settings = await getServerSettings();
  const document = await createCommercialDocument({
    order,
    settings,
    lines: itemInputs.map((item) => {
      const product = productMap.get(item.productId.trim());

      if (!product) {
        throw new OrderValidationError(
          `No se encontro el articulo ${item.productId} para grabar el comprobante.`,
        );
      }

      return {
        articleId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
      };
    }),
  });

  const updated = await orderRepository.update(order.id, {
    numero_pedido: document.idComprobante,
    metadata: {
      ...order.metadata,
      documentInternalId: document.id,
      documentTc: document.tc,
      documentNumber: document.idComprobante,
      documentCustomerAccount: document.customerAccount,
      documentError: null,
    },
  });

  return updated || order;
}

function resolveOrigin(input: OrderTransitionOptions | undefined) {
  return input?.origin || "sistema";
}

function resolvePickupCodeFromInput(rawValue: string) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as { pickupCode?: string | null };
      return parsed.pickupCode?.trim() || null;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function mergeMetadata(
  current: StoredOrder["metadata"],
  patch?: StoredOrder["metadata"],
) {
  return patch ? { ...current, ...patch } : current;
}

function hasSameMetadata(
  left: StoredOrder["metadata"],
  right: StoredOrder["metadata"],
) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function buildFallbackDocumentItem(
  order: StoredOrder,
  documentNumber: string,
  item: NonNullable<StoredOrder["metadata"]["items"]>[number],
  index: number,
): OrderDocumentItem {
  const quantity = Number(item.quantity || 0);
  const unitPrice = quantity > 0 ? order.monto_total / quantity : order.monto_total;

  return {
    id: null,
    tc: "",
    idComprobante: documentNumber,
    sequence: index + 1,
    articleId: item.productId,
    description: item.productId,
    quantity,
    unitPrice,
    total: unitPrice * quantity,
  };
}

async function resolveOrderDocument(order: StoredOrder) {
  const settings = await getServerSettings();
  const persistedDocumentNumber = (order.metadata.documentNumber || "").trim();
  const persistedDocumentTc = (order.metadata.documentTc || "").trim() || null;
  const fallbackDocumentNumber = buildOrderDocumentNumber(order.id, settings.orderBranch);
  const possibleDocumentNumbers = Array.from(
    new Set([
      persistedDocumentNumber,
      fallbackDocumentNumber,
      normalizeNumber(order.id),
    ].filter(Boolean)),
  );
  const possibleTcs = Array.from(
    new Set([
      persistedDocumentTc,
      settings.mercadoPagoOrderTc,
      settings.orderTc,
      "NP",
    ].map((value) => (value || "").trim()).filter(Boolean)),
  );

  for (const tc of possibleTcs) {
    for (const idComprobante of possibleDocumentNumbers) {
      const items = await orderRepository.getDocumentItemsByComprobante({
        tc,
        idComprobante,
      });

      if (items.length > 0) {
        return {
          documentTc: tc,
          documentNumber: idComprobante,
          documentItems: items,
        };
      }
    }
  }

  for (const idComprobante of possibleDocumentNumbers) {
    const items = await orderRepository.getDocumentItemsByNumber(idComprobante);

    if (items.length > 0) {
      return {
        documentTc: items[0]?.tc || null,
        documentNumber: idComprobante,
        documentItems: items,
      };
    }
  }

  const fallbackItems = (order.metadata.items || []).map((item, index) =>
    buildFallbackDocumentItem(order, fallbackDocumentNumber, item, index),
  );

  return {
    documentTc: persistedDocumentTc || possibleTcs[0] || null,
    documentNumber: persistedDocumentNumber || fallbackDocumentNumber,
    documentItems: fallbackItems,
  };
}

export async function buildCheckoutOrderDraft(
  payload: CreateOrderPayload,
): Promise<CheckoutOrderDraft> {
  if (!payload.items.length) {
    throw new OrderValidationError("El pedido no tiene articulos.");
  }

  const products = await getProductsByIds(payload.items.map((item) => item.productId));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const missingProduct = payload.items.find((item) => !productMap.has(item.productId.trim()));

  if (missingProduct) {
    throw new OrderValidationError(
      `No se encontro el articulo ${missingProduct.productId}.`,
    );
  }

  const paymentItems = payload.items.map((item) => {
    const product = productMap.get(item.productId.trim());

    if (!product) {
      throw new OrderValidationError(`No se encontro el articulo ${item.productId}.`);
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
        customerDocumentNumber: payload.customer.documentNumber || null,
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

export async function getOrderById(orderId: number) {
  const order = await orderRepository.getById(orderId);

  if (!order) {
    throw new OrderNotFoundError(orderId);
  }

  return order;
}

function isPendingOrderExpired(order: StoredOrder, ttlMinutes: number) {
  if (order.estado !== "PENDIENTE" || order.estado_pago !== "pendiente") {
    return false;
  }

  const createdAt = new Date(order.fecha_creacion);

  if (Number.isNaN(createdAt.getTime())) {
    return false;
  }

  return Date.now() - createdAt.getTime() >= ttlMinutes * 60_000;
}

export async function cancelExpiredPendingOrders() {
  const settings = await getServerSettings();
  const pendingOrders = await orderRepository.getFiltered({
    estado: "PENDIENTE",
    estado_pago: "pendiente",
    limit: 200,
  });
  const expiredOrders = pendingOrders.filter((order) =>
    isPendingOrderExpired(order, settings.pendingOrderTtlMinutes),
  );

  for (const order of expiredOrders) {
    await updateOrderStatus(order.id, "CANCELADO", { origin: "sistema" });
  }

  return expiredOrders.length;
}

export async function getOrderLogs(orderId: number) {
  await getOrderById(orderId);
  return orderRepository.getLogsByOrderId(orderId);
}

export async function getOrderDetailById(orderId: number) {
  const [order, logs] = await Promise.all([
    getOrderById(orderId),
    orderRepository.getLogsByOrderId(orderId),
  ]);
  const document = await resolveOrderDocument(order);

  return {
    order,
    logs,
    documentTc: document.documentTc,
    documentNumber: document.documentNumber,
    documentItems: document.documentItems,
  } satisfies OrderDetail;
}

export async function getOrders(filters: OrderFilters = {}) {
  await cancelExpiredPendingOrders();
  return orderRepository.getFiltered(filters);
}

export async function createOrder(
  input: CreateOrderInput,
  options?: OrderTransitionOptions,
) {
  ensureOrderCreateInput(input);
  const order = await orderRepository.create({
    ...input,
    estado: input.estado || "PENDIENTE",
    estado_pago: input.estado_pago || "pendiente",
  });
  const orderWithDocument = await ensureCommercialDocument(order).catch(async (error) => {
    const message = error instanceof Error ? error.message : "No se pudo generar el comprobante.";
    await orderRepository.update(order.id, {
      metadata: {
        ...order.metadata,
        documentError: message,
      },
    });
    throw error;
  });

  await orderRepository.logStatusChange(
    order.id,
    null,
    order.estado,
    resolveOrigin(options),
  );
  return orderWithDocument;
}

export async function createOrderFromCheckoutPayload(payload: CreateOrderPayload) {
  const draft = await buildCheckoutOrderDraft(payload);
  return createOrder(draft.input, { origin: "sistema" });
}

export async function updateOrderStatus(
  orderId: number,
  nextState: OrderState,
  options?: OrderTransitionOptions,
) {
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

  await orderRepository.logStatusChange(
    order.id,
    order.estado,
    nextState,
    resolveOrigin(options),
  );
  return runTransitionSideEffects(updated, nextState);
}

export async function updateOrderState(
  orderId: number,
  nextState: OrderState,
  options?: OrderTransitionOptions,
) {
  return updateOrderStatus(orderId, nextState, options);
}

export async function avanzarEstadoPedido(
  orderId: number,
  options?: OrderTransitionOptions,
) {
  const order = await getOrderById(orderId);
  const nextState = deriveNextOrderState(order);
  return updateOrderStatus(orderId, nextState, options);
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
  const nextMetadata = mergeMetadata(order.metadata, metadataPatch);
  const normalizedPaymentId = paymentId || null;

  if (
    order.estado_pago === paymentStatus &&
    (order.id_pago || null) === normalizedPaymentId &&
    hasSameMetadata(order.metadata, nextMetadata)
  ) {
    return order;
  }

  const updated = await orderRepository.update(order.id, {
    estado_pago: paymentStatus,
    id_pago: normalizedPaymentId,
    metadata: nextMetadata,
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
    order = await updateOrderStatus(order.id, "APROBADO", {
      origin: "webhook",
    });
  }

  return order;
}

export async function resendPickupReadyEmail(orderId: number) {
  const order = await getOrderById(orderId);

  if (order.tipo_pedido !== "retiro") {
    throw new OrderValidationError("Solo se puede reenviar este email para pedidos de retiro.");
  }

  const patchedOrder = await ensurePickupAssets(order);
  await sendOrderStatusEmail(patchedOrder, "LISTO_PARA_RETIRO");

  const updated = await orderRepository.update(order.id, {
    email_listo_enviado_at: new Date().toISOString(),
  });

  return updated || patchedOrder;
}

export async function findPickupOrderByCode(rawPickupValue: string) {
  const pickupCode = resolvePickupCodeFromInput(rawPickupValue);

  if (!pickupCode) {
    throw new OrderValidationError("Escanea el QR o ingresa el codigo de retiro.");
  }

  const order = await orderRepository.getByPickupCode(pickupCode);

  if (!order) {
    throw new OrderNotFoundError(pickupCode);
  }

  return {
    order,
    pickupCode,
  };
}

export async function registrarRetiroPedido(
  orderId: number,
  rawPickupValue: string,
  nombreApellido: string,
  options?: OrderTransitionOptions,
) {
  const order = await getOrderById(orderId);

  if (order.tipo_pedido !== "retiro") {
    throw new OrderValidationError("Solo se puede registrar retiro para pedidos de retiro.");
  }

  const pickupCode = resolvePickupCodeFromInput(rawPickupValue);

  if (!pickupCode) {
    throw new OrderValidationError("Escanea el QR o ingresa el codigo de retiro.");
  }

  if (!nombreApellido.trim()) {
    throw new OrderValidationError("Ingresa NombreApellido para registrar el retiro.");
  }

  if (!order.metadata.pickupCode || order.metadata.pickupCode.trim() !== pickupCode) {
    throw new OrderValidationError("El QR o codigo no corresponde a este pedido.");
  }

  if (order.retirado === "SI") {
    throw new OrderValidationError("Este pedido ya fue retirado y no puede volver a usarse.");
  }

  const redeemed = await orderRepository.markPickupAsRedeemed(order.id, nombreApellido);

  if (!redeemed) {
    throw new OrderValidationError("Este pedido ya fue retirado y no puede volver a usarse.");
  }

  if (redeemed.estadoAnterior !== redeemed.order.estado) {
    await orderRepository.logStatusChange(
      order.id,
      redeemed.estadoAnterior,
      redeemed.order.estado,
      resolveOrigin(options),
    );
  }

  await sendOrderStatusEmail(redeemed.order, "ENTREGADO");

  return redeemed.order;
}

export async function registrarRetiroPedidoPorCodigo(
  rawPickupValue: string,
  nombreApellido: string,
  options?: OrderTransitionOptions,
) {
  const { order, pickupCode } = await findPickupOrderByCode(rawPickupValue);
  return registrarRetiroPedido(order.id, pickupCode, nombreApellido, options);
}

function buildSampleMetadata(input: {
  city: string;
  province: string;
  address?: string | null;
  notes?: string | null;
  items: Array<{ productId: string; quantity: number }>;
  deliveryMethod: string;
}) {
  return {
    items: input.items,
    customerAddress: input.address || null,
    customerCity: input.city,
    customerProvince: input.province,
    customerPostalCode: "8400",
    customerNotes: input.notes || null,
    deliveryMethod: input.deliveryMethod,
    paymentMethod: "Mercado Pago",
  } satisfies StoredOrder["metadata"];
}

export async function seedSampleOrders() {
  const existing = await orderRepository.getAll();

  if (existing.length > 0) {
    return existing;
  }

  await createOrder({
    nombre_cliente: "Retiro Pendiente",
    email_cliente: "retiro.pendiente@example.com",
    telefono_cliente: "2944000001",
    monto_total: 120000,
    tipo_pedido: "retiro",
    direccion: null,
    estado_pago: "pendiente",
    metadata: buildSampleMetadata({
      city: "Bariloche",
      province: "Rio Negro",
      items: [
        { productId: "RET-001", quantity: 1 },
        { productId: "RET-002", quantity: 2 },
      ],
      deliveryMethod: "retiro",
      notes: "Espera confirmacion de pago.",
    }),
  });

  const retiroListo = await createOrder({
    nombre_cliente: "Retiro Listo",
    email_cliente: "retiro.listo@example.com",
    telefono_cliente: "2944000002",
    monto_total: 89000,
    tipo_pedido: "retiro",
    direccion: null,
    estado_pago: "aprobado",
    metadata: buildSampleMetadata({
      city: "Bariloche",
      province: "Rio Negro",
      items: [
        { productId: "RET-010", quantity: 1 },
      ],
      deliveryMethod: "retiro",
      notes: "Retira titular con DNI.",
    }),
  });

  await updateOrderStatus(retiroListo.id, "APROBADO");
  await updateOrderStatus(retiroListo.id, "FACTURADO");
  await updateOrderStatus(retiroListo.id, "PREPARANDO");
  await updateOrderStatus(retiroListo.id, "LISTO_PARA_RETIRO");

  const envioPreparando = await createOrder({
    nombre_cliente: "Envio Preparando",
    email_cliente: "envio.preparando@example.com",
    telefono_cliente: "2944000003",
    monto_total: 98500,
    tipo_pedido: "envio",
    direccion: "Av. Sarmiento 123",
    estado_pago: "aprobado",
    metadata: buildSampleMetadata({
      city: "Neuquen",
      province: "Neuquen",
      address: "Av. Sarmiento 123",
      items: [
        { productId: "ENV-100", quantity: 1 },
        { productId: "ENV-101", quantity: 1 },
      ],
      deliveryMethod: "envio",
      notes: "Despacho en preparacion.",
    }),
  });

  await updateOrderStatus(envioPreparando.id, "APROBADO");
  await updateOrderStatus(envioPreparando.id, "FACTURADO");
  await updateOrderStatus(envioPreparando.id, "PREPARANDO");

  const envioEnviado = await createOrder({
    nombre_cliente: "Envio Despachado",
    email_cliente: "envio.enviado@example.com",
    telefono_cliente: "2944000004",
    monto_total: 112300,
    tipo_pedido: "envio",
    direccion: "San Martin 456",
    estado_pago: "aprobado",
    metadata: buildSampleMetadata({
      city: "Cipolletti",
      province: "Rio Negro",
      address: "San Martin 456",
      items: [
        { productId: "ENV-200", quantity: 3 },
      ],
      deliveryMethod: "envio",
      notes: "Despacho por transporte.",
    }),
  });

  await updateOrderStatus(envioEnviado.id, "APROBADO");
  await updateOrderStatus(envioEnviado.id, "FACTURADO");
  await updateOrderStatus(envioEnviado.id, "PREPARANDO");
  await assignTrackingNumber(envioEnviado.id, "TRK-000123");
  await updateOrderStatus(envioEnviado.id, "ENVIADO");

  const finalizado = await createOrder({
    nombre_cliente: "Pedido Finalizado",
    email_cliente: "pedido.finalizado@example.com",
    telefono_cliente: "2944000005",
    monto_total: 45200,
    tipo_pedido: "retiro",
    direccion: null,
    estado_pago: "aprobado",
    metadata: buildSampleMetadata({
      city: "Bariloche",
      province: "Rio Negro",
      items: [
        { productId: "FIN-001", quantity: 1 },
      ],
      deliveryMethod: "retiro",
      notes: "Pedido ya entregado.",
    }),
  });

  await updateOrderStatus(finalizado.id, "APROBADO");
  await updateOrderStatus(finalizado.id, "FACTURADO");
  await updateOrderStatus(finalizado.id, "PREPARANDO");
  await updateOrderStatus(finalizado.id, "LISTO_PARA_RETIRO");
  await updateOrderStatus(finalizado.id, "ENTREGADO");

  const errorOrder = await createOrder({
    nombre_cliente: "Pedido con Error",
    email_cliente: "pedido.error@example.com",
    telefono_cliente: "2944000006",
    monto_total: 65000,
    tipo_pedido: "envio",
    direccion: "Mitre 999",
    estado_pago: "rechazado",
    metadata: buildSampleMetadata({
      city: "General Roca",
      province: "Rio Negro",
      address: "Mitre 999",
      items: [
        { productId: "ERR-001", quantity: 2 },
      ],
      deliveryMethod: "envio",
      notes: "Pago rechazado, revisar manualmente.",
    }),
  });

  await updateOrderStatus(errorOrder.id, "ERROR");

  return orderRepository.getAll();
}
