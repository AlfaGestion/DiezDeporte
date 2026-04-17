"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  buildImageProxyUrl,
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
const LOCAL_STORAGE_THEME_KEY = "diezdeportes-theme";
const LOCAL_STORAGE_WEB_IMAGE_KEY = "diezdeportes-web-images";
const ODOO_FACEBOOK_URL =
  "https://diezdeportes.odoo.com/website/social/facebook";
const ODOO_INSTAGRAM_URL =
  "https://diezdeportes.odoo.com/website/social/instagram";

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
type ThemeMode = "light" | "dark";
type AudienceFilter = "all" | "ninez" | "mujeres" | "hombres";
type CheckoutStep = "cart" | "details";

type StorefrontProps = {
  initialProducts: Product[];
  settings: PublicStoreSettings;
  brandImages: BrandImage[];
  logoUrl: string | null;
  heroImageUrl: string | null;
  promoTiles: PromoTile[];
  loadError?: string;
};

type WebImageOverride = {
  imageUrl: string;
  imageMode: "illustrative";
  imageNote: string;
  imageSourceUrl: string | null;
};

export function Storefront({
  initialProducts,
  settings,
  brandImages,
  logoUrl,
  heroImageUrl,
  promoTiles,
  loadError,
}: StorefrontProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [stockFilter, setStockFilter] = useState<StockOption>("all");
  const [selectedFamily, setSelectedFamily] = useState("all");
  const [selectedAudience, setSelectedAudience] =
    useState<AudienceFilter>("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<CheckoutCustomer>(emptyCustomer);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("cart");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [webImageOverrides, setWebImageOverrides] = useState<
    Record<string, WebImageOverride | null>
  >({});
  const pendingWebImageSearchesRef = useRef(new Set<string>());

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

  useEffect(() => {
    const savedOverrides = window.localStorage.getItem(
      LOCAL_STORAGE_WEB_IMAGE_KEY,
    );
    if (!savedOverrides) return;

    try {
      setWebImageOverrides(
        JSON.parse(savedOverrides) as Record<string, WebImageOverride | null>,
      );
    } catch {
      window.localStorage.removeItem(LOCAL_STORAGE_WEB_IMAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      LOCAL_STORAGE_WEB_IMAGE_KEY,
      JSON.stringify(webImageOverrides),
    );
  }, [webImageOverrides]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      return;
    }

    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (cart.length === 0 && !order) {
      setCheckoutStep("cart");
    }
  }, [cart.length, order]);

  useEffect(() => {
    const shouldLockUi = mobileCartOpen || Boolean(selectedProduct);
    if (!shouldLockUi) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (selectedProduct) {
        setSelectedProduct(null);
        return;
      }

      if (mobileCartOpen) {
        setMobileCartOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileCartOpen, selectedProduct]);

  const families = Array.from(
    new Set(
      initialProducts.map((product) => product.familyId.trim()).filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const prices = initialProducts.map((product) => product.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const normalizedBrandImages = brandImages.slice(0, 6).map((brand, index) => {
    const label =
      brand.label ||
      ["Puma", "Reebok", "Topper", "Salomon", "Montagne", "Merrell"][index] ||
      brand.alt;
    return {
      ...brand,
      label,
      aliases: brand.aliases?.length ? brand.aliases : [label.toUpperCase()],
    };
  });
  const brandOptions = normalizedBrandImages.filter((brand) =>
    Boolean(brand.label),
  );
  const activeBrand =
    selectedBrand === "all"
      ? null
      : brandOptions.find((brand) => brand.label === selectedBrand) || null;

  const filteredProducts = initialProducts
    .filter((product) => {
      const normalizedDescription = normalizeFilterValue(product.description);
      const normalizedCode = normalizeFilterValue(product.code);
      const normalizedSearch = search.trim().toLowerCase();
      const matchesSearch =
        normalizedSearch === "" ||
        normalizedDescription.includes(
          normalizeFilterValue(normalizedSearch),
        ) ||
        normalizedCode.includes(normalizeFilterValue(normalizedSearch));

      const matchesFamily =
        selectedFamily === "all" || product.familyId.trim() === selectedFamily;

      const matchesAudience = matchesAudienceFilter(
        normalizedDescription,
        selectedAudience,
      );
      const matchesBrand = matchesBrandFilter(
        normalizedDescription,
        normalizedCode,
        activeBrand?.aliases || [],
      );

      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "available" && product.stock > 0) ||
        (stockFilter === "low" && product.stock > 0 && product.stock <= 3) ||
        (stockFilter === "empty" && product.stock <= 0);

      if (
        !matchesSearch ||
        !matchesFamily ||
        !matchesAudience ||
        !matchesBrand ||
        !matchesStock
      ) {
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

  const subtotal = cart.reduce(
    (sum, item) => sum + item.netPrice * item.quantity,
    0,
  );
  const taxTotal = cart.reduce(
    (sum, item) => sum + item.taxAmount * item.quantity,
    0,
  );
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cartItemCount(cart);

  const whatsappHref = resolveWhatsappHref(settings.supportWhatsapp);
  const resolvedLogoUrl = buildImageProxyUrl(logoUrl || settings.logoUrl);
  const resolvedHeroImageUrl = heroImageUrl || settings.heroImageUrl;
  const displayHeroImageUrl = buildImageProxyUrl(resolvedHeroImageUrl);
  const heroStyle = resolvedHeroImageUrl
    ? {
        backgroundImage: `linear-gradient(90deg, rgba(6, 10, 18, 0.72), rgba(6, 10, 18, 0.2)), url("${displayHeroImageUrl}")`,
      }
    : undefined;
  const mapEmbedUrl = buildMapEmbedUrl(settings.storeAddress);

  const normalizedPromoTiles =
    promoTiles.length > 0
      ? promoTiles.slice(0, 3).map((tile, index) => {
          const promoDefinition = getPromoDefinition(tile.href, index);

          return {
            ...tile,
            src: getPromoImageOverride(tile.href) || tile.src,
            label: promoDefinition.label,
            filterValue: promoDefinition.filterValue,
          };
        })
      : [];

  const featuredTiles =
    normalizedPromoTiles.length > 0
      ? normalizedPromoTiles
      : initialProducts
          .filter((product) => Boolean(product.imageUrl))
          .slice(0, 3)
          .map((product, index) => ({
            src: product.imageUrl || "",
            href: "#catalogo",
            alt: product.description,
            label: ["Kids", "Mujeres", "Hombres"][index] || "Destacado",
            filterValue: (["ninez", "mujeres", "hombres"][index] ||
              "all") as AudienceFilter,
          }));
  const audienceOptions: Array<{ value: AudienceFilter; label: string }> = [
    { value: "all", label: "Todo" },
    { value: "ninez", label: "Kids" },
    { value: "mujeres", label: "Mujeres" },
    { value: "hombres", label: "Hombres" },
  ];
  const activeAudienceLabel =
    audienceOptions.find((option) => option.value === selectedAudience)
      ?.label || "Todo";
  const resolvedFilteredProducts = filteredProducts.map(resolveProductImage);
  const resolvedSelectedProduct = selectedProduct
    ? resolveProductImage(selectedProduct)
    : null;
  const selectedProductCartItem = resolvedSelectedProduct
    ? cart.find((item) => item.id === resolvedSelectedProduct.id) || null
    : null;

  useEffect(() => {
    const candidates = resolvedFilteredProducts
      .filter(shouldAttemptWebImageSearch)
      .slice(0, 12);

    if (
      resolvedSelectedProduct &&
      shouldAttemptWebImageSearch(resolvedSelectedProduct)
    ) {
      candidates.unshift(resolvedSelectedProduct);
    }

    const uniqueCandidates = Array.from(
      new Map(candidates.map((product) => [product.id, product])).values(),
    );

    uniqueCandidates.forEach((product) => {
      void fetchWebImageForProduct(product);
    });
  }, [resolvedFilteredProducts, resolvedSelectedProduct]);

  function resolveProductImage(product: Product): Product {
    const override = webImageOverrides[product.id];
    if (!override) {
      return product;
    }

    return {
      ...product,
      imageUrl: override.imageUrl,
      imageMode: override.imageMode,
      imageNote: override.imageNote,
      imageSourceUrl: override.imageSourceUrl,
    };
  }

  async function fetchWebImageForProduct(product: Product) {
    if (!shouldAttemptWebImageSearch(product)) return;
    if (Object.prototype.hasOwnProperty.call(webImageOverrides, product.id))
      return;
    if (pendingWebImageSearchesRef.current.has(product.id)) return;

    pendingWebImageSearchesRef.current.add(product.id);

    try {
      const response = await fetch(
        `/api/product-image-search?code=${encodeURIComponent(product.code)}&description=${encodeURIComponent(product.description)}&currentImageUrl=${encodeURIComponent(product.imageUrl || "")}`,
      );

      if (!response.ok) {
        throw new Error("No se pudo buscar la imagen web.");
      }

      const result = (await response.json()) as {
        result?: WebImageOverride | null;
      };

      setWebImageOverrides((current) => ({
        ...current,
        [product.id]: result.result ?? null,
      }));
    } catch {
      setWebImageOverrides((current) => ({
        ...current,
        [product.id]: null,
      }));
    } finally {
      pendingWebImageSearchesRef.current.delete(product.id);
    }
  }

  function shouldAttemptWebImageSearch(product: Product) {
    if (product.imageMode === "none") {
      return true;
    }

    return Boolean(
      product.imageUrl &&
      /https?:\/\/diezdeportes\.odoo\.com\/web\/image\/product\.template\//i.test(
        product.imageUrl,
      ),
    );
  }

  function applyAudienceFilter(nextAudience: AudienceFilter) {
    setSelectedAudience((current) =>
      current === nextAudience ? "all" : nextAudience,
    );
    setSelectedFamily("all");
    scrollToCatalog();
  }

  function applyBrandFilter(nextBrand: string) {
    setSelectedBrand((current) => (current === nextBrand ? "all" : nextBrand));
    scrollToCatalog();
  }

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

  function openProductDetail(product: Product) {
    setSelectedProduct(product);
  }

  function closeProductDetail() {
    setSelectedProduct(null);
  }

  function handleProductCardKeyDown(
    event: ReactKeyboardEvent<HTMLElement>,
    product: Product,
  ) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openProductDetail(product);
  }

  function openCartFromDetail() {
    setSelectedProduct(null);
    requestAnimationFrame(() => {
      openCartPanel("cart");
    });
  }

  function removeFromCart(productId: string) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.id !== productId),
    );
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

  function openCartPanel(step: CheckoutStep = "cart") {
    setCheckoutStep(step);
    setMobileCartOpen(true);
  }

  function scrollToCatalog() {
    requestAnimationFrame(() => {
      document.getElementById("catalogo")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
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

    if (
      !customer.fullName ||
      !customer.phone ||
      !customer.address ||
      !customer.city
    ) {
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
      setCheckoutStep("details");
      setMobileCartOpen(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo grabar el pedido.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const checkoutSheetClassName = mobileCartOpen
    ? "order-panel checkout-sheet-open"
    : "order-panel checkout-sheet-hidden";

  return (
    <>
      <main className="shop-page" id="top">
        <header className="site-header">
          <a className="site-logo" href="#top" aria-label={settings.storeName}>
            {resolvedLogoUrl ? (
              <img src={resolvedLogoUrl} alt={settings.storeName} />
            ) : (
              <>
                <span>Diez</span>
                <span>Deportes</span>
              </>
            )}
          </a>

          <nav className="site-nav" aria-label="Principal">
            <a href="#top">Inicio</a>
            <a href="#sobre-nosotros">Sobre nosotros</a>
          </nav>

          <div className="site-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
              }
              aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
            >
              {theme === "dark" ? "Claro" : "Oscuro"}
            </button>

            <button
              type="button"
              className="site-cart-pill"
              onClick={() => openCartPanel("cart")}
              aria-label="Abrir pedido"
            >
              <span className="site-cart-count">{itemCount}</span>
              <IconCart />
            </button>

            <div className="site-socials" aria-label="Redes">
              <a
                href={ODOO_FACEBOOK_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook"
              >
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
                Explorar catalogo
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
            {normalizedBrandImages.slice(0, 6).map((image) => (
              <button
                type="button"
                className={`brand-chip ${selectedBrand === image.label ? "active" : ""}`}
                key={image.src}
                onClick={() => applyBrandFilter(image.label)}
                aria-label={`Filtrar por ${image.label}`}
                title={`Filtrar por ${image.label}`}
              >
                <img
                  src={buildImageProxyUrl(image.src) || image.src}
                  alt={image.alt}
                  loading="lazy"
                />
              </button>
            ))}
          </section>
        ) : null}

        {featuredTiles.length > 0 ? (
          <section
            className="promo-section"
            aria-label="Colecciones destacadas"
          >
            <div className="section-heading">
              <span className="section-kicker">Colecciones</span>
              <h2>Bloques destacados</h2>
            </div>

            <div className="promo-grid">
              {featuredTiles.map((tile) => (
                <button
                  type="button"
                  className={`promo-tile ${selectedAudience === tile.filterValue ? "active" : ""}`}
                  key={`${tile.src}-${tile.label}`}
                  onClick={() =>
                    applyAudienceFilter(tile.filterValue as AudienceFilter)
                  }
                >
                  <div className="promo-tile-media">
                    <img
                      src={buildImageProxyUrl(tile.src) || tile.src}
                      alt={tile.alt}
                      loading="lazy"
                    />
                  </div>
                  <div className="promo-tile-copy">
                    <strong>{tile.label}</strong>
                    <span>Filtrar catalogo</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

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
              <h3>Publico</h3>
              <div className="filter-list">
                {audienceOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`filter-chip ${selectedAudience === option.value ? "active" : ""}`}
                    onClick={() => setSelectedAudience(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {brandOptions.length > 0 ? (
              <div className="panel-block">
                <h3>Marcas</h3>
                <div className="filter-list">
                  <button
                    type="button"
                    className={`filter-chip ${selectedBrand === "all" ? "active" : ""}`}
                    onClick={() => setSelectedBrand("all")}
                  >
                    Todas
                  </button>
                  {brandOptions.map((brand) => (
                    <button
                      key={brand.label}
                      type="button"
                      className={`filter-chip ${selectedBrand === brand.label ? "active" : ""}`}
                      onClick={() => setSelectedBrand(brand.label)}
                    >
                      {brand.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="panel-block">
              <h3>Rango de precio</h3>
              <p className="panel-note">
                Desde {formatCurrency(minPrice)} hasta{" "}
                {formatCurrency(maxPrice)}
              </p>
            </div>
          </aside>

          <section className="catalog-panel">
            <div className="catalog-toolbar">
              <div>
                <h2>
                  {selectedBrand !== "all"
                    ? selectedBrand
                    : selectedAudience !== "all"
                      ? activeAudienceLabel
                      : "Todos los productos"}
                </h2>
                <p>
                  {resolvedFilteredProducts.length} resultados
                  {selectedBrand !== "all" ? ` · Marca ${selectedBrand}` : ""}
                  {selectedAudience !== "all"
                    ? ` · ${activeAudienceLabel}`
                    : ""}
                </p>
              </div>

              <label className="sort-box">
                <span>Ordenar por</span>
                <select
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(event.target.value as SortOption)
                  }
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
                  Revisa la configuracion de `.env` y la conectividad a SQL
                  Server.
                </div>
              </div>
            ) : null}

            {!loadError && resolvedFilteredProducts.length === 0 ? (
              <div className="empty-state">
                No hay productos para mostrar con los filtros actuales.
              </div>
            ) : null}

            <div className="catalog-grid">
              {resolvedFilteredProducts.map((product) => {
                const outOfStock = product.stock <= 0;
                const disableAddButton =
                  outOfStock && !settings.allowBackorders;

                return (
                  <article
                    className="catalog-card"
                    key={product.id}
                    onClick={() => openProductDetail(product)}
                    onKeyDown={(event) =>
                      handleProductCardKeyDown(event, product)
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={`Ver detalle de ${product.description}`}
                  >
                    <div className="catalog-card-media">
                      {product.imageUrl ? (
                        <img
                          src={
                            buildImageProxyUrl(product.imageUrl) ||
                            product.imageUrl
                          }
                          alt={product.description}
                          loading="lazy"
                        />
                      ) : (
                        <div className="catalog-card-placeholder">
                          {product.code.slice(0, 3)}
                        </div>
                      )}
                    </div>

                    <div className="catalog-card-body">
                      <div className="catalog-card-tags">
                        <span className="catalog-tag">Cod. {product.code}</span>
                        <span
                          className={`catalog-tag ${getStockBadgeClass(product.stock)}`}
                        >
                          Stock {product.stock.toFixed(0)}
                        </span>
                        {product.imageMode === "illustrative" ? (
                          <span className="catalog-tag image-illustrative">
                            Imagen ilustrativa
                          </span>
                        ) : null}
                      </div>

                      <h3>{product.description}</h3>

                      <p className="catalog-card-subtitle">
                        {product.presentation || product.unitId || "Unidad"}
                      </p>

                      {product.imageMode === "illustrative" &&
                      product.imageNote ? (
                        <p className="catalog-card-image-note">
                          {product.imageNote}
                        </p>
                      ) : null}

                      <div className="catalog-card-price">
                        {formatCurrency(product.price)}
                      </div>
                      <p className="catalog-card-tax">Precio s/Imp. Nac.</p>

                      <button
                        type="button"
                        className="catalog-card-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          addToCart(product);
                        }}
                        disabled={disableAddButton}
                      >
                        {disableAddButton ? "Sin stock" : "Anadir al carrito"}
                      </button>
                      <span className="catalog-card-detail-link">
                        Ver detalle
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <section className="contact-zone" id="sobre-nosotros">
          <section className="support-band" id="contacto">
            <div>
              <span className="section-kicker">Atencion personalizada</span>
              <h2>Comprometidos con tu satisfaccion</h2>
              <p>{settings.supportBlurb}</p>
            </div>

            <div className="support-band-actions">
              <a href={`tel:${settings.supportPhone.replace(/\s+/g, "")}`}>
                {settings.supportPhone}
              </a>
              <a href={`mailto:${settings.supportEmail}`}>
                {settings.supportEmail}
              </a>
              {whatsappHref ? (
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              ) : null}
            </div>
          </section>

          <section className="map-section" aria-label="Ubicacion del local">
            <div className="map-copy">
              <span className="section-kicker">Donde estamos</span>
              <h2>Visitanos en el local</h2>
              <p>{settings.storeAddress}</p>
            </div>

            <div className="map-frame">
              <iframe
                src={mapEmbedUrl}
                title="Mapa del local"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </section>

          <footer className="site-footer">
            <div className="site-footer-copy">
              <a
                className="site-logo footer-logo"
                href="#top"
                aria-label={settings.storeName}
              >
                {resolvedLogoUrl ? (
                  <img src={resolvedLogoUrl} alt={settings.storeName} />
                ) : (
                  <>
                    <span>Diez</span>
                    <span>Deportes</span>
                  </>
                )}
              </a>
              <p>{settings.storeAddress}</p>
            </div>

            <div className="site-footer-links">
              <a href={`tel:${settings.supportPhone.replace(/\s+/g, "")}`}>
                {settings.supportPhone}
              </a>
              <a href={`mailto:${settings.supportEmail}`}>
                {settings.supportEmail}
              </a>
              {whatsappHref ? (
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              ) : null}
            </div>

            <div className="site-socials footer-socials" aria-label="Redes">
              <a
                href={ODOO_FACEBOOK_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook"
              >
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
        </section>
      </main>

      {resolvedSelectedProduct ? (
        <>
          <div
            className="mobile-backdrop product-detail-backdrop"
            onClick={closeProductDetail}
          />
          <section
            className="product-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-detail-title"
          >
            <button
              type="button"
              className="product-detail-close"
              onClick={closeProductDetail}
              aria-label="Cerrar detalle del producto"
            >
              Cerrar
            </button>

            <div className="product-detail-grid">
              <div className="product-detail-media">
                {resolvedSelectedProduct.imageUrl ? (
                  <img
                    src={
                      buildImageProxyUrl(resolvedSelectedProduct.imageUrl) ||
                      resolvedSelectedProduct.imageUrl
                    }
                    alt={resolvedSelectedProduct.description}
                    loading="eager"
                  />
                ) : (
                  <div className="catalog-card-placeholder product-detail-placeholder">
                    {resolvedSelectedProduct.code.slice(0, 3)}
                  </div>
                )}
              </div>

              <div className="product-detail-copy">
                <div className="product-detail-heading">
                  <span className="section-kicker">Detalle del producto</span>
                  <h2 id="product-detail-title">
                    {resolvedSelectedProduct.description}
                  </h2>
                  <p className="product-detail-subtitle">
                    {resolvedSelectedProduct.presentation ||
                      resolvedSelectedProduct.unitId ||
                      "Unidad"}
                  </p>
                </div>

                <div className="product-detail-tags">
                  <span className="catalog-tag">
                    Cod. {resolvedSelectedProduct.code}
                  </span>
                  <span
                    className={`catalog-tag ${getStockBadgeClass(resolvedSelectedProduct.stock)}`}
                  >
                    Stock {resolvedSelectedProduct.stock.toFixed(0)}
                  </span>
                  {resolvedSelectedProduct.imageMode === "illustrative" ? (
                    <span className="catalog-tag image-illustrative">
                      Imagen ilustrativa
                    </span>
                  ) : null}
                  {resolvedSelectedProduct.barcode ? (
                    <span className="catalog-tag">
                      EAN {resolvedSelectedProduct.barcode}
                    </span>
                  ) : null}
                </div>

                <div className="product-detail-price">
                  {formatCurrency(resolvedSelectedProduct.price)}
                </div>
                <p className="catalog-card-tax">Precio s/Imp. Nac.</p>

                <div className="product-detail-specs">
                  <div className="product-detail-spec">
                    <span>Unidad</span>
                    <strong>
                      {resolvedSelectedProduct.unitId || "Unidad"}
                    </strong>
                  </div>
                  <div className="product-detail-spec">
                    <span>Presentacion</span>
                    <strong>
                      {resolvedSelectedProduct.presentation || "Estandar"}
                    </strong>
                  </div>
                  <div className="product-detail-spec">
                    <span>Moneda</span>
                    <strong>{resolvedSelectedProduct.currency}</strong>
                  </div>
                  <div className="product-detail-spec">
                    <span>IVA</span>
                    <strong>
                      {resolvedSelectedProduct.taxRate.toFixed(0)}%
                    </strong>
                  </div>
                </div>

                <p className="product-detail-note">
                  Si necesitas talle, color o mas informacion sobre este
                  articulo, escribinos por WhatsApp y te ayudamos con la
                  variante correcta.
                </p>

                {resolvedSelectedProduct.imageMode === "illustrative" &&
                resolvedSelectedProduct.imageNote ? (
                  <div className="product-detail-illustrative">
                    <p>{resolvedSelectedProduct.imageNote}</p>
                    {resolvedSelectedProduct.imageSourceUrl ? (
                      <a
                        href={resolvedSelectedProduct.imageSourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver articulo similar online
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {selectedProductCartItem ? (
                  <div className="message success product-detail-message">
                    Ya tienes {selectedProductCartItem.quantity} unidad
                    {selectedProductCartItem.quantity === 1 ? "" : "es"} en tu
                    pedido.
                  </div>
                ) : null}

                <div className="product-detail-actions">
                  <button
                    type="button"
                    className="catalog-card-button"
                    onClick={() => addToCart(resolvedSelectedProduct)}
                    disabled={
                      resolvedSelectedProduct.stock <= 0 &&
                      !settings.allowBackorders
                    }
                  >
                    {resolvedSelectedProduct.stock <= 0 &&
                    !settings.allowBackorders
                      ? "Sin stock"
                      : "Anadir al carrito"}
                  </button>
                  <button
                    type="button"
                    className="product-detail-secondary"
                    onClick={openCartFromDetail}
                  >
                    Ver pedido
                  </button>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {mobileCartOpen ? (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileCartOpen(false)}
        />
      ) : null}

      <button
        type="button"
        className="mobile-cart-button"
        onClick={() => openCartPanel("cart")}
      >
        Carrito ({itemCount})
      </button>

      <aside className={checkoutSheetClassName}>
        <CartContent
          cart={cart}
          customer={customer}
          checkoutStep={checkoutStep}
          errorMessage={errorMessage}
          itemCount={itemCount}
          onCheckoutStepChange={setCheckoutStep}
          onCheckoutSubmit={handleCheckoutSubmit}
          onClose={() => setMobileCartOpen(false)}
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
  checkoutStep: CheckoutStep;
  errorMessage: string | null;
  itemCount: number;
  onCheckoutStepChange: (step: CheckoutStep) => void;
  onCheckoutSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onClose: () => void;
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
  checkoutStep,
  errorMessage,
  itemCount,
  onCheckoutStepChange,
  onCheckoutSubmit,
  onClose,
  onCustomerChange,
  onItemQuantityChange,
  onItemRemove,
  order,
  submitting,
  subtotal,
  taxTotal,
  total,
}: CartContentProps) {
  const orderCompleted = Boolean(order) && cart.length === 0;
  const cartStepActive = checkoutStep === "cart" && !orderCompleted;
  const stepLabel = orderCompleted
    ? "Pedido confirmado"
    : cartStepActive
      ? "Paso 1 de 2"
      : "Paso 2 de 2";
  const heading = orderCompleted
    ? "Tu pedido"
    : cartStepActive
      ? "Carrito"
      : "Tu pedido";
  const subtitle = orderCompleted
    ? "Recibimos tu compra y la dejamos registrada."
    : cartStepActive
      ? `${itemCount} unidades`
      : "Completa tus datos para confirmar la compra.";

  return (
    <>
      <div className="order-panel-header">
        <div>
          <p className="checkout-step-label">{stepLabel}</p>
          <h2>{heading}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="checkout-header-actions">
          <span className="order-badge">Web</span>
          <button
            type="button"
            className="checkout-close-button"
            onClick={onClose}
            aria-label="Cerrar carrito"
          >
            X
          </button>
        </div>
      </div>

      {orderCompleted ? (
        <div className="message success">
          Pedido grabado con exito.
          <div className="message-detail">
            Comprobante:{" "}
            <strong>
              {order?.tc} {order?.idComprobante}
            </strong>
          </div>
        </div>
      ) : null}

      {cartStepActive ? null : errorMessage ? (
        <div className="message error">{errorMessage}</div>
      ) : null}

      {cartStepActive ? (
        cart.length === 0 ? (
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
                    <p>
                      {item.code} - {formatCurrency(item.price)} c/u
                    </p>
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
                    onClick={() =>
                      onItemQuantityChange(item.id, item.quantity - 1)
                    }
                  >
                    -
                  </button>
                  <strong>{item.quantity}</strong>
                  <button
                    type="button"
                    className="qty-button"
                    onClick={() =>
                      onItemQuantityChange(item.id, item.quantity + 1)
                    }
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
        )
      ) : null}

      <div className="order-summary">
        {orderCompleted ? (
          <>
            <div className="summary-row">
              <span>Articulos</span>
              <span>{order?.itemCount ?? 0}</span>
            </div>
            <div className="summary-row total">
              <span>Total confirmado</span>
              <strong>{formatCurrency(order?.total ?? 0)}</strong>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {cartStepActive ? (
        <div className="checkout-actions">
          <button
            type="button"
            className="checkout-secondary-button"
            onClick={onClose}
          >
            Seguir viendo productos
          </button>
          <button
            type="button"
            className="submit-order-button"
            onClick={() => onCheckoutStepChange("details")}
            disabled={cart.length === 0}
          >
            Continuar compra
          </button>
        </div>
      ) : orderCompleted ? (
        <div className="checkout-success-actions">
          <button
            type="button"
            className="checkout-secondary-button"
            onClick={onClose}
          >
            Seguir comprando
          </button>
        </div>
      ) : (
        <>
          <div className="checkout-step-summary">
            <div>
              <strong>{itemCount} unidades listas para confirmar</strong>
              <p>Revisa tus datos y completa el pedido.</p>
            </div>
            <button
              type="button"
              className="checkout-secondary-button"
              onClick={() => onCheckoutStepChange("cart")}
            >
              Editar carrito
            </button>
          </div>

          <form className="checkout-form" onSubmit={onCheckoutSubmit}>
            <div className="checkout-grid">
              <div className="field span-2">
                <label htmlFor="fullName">Nombre y apellido</label>
                <input
                  id="fullName"
                  value={customer.fullName}
                  onChange={(event) =>
                    onCustomerChange("fullName", event.target.value)
                  }
                  placeholder="Quien recibe el pedido"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="phone">Telefono</label>
                <input
                  id="phone"
                  value={customer.phone}
                  onChange={(event) =>
                    onCustomerChange("phone", event.target.value)
                  }
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
                  onChange={(event) =>
                    onCustomerChange("email", event.target.value)
                  }
                  placeholder="correo@cliente.com"
                />
              </div>

              <div className="field span-2">
                <label htmlFor="address">Direccion</label>
                <input
                  id="address"
                  value={customer.address}
                  onChange={(event) =>
                    onCustomerChange("address", event.target.value)
                  }
                  placeholder="Calle, altura y referencias"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="city">Localidad</label>
                <input
                  id="city"
                  value={customer.city}
                  onChange={(event) =>
                    onCustomerChange("city", event.target.value)
                  }
                  placeholder="Ciudad"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="province">Provincia</label>
                <input
                  id="province"
                  value={customer.province}
                  onChange={(event) =>
                    onCustomerChange("province", event.target.value)
                  }
                  placeholder="Provincia"
                />
              </div>

              <div className="field">
                <label htmlFor="postalCode">Codigo postal</label>
                <input
                  id="postalCode"
                  value={customer.postalCode}
                  onChange={(event) =>
                    onCustomerChange("postalCode", event.target.value)
                  }
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
                  onChange={(event) =>
                    onCustomerChange("notes", event.target.value)
                  }
                  placeholder="Horario de entrega, talle, color o cualquier observacion"
                />
              </div>
            </div>

            <div className="checkout-actions">
              <button
                type="button"
                className="checkout-secondary-button"
                onClick={() => onCheckoutStepChange("cart")}
              >
                Volver al carrito
              </button>
              <button
                type="submit"
                className="submit-order-button"
                disabled={submitting || cart.length === 0}
              >
                {submitting ? "Grabando pedido..." : "Confirmar pedido"}
              </button>
            </div>
          </form>
        </>
      )}
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

function buildMapEmbedUrl(address: string) {
  const encodedAddress = encodeURIComponent(address.trim());
  return `https://maps.google.com/maps?q=${encodedAddress}&t=m&z=18&ie=UTF8&iwloc=&output=embed`;
}

function getPromoDefinition(href: string, index: number) {
  if (/attribute_values=13-102/i.test(href)) {
    return { label: "Kids", filterValue: "ninez" as AudienceFilter };
  }

  if (/attribute_values=13-99/i.test(href)) {
    return { label: "Mujeres", filterValue: "mujeres" as AudienceFilter };
  }

  if (/attribute_values=13-98/i.test(href)) {
    return { label: "Hombres", filterValue: "hombres" as AudienceFilter };
  }

  const fallbacks = [
    { label: "Kids", filterValue: "ninez" as AudienceFilter },
    { label: "Mujeres", filterValue: "mujeres" as AudienceFilter },
    { label: "Hombres", filterValue: "hombres" as AudienceFilter },
  ];

  return (
    fallbacks[index] || {
      label: "Destacado",
      filterValue: "all" as AudienceFilter,
    }
  );
}

function getPromoImageOverride(href: string) {
  if (/attribute_values=13-102/i.test(href)) {
    return "/promos/promo-kids.png";
  }

  if (/attribute_values=13-99/i.test(href)) {
    return "/promos/promo-mujeres.png";
  }

  if (/attribute_values=13-98/i.test(href)) {
    return "/promos/promo-hombres.png";
  }

  return null;
}

function normalizeFilterValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesAudienceFilter(
  normalizedDescription: string,
  audience: AudienceFilter,
) {
  if (audience === "all") {
    return true;
  }

  const haystack = ` ${normalizedDescription} `;
  const audienceKeywords: Record<Exclude<AudienceFilter, "all">, string[]> = {
    hombres: [" men ", " hombre ", " masculino ", " caballero "],
    mujeres: [" women ", " mujer ", " femenino ", " dama ", " lady "],
    ninez: [
      " nino ",
      " nina ",
      " kids ",
      " kid ",
      " junior ",
      " infantil ",
      " jr ",
    ],
  };

  return audienceKeywords[audience].some((keyword) =>
    haystack.includes(keyword),
  );
}

function matchesBrandFilter(
  normalizedDescription: string,
  normalizedCode: string,
  aliases: string[],
) {
  if (aliases.length === 0) {
    return true;
  }

  return aliases.some((alias) => {
    const normalizedAlias = normalizeFilterValue(alias);
    return (
      normalizedDescription.includes(normalizedAlias) ||
      normalizedCode.includes(normalizedAlias)
    );
  });
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
