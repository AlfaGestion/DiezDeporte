import type { CartItem, CheckoutCustomer, Product } from "@/lib/types";

export function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "si", "on"].includes(value.trim().toLowerCase());
}

export function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

export function normalizeCode(value: string, length: number) {
  return value.trim().padStart(length, " ");
}

export function normalizeBranch(value: string) {
  return value.trim().padStart(4, "0").slice(-4);
}

export function normalizeNumber(value: number) {
  return String(value).padStart(8, "0").slice(-8);
}

export function getPriceBreakdown(
  rawPrice: number,
  taxRate: number,
  pricesIncludeTax: boolean,
) {
  const safePrice = toNumber(rawPrice);
  const safeTaxRate = toNumber(taxRate);
  const multiplier = 1 + safeTaxRate / 100;

  if (!pricesIncludeTax || multiplier <= 0) {
    return {
      grossPrice: safePrice,
      netPrice: safePrice,
      taxAmount: 0,
    };
  }

  const netPrice = safePrice / multiplier;
  const taxAmount = safePrice - netPrice;

  return {
    grossPrice: safePrice,
    netPrice,
    taxAmount,
  };
}

export function resolveImageUrl(
  imagePath: string | null,
  fallbackUrl: string | null,
  imageBaseUrl: string,
) {
  if (fallbackUrl && /^https?:\/\//i.test(fallbackUrl)) {
    return fallbackUrl;
  }

  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  if (!imageBaseUrl) return null;

  const base = imageBaseUrl.endsWith("/") ? imageBaseUrl.slice(0, -1) : imageBaseUrl;
  const cleanPath = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;

  return `${base}${cleanPath}`;
}

export function buildImageProxyUrl(imageUrl: string | null) {
  if (!imageUrl) return null;
  if (!/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function toCartItem(product: Product): CartItem {
  return {
    ...product,
    quantity: 1,
  };
}

export function cartItemCount(cart: CartItem[]) {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

export function getStockBadgeClass(stock: number) {
  if (stock <= 0) return "stock-empty";
  if (stock <= 3) return "stock-low";
  return "stock-ok";
}

export function buildOrderNotes(customer: CheckoutCustomer) {
  const notes = [
    customer.email ? `Email: ${customer.email}` : "",
    customer.province ? `Provincia: ${customer.province}` : "",
    customer.deliveryMethod ? `Entrega: ${customer.deliveryMethod}` : "",
    customer.paymentMethod ? `Pago: ${customer.paymentMethod}` : "",
    customer.notes ? `Notas: ${customer.notes}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return truncate(notes, 500);
}

export function buildOrderComment(customer: CheckoutCustomer) {
  const compact = [
    customer.email ? `Email ${customer.email}` : "",
    customer.deliveryMethod ? `Entrega ${customer.deliveryMethod}` : "",
    customer.paymentMethod ? `Pago ${customer.paymentMethod}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return truncate(compact, 100);
}
