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

export const ORDER_LIST_VIEWS = [
  "pedidos",
  "pendientes",
  "procesados",
  "pendientes_retiro",
  "finalizados",
] as const;

export const ORDER_CHANGE_ORIGINS = [
  "admin",
  "webhook",
  "sistema",
] as const;

export type OrderState = (typeof ORDER_STATES)[number];
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATES)[number];
export type OrderType = (typeof ORDER_TYPES)[number];
export type OrderListView = (typeof ORDER_LIST_VIEWS)[number];
export type OrderChangeOrigin = (typeof ORDER_CHANGE_ORIGINS)[number];

export type OrderItem = {
  productId: string;
  quantity: number;
};

export type OrderDocumentItem = {
  id: number | null;
  tc: string;
  idComprobante: string;
  sequence: number;
  articleId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
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
  pickupCode?: string | null;
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
  origen: OrderChangeOrigin;
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

export type OrderFilters = {
  estado?: OrderState | null;
  estado_pago?: OrderPaymentStatus | null;
  tipo_pedido?: OrderType | null;
  vista?: OrderListView | null;
  q?: string | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  limit?: number | null;
};

export type OrderDetail = {
  order: StoredOrder;
  logs: OrderStatusLog[];
  documentTc: string | null;
  documentNumber: string;
  documentItems: OrderDocumentItem[];
};
