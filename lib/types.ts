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
  presentation: string;
  supplierAccount: string;
  barcode: string | null;
  imageUrl: string | null;
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

export type PublicStoreSettings = {
  storeName: string;
  storeTagline: string;
  allowBackorders: boolean;
  showOutOfStock: boolean;
  supportWhatsapp: string;
};

export type BrandImage = {
  src: string;
  alt: string;
};
