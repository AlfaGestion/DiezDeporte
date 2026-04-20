export type ProductImageMode = "none" | "exact" | "illustrative";

export type Product = {
  id: string;
  code: string;
  description: string;
  price: number;
  netPrice: number;
  taxAmount: number;
  rawPrice: number;
  stock: number;
  taxRate: number;
  currency: string;
  unitId: string;
  familyId: string;
  typeId: string;
  defaultSize: string;
  presentation: string;
  supplierAccount: string;
  barcode: string | null;
  imageUrl: string | null;
  imageMode: ProductImageMode;
  imageNote: string | null;
  imageSourceUrl: string | null;
  cost: number;
};

export type CartItem = Product & {
  quantity: number;
};

export type CheckoutCustomer = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  documentNumber: string;
  notes: string;
  deliveryMethod: string;
  paymentMethod: string;
};

export type CreateOrderPayload = {
  customer: CheckoutCustomer;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
};

export type OrderSummary = {
  tc: string;
  idComprobante: string;
  internalId: number | null;
  total: number;
  itemCount: number;
};

export type PaymentFlowStatus =
  | "pending"
  | "processing"
  | "approved"
  | "finalized"
  | "rejected"
  | "cancelled"
  | "error";

export type PaymentPreferenceResponse = {
  pendingOrderId: number;
  externalReference: string;
  preferenceId: string;
  checkoutUrl: string;
  total: number;
  itemCount: number;
  status: PaymentFlowStatus;
};

export type PaymentStatusResult = {
  pendingOrderId: number;
  externalReference: string;
  status: PaymentFlowStatus;
  paymentStatus: string | null;
  paymentStatusDetail: string | null;
  paymentId: string | null;
  preferenceId: string | null;
  merchantOrderId: string | null;
  total: number;
  itemCount: number;
  checkoutUrl: string | null;
  finalizationError: string | null;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  updatedAt: string;
  order: OrderSummary | null;
};

export type PublicStoreSettings = {
  storeName: string;
  logoUrl: string;
  storeTagline: string;
  allowBackorders: boolean;
  mercadoPagoEnabled: boolean;
  showOutOfStock: boolean;
  heroImageUrl: string;
  supportWhatsapp: string;
  supportEmail: string;
  supportPhone: string;
  storeAddress: string;
  supportBlurb: string;
};

export type BrandImage = {
  src: string;
  alt: string;
  label: string;
  aliases: string[];
};

export type PromoTile = {
  src: string;
  href: string;
  alt: string;
  label: string;
  filterValue: string;
};

export type AdminConfigFieldType = "text" | "password" | "boolean";

export type AdminConfigField = {
  key: string;
  label: string;
  description: string;
  section: string;
  type: AdminConfigFieldType;
  value: string | boolean;
  placeholder?: string;
};

export type AdminOrderStatusFilter = PaymentFlowStatus | "orders";

export type AdminOrderItem = {
  productId: string;
  quantity: number;
};

export type AdminOrderRecord = PaymentStatusResult & {
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  customerProvince: string;
  customerPostalCode: string;
  deliveryMethod: string;
  notes: string;
  items: AdminOrderItem[];
  approvedAt: string;
  finalizedAt: string;
  lastSyncAt: string;
  paymentMethodId: string | null;
  paymentTypeId: string | null;
};

export type AdminOrdersSnapshot = {
  orders: AdminOrderRecord[];
  summary: Record<PaymentFlowStatus, number> & {
    total: number;
  };
};

export * from "@/lib/types/order";
