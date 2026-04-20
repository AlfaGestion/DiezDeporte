export const ORDER_STATES = [
  "PENDIENTE",
  "APROBADO",
  "FACTURADO",
  "PREPARANDO",
  "LISTO_PARA_RETIRO",
  "ENVIADO",
  "ENTREGADO",
  "CANCELADO",
  "ERROR",
] as const;

export const ORDER_PAYMENT_STATES = [
  "pendiente",
  "aprobado",
  "rechazado",
] as const;

export const ORDER_TYPES = ["retiro", "envio"] as const;

export type OrderState = (typeof ORDER_STATES)[number];
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATES)[number];
export type OrderType = (typeof ORDER_TYPES)[number];

export type OrderItem = {
  productId: string;
  quantity: number;
};

export type OrderMetadata = {
  items?: OrderItem[];
  preferenceId?: string | null;
  externalReference?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerProvince?: string | null;
  customerPostalCode?: string | null;
  customerNotes?: string | null;
  deliveryMethod?: string | null;
  paymentMethod?: string | null;
  paymentStatusDetail?: string | null;
  paymentTypeId?: string | null;
  paymentMethodId?: string | null;
  lastPaymentPayload?: string | null;
};

export type Order = {
  id: number;
  numero_pedido: string;
  nombre_cliente: string;
  email_cliente: string;
  telefono_cliente: string;
  monto_total: number;
  estado_pago: OrderPaymentStatus;
  id_pago: string | null;
  tipo_pedido: OrderType;
  estado: OrderState;
  codigo_qr: string | null;
  numero_seguimiento: string | null;
  direccion: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
};

export type StoredOrder = Order & {
  metadata: OrderMetadata;
  email_facturado_enviado_at: string | null;
  email_listo_enviado_at: string | null;
  email_enviado_enviado_at: string | null;
};

export type OrderStatusLog = {
  id: number;
  orderId: number;
  estadoAnterior: OrderState | null;
  estadoNuevo: OrderState;
  fecha: string;
};

export type CreateOrderInput = {
  nombre_cliente: string;
  email_cliente: string;
  telefono_cliente: string;
  monto_total: number;
  tipo_pedido: OrderType;
  direccion?: string | null;
  estado?: OrderState;
  estado_pago?: OrderPaymentStatus;
  id_pago?: string | null;
  numero_seguimiento?: string | null;
  metadata?: OrderMetadata;
};

export type UpdateOrderInput = Partial<
  Pick<
    StoredOrder,
    | "nombre_cliente"
    | "email_cliente"
    | "telefono_cliente"
    | "monto_total"
    | "estado_pago"
    | "id_pago"
    | "tipo_pedido"
    | "estado"
    | "codigo_qr"
    | "numero_seguimiento"
    | "direccion"
    | "metadata"
    | "email_facturado_enviado_at"
    | "email_listo_enviado_at"
    | "email_enviado_enviado_at"
  >
>;

