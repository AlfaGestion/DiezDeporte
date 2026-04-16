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
  BrandImage,
  CartItem,
  CheckoutCustomer,
  CreateOrderPayload,
  OrderSummary,
  Product,
  PromoTile,
  PublicStoreSettings,
} from "@/lib/types";

const LOCAL_STORAGE_CART_KEY = "diezdeportes-cart";
const ODOO_FACEBOOK_URL = "https://diezdeportes.odoo.com/website/social/facebook";
const ODOO_INSTAGRAM_URL = "https://diezdeportes.odoo.com/website/social/instagram";

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

type SortOption = "featured" | "name-asc" | "price-asc" | "price-desc";
type StockOption = "all" | "available" | "low" | "empty";

type StorefrontProps = {
  initialProducts: Product[];
  settings: PublicStoreSettings;
  brandImages: BrandImage[];
  heroImageUrl: string | null;
  promoTiles: PromoTile[];
  loadError?: string;
};

export function Storefront({
  initialProducts,
  settings,
  brandImages,
  heroImageUrl,
  promoTiles,
  loadError,
}: StorefrontProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [stockFilter, setStockFilter] = useState<StockOption>("all");
  const [selectedFamily, setSelectedFamily] = useState("all");
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
      setCart(JSON.parse(savedCart) as CartItem[]);
    } catch {
      window.localStorage.removeItem(LOCAL_STORAGE_CART_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_STORAGE_CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const families = Array.from(
    new Set(
      initialProducts
        .map((product) => product.familyId.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const prices = initialProducts.map((product) => product.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

  const filteredProducts = initialProducts
    .filter((product) => {
      const normalizedSearch = search.trim().toLowerCase();
      const matchesSearch =
        normalizedSearch === "" ||
        product.description.toLowerCase().includes(normalizedSearch) ||
        product.code.toLowerCase().includes(normalizedSearch);

      const matchesFamily =
        selectedFamily === "all" || product.familyId.trim() === selectedFamily;

      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "available" && product.stock > 0) ||
        (stockFilter === "low" && product.stock > 0 && product.stock <= 3) ||
        (stockFilter === "empty" && product.stock <= 0);

      if (!matchesSearch || !matchesFamily || !matchesStock) {
        return false;
      }

      if (settings.showOutOfStock) {
        return true;
      }

      return product.stock > 0;
    })
    .sort((left, right) => {
      if (sortBy === "name-asc") {
        return left.description.localeCompare(right.description);
      }

      if (sortBy === "price-asc") {
        return left.price - right.price;
      }

      if (sortBy === "price-desc") {
        return right.price - left.price;
      }

      return (
        right.stock - left.stock ||
        left.description.localeCompare(right.description)
      );
    });

  const subtotal = cart.reduce((sum, item) => sum + item.netPrice * item.quantity, 0);
  const taxTotal = cart.reduce((sum, item) => sum + item.taxAmount * item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cartItemCount(cart);

  const whatsappHref = resolveWhatsappHref(settings.supportWhatsapp);
  const heroStyle = heroImageUrl
    ? {
        backgroundImage: `linear-gradient(90deg, rgba(6, 10, 18, 0.72), rgba(6, 10, 18, 0.2)), url("${heroImageUrl}")`,
      }
    : undefined;

  const featuredTiles =
    promoTiles.length > 0
      ? promoTiles.slice(0, 3)
      : initialProducts
          .filter((product) => Boolean(product.imageUrl))
          .slice(0, 3)
          .map((product, index) => ({
            src: product.imageUrl || "",
            href: "#catalogo",
            alt: product.description,
            label: ["Novedades", "Rendimiento", "Coleccion"][index] || "Destacado",
          }));

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

  function updateCustomerField(field: keyof CheckoutCustomer, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  function openCartPanel() {
    if (window.innerWidth <= 1180) {
      setMobileCartOpen(true);
      return;
    }

    document.getElementById("pedido")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function handleCheckoutSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setOrder(null);

    if (cart.length === 0) {
      setErrorMessage("Agrega al menos un producto antes de enviar el pedido.");
      return;
    }

    if (!customer.fullName || !customer.phone || !customer.address || !customer.city) {
      setErrorMessage(
        "Completa nombre, telefono, direccion y localidad para grabar el pedido.",
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

  const desktopCartClassName = mobileCartOpen
    ? "order-panel mobile-sheet"
    : "order-panel mobile-hidden";

  return (
    <>
      <main className="shop-page" id="top">
        <header className="site-header">
          <a className="site-logo" href="#top" aria-label={settings.storeName}>
            <span>Diez</span>
            <span>Deportes</span>
          </a>

          <nav className="site-nav" aria-label="Principal">
            <a href="#top">Inicio</a>
            <a href="#sobre-nosotros">Sobre nosotros</a>
          </nav>

          <div className="site-actions">
            <button
              type="button"
              className="site-cart-pill"
              onClick={openCartPanel}
              aria-label="Abrir pedido"
            >
              <span className="site-cart-count">{itemCount}</span>
              <IconCart />
            </button>

            <div className="site-socials" aria-label="Redes">
              <a href={ODOO_FACEBOOK_URL} target="_blank" rel="noreferrer" aria-label="Facebook">
                <IconFacebook />
              </a>
              <a
                href={ODOO_INSTAGRAM_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
              >
                <IconInstagram />
              </a>
            </div>

            <a className="site-email" href={`mailto:${settings.supportEmail}`}>
              {settings.supportEmail}
            </a>

            <a className="site-contact-button" href="#contacto">
              Contactanos
            </a>
          </div>
        </header>

        <section className="shop-hero hero-immersive" style={heroStyle}>
          <div className="shop-hero-copy">
            <span className="shop-kicker">Store online</span>
            <h1>La casa del deporte</h1>
            <p>{settings.storeTagline}</p>

            <div className="hero-actions">
              <a className="hero-primary" href="#catalogo">
                Ver productos
              </a>
              {whatsappHref ? (
                <a
                  className="hero-secondary hero-whatsapp"
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              ) : null}
            </div>

            <div className="hero-metrics">
              <div className="hero-stat-inline">
                <strong>{initialProducts.length}</strong>
                <span>productos</span>
              </div>
              <div className="hero-stat-inline">
                <strong>{itemCount}</strong>
                <span>en tu pedido</span>
              </div>
              <div className="hero-stat-inline">
                <strong>{formatCurrency(total)}</strong>
                <span>estimado</span>
              </div>
            </div>
          </div>
        </section>

        {brandImages.length > 0 ? (
          <section className="brand-strip" aria-label="Marcas destacadas">
            {brandImages.slice(0, 6).map((image) => (
              <div className="brand-chip" key={image.src}>
                <img src={image.src} alt={image.alt} loading="lazy" />
              </div>
            ))}
          </section>
        ) : null}

        {featuredTiles.length > 0 ? (
          <section className="promo-section" aria-label="Colecciones destacadas">
            <div className="section-heading">
              <span className="section-kicker">Colecciones</span>
              <h2>Bloques destacados</h2>
            </div>

            <div className="promo-grid">
              {featuredTiles.map((tile) => (
                <a
                  className="promo-tile"
                  href={tile.href}
                  key={`${tile.src}-${tile.label}`}
                  target={tile.href.startsWith("http") ? "_blank" : undefined}
                  rel={tile.href.startsWith("http") ? "noreferrer" : undefined}
                >
                  <img src={tile.src} alt={tile.alt} loading="lazy" />
                  <span>{tile.label}</span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section className="support-band" id="sobre-nosotros">
          <div>
            <span className="section-kicker">Atencion personalizada</span>
            <h2>Comprometidos con tu satisfaccion</h2>
            <p>{settings.supportBlurb}</p>
          </div>

          <div className="support-band-actions">
            <a href={`tel:${settings.supportPhone.replace(/\s+/g, "")}`}>
              {settings.supportPhone}
            </a>
            <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a>
            {whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            ) : null}
          </div>
        </section>

        <div className="shop-layout" id="catalogo">
          <aside className="filters-panel">
            <div className="panel-block">
              <h2>Buscar</h2>
              <input
                className="search-input"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Codigo o descripcion"
              />
            </div>

            <div className="panel-block">
              <h3>Categorias</h3>
              <div className="filter-list">
                <button
                  type="button"
                  className={`filter-chip ${selectedFamily === "all" ? "active" : ""}`}
                  onClick={() => setSelectedFamily("all")}
                >
                  Todos los productos
                </button>
                {families.map((family) => (
                  <button
                    key={family}
                    type="button"
                    className={`filter-chip ${selectedFamily === family ? "active" : ""}`}
                    onClick={() => setSelectedFamily(family)}
                  >
                    Familia {family}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-block">
              <h3>Stock</h3>
              <div className="filter-list">
                <button
                  type="button"
                  className={`filter-chip ${stockFilter === "all" ? "active" : ""}`}
                  onClick={() => setStockFilter("all")}
                >
                  Todo
                </button>
                <button
                  type="button"
                  className={`filter-chip ${stockFilter === "available" ? "active" : ""}`}
                  onClick={() => setStockFilter("available")}
                >
                  Disponible
                </button>
                <button
                  type="button"
                  className={`filter-chip ${stockFilter === "low" ? "active" : ""}`}
                  onClick={() => setStockFilter("low")}
                >
                  Bajo
                </button>
                <button
                  type="button"
                  className={`filter-chip ${stockFilter === "empty" ? "active" : ""}`}
                  onClick={() => setStockFilter("empty")}
                >
                  Sin stock
                </button>
              </div>
            </div>

            <div className="panel-block">
              <h3>Rango de precio</h3>
              <p className="panel-note">
                Desde {formatCurrency(minPrice)} hasta {formatCurrency(maxPrice)}
              </p>
            </div>
          </aside>

          <section className="catalog-panel">
            <div className="catalog-toolbar">
              <div>
                <h2>Todos los productos</h2>
                <p>{filteredProducts.length} resultados</p>
              </div>

              <label className="sort-box">
                <span>Ordenar por</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortOption)}
                >
                  <option value="featured">Destacado</option>
                  <option value="name-asc">Nombre (A-Z)</option>
                  <option value="price-asc">Precio - bajo a alto</option>
                  <option value="price-desc">Precio - alto a bajo</option>
                </select>
              </label>
            </div>

            {loadError ? (
              <div className="message error">
                {loadError}
                <div className="message-detail">
                  Revisa la configuracion de `.env` y la conectividad a SQL Server.
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
                const outOfStock = product.stock <= 0;
                const disableAddButton = outOfStock && !settings.allowBackorders;

                return (
                  <article className="catalog-card" key={product.id}>
                    <a className="catalog-card-media" href="#pedido">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.description}
                          loading="lazy"
                        />
                      ) : (
                        <div className="catalog-card-placeholder">
                          {product.code.slice(0, 3)}
                        </div>
                      )}
                    </a>

                    <div className="catalog-card-body">
                      <div className="catalog-card-tags">
                        <span className="catalog-tag">Cod. {product.code}</span>
                        <span className={`catalog-tag ${getStockBadgeClass(product.stock)}`}>
                          Stock {product.stock.toFixed(0)}
                        </span>
                      </div>

                      <h3>{product.description}</h3>

                      <p className="catalog-card-subtitle">
                        {product.presentation || product.unitId || "Unidad"}
                      </p>

                      <div className="catalog-card-price">{formatCurrency(product.price)}</div>
                      <p className="catalog-card-tax">Precio s/Imp. Nac.</p>

                      <button
                        type="button"
                        className="catalog-card-button"
                        onClick={() => addToCart(product)}
                        disabled={disableAddButton}
                      >
                        {disableAddButton ? "Sin stock" : "Anadir al carrito"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="order-panel desktop-only" id="pedido">
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

        <footer className="site-footer" id="contacto">
          <div className="site-footer-copy">
            <a className="site-logo footer-logo" href="#top" aria-label={settings.storeName}>
              <span>Diez</span>
              <span>Deportes</span>
            </a>
            <p>{settings.storeAddress}</p>
          </div>

          <div className="site-footer-links">
            <a href={`tel:${settings.supportPhone.replace(/\s+/g, "")}`}>
              {settings.supportPhone}
            </a>
            <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a>
            {whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            ) : null}
          </div>

          <div className="site-socials footer-socials" aria-label="Redes">
            <a href={ODOO_FACEBOOK_URL} target="_blank" rel="noreferrer" aria-label="Facebook">
              <IconFacebook />
            </a>
            <a
              href={ODOO_INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
            >
              <IconInstagram />
            </a>
          </div>
        </footer>
      </main>

      {mobileCartOpen ? (
        <div className="mobile-backdrop" onClick={() => setMobileCartOpen(false)} />
      ) : null}

      <button
        type="button"
        className="mobile-cart-button"
        onClick={() => setMobileCartOpen((current) => !current)}
      >
        Pedido ({itemCount})
      </button>

      <aside className={desktopCartClassName}>
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
      <div className="order-panel-header">
        <div>
          <h2>Tu pedido</h2>
          <p>{itemCount} unidades</p>
        </div>
        <span className="order-badge">Web</span>
      </div>

      {order ? (
        <div className="message success">
          Pedido grabado con exito.
          <div className="message-detail">
            Comprobante: <strong>{order.tc} {order.idComprobante}</strong>
          </div>
        </div>
      ) : null}

      {errorMessage ? <div className="message error">{errorMessage}</div> : null}

      {cart.length === 0 ? (
        <div className="empty-state compact">
          Aun no agregaste productos. El carrito se guarda en este navegador.
        </div>
      ) : (
        <div className="order-items">
          {cart.map((item) => (
            <article className="order-item" key={item.id}>
              <div className="order-item-top">
                <div>
                  <h3>{item.description}</h3>
                  <p>{item.code} · {formatCurrency(item.price)} c/u</p>
                </div>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onItemRemove(item.id)}
                >
                  Quitar
                </button>
              </div>

              <div className="order-item-controls">
                <button
                  type="button"
                  className="qty-button"
                  onClick={() => onItemQuantityChange(item.id, item.quantity - 1)}
                >
                  -
                </button>
                <strong>{item.quantity}</strong>
                <button
                  type="button"
                  className="qty-button"
                  onClick={() => onItemQuantityChange(item.id, item.quantity + 1)}
                >
                  +
                </button>
                <span className="order-item-total">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="order-summary">
        <div className="summary-row">
          <span>Subtotal neto</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="summary-row">
          <span>IVA</span>
          <span>{formatCurrency(taxTotal)}</span>
        </div>
        <div className="summary-row total">
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
              placeholder="Quien recibe el pedido"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="phone">Telefono</label>
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
            <label htmlFor="address">Direccion</label>
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
            <label htmlFor="postalCode">Codigo postal</label>
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
              <option>Envio a domicilio</option>
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
              placeholder="Horario de entrega, talle, color o cualquier observacion"
            />
          </div>
        </div>

        <button
          type="submit"
          className="submit-order-button"
          disabled={submitting || cart.length === 0}
        >
          {submitting ? "Grabando pedido..." : "Confirmar pedido"}
        </button>
      </form>
    </>
  );
}

function resolveWhatsappHref(rawValue: string) {
  const value = rawValue.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  return `https://wa.me/${digits}`;
}

function IconCart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm9 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 4h-2v2h1.2l2.16 8.64A2 2 0 0 0 8.3 16H18v-2H8.3l-.25-1H18a2 2 0 0 0 1.94-1.52L21.6 5H7.1L6.65 3.2A1.5 1.5 0 0 0 5.2 2H5v2Z" />
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.6 1.7-1.6h1.5V4.8c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4V11H8v3h2.5v8h3Z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3Zm0 2A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 16.5 5h-9Zm9.75 1.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5ZM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
    </svg>
  );
}
