import { formatCurrency } from "@/lib/commerce";

export const EMAIL_PREVIEW_VALUES: Record<string, string> = {
  nombre_cliente: "Juan Perez",
  numero_pedido: "NP-10248",
  estado: "Listo para retirar",
  monto_total: formatCurrency(124500),
  tipo_entrega: "Retiro en local",
  link_seguimiento: "https://mitienda.com/pedido/NP-10248",
  codigo_retiro: "WEB-2480-A91K",
  link_reintento: "https://mitienda.com/pago/reintentar/NP-10248",
  direccion_local: "Av. Sarmiento 123, El Bolson",
  nombre_local: "Diez Deportes",
  horario_local: "Lunes a sabados de 9 a 13 hs y de 16 a 20 hs.",
  email_contacto: "ventas@mitienda.com",
  telefono_contacto: "+54 9 294 400-0000",
};

export const EMAIL_VARIABLE_ORDER = [
  "nombre_cliente",
  "numero_pedido",
  "estado",
  "monto_total",
  "tipo_entrega",
  "link_seguimiento",
  "codigo_retiro",
  "link_reintento",
  "direccion_local",
  "nombre_local",
  "horario_local",
  "email_contacto",
  "telefono_contacto",
] as const;

export function renderEmailPreviewTemplate(template: string) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => {
    return EMAIL_PREVIEW_VALUES[key] ?? "";
  });
}
