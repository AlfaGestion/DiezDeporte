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
import {
  LOCAL_STORE_LOGO_DARK_URL,
  LOCAL_STORE_LOGO_URL,
} from "@/lib/site-assets";
import type {
  BrandImage,
  CartItem,
  CheckoutCustomer,
  CreateOrderPayload,
  OrderSummary,
  PaymentPreferenceResponse,
  Product,
  PromoTile,
  PublicStoreSettings,
} from "@/lib/types";

const LOCAL_STORAGE_CART_KEY = "diezdeportes-cart";
const LOCAL_STORAGE_THEME_KEY = "diezdeportes-theme";
const LOCAL_STORAGE_WEB_IMAGE_KEY = "diezdeportes-web-images";
const VARIANT_LABEL_COLLATOR = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});
const AUDIENCE_DISPLAY_ORDER: AudienceFilter[] = [
  "mujeres",
  "hombres",
  "ninez",
];
const APPAREL_SIZE_ORDER = [
  "xxxs",
  "xxs",
  "xs",
  "s",
  "m",
  "l",
  "xl",
  "xxl",
  "xxxl",
];

type SortOption = "featured" | "name-asc" | "price-asc" | "price-desc";
type ThemeMode = "light" | "dark";
type AudienceFilter = "all" | "ninez" | "mujeres" | "hombres";
type CheckoutStep = "cart" | "delivery" | "details" | "payment";

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
  imageNote: string | null;
  imageSourceUrl: string | null;
};

type ProductGroup = {
  parentCode: string;
  parentProduct: Product | null;
  catalogProduct: Product;
  children: Product[];
  members: Product[];
  groupStock: number;
};

type GroupCartSummary = {
  quantity: number;
  total: number;
};

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const raw = await response.text();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("El servidor devolvio una respuesta invalida. Reintenta en unos segundos.");
  }
}

function isPickupDeliveryMethod(value: string) {
  return value.trim().toLowerCase() !== "envio a domicilio";
}

function buildEmptyCustomer(settings: PublicStoreSettings): CheckoutCustomer {
  return {
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
    paymentMethod: settings.mercadoPagoEnabled
      ? "Mercado Pago"
      : "Pedido directo",
  };
}

function getCheckoutValidationMessage(params: {
  customer: CheckoutCustomer;
  allowPickupCheckoutWithoutAddress: boolean;
  mercadoPagoEnabled: boolean;
}) {
  const { customer, allowPickupCheckoutWithoutAddress, mercadoPagoEnabled } =
    params;
  const pickupOrder = isPickupDeliveryMethod(customer.deliveryMethod);
  const requiresShippingAddress =
    !pickupOrder || !allowPickupCheckoutWithoutAddress;

  if (
    !customer.fullName ||
    !customer.email ||
    !customer.phone ||
    (requiresShippingAddress && !customer.address) ||
    (requiresShippingAddress && !customer.city)
  ) {
    if (mercadoPagoEnabled) {
      return requiresShippingAddress
        ? "Completa nombre, email, telefono, direccion y localidad para iniciar el pago."
        : "Completa nombre, email y telefono para iniciar el pago.";
    }

    return requiresShippingAddress
      ? "Completa nombre, email, telefono, direccion y localidad para registrar el pedido."
      : "Completa nombre, email y telefono para registrar el pedido.";
  }

  return null;
}

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
  const [selectedFamily, setSelectedFamily] = useState("all");
  const [selectedAudience, setSelectedAudience] =
    useState<AudienceFilter>("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [familiesOpen, setFamiliesOpen] = useState(true);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(true);
  const [selectedMinPrice, setSelectedMinPrice] = useState<number | null>(null);
  const [selectedMaxPrice, setSelectedMaxPrice] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<CheckoutCustomer>(() =>
    buildEmptyCustomer(settings),
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("cart");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const [detailQuantity, setDetailQuantity] = useState(1);
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
    document.body.dataset.theme = theme;
    document.body.style.colorScheme = theme;
    window.localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (cart.length === 0) {
      setCheckoutStep("cart");
    }
  }, [cart.length]);

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

  const resolvedInitialProducts = initialProducts.map(resolveProductImage);
  const productGroups = buildProductGroups(resolvedInitialProducts);
  const families = Array.from(
    new Set(
      productGroups
        .map((group) => group.catalogProduct.familyId.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const prices = productGroups.map((group) => group.catalogProduct.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const effectiveMinPrice = selectedMinPrice ?? minPrice;
  const effectiveMaxPrice = selectedMaxPrice ?? maxPrice;
  const priceRangeIsFlat = maxPrice <= minPrice;
  const priceRangeSpan = priceRangeIsFlat ? 1 : maxPrice - minPrice;
  const minPricePercent = priceRangeIsFlat
    ? 0
    : ((effectiveMinPrice - minPrice) / priceRangeSpan) * 100;
  const maxPricePercent = priceRangeIsFlat
    ? 100
    : ((effectiveMaxPrice - minPrice) / priceRangeSpan) * 100;

  useEffect(() => {
    setSelectedMinPrice(minPrice);
    setSelectedMaxPrice(maxPrice);
  }, [minPrice, maxPrice]);

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
  const normalizedSearch = normalizeFilterValue(search);
  const filteredProductGroups = productGroups
    .filter((group) => {
      const matchesSearch =
        normalizedSearch === "" ||
        group.members.some((product) => {
          const normalizedDescription = normalizeFilterValue(
            product.description,
          );
          const normalizedCode = normalizeFilterValue(product.code);

          return (
            normalizedDescription.includes(normalizedSearch) ||
            normalizedCode.includes(normalizedSearch)
          );
        });

      const matchesFamily =
        selectedFamily === "all" ||
        group.members.some(
          (product) => product.familyId.trim() === selectedFamily,
        );

      const matchesAudience = group.members.some((product) =>
        matchesAudienceFilter(
          normalizeFilterValue(product.description),
          selectedAudience,
        ),
      );
      const matchesBrand = group.members.some((product) =>
        matchesBrandFilter(
          normalizeFilterValue(product.description),
          normalizeFilterValue(product.code),
          activeBrand?.aliases || [],
        ),
      );
      const matchesPrice =
        group.catalogProduct.price >= effectiveMinPrice &&
        group.catalogProduct.price <= effectiveMaxPrice;

      if (
        !matchesSearch ||
        !matchesFamily ||
        !matchesAudience ||
        !matchesBrand ||
        !matchesPrice
      ) {
        return false;
      }

      if (settings.showOutOfStock) {
        return true;
      }

      return group.groupStock > 0;
    })
    .sort((left, right) => {
      const leftProduct = left.catalogProduct;
      const rightProduct = right.catalogProduct;

      if (sortBy === "name-asc") {
        return leftProduct.description.localeCompare(rightProduct.description);
      }

      if (sortBy === "price-asc") {
        return leftProduct.price - rightProduct.price;
      }

      if (sortBy === "price-desc") {
        return rightProduct.price - leftProduct.price;
      }

      return (
        right.groupStock - left.groupStock ||
        leftProduct.description.localeCompare(rightProduct.description)
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
  const rawLogoUrl = logoUrl || settings.logoUrl;
  const resolvedLogoUrl =
    rawLogoUrl === LOCAL_STORE_LOGO_URL
      ? theme === "dark"
        ? LOCAL_STORE_LOGO_URL
        : LOCAL_STORE_LOGO_DARK_URL
      : buildImageProxyUrl(rawLogoUrl);
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
          .sort(
            (left, right) =>
              getAudienceDisplayOrder(left.filterValue as AudienceFilter) -
              getAudienceDisplayOrder(right.filterValue as AudienceFilter),
          )
      : [];

  const featuredTiles =
    normalizedPromoTiles.length > 0
      ? normalizedPromoTiles
      : productGroups
          .map((group) => group.catalogProduct)
          .filter((product) => Boolean(product.imageUrl))
          .slice(0, 3)
          .map((product, index) => ({
            src: product.imageUrl || "",
            href: "#catalogo",
            alt: product.description,
            label: ["Mujeres", "Hombres", "Kids"][index] || "Destacado",
            filterValue: (["mujeres", "hombres", "ninez"][index] ||
              "all") as AudienceFilter,
          }));
  const audienceOptions: Array<{ value: AudienceFilter; label: string }> = [
    { value: "all", label: "Todo" },
    { value: "mujeres", label: "Mujeres" },
    { value: "hombres", label: "Hombres" },
    { value: "ninez", label: "Kids" },
  ];
  const activeAudienceLabel =
    audienceOptions.find((option) => option.value === selectedAudience)
      ?.label || "Todo";
  const selectedProductGroup = selectedProduct
    ? productGroups.find(
        (group) =>
          group.parentCode === getParentProductCode(selectedProduct.code),
      ) || null
    : null;
  const selectedDetailProduct = selectedProductGroup
    ? selectedProductGroup.members.find(
        (product) => product.id === selectedVariantId,
      ) || getDefaultSelectableProduct(selectedProductGroup)
    : null;
  const selectedProductCartItem = selectedDetailProduct
    ? cart.find((item) => item.id === selectedDetailProduct.id) || null
    : null;
  const cartSummaryByParentCode = cart.reduce<
    Record<string, GroupCartSummary>
  >((summary, item) => {
    const parentCode = getParentProductCode(item.code);
    const current = summary[parentCode] || { quantity: 0, total: 0 };

    current.quantity += item.quantity;
    current.total += item.price * item.quantity;
    summary[parentCode] = current;

    return summary;
  }, {});

  useEffect(() => {
    const candidates = filteredProductGroups
      .map((group) => group.catalogProduct)
      .filter(shouldAttemptWebImageSearch)
      .slice(0, 12);

    if (selectedDetailProduct && shouldAttemptWebImageSearch(selectedDetailProduct)) {
      candidates.unshift(selectedDetailProduct);
    }

    if (selectedProductGroup) {
      candidates.push(
        ...selectedProductGroup.children
          .filter(shouldAttemptWebImageSearch)
          .slice(0, 8),
      );
    }

    const uniqueCandidates = Array.from(
      new Map(candidates.map((product) => [product.id, product])).values(),
    );

    uniqueCandidates.forEach((product) => {
      void fetchWebImageForProduct(product);
    });
  }, [filteredProductGroups, selectedDetailProduct, selectedProductGroup]);

  useEffect(() => {
    if (!selectedProductGroup) {
      setSelectedVariantId(null);
      return;
    }

    setSelectedVariantId((current) => {
      if (
        current &&
        selectedProductGroup.members.some((product) => product.id === current)
      ) {
        return current;
      }

      return getDefaultSelectableProduct(selectedProductGroup)?.id ?? null;
    });
  }, [selectedProductGroup]);

  useEffect(() => {
    setDetailQuantity(1);
  }, [selectedDetailProduct?.id]);

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

  function addToCart(product: Product, quantity = 1) {
    setErrorMessage(null);
    setSuccessMessage(null);

    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.id === product.id);
      const requestedQuantity = Math.max(1, Math.floor(quantity));
      const stockLimit = Math.max(0, Math.floor(product.stock));
      const maxQuantity = settings.allowBackorders
        ? requestedQuantity
        : Math.max(1, stockLimit);

      if (!existing) {
        return [
          ...currentCart,
          {
            ...toCartItem(product),
            quantity: settings.allowBackorders
              ? requestedQuantity
              : Math.min(requestedQuantity, maxQuantity),
          },
        ];
      }

      return currentCart.map((item) => {
        if (item.id !== product.id) return item;

        const maxAllowedQuantity = settings.allowBackorders
          ? item.quantity + requestedQuantity
          : Math.max(1, Math.floor(product.stock));
        const nextQuantity = Math.min(
          item.quantity + requestedQuantity,
          maxAllowedQuantity,
        );

        return { ...item, quantity: nextQuantity };
      });
    });
  }

  function openProductDetail(product: Product) {
    setSelectedProduct(product);
    setSelectedVariantId(null);
  }

  function closeProductDetail() {
    setSelectedProduct(null);
    setSelectedVariantId(null);
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

  function updateDetailQuantity(nextQuantity: number) {
    if (!selectedDetailProduct) return;

    const maxQuantity = settings.allowBackorders
      ? Math.max(1, nextQuantity)
      : Math.max(1, Math.floor(selectedDetailProduct.stock));

    setDetailQuantity(Math.max(1, Math.min(nextQuantity, maxQuantity)));
  }

  function handleDetailAddToCart() {
    if (!selectedDetailProduct) return;

    addToCart(selectedDetailProduct, detailQuantity);
    setDetailQuantity(1);
  }

  function removeFromCart(productId: string) {
    setSuccessMessage(null);
    setCart((currentCart) =>
      currentCart.filter((item) => item.id !== productId),
    );
  }

  function updateItemQuantity(productId: string, nextQuantity: number) {
    if (nextQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setSuccessMessage(null);
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
    setSuccessMessage(null);
    setErrorMessage(null);
    setCustomer((current) => {
      if (field === "deliveryMethod") {
        const pickupSelected = isPickupDeliveryMethod(value);

        return {
          ...current,
          [field]: value,
          paymentMethod:
            pickupSelected
              ? "Pago en local"
              : settings.mercadoPagoEnabled
                ? "Mercado Pago"
                : "Pedido directo",
        };
      }

      return { ...current, [field]: value };
    });
  }

  function openCartPanel(step: CheckoutStep = "cart") {
    setCheckoutStep(step);
    setMobileCartOpen(true);
  }

  function openCheckoutFromSummary() {
    if (cart.length === 0) {
      openCartPanel("cart");
      return;
    }

    openCartPanel("delivery");
  }

  function goToCheckoutStep(step: CheckoutStep) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setCheckoutStep(step);
  }

  function handleContinueToPayment() {
    const validationError = getCheckoutValidationMessage({
      customer,
      allowPickupCheckoutWithoutAddress: settings.allowPickupCheckoutWithoutAddress,
      mercadoPagoEnabled: settings.mercadoPagoEnabled,
    });

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setCheckoutStep("payment");
  }

  function scrollToCatalog() {
    requestAnimationFrame(() => {
      document.getElementById("catalogo")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function submitCheckout() {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (cart.length === 0) {
      setErrorMessage("Agrega al menos un producto antes de enviar el pedido.");
      return;
    }

    const validationError = getCheckoutValidationMessage({
      customer,
      allowPickupCheckoutWithoutAddress: settings.allowPickupCheckoutWithoutAddress,
      mercadoPagoEnabled: settings.mercadoPagoEnabled,
    });

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const payload: CreateOrderPayload = {
      customer,
      items: cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        unitPrice: item.price,
      })),
    };

    setSubmitting(true);

    try {
      const pickupOrder = isPickupDeliveryMethod(customer.deliveryMethod);
      const shouldUseMercadoPago =
        settings.mercadoPagoEnabled &&
        (!pickupOrder || customer.paymentMethod.trim() === "Mercado Pago");

      if (shouldUseMercadoPago) {
        const response = await fetch("/api/payments/preference", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const result = (await readJsonResponse<{
          error?: string;
          preference?: PaymentPreferenceResponse;
        }>(response)) || null;

        if (!response.ok || !result?.preference) {
          throw new Error(result?.error || "No se pudo iniciar el pago.");
        }

        window.location.assign(result.preference.checkoutUrl);
        return;
      }

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await readJsonResponse<{
        error?: string;
        order?: OrderSummary;
      }>(response)) || null;

      if (!response.ok || !result?.order) {
        throw new Error(result?.error || "No se pudo registrar el pedido.");
      }

      setCart([]);
      setCustomer(buildEmptyCustomer(settings));
      setCheckoutStep("cart");
      setMobileCartOpen(false);
      setSuccessMessage(
        `Pedido ${result.order.tc} ${result.order.idComprobante} grabado correctamente.`,
      );
      window.localStorage.removeItem(LOCAL_STORAGE_CART_KEY);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : settings.mercadoPagoEnabled &&
              !isPickupDeliveryMethod(customer.deliveryMethod)
            ? "No se pudo iniciar el pago."
            : "No se pudo registrar el pedido.",
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
              <img
                src={resolvedLogoUrl}
                alt={settings.storeName}
                width={351}
                height={141}
                fetchPriority="high"
              />
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
              {settings.facebookUrl ? (
                <a
                  href={settings.facebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                >
                  <IconFacebook />
                </a>
              ) : null}
              {settings.instagramUrl ? (
                <a
                  href={settings.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                >
                  <IconInstagram />
                </a>
              ) : null}
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
            <h1>{settings.storeName}</h1>
            <p>{settings.welcomeMessage || settings.storeTagline}</p>

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
            <div className="catalog-summary" aria-label="Resumen del pedido">
              <div className="catalog-summary-title">En tu pedido</div>
              <div className="catalog-summary-item">
                <span>Cantidad</span>
                <strong>{itemCount}</strong>
              </div>
              <div className="catalog-summary-item">
                <span>Total</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
              <button
                type="button"
                className="submit-order-button catalog-summary-button"
                onClick={openCheckoutFromSummary}
                disabled={cart.length === 0}
              >
                Continuar compra
              </button>
            </div>

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
              <button
                type="button"
                className="filter-section-toggle"
                onClick={() => setFamiliesOpen((current) => !current)}
                aria-expanded={familiesOpen}
              >
                <span>Categorias</span>
                <span className="filter-section-chevron" aria-hidden="true" />
              </button>
              {familiesOpen ? (
                <div className="filter-section-content">
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
              ) : null}
            </div>

            <div className="panel-block">
              <button
                type="button"
                className="filter-section-toggle"
                onClick={() => setAudienceOpen((current) => !current)}
                aria-expanded={audienceOpen}
              >
                <span>Publico</span>
                <span className="filter-section-chevron" aria-hidden="true" />
              </button>
              {audienceOpen ? (
                <div className="filter-section-content">
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
              ) : null}
            </div>

            {brandOptions.length > 0 ? (
              <div className="panel-block">
                <button
                  type="button"
                  className="filter-section-toggle"
                  onClick={() => setBrandsOpen((current) => !current)}
                  aria-expanded={brandsOpen}
                >
                  <span>Marcas</span>
                  <span className="filter-section-chevron" aria-hidden="true" />
                </button>
                {brandsOpen ? (
                  <div className="filter-section-content">
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
              </div>
            ) : null}

            <div className="panel-block">
              <button
                type="button"
                className="filter-section-toggle"
                onClick={() => setPriceOpen((current) => !current)}
                aria-expanded={priceOpen}
              >
                <span>Rango de precio</span>
                <span className="filter-section-chevron" aria-hidden="true" />
              </button>
              {priceOpen ? (
                <div className="filter-section-content">
                  <div className="price-range-values" aria-label="Valores de precio">
                    <strong>{formatCurrency(effectiveMinPrice)}</strong>
                    <strong>{formatCurrency(effectiveMaxPrice)}</strong>
                  </div>
                  <div className="price-range-slider">
                    <div className="price-range-track" />
                    <div
                      className="price-range-track-active"
                      style={{
                        left: `${minPricePercent}%`,
                        width: `${Math.max(maxPricePercent - minPricePercent, 0)}%`,
                      }}
                    />
                    <input
                      type="range"
                      min={minPrice}
                      max={maxPrice}
                      step="any"
                      value={effectiveMinPrice}
                      className="price-range-input min"
                      onChange={(event) =>
                        setSelectedMinPrice(
                          Math.min(Number(event.target.value), effectiveMaxPrice),
                        )
                      }
                      disabled={priceRangeIsFlat}
                      aria-label="Precio minimo"
                    />
                    <input
                      type="range"
                      min={minPrice}
                      max={maxPrice}
                      step="any"
                      value={effectiveMaxPrice}
                      className="price-range-input max"
                      onChange={(event) =>
                        setSelectedMaxPrice(
                          Math.max(Number(event.target.value), effectiveMinPrice),
                        )
                      }
                      disabled={priceRangeIsFlat}
                      aria-label="Precio maximo"
                    />
                  </div>
                </div>
              ) : null}
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
                  {filteredProductGroups.length} resultados
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

            {!loadError && filteredProductGroups.length === 0 ? (
              <div className="empty-state">
                No hay productos para mostrar con los filtros actuales.
              </div>
            ) : null}

            <div className="catalog-grid">
              {filteredProductGroups.map((group) => {
                const product = group.catalogProduct;
                const hasVariants = group.children.length > 0;
                const variantPreview = group.children.slice(0, 4);
                const hiddenVariantCount = Math.max(
                  0,
                  group.children.length - variantPreview.length,
                );
                const outOfStock = group.groupStock <= 0;
                const disableAddButton =
                  !hasVariants && outOfStock && !settings.allowBackorders;
                const cartSummary = cartSummaryByParentCode[group.parentCode];

                return (
                  <article
                    className="catalog-card"
                    key={group.parentCode}
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
                            buildImageProxyUrl(product.imageUrl, {
                              transparentBackground: true,
                            }) ||
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
                          className={`catalog-tag ${getStockBadgeClass(group.groupStock)}`}
                        >
                          Stock {group.groupStock.toFixed(0)}
                        </span>
                        {product.imageMode === "illustrative" ? (
                          <span className="catalog-tag image-illustrative">
                            Imagen ilustrativa
                          </span>
                        ) : null}
                        {hasVariants ? (
                          <span className="catalog-tag">
                            {group.children.length} variantes
                          </span>
                        ) : null}
                      </div>

                      <h3>{product.description}</h3>

                      <p className="catalog-card-subtitle">
                        {hasVariants
                          ? "Selecciona variante en el detalle"
                          : product.defaultSize ||
                            product.presentation ||
                            product.unitId ||
                            "Unidad"}
                      </p>

                      {hasVariants ? (
                        <div className="catalog-card-variant-preview">
                          {variantPreview.map((variant) => (
                            <span
                              className="catalog-variant-chip"
                              key={variant.id}
                            >
                              {getVariantLabel(variant)}
                            </span>
                          ))}
                          {hiddenVariantCount > 0 ? (
                            <span className="catalog-variant-chip more">
                              +{hiddenVariantCount}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="catalog-card-price">
                        {formatCurrency(product.price)}
                      </div>
                      <p className="catalog-card-tax">Precio s/Imp. Nac.</p>
                      {cartSummary ? (
                        <div className="catalog-card-cart-status">
                          <span>
                            Ya tienes {cartSummary.quantity} unidad
                            {cartSummary.quantity === 1 ? "" : "es"}
                          </span>
                          <strong>
                            Total {formatCurrency(cartSummary.total)}
                          </strong>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        className="catalog-card-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (hasVariants) {
                            openProductDetail(product);
                            return;
                          }

                          addToCart(product);
                        }}
                        disabled={disableAddButton}
                      >
                        {hasVariants
                          ? "Ver talles"
                          : disableAddButton
                            ? "Sin stock"
                            : "Anadir al carrito"}
                      </button>
                      <span className="catalog-card-detail-link">
                        {hasVariants ? "Elegir talle" : "Ver detalle"}
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
              {settings.storeHours ? <p>{settings.storeHours}</p> : null}
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
              {settings.storeHours ? <p>{settings.storeHours}</p> : null}
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
                  <img
                    src={resolvedLogoUrl}
                    alt={settings.storeName}
                    width={351}
                    height={141}
                  />
                ) : (
                  <>
                    <span>Diez</span>
                    <span>Deportes</span>
                  </>
                )}
              </a>
              <p>{settings.storeAddress}</p>
              {settings.storeHours ? <p>{settings.storeHours}</p> : null}
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
              {settings.facebookUrl ? (
                <a
                  href={settings.facebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                >
                  <IconFacebook />
                </a>
              ) : null}
              {settings.instagramUrl ? (
                <a
                  href={settings.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                >
                  <IconInstagram />
                </a>
              ) : null}
            </div>
          </footer>
        </section>
      </main>

      {selectedDetailProduct ? (
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
              X
            </button>

            <div className="product-detail-layout">
              <div className="product-detail-top">
                <div
                  className="product-detail-media"
                  key={selectedDetailProduct.id}
                >
                  {selectedDetailProduct.imageUrl ? (
                    <img
                      src={
                        buildImageProxyUrl(selectedDetailProduct.imageUrl, {
                          transparentBackground: true,
                        }) ||
                        selectedDetailProduct.imageUrl
                      }
                      alt={selectedDetailProduct.description}
                      loading="eager"
                    />
                  ) : (
                    <div className="catalog-card-placeholder product-detail-placeholder">
                      {selectedDetailProduct.code.slice(0, 3)}
                    </div>
                  )}
                </div>

                <div className="product-detail-summary">
                  <div className="product-detail-copy">
                    <div className="product-detail-heading">
                      <span className="section-kicker">Detalle del producto</span>
                      <h2 id="product-detail-title">
                        {selectedProductGroup?.catalogProduct.description ||
                          selectedDetailProduct.description}
                      </h2>
                      <p className="product-detail-subtitle">
                        {selectedProductGroup &&
                        selectedProductGroup.children.length > 0
                          ? `Talle ${getVariantLabel(selectedDetailProduct)}`
                          : selectedDetailProduct.defaultSize ||
                            selectedDetailProduct.presentation ||
                            selectedDetailProduct.unitId ||
                            "Unidad"}
                      </p>
                    </div>

                    <div className="product-detail-tags">
                      <span
                        className={`catalog-tag ${getStockBadgeClass(selectedDetailProduct.stock)}`}
                      >
                        Stock {selectedDetailProduct.stock.toFixed(0)}
                      </span>
                      {selectedDetailProduct.imageMode === "illustrative" ? (
                        <span className="catalog-tag image-illustrative">
                          Imagen ilustrativa
                        </span>
                      ) : null}
                      {selectedDetailProduct.barcode ? (
                        <span className="catalog-tag">
                          EAN {selectedDetailProduct.barcode}
                        </span>
                      ) : null}
                    </div>

                    <div className="product-detail-price-block">
                      <div className="product-detail-price">
                        {formatCurrency(selectedDetailProduct.price)}
                      </div>
                      <p className="catalog-card-tax">Precio s/Imp. Nac.</p>
                    </div>

                    <p className="product-detail-note">
                      {selectedProductGroup &&
                      selectedProductGroup.children.length > 0
                        ? "Selecciona el talle correcto antes de agregar el articulo al pedido."
                        : "Si necesitas talle, color o mas informacion sobre este articulo, escribinos por WhatsApp y te ayudamos con la variante correcta."}
                    </p>

                    {selectedProductCartItem ? (
                      <div className="message success product-detail-message">
                        Ya tienes {selectedProductCartItem.quantity} unidad
                        {selectedProductCartItem.quantity === 1 ? "" : "es"} en
                        tu pedido.
                      </div>
                    ) : null}

                    <div className="product-detail-actions">
                      <div
                        className="product-detail-quantity"
                        aria-label={`Cantidad de ${selectedDetailProduct.description}`}
                      >
                        <span className="product-detail-quantity-label">
                          {selectedDetailProduct.description}
                        </span>
                        <div className="product-detail-quantity-controls">
                          <button
                            type="button"
                            className="qty-button"
                            onClick={() =>
                              updateDetailQuantity(detailQuantity - 1)
                            }
                            disabled={detailQuantity <= 1}
                            aria-label="Quitar una unidad"
                          >
                            -
                          </button>
                          <strong>{detailQuantity}</strong>
                          <button
                            type="button"
                            className="qty-button"
                            onClick={() =>
                              updateDetailQuantity(detailQuantity + 1)
                            }
                            disabled={
                              !settings.allowBackorders &&
                              detailQuantity >=
                                Math.max(
                                  1,
                                  Math.floor(selectedDetailProduct.stock),
                                )
                            }
                            aria-label="Agregar una unidad"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="product-detail-pricing">
                        <span>
                          Unitario{" "}
                          <strong>
                            {formatCurrency(selectedDetailProduct.price)}
                          </strong>
                        </span>
                        <span>
                          Total{" "}
                          <strong>
                            {formatCurrency(
                              selectedDetailProduct.price * detailQuantity,
                            )}
                          </strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="catalog-card-button"
                        onClick={handleDetailAddToCart}
                        disabled={
                          selectedDetailProduct.stock <= 0 &&
                          !settings.allowBackorders
                        }
                      >
                        {selectedDetailProduct.stock <= 0 &&
                        !settings.allowBackorders
                          ? "Sin stock"
                          : "Anadir al carrito"}
                      </button>
                      <button
                        type="button"
                        className="product-detail-secondary"
                        onClick={closeProductDetail}
                      >
                        Seguir comprando
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
              </div>

              {selectedProductGroup &&
              selectedProductGroup.children.length > 0 ? (
                <div className="product-variant-section">
                  <div className="product-variant-header">
                    <span>Talles disponibles</span>
                    <strong>{selectedProductGroup.children.length}</strong>
                  </div>
                  <div className="product-variant-grid">
                    {selectedProductGroup.children.map((variant) => {
                      const isActive = selectedDetailProduct.id === variant.id;
                      const variantOutOfStock =
                        variant.stock <= 0 && !settings.allowBackorders;

                      return (
                        <button
                          type="button"
                          key={variant.id}
                          className={`product-variant-option ${isActive ? "active" : ""}`}
                          onClick={() => setSelectedVariantId(variant.id)}
                        >
                          <strong>{getVariantLabel(variant)}</strong>
                          <small>
                            {variantOutOfStock
                              ? "Sin stock"
                              : `Stock ${variant.stock.toFixed(0)}`}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

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
          allowPickupCheckoutWithoutAddress={
            settings.allowPickupCheckoutWithoutAddress
          }
          customer={customer}
          checkoutStep={checkoutStep}
          errorMessage={errorMessage}
          itemCount={itemCount}
          mercadoPagoEnabled={settings.mercadoPagoEnabled}
          onAdvanceToPayment={handleContinueToPayment}
          onCheckoutStepChange={goToCheckoutStep}
          onCheckoutSubmit={submitCheckout}
          onClose={() => setMobileCartOpen(false)}
          onCustomerChange={updateCustomerField}
          onItemQuantityChange={updateItemQuantity}
          onItemRemove={removeFromCart}
          submitting={submitting}
          storeAddress={settings.storeAddress}
          successMessage={successMessage}
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
  allowPickupCheckoutWithoutAddress: boolean;
  customer: CheckoutCustomer;
  checkoutStep: CheckoutStep;
  errorMessage: string | null;
  itemCount: number;
  mercadoPagoEnabled: boolean;
  onAdvanceToPayment: () => void;
  onCheckoutStepChange: (step: CheckoutStep) => void;
  onCheckoutSubmit: () => Promise<void>;
  onClose: () => void;
  onCustomerChange: (field: keyof CheckoutCustomer, value: string) => void;
  onItemQuantityChange: (productId: string, quantity: number) => void;
  onItemRemove: (productId: string) => void;
  submitting: boolean;
  storeAddress: string;
  successMessage: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
};

function CartContent({
  cart,
  allowPickupCheckoutWithoutAddress,
  customer,
  checkoutStep,
  errorMessage,
  itemCount,
  mercadoPagoEnabled,
  onAdvanceToPayment,
  onCheckoutStepChange,
  onCheckoutSubmit,
  onClose,
  onCustomerChange,
  onItemQuantityChange,
  onItemRemove,
  submitting,
  storeAddress,
  successMessage,
  subtotal,
  taxTotal,
  total,
}: CartContentProps) {
  const cartStepActive = checkoutStep === "cart";
  const deliveryStepActive = checkoutStep === "delivery";
  const detailsStepActive = checkoutStep === "details";
  const paymentStepActive = checkoutStep === "payment";
  const pickupOrder = isPickupDeliveryMethod(customer.deliveryMethod);
  const shouldUseMercadoPago =
    mercadoPagoEnabled &&
    (!pickupOrder || customer.paymentMethod.trim() === "Mercado Pago");
  const requiresShippingAddress =
    !pickupOrder || !allowPickupCheckoutWithoutAddress;
  const checkoutSteps: Array<{
    id: CheckoutStep;
    label: string;
    title: string;
    subtitle: string;
    progressTitle: string;
  }> = [
    {
      id: "cart",
      label: "Paso 1 de 4",
      title: "Confirma tu pedido",
      subtitle: "Revisa articulos, cantidades y total antes de avanzar.",
      progressTitle: "Pedido",
    },
    {
      id: "delivery",
      label: "Paso 2 de 4",
      title: "Elige como lo recibes",
      subtitle: "Define si retiras en el local o si prefieres envio.",
      progressTitle: "Entrega",
    },
    {
      id: "details",
      label: "Paso 3 de 4",
      title: "Completa tus datos",
      subtitle: pickupOrder
        ? "Para retiro solo pedimos tus datos de contacto."
        : "Para envio necesitamos los datos logisticos del destino.",
      progressTitle: "Datos",
    },
    {
      id: "payment",
      label: "Paso 4 de 4",
      title: shouldUseMercadoPago ? "Ir al pago" : "Confirmar pedido",
      subtitle: shouldUseMercadoPago
        ? "Verifica todo y te redirigimos a Mercado Pago."
        : "Verifica todo y grabamos la NP del pedido para pagar en el local.",
      progressTitle: shouldUseMercadoPago ? "Pago" : "Confirmacion",
    },
  ];
  const currentStepIndex = checkoutSteps.findIndex(
    (step) => step.id === checkoutStep,
  );
  const currentStep = checkoutSteps[currentStepIndex] ?? checkoutSteps[0];
  const stepLabel = currentStep.label;
  const heading = currentStep.title;
  const subtitle = currentStep.subtitle;
  const orderProductCount = cart.length;

  function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAdvanceToPayment();
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCheckoutSubmit();
  }

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

      <div className="checkout-progress" aria-label="Etapas del checkout">
        {checkoutSteps.map((step, index) => {
          const active = step.id === checkoutStep;
          const completed = index < currentStepIndex;

          return (
            <div
              key={step.id}
              className={[
                "checkout-progress-item",
                active ? "active" : "",
                completed ? "done" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="checkout-progress-badge">{index + 1}</span>
              <div className="checkout-progress-copy">
                <strong>{step.progressTitle}</strong>
                {active ? <span>Actual</span> : completed ? <span>Listo</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      {errorMessage ? <div className="message error">{errorMessage}</div> : null}

      {successMessage ? <div className="message success">{successMessage}</div> : null}

      <div className="order-metrics" aria-label="Resumen del pedido">
        <div className="order-metric">
          <strong>{orderProductCount}</strong>
          <span>Productos</span>
        </div>
        <div className="order-metric">
          <strong>{itemCount}</strong>
          <span>Unidades</span>
        </div>
        <div className="order-metric">
          <strong>{formatCurrency(total)}</strong>
          <span>Estimado</span>
        </div>
      </div>

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
            onClick={() => onCheckoutStepChange("delivery")}
            disabled={cart.length === 0}
          >
            Confirmar pedido
          </button>
        </div>
      ) : deliveryStepActive ? (
        <>
          <div className="checkout-step-summary">
            <div>
              <strong>Elige el tipo de entrega antes de cargar tus datos</strong>
              <p>
                Puedes retirar en el local o pedir envio. Eso define los campos
                que te vamos a pedir despues.
              </p>
            </div>
            <button
              type="button"
              className="checkout-secondary-button"
              onClick={() => onCheckoutStepChange("cart")}
            >
              Volver al pedido
            </button>
          </div>

          <div className="checkout-delivery-grid">
            <button
              type="button"
              className={[
                "checkout-delivery-option",
                pickupOrder ? "selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onCustomerChange("deliveryMethod", "Retiro en local")}
            >
              <span className="checkout-delivery-kicker">Retiro</span>
              <strong>Retiro en local</strong>
              <p>
                Pasas a buscarlo por el local. Solo te pedimos nombre, email y
                telefono.
              </p>
              {storeAddress ? (
                <small>Retiras en {storeAddress}</small>
              ) : (
                <small>Te avisamos cuando el pedido este listo para retirar.</small>
              )}
            </button>

            <button
              type="button"
              className={[
                "checkout-delivery-option",
                pickupOrder ? "" : "selected",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() =>
                onCustomerChange("deliveryMethod", "Envio a domicilio")
              }
            >
              <span className="checkout-delivery-kicker">Envio</span>
              <strong>Envio a domicilio</strong>
              <p>
                Cargamos direccion y localidad para preparar la entrega
                correctamente.
              </p>
              <small>Te pediremos direccion, ciudad y datos logisticos.</small>
            </button>
          </div>

          <div className="checkout-actions">
            <button
              type="button"
              className="checkout-secondary-button"
              onClick={() => onCheckoutStepChange("cart")}
            >
              Volver al pedido
            </button>
            <button
              type="button"
              className="submit-order-button"
              onClick={() => onCheckoutStepChange("details")}
            >
              Continuar con mis datos
            </button>
          </div>
        </>
      ) : detailsStepActive ? (
        <>
          <div className="checkout-step-summary">
            <div>
              <strong>
                {pickupOrder ? "Retiro en local" : "Envio a domicilio"}
              </strong>
              <p>
                {pickupOrder
                  ? "Carga tus datos de contacto para registrar la NP y avisarte cuando este listo."
                  : "Carga los datos del destinatario y la direccion de entrega."}
              </p>
            </div>
            <button
              type="button"
              className="checkout-secondary-button"
              onClick={() => onCheckoutStepChange("delivery")}
            >
              Cambiar entrega
            </button>
          </div>

          <form className="checkout-form" onSubmit={handleDetailsSubmit}>
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
                  required
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

              {requiresShippingAddress ? (
                <>
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
                </>
              ) : null}

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
                onClick={() => onCheckoutStepChange("delivery")}
              >
                Volver a entrega
              </button>
              <button
                type="submit"
                className="submit-order-button"
                disabled={cart.length === 0}
              >
                Revisar y continuar
              </button>
            </div>
          </form>
        </>
      ) : paymentStepActive ? (
        <>
          <div className="checkout-step-summary">
            <div>
              <strong>Ultima revision antes de avanzar</strong>
              <p>
                {shouldUseMercadoPago
                  ? "Confirmas el pedido, el tipo de entrega y los datos del cliente. Despues sigues al pago."
                  : "Confirmas el pedido, el tipo de entrega y los datos del cliente para pagarlo al retirar."}
              </p>
            </div>
            <button
              type="button"
              className="checkout-secondary-button"
              onClick={() => onCheckoutStepChange("details")}
            >
              Editar datos
            </button>
          </div>

          {pickupOrder && mercadoPagoEnabled ? (
            <div className="checkout-delivery-grid">
              <button
                type="button"
                className={[
                  "checkout-delivery-option",
                  customer.paymentMethod.trim() === "Mercado Pago" ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onCustomerChange("paymentMethod", "Mercado Pago")}
              >
                <span className="checkout-delivery-kicker">Pago online</span>
                <strong>Mercado Pago</strong>
                <p>Pagas ahora y te redirigimos para completar la operacion.</p>
                <small>El pedido queda abonado antes del retiro.</small>
              </button>

              <button
                type="button"
                className={[
                  "checkout-delivery-option",
                  customer.paymentMethod.trim() === "Pago en local" ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onCustomerChange("paymentMethod", "Pago en local")}
              >
                <span className="checkout-delivery-kicker">Pago en local</span>
                <strong>Pagar al retirar</strong>
                <p>Confirmas el pedido ahora y abonas cuando pases por el local.</p>
                <small>Lo dejamos registrado para que lo retires despues.</small>
              </button>
            </div>
          ) : null}

          <div className="checkout-review-grid">
            <div className="checkout-review-card">
              <span className="checkout-review-label">Resumen final</span>
              <div className="checkout-review-list">
                <div className="checkout-review-row">
                  <span>Entrega</span>
                  <strong>{customer.deliveryMethod}</strong>
                  <p>
                    {pickupOrder
                      ? storeAddress || "Retiras en el local."
                      : customer.address
                        ? `${customer.address}, ${customer.city || "Sin localidad"}`
                        : "Envio a domicilio"}
                  </p>
                </div>

                <div className="checkout-review-row">
                  <span>Cliente</span>
                  <strong>{customer.fullName || "Sin nombre cargado"}</strong>
                  <p>{customer.email || "Sin email cargado"}</p>
                  <p>{customer.phone || "Sin telefono cargado"}</p>
                  {customer.documentNumber ? (
                    <p>Documento: {customer.documentNumber}</p>
                  ) : null}
                </div>

                {requiresShippingAddress ? (
                  <div className="checkout-review-row">
                    <span>Destino</span>
                    <strong>{customer.city || "Sin localidad"}</strong>
                    <p>{customer.address || "Sin direccion"}</p>
                    {customer.province ? <p>{customer.province}</p> : null}
                    {customer.postalCode ? <p>CP {customer.postalCode}</p> : null}
                  </div>
                ) : null}

                <div className="checkout-review-row">
                  <span>Pago</span>
                  <strong>
                    {shouldUseMercadoPago ? "Mercado Pago" : "Pago en local"}
                  </strong>
                  <p>
                    {shouldUseMercadoPago
                      ? "Al confirmar te redirigimos para completar el pago."
                      : "Al confirmar dejamos registrado el pedido para abonar al retirar."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {customer.notes ? (
            <div className="checkout-inline-note">
              <strong>Notas del pedido</strong>
              <p>{customer.notes}</p>
            </div>
          ) : null}

          <form className="checkout-form" onSubmit={handlePaymentSubmit}>
            <div className="checkout-actions">
              <button
                type="button"
                className="checkout-secondary-button"
                onClick={() => onCheckoutStepChange("details")}
              >
                Volver a datos
              </button>
              <button
                type="submit"
                className="submit-order-button"
                disabled={submitting || cart.length === 0}
              >
                {submitting
                  ? shouldUseMercadoPago
                    ? "Redirigiendo a Mercado Pago..."
                    : "Grabando pedido..."
                  : shouldUseMercadoPago
                    ? "Ir a pagar"
                    : "Confirmar pedido"}
              </button>
            </div>
          </form>
        </>
      ) : null}
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

function buildProductGroups(products: Product[]) {
  const groups = new Map<
    string,
    { parentProduct: Product | null; members: Product[]; children: Product[] }
  >();

  for (const product of products) {
    const parentCode = getParentProductCode(product.code);
    const group = groups.get(parentCode) || {
      parentProduct: null,
      members: [],
      children: [],
    };

    group.members.push(product);

    if (isChildProduct(product)) {
      group.children.push(product);
    } else if (!group.parentProduct) {
      group.parentProduct = product;
    }

    groups.set(parentCode, group);
  }

  return Array.from(groups.entries()).map(([parentCode, group]) => {
    const sortedChildren = [...group.children].sort(compareVariantProducts);
    const stockPool = sortedChildren.length > 0 ? sortedChildren : group.members;
    const groupStock = stockPool.reduce(
      (sum, product) => sum + Math.max(0, product.stock),
      0,
    );
    const primaryProduct =
      group.parentProduct || sortedChildren[0] || group.members[0];
    const defaultSelectable =
      sortedChildren.find((product) => product.stock > 0) ||
      sortedChildren[0] ||
      group.parentProduct ||
      group.members[0];
    const imageProduct =
      [group.parentProduct, defaultSelectable, ...sortedChildren, ...group.members]
        .filter((product): product is Product => Boolean(product))
        .find((product) => Boolean(product.imageUrl)) || primaryProduct;
    const catalogProduct: Product = {
      ...primaryProduct,
      price: defaultSelectable.price,
      netPrice: defaultSelectable.netPrice,
      taxAmount: defaultSelectable.taxAmount,
      rawPrice: defaultSelectable.rawPrice,
      taxRate: defaultSelectable.taxRate,
      currency: defaultSelectable.currency,
      unitId: defaultSelectable.unitId || primaryProduct.unitId,
      defaultSize: defaultSelectable.defaultSize || primaryProduct.defaultSize,
      presentation:
        primaryProduct.presentation || defaultSelectable.presentation,
      barcode: primaryProduct.barcode || defaultSelectable.barcode,
      imageUrl: imageProduct.imageUrl,
      imageMode: imageProduct.imageMode,
      imageNote: imageProduct.imageNote,
      imageSourceUrl: imageProduct.imageSourceUrl,
      stock: groupStock,
    };

    return {
      parentCode,
      parentProduct: group.parentProduct,
      catalogProduct,
      children: sortedChildren,
      members: group.members,
      groupStock,
    } satisfies ProductGroup;
  });
}

function getParentProductCode(code: string) {
  return code.split("|")[0]?.trim() || code.trim();
}

function isChildProduct(product: Product) {
  return product.code.includes("|");
}

function getDefaultSelectableProduct(group: ProductGroup) {
  return (
    group.children.find((product) => product.stock > 0) ||
    group.children[0] ||
    group.parentProduct ||
    group.catalogProduct
  );
}

function getVariantLabel(product: Product) {
  if (product.defaultSize) {
    return product.defaultSize;
  }

  const variantSegments = product.code
    .split("|")
    .slice(1)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "-");

  if (variantSegments.length > 0) {
    return variantSegments.join(" / ");
  }

  return product.presentation || product.unitId || product.code;
}

function compareVariantProducts(left: Product, right: Product) {
  const leftLabel = getVariantLabel(left);
  const rightLabel = getVariantLabel(right);
  const leftRank = getVariantSortRank(leftLabel);
  const rightRank = getVariantSortRank(rightLabel);

  if (leftRank.group !== rightRank.group) {
    return leftRank.group - rightRank.group;
  }

  if (leftRank.group !== 2 && leftRank.value !== rightRank.value) {
    return leftRank.value - rightRank.value;
  }

  return VARIANT_LABEL_COLLATOR.compare(leftLabel, rightLabel);
}

function getVariantSortRank(label: string) {
  const firstSegment = label.split("/")[0]?.trim() || label.trim();
  const normalizedSegment = normalizeFilterValue(firstSegment).replace(/\s+/g, "");
  const apparelIndex = APPAREL_SIZE_ORDER.indexOf(normalizedSegment);

  if (apparelIndex !== -1) {
    return {
      group: 0,
      value: apparelIndex,
    };
  }

  const numericMatch = firstSegment.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (numericMatch) {
    return {
      group: 1,
      value: Number(numericMatch[0]),
    };
  }

  return {
    group: 2,
    value: 0,
  };
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
    { label: "Mujeres", filterValue: "mujeres" as AudienceFilter },
    { label: "Hombres", filterValue: "hombres" as AudienceFilter },
    { label: "Kids", filterValue: "ninez" as AudienceFilter },
  ];

  return (
    fallbacks[index] || {
      label: "Destacado",
      filterValue: "all" as AudienceFilter,
    }
  );
}

function getAudienceDisplayOrder(audience: AudienceFilter) {
  const index = AUDIENCE_DISPLAY_ORDER.indexOf(audience);
  return index === -1 ? AUDIENCE_DISPLAY_ORDER.length : index;
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
