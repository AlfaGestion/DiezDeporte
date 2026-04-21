import "server-only";
import { getProductsByIds } from "@/lib/catalog";
import {
  normalizeOrderType,
  OrderValidationError,
} from "@/lib/models/order";
import { getServerSettings } from "@/lib/store-config";
import type { CheckoutCustomer, CreateOrderPayload } from "@/lib/types";
import type { CreateOrderInput, OrderItem } from "@/lib/types/order";

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

type NormalizedCheckoutItem = {
  productId: string;
  quantity: number;
  unitPrice: number | null;
};

function trimValue(value: string | null | undefined) {
  return (value || "").trim();
}

function normalizeOptionalValue(value: string | null | undefined) {
  const normalized = trimValue(value);
  return normalized || null;
}

function normalizeMoney(value: number | null | undefined) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Number(numeric.toFixed(2));
}

function sameMoney(left: number | null, right: number | null) {
  if (left === null || right === null) {
    return false;
  }

  return Math.abs(left - right) < 0.01;
}

function normalizeCheckoutCustomer(customer: CheckoutCustomer): CheckoutCustomer {
  return {
    fullName: trimValue(customer.fullName),
    email: trimValue(customer.email),
    phone: trimValue(customer.phone),
    address: trimValue(customer.address),
    city: trimValue(customer.city),
    province: trimValue(customer.province),
    postalCode: trimValue(customer.postalCode),
    documentNumber: trimValue(customer.documentNumber),
    notes: trimValue(customer.notes),
    deliveryMethod: trimValue(customer.deliveryMethod) || "Retiro en local",
    paymentMethod: trimValue(customer.paymentMethod) || "Mercado Pago",
  };
}

function normalizeCheckoutItems(
  items: CreateOrderPayload["items"],
): NormalizedCheckoutItem[] {
  const aggregated = new Map<string, NormalizedCheckoutItem>();

  for (const item of items) {
    const productId = trimValue(item.productId);
    const quantity = Math.max(0, Math.trunc(Number(item.quantity) || 0));

    if (!productId || quantity <= 0) {
      continue;
    }

    const current =
      aggregated.get(productId) || {
        productId,
        quantity: 0,
        unitPrice: null,
      };

    const submittedUnitPrice = normalizeMoney(item.unitPrice);
    current.quantity += quantity;
    current.unitPrice = current.unitPrice ?? submittedUnitPrice;
    aggregated.set(productId, current);
  }

  return Array.from(aggregated.values());
}

function validateCheckoutCustomer(input: {
  customer: CheckoutCustomer;
  tipoPedido: CreateOrderInput["tipo_pedido"];
  permitirCheckoutSinDireccionEnRetiro: boolean;
}) {
  const { customer, tipoPedido, permitirCheckoutSinDireccionEnRetiro } = input;

  if (!customer.fullName) {
    throw new OrderValidationError("Ingresa tu nombre y apellido para continuar.");
  }

  if (!customer.email) {
    throw new OrderValidationError("Ingresa tu email para continuar.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    throw new OrderValidationError("Ingresa un email valido para continuar.");
  }

  if (!customer.phone) {
    throw new OrderValidationError("Ingresa tu telefono para continuar.");
  }

  const requiresShippingAddress =
    tipoPedido === "envio" ||
    (tipoPedido === "retiro" && !permitirCheckoutSinDireccionEnRetiro);

  if (requiresShippingAddress && !customer.address) {
    throw new OrderValidationError(
      "Completa la direccion para continuar con el pedido.",
    );
  }

  if (requiresShippingAddress && !customer.city) {
    throw new OrderValidationError(
      "Completa la localidad para continuar con el pedido.",
    );
  }
}

export async function buildCheckoutOrderDraft(
  payload: CreateOrderPayload,
): Promise<CheckoutOrderDraft> {
  const settings = await getServerSettings();
  const customer = normalizeCheckoutCustomer(payload.customer);
  const requestedItems = normalizeCheckoutItems(payload.items);

  if (requestedItems.length === 0) {
    throw new OrderValidationError(
      "Agrega al menos un articulo valido antes de confirmar el pedido.",
    );
  }

  const tipoPedido = normalizeOrderType(customer.deliveryMethod);

  validateCheckoutCustomer({
    customer,
    tipoPedido,
    permitirCheckoutSinDireccionEnRetiro:
      settings.permitirCheckoutSinDireccionEnRetiro,
  });

  const products = await getProductsByIds(
    requestedItems.map((item) => item.productId),
  );
  const productMap = new Map(products.map((product) => [product.id.trim(), product]));

  const snapshotItems: OrderItem[] = requestedItems.map((item) => {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new OrderValidationError(
        `El articulo ${item.productId} ya no esta disponible para este canal.`,
      );
    }

    if (!Number.isFinite(product.price) || product.price <= 0) {
      throw new OrderValidationError(
        `El articulo "${product.description}" no tiene un precio valido para checkout.`,
      );
    }

    if (
      settings.validarStockAlConfirmarPedido &&
      Math.max(0, Math.trunc(product.stock)) < item.quantity
    ) {
      throw new OrderValidationError(
        `No hay stock suficiente para "${product.description}". Disponible: ${Math.max(
          0,
          Math.trunc(product.stock),
        )}.`,
      );
    }

    if (
      settings.validarClasePrecioAlConfirmarPedido &&
      item.unitPrice !== null &&
      !sameMoney(item.unitPrice, normalizeMoney(product.price))
    ) {
      throw new OrderValidationError(
        `El precio de "${product.description}" cambio. Revisa el carrito y vuelve a intentar.`,
      );
    }

    const unitPrice = normalizeMoney(product.price) || 0;

    return {
      productId: product.id,
      productName: product.description,
      quantity: item.quantity,
      unitPrice,
      subtotal: normalizeMoney(unitPrice * item.quantity) || 0,
      currency: product.currency || "ARS",
    } satisfies OrderItem;
  });

  const paymentItems = snapshotItems.map((item) => ({
    title: item.productName || item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice || 0,
    currency: item.currency || "ARS",
  }));
  const montoTotal = snapshotItems.reduce(
    (sum, item) => sum + Number(item.subtotal || 0),
    0,
  );
  const itemCount = snapshotItems.reduce((sum, item) => sum + item.quantity, 0);

  return {
    input: {
      nombre_cliente: customer.fullName,
      email_cliente: customer.email,
      telefono_cliente: customer.phone,
      monto_total: normalizeMoney(montoTotal) || 0,
      tipo_pedido: tipoPedido,
      direccion: normalizeOptionalValue(customer.address),
      metadata: {
        items: snapshotItems,
        customerDocumentNumber: normalizeOptionalValue(customer.documentNumber),
        customerAddress: normalizeOptionalValue(customer.address),
        customerCity: normalizeOptionalValue(customer.city),
        customerProvince: normalizeOptionalValue(customer.province),
        customerPostalCode: normalizeOptionalValue(customer.postalCode),
        customerNotes: normalizeOptionalValue(customer.notes),
        deliveryMethod:
          tipoPedido === "envio" ? "Envio a domicilio" : "Retiro en local",
        paymentMethod:
          normalizeOptionalValue(customer.paymentMethod) ||
          (settings.mercadoPagoAccessToken ? "Mercado Pago" : "Pedido directo"),
        documentKind: "NP",
        checkoutValidatedAt: new Date().toISOString(),
        stockValidatedAtCheckout: settings.validarStockAlConfirmarPedido,
        priceValidatedAtCheckout:
          settings.validarClasePrecioAlConfirmarPedido,
      },
    },
    paymentItems,
    itemCount,
  };
}
