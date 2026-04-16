"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  cartItemCount,
  formatCurrency,
  getStockBadgeClass,
  toCartItem,
} from "@/lib/commerce";
import type {
  CartItem,
  CheckoutCustomer,
  CreateOrderPayload,
  OrderSummary,
  Product,
  PublicStoreSettings,
} from "@/lib/types";

const LOCAL_STORAGE_CART_KEY = "diezdeportes-cart";

const emptyCustomer: CheckoutCustomer = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  documentNumber: "",
  notes: "",
  deliveryMethod: "Retiro en local",
  paymentMethod: "Coordinar pago",
};

type StorefrontProps = {
  initialProducts: Product[];
  settings: PublicStoreSettings;
  loadError?: string;
};

export function Storefront({
  initialProducts,
  settings,
  loadError,
}: StorefrontProps) {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<CheckoutCustomer>(emptyCustomer);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  useEffect(() => {
    const savedCart = window.localStorage.getItem(LOCAL_STORAGE_CART_KEY);
    if (!savedCart) return;

    try {
      const parsed = JSON.parse(savedCart) as CartItem[];
      setCart(parsed);
    } catch {
      window.localStorage.removeItem(LOCAL_STORAGE_CART_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_STORAGE_CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const filteredProducts = initialProducts.filter((product) => {
    const matchesSearch =
      search.trim() === "" ||
      product.description.toLowerCase().includes(search.toLowerCase()) ||
      product.code.toLowerCase().includes(search.toLowerCase()) ||
      product.familyId.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (settings.showOutOfStock) return true;

    return product.stock > 0;
  });

  const subtotal = cart.reduce((sum, item) => sum + item.netPrice * item.quantity, 0);
  const taxTotal = cart.reduce((sum, item) => sum + item.taxAmount * item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cartItemCount(cart);

  function addToCart(product: Product) {
    setErrorMessage(null);
    setOrder(null);

    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.id === product.id);
      if (!existing) {
        return [...currentCart, toCartItem(product)];
      }

      return currentCart.map((item) => {
        if (item.id !== product.id) return item;

        const maxQuantity = settings.allowBackorders
          ? item.quantity + 1
          : Math.max(1, Math.floor(product.stock));
        const nextQuantity = Math.min(item.quantity + 1, maxQuantity);

        return { ...item, quantity: nextQuantity };
      });
    });
  }

  function removeFromCart(productId: string) {
    setCart((currentCart) => currentCart.filter((item) => item.id !== productId));
  }

  function updateItemQuantity(productId: string, nextQuantity: number) {
    if (nextQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.id !== productId) return item;

        const maxQuantity = settings.allowBackorders
          ? nextQuantity
          : Math.max(1, Math.floor(item.stock));

        return {
          ...item,
          quantity: Math.min(nextQuantity, maxQuantity),
        };
      }),
    );
  }

  function updateCustomerField(
    field: keyof CheckoutCustomer,
    value: string,
  ) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  async function handleCheckoutSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setOrder(null);

    if (cart.length === 0) {
      setErrorMessage("Agregá al menos un producto antes de enviar el pedido.");
      return;
    }

    if (!customer.fullName || !customer.phone || !customer.address || !customer.city) {
      setErrorMessage(
        "Completá nombre, teléfono, dirección y localidad para grabar el pedido.",
      );
      return;
    }

    const payload: CreateOrderPayload = {
      customer,
      items: cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
    };

    setSubmitting(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        error?: string;
        order?: OrderSummary;
      };

      if (!response.ok || !result.order) {
        throw new Error(result.error || "No se pudo grabar el pedido.");
      }

      setOrder(result.order);
      setCart([]);
      setCustomer(emptyCustomer);
      window.localStorage.removeItem(LOCAL_STORAGE_CART_KEY);
      setMobileCartOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo grabar el pedido.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const cartPanelClassName = mobileCartOpen
    ? "cart-panel mobile-sheet"
    : "cart-panel mobile-hidden";

  return (
    <>
      <main className="page-shell">
        <section className="hero">
          <div className="hero-grid">
            <div>
              <span className="eyebrow">Tienda directa desde SQL Server</span>
              <h1>{settings.storeName}</h1>
              <p>{settings.storeTagline}</p>
              {settings.supportWhatsapp ? (
                <a
                  className="support-link"
                  href={`https://wa.me/${settings.supportWhatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp para soporte comercial
                </a>
              ) : null}
            </div>

            <div className="hero-stats">
              <article className="hero-stat">
                <strong>{initialProducts.length}</strong>
                <span>artículos publicados</span>
              </article>
              <article className="hero-stat">
                <strong>{itemCount}</strong>
                <span>unidades en el carrito</span>
              </article>
              <article className="hero-stat">
                <strong>{formatCurrency(total)}</strong>
                <span>total estimado del pedido</span>
              </article>
            </div>
          </div>
        </section>

        <div className="layout-grid">
          <section className="catalog-panel">
            <div className="panel-header">
              <h2>Catálogo</h2>
              <input
                className="search-bar"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por código, descripción o familia"
              />
            </div>

            {loadError ? (
              <div className="message error">
                {loadError}
                <div style={{ marginTop: 8 }}>
                  Revisá la configuración de `.env` y la conectividad a SQL Server.
                </div>
              </div>
            ) : null}

            {!loadError && filteredProducts.length === 0 ? (
              <div className="empty-state">
                No hay productos para mostrar con los filtros actuales.
              </div>
            ) : null}

            <div className="catalog-grid">
              {filteredProducts.map((product) => {
                const isOutOfStock = product.stock <= 0;
                const disableAddButton = isOutOfStock && !settings.allowBackorders;

                return (
                  <article className="product-card" key={product.id}>
                    <div className="product-media">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.description}
                          loading="lazy"
                        />
                      ) : (
                        <div className="product-placeholder">
                          {product.code.slice(0, 3)}
                        </div>
                      )}
                    </div>

                    <div className="product-body">
                      <div className="product-meta">
                        <span className="pill">{product.familyId || "General"}</span>
                        <span className={`pill ${getStockBadgeClass(product.stock)}`}>
                          Stock: {product.stock.toFixed(2)}
                        </span>
                      </div>

                      <div>
                        <h3 className="product-title">{product.description}</h3>
                        <div className="product-code">Cod. {product.code}</div>
                      </div>

                      <div className="product-code">
                        {product.presentation || product.unitId || "Unidad estándar"}
                      </div>

                      <div className="product-price">{formatCurrency(product.price)}</div>

                      <div className="product-actions">
                        <button
                          type="button"
                          className="product-button"
                          onClick={() => addToCart(product)}
                          disabled={disableAddButton}
                        >
                          {disableAddButton ? "Sin stock" : "Agregar"}
                        </button>
                        <span className="product-code">
                          IVA {product.taxRate.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="cart-panel">
            <CartContent
              cart={cart}
              customer={customer}
              errorMessage={errorMessage}
              itemCount={itemCount}
              onCheckoutSubmit={handleCheckoutSubmit}
              onCustomerChange={updateCustomerField}
              onItemQuantityChange={updateItemQuantity}
              onItemRemove={removeFromCart}
              order={order}
              submitting={submitting}
              subtotal={subtotal}
              taxTotal={taxTotal}
              total={total}
            />
          </aside>
        </div>
      </main>

      {mobileCartOpen ? <div className="mobile-sheet-backdrop" /> : null}

      <button
        type="button"
        className="mobile-cart-button"
        onClick={() => setMobileCartOpen((current) => !current)}
      >
        Carrito {itemCount > 0 ? `(${itemCount})` : ""}
      </button>

      <aside className={cartPanelClassName}>
        <CartContent
          cart={cart}
          customer={customer}
          errorMessage={errorMessage}
          itemCount={itemCount}
          onCheckoutSubmit={handleCheckoutSubmit}
          onCustomerChange={updateCustomerField}
          onItemQuantityChange={updateItemQuantity}
          onItemRemove={removeFromCart}
          order={order}
          submitting={submitting}
          subtotal={subtotal}
          taxTotal={taxTotal}
          total={total}
        />
      </aside>
    </>
  );
}

type CartContentProps = {
  cart: CartItem[];
  customer: CheckoutCustomer;
  errorMessage: string | null;
  itemCount: number;
  onCheckoutSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCustomerChange: (field: keyof CheckoutCustomer, value: string) => void;
  onItemQuantityChange: (productId: string, quantity: number) => void;
  onItemRemove: (productId: string) => void;
  order: OrderSummary | null;
  submitting: boolean;
  subtotal: number;
  taxTotal: number;
  total: number;
};

function CartContent({
  cart,
  customer,
  errorMessage,
  itemCount,
  onCheckoutSubmit,
  onCustomerChange,
  onItemQuantityChange,
  onItemRemove,
  order,
  submitting,
  subtotal,
  taxTotal,
  total,
}: CartContentProps) {
  return (
    <>
      <div className="panel-header">
        <h2>Carrito</h2>
        <span className="pill">{itemCount} unidades</span>
      </div>

      {order ? (
        <div className="message success">
          Pedido grabado con éxito.
          <div style={{ marginTop: 8 }}>
            Comprobante: <strong>{order.tc} {order.idComprobante}</strong>
          </div>
        </div>
      ) : null}

      {errorMessage ? <div className="message error">{errorMessage}</div> : null}

      {cart.length === 0 ? (
        <div className="empty-state">
          Todavía no agregaste productos. El carrito se guarda en este navegador.
        </div>
      ) : (
        <div className="cart-items">
          {cart.map((item) => (
            <article className="cart-item" key={item.id}>
              <div className="cart-item-header">
                <div>
                  <p className="cart-item-title">{item.description}</p>
                  <div className="cart-item-subtitle">
                    {item.code} · {formatCurrency(item.price)} c/u
                  </div>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => onItemRemove(item.id)}
                >
                  Quitar
                </button>
              </div>

              <div className="cart-qty">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onItemQuantityChange(item.id, item.quantity - 1)}
                >
                  -
                </button>
                <strong>{item.quantity}</strong>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onItemQuantityChange(item.id, item.quantity + 1)}
                >
                  +
                </button>
                <span style={{ marginLeft: "auto", fontWeight: 700 }}>
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="cart-summary">
        <div className="summary-line">
          <span>Subtotal neto</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="summary-line">
          <span>IVA</span>
          <span>{formatCurrency(taxTotal)}</span>
        </div>
        <div className="summary-line">
          <span>Total pedido</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
      </div>

      <form className="checkout-form" onSubmit={onCheckoutSubmit}>
        <div className="checkout-grid">
          <div className="field span-2">
            <label htmlFor="fullName">Nombre y apellido</label>
            <input
              id="fullName"
              value={customer.fullName}
              onChange={(event) => onCustomerChange("fullName", event.target.value)}
              placeholder="Quién recibe el pedido"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="phone">Teléfono</label>
            <input
              id="phone"
              value={customer.phone}
              onChange={(event) => onCustomerChange("phone", event.target.value)}
              placeholder="WhatsApp o celular"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={customer.email}
              onChange={(event) => onCustomerChange("email", event.target.value)}
              placeholder="correo@cliente.com"
            />
          </div>

          <div className="field span-2">
            <label htmlFor="address">Dirección</label>
            <input
              id="address"
              value={customer.address}
              onChange={(event) => onCustomerChange("address", event.target.value)}
              placeholder="Calle, altura y referencias"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="city">Localidad</label>
            <input
              id="city"
              value={customer.city}
              onChange={(event) => onCustomerChange("city", event.target.value)}
              placeholder="Ciudad"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="province">Provincia</label>
            <input
              id="province"
              value={customer.province}
              onChange={(event) => onCustomerChange("province", event.target.value)}
              placeholder="Provincia"
            />
          </div>

          <div className="field">
            <label htmlFor="postalCode">Código postal</label>
            <input
              id="postalCode"
              value={customer.postalCode}
              onChange={(event) => onCustomerChange("postalCode", event.target.value)}
              placeholder="CP"
            />
          </div>

          <div className="field">
            <label htmlFor="documentNumber">Documento</label>
            <input
              id="documentNumber"
              value={customer.documentNumber}
              onChange={(event) =>
                onCustomerChange("documentNumber", event.target.value)
              }
              placeholder="DNI / CUIT"
            />
          </div>

          <div className="field">
            <label htmlFor="deliveryMethod">Entrega</label>
            <select
              id="deliveryMethod"
              value={customer.deliveryMethod}
              onChange={(event) =>
                onCustomerChange("deliveryMethod", event.target.value)
              }
            >
              <option>Retiro en local</option>
              <option>Envío a domicilio</option>
              <option>Coordinar por WhatsApp</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="paymentMethod">Pago</label>
            <select
              id="paymentMethod"
              value={customer.paymentMethod}
              onChange={(event) =>
                onCustomerChange("paymentMethod", event.target.value)
              }
            >
              <option>Coordinar pago</option>
              <option>Transferencia</option>
              <option>Efectivo</option>
              <option>Tarjeta</option>
            </select>
          </div>

          <div className="field span-2">
            <label htmlFor="notes">Notas</label>
            <textarea
              id="notes"
              rows={4}
              value={customer.notes}
              onChange={(event) => onCustomerChange("notes", event.target.value)}
              placeholder="Horario de entrega, talle, color o cualquier observación"
            />
          </div>
        </div>

        <button
          type="submit"
          className="checkout-button"
          disabled={submitting || cart.length === 0}
        >
          {submitting ? "Grabando pedido..." : "Confirmar pedido"}
        </button>
      </form>
    </>
  );
}
  onCheckoutSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
