import { Fragment } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createAdminUserAction,
  deleteAdminUserAction,
  logoutAdminAction,
  saveAdminSettingsAction,
  updateAdminUserAction,
} from "@/app/admin/actions";
import { AdminHelpWorkspace } from "@/components/admin/admin-help-workspace";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminConfigWorkspace } from "@/components/admin/admin-config-workspace";
import { AdminLiveOrderWatcher } from "@/components/admin/admin-live-order-watcher";
import { AdminSystemArticleImageEditorFrame } from "@/components/admin/admin-system-article-image-editor-frame";
import { AdminThemeToggle } from "@/components/admin-theme-toggle";
import { cn } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/admin/empty-state";
import { OrderFiltersBar } from "@/components/admin/order-filters-bar";
import { PickupDeskPane } from "@/components/admin/pickup-desk-pane";
import { OrdersTable } from "@/components/admin/orders-table";
import { OrderTabs } from "@/components/admin/order-tabs";
import {
  getAdminProductsByIds,
  searchProductsForAdmin,
  type AdminProductImageEntry,
} from "@/lib/catalog";
import { ensureProductImageStorageReady } from "@/lib/product-image-storage";
import {
  ADMIN_SYSTEM_SECTIONS,
  getAdminSystemSectionLabel,
  normalizeAdminSystemSection,
  type AdminSystemSection,
} from "@/lib/admin-system";
import { formatCurrency } from "@/lib/commerce";
import { getWatchSnapshot } from "@/lib/repositories/orderRepository";
import { ensureProductImageSchemaReady } from "@/lib/repositories/productImageRepository";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionUser,
} from "@/lib/admin-auth";
import {
  getAdminConfigFields,
} from "@/lib/admin-config";
import {
  ADMIN_PASSWORD_PATTERN,
  ADMIN_PASSWORD_POLICY_HINT,
  listAdminUsers,
} from "@/lib/admin-users";
import {
  ADMIN_ORDER_VIEWS,
  buildAdminOrdersSnapshot,
  getAdminOrderViewLabel,
  normalizeAdminOrderView,
} from "@/lib/order-admin";
import { getAdminOrderStateCssVariables } from "@/lib/order-state-config";
import { normalizeOrderFilters } from "@/lib/models/order";
import { getOrders } from "@/lib/services/orderService";
import { getPublicStoreSettings, getServerSettings } from "@/lib/store-config";
import type {
  AdminOrderBucket,
  AdminOrdersSnapshot,
  OrderListView,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminPageProps = {
  searchParams: Promise<{
    saved?: string;
    status?: string;
    view?: string;
    vista?: string;
    q?: string;
    estado?: string;
    estado_pago?: string;
    tipo_pedido?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    system?: string;
    system_q?: string;
    system_article?: string;
    config?: string;
    error?: string;
    create?: string;
    editUser?: string;
    productQ?: string;
    product?: string;
  }>;
};

type AdminView = "orders" | "pickups" | "users" | "system" | "config" | "help";

type AdminProductImageGroup = {
  parentCode: string;
  parentEntry: AdminProductImageEntry | null;
  displayEntry: AdminProductImageEntry;
  editEntry: AdminProductImageEntry;
  imageEntry: AdminProductImageEntry;
  children: AdminProductImageEntry[];
  members: AdminProductImageEntry[];
  groupStock: number;
  sizeLabels: string[];
  colorLabels: string[];
  firstIndex: number;
};

const ADMIN_VARIANT_LABEL_COLLATOR = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});
const ADMIN_APPAREL_SIZE_ORDER = [
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

type AdminHrefInput = {
  view?: AdminView;
  vista?: OrderListView;
  q?: string | null;
  estado?: string | null;
  estado_pago?: string | null;
  tipo_pedido?: string | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  system?: AdminSystemSection;
  system_q?: string | null;
  system_article?: string | null;
  config?: string;
  create?: boolean;
  editUser?: number;
};

function normalizeView(rawValue: string | undefined): AdminView {
  if (rawValue === "users") {
    return "users";
  }

  if (rawValue === "pickups" || rawValue === "retiros") {
    return "pickups";
  }

  if (rawValue === "config" || rawValue === "general") {
    return "config";
  }

  if (
    rawValue === "system" ||
    rawValue === "sistema" ||
    rawValue === "products" ||
    rawValue === "articulos"
  ) {
    return "system";
  }

  if (rawValue === "help" || rawValue === "ayuda") {
    return "help";
  }

  return "orders";
}

function normalizePositiveInt(value: string | undefined) {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Sin dato";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin dato";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function normalizeAdminFilterValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAdminText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function getAdminParentProductCode(code: string) {
  return code.split("|")[0]?.trim() || code.trim();
}

function isAdminChildProductCode(code: string) {
  return code.includes("|");
}

function getAdminVariantLabel(product: AdminProductImageEntry["product"]) {
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

function getAdminVariantSortRank(label: string) {
  const firstSegment = label.split("/")[0]?.trim() || label.trim();
  const normalizedSegment = normalizeAdminFilterValue(firstSegment).replace(/\s+/g, "");
  const apparelIndex = ADMIN_APPAREL_SIZE_ORDER.indexOf(normalizedSegment);

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

function compareAdminVariantEntries(
  left: AdminProductImageEntry,
  right: AdminProductImageEntry,
) {
  const leftLabel = getAdminVariantLabel(left.product);
  const rightLabel = getAdminVariantLabel(right.product);
  const leftRank = getAdminVariantSortRank(leftLabel);
  const rightRank = getAdminVariantSortRank(rightLabel);

  if (leftRank.group !== rightRank.group) {
    return leftRank.group - rightRank.group;
  }

  if (leftRank.group !== 2 && leftRank.value !== rightRank.value) {
    return leftRank.value - rightRank.value;
  }

  return ADMIN_VARIANT_LABEL_COLLATOR.compare(leftLabel, rightLabel);
}

function compareAdminLabels(left: string, right: string) {
  const leftRank = getAdminVariantSortRank(left);
  const rightRank = getAdminVariantSortRank(right);

  if (leftRank.group !== rightRank.group) {
    return leftRank.group - rightRank.group;
  }

  if (leftRank.group !== 2 && leftRank.value !== rightRank.value) {
    return leftRank.value - rightRank.value;
  }

  return ADMIN_VARIANT_LABEL_COLLATOR.compare(left, right);
}

function extractAdminVariantColor(params: {
  childEntry: AdminProductImageEntry;
  parentDescription: string;
}) {
  const { childEntry, parentDescription } = params;
  let remainder = normalizeAdminText(childEntry.product.description);
  const normalizedParentDescription = normalizeAdminText(parentDescription);

  if (
    normalizedParentDescription &&
    normalizeAdminFilterValue(remainder).startsWith(
      normalizeAdminFilterValue(normalizedParentDescription),
    )
  ) {
    remainder = normalizeAdminText(remainder.slice(normalizedParentDescription.length));
  }

  const childSegments = childEntry.product.code
    .split("|")
    .slice(1)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const audienceSegment = childSegments[0] || "";

  if (/^(m|f|u|k|b|g|d)$/i.test(audienceSegment)) {
    remainder = normalizeAdminText(
      remainder.replace(new RegExp(`^${escapeRegExp(audienceSegment)}\\b`, "i"), ""),
    );
  }

  const sizeLabel = getAdminVariantLabel(childEntry.product);
  if (sizeLabel) {
    remainder = normalizeAdminText(
      remainder.replace(new RegExp(escapeRegExp(sizeLabel), "i"), ""),
    );
  }

  remainder = normalizeAdminText(remainder.replace(/^[-/|]+|[-/|]+$/g, ""));
  return remainder || null;
}

function buildAdminProductImageGroups(entries: AdminProductImageEntry[]) {
  const groups = new Map<
    string,
    {
      parentEntry: AdminProductImageEntry | null;
      children: AdminProductImageEntry[];
      members: AdminProductImageEntry[];
      firstIndex: number;
    }
  >();

  entries.forEach((entry, index) => {
    const parentCode = getAdminParentProductCode(entry.product.code);
    const currentGroup = groups.get(parentCode) || {
      parentEntry: null,
      children: [],
      members: [],
      firstIndex: index,
    };

    currentGroup.members.push(entry);
    currentGroup.firstIndex = Math.min(currentGroup.firstIndex, index);

    if (isAdminChildProductCode(entry.product.code)) {
      currentGroup.children.push(entry);
    } else if (!currentGroup.parentEntry) {
      currentGroup.parentEntry = entry;
    }

    groups.set(parentCode, currentGroup);
  });

  return Array.from(groups.entries())
    .map(([parentCode, group]) => {
      const children = [...group.children].sort(compareAdminVariantEntries);
      const displayEntry = group.parentEntry || children[0] || group.members[0];
      const editEntry = group.parentEntry || displayEntry;
      const imageEntry =
        [group.parentEntry, ...children, ...group.members]
          .filter((entry): entry is AdminProductImageEntry => Boolean(entry))
          .find((entry) => Boolean(entry.product.imageUrl) || entry.product.imageGalleryUrls.length > 0)
        || displayEntry;
      const stockPool = children.length > 0 ? children : group.members;
      const groupStock = stockPool.reduce(
        (sum, entry) => sum + Math.max(0, entry.product.stock),
        0,
      );
      const sizeLabels = Array.from(
        new Set(children.map((child) => getAdminVariantLabel(child.product)).filter(Boolean)),
      ).sort(compareAdminLabels);
      const colorLabels = Array.from(
        new Set(
          children
            .map((child) =>
              extractAdminVariantColor({
                childEntry: child,
                parentDescription: displayEntry.product.description,
              }),
            )
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((left, right) => ADMIN_VARIANT_LABEL_COLLATOR.compare(left, right));

      return {
        parentCode,
        parentEntry: group.parentEntry,
        displayEntry,
        editEntry,
        imageEntry,
        children,
        members: group.members,
        groupStock,
        sizeLabels,
        colorLabels,
        firstIndex: group.firstIndex,
      } satisfies AdminProductImageGroup;
    })
    .sort((left, right) => left.firstIndex - right.firstIndex);
}

function buildAdminHref(input: AdminHrefInput) {
  const params = new URLSearchParams();

  if (input.view && input.view !== "orders") {
    params.set("view", input.view);
  }

  if (
    input.view === "system"
  ) {
    if (input.system && input.system !== "articulos") {
      params.set("system", input.system);
    }

    if (input.system_q) {
      params.set("system_q", input.system_q);
    }

    if (input.system_article) {
      params.set("system_article", input.system_article);
    }
  } else if (!input.view || input.view === "orders") {
    if (input.vista && input.vista !== "pedidos") {
      params.set("vista", input.vista);
    }

    if (input.q) {
      params.set("q", input.q);
    }

    if (input.estado) {
      params.set("estado", input.estado);
    }

    if (input.estado_pago) {
      params.set("estado_pago", input.estado_pago);
    }

    if (input.tipo_pedido) {
      params.set("tipo_pedido", input.tipo_pedido);
    }

    if (input.fecha_desde) {
      params.set("fecha_desde", input.fecha_desde);
    }

    if (input.fecha_hasta) {
      params.set("fecha_hasta", input.fecha_hasta);
    }
  }

  if (input.config) {
    params.set("config", input.config);
  }

  if (input.create) {
    params.set("create", "1");
  }

  if (input.editUser && Number.isFinite(input.editUser) && input.editUser > 0) {
    params.set("editUser", String(input.editUser));
  }

  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

function getViewMeta(view: AdminView) {
  switch (view) {
    case "orders":
      return {
        label: "Pedidos",
        description: "Gestion operativa de pedidos, pagos y estados.",
      };
    case "users":
      return {
        label: "Usuarios",
        description: "Control de accesos internos del panel.",
      };
    case "pickups":
      return {
        label: "Retiros",
        description: "Mostrador para validar codigos de retiro y registrar la entrega.",
      };
    case "config":
      return {
        label: "Configuracion",
        description: "Parametros del checkout y comportamiento comercial.",
      };
    case "system":
      return {
        label: "Sistema",
        description: "Herramientas internas del catalogo y datos comerciales.",
      };
    case "help":
      return {
        label: "Ayuda",
        description: "Guia operativa e instructivo completo de uso del sistema.",
      };
    default:
      return {
        label: "Panel",
        description: "Centro de control interno.",
      };
  }
}

function getSummaryCount(
  summary: AdminOrdersSnapshot["summary"],
  key: AdminOrderBucket,
) {
  return summary[key];
}

function FlashMessages({
  saved,
  error,
}: {
  saved?: string;
  error?: string;
}) {
  const renderBanner = (tone: "success" | "error", message: string) => (
    <div
      className={cn(
        "rounded-[18px] border px-4 py-3 text-sm",
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
          : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200",
      )}
    >
      {message}
    </div>
  );

  if (saved === "config") {
    return renderBanner("success", "Configuracion guardada y aplicada al runtime actual.");
  }

  if (saved === "refresh") {
    return renderBanner("success", "Estado del pedido actualizado.");
  }

  if (saved === "advance") {
    return renderBanner("success", "Estado del pedido avanzado correctamente.");
  }

  if (saved === "state-updated") {
    return renderBanner("success", "Estado del pedido actualizado.");
  }

  if (saved === "payment-updated") {
    return renderBanner("success", "Pago del pedido actualizado.");
  }

  if (saved === "pickup-email-resent") {
    return renderBanner("success", "Email de retiro reenviado.");
  }

  if (saved === "user") {
    return renderBanner("success", "Usuario admin creado.");
  }

  if (saved === "user-updated") {
    return renderBanner("success", "Usuario admin actualizado.");
  }

  if (saved === "user-deleted") {
    return renderBanner("success", "Usuario admin eliminado.");
  }

  if (saved === "product-image" || saved === "product-updated") {
    return renderBanner("success", "Articulo actualizado.");
  }

  if (saved === "product-image-cleared") {
    return renderBanner("success", "Se elimino la personalizacion y se volvieron a usar las imagenes del sistema.");
  }

  if (error === "order-not-found") {
    return renderBanner("error", "No se encontro el pedido solicitado.");
  }

  if (error === "order-advance") {
    return renderBanner(
      "error",
      "No se pudo avanzar el pedido. Revisa el flujo y el estado actual.",
    );
  }

  if (error === "order-refresh") {
    return renderBanner(
      "error",
      "No se pudo actualizar el estado del pago. Reintenta en unos segundos.",
    );
  }

  if (error === "order-update") {
    return renderBanner(
      "error",
      "No se pudo actualizar el pedido. Revisa la transicion solicitada.",
    );
  }

  if (error === "order-payment-update") {
    return renderBanner(
      "error",
      "No se pudo actualizar el estado del pago del pedido.",
    );
  }

  if (error === "pickup-email-resend") {
    return renderBanner(
      "error",
      "No se pudo reenviar el email de retiro.",
    );
  }

  if (error === "user-create") {
    return renderBanner(
      "error",
      "No se pudo crear el usuario admin. Revisa si ya existe o si faltan datos.",
    );
  }

  if (error === "password-match") {
    return renderBanner("error", "Las claves no coinciden.");
  }

  if (error === "user-password-policy") {
    return renderBanner("error", ADMIN_PASSWORD_POLICY_HINT);
  }

  if (error === "user-username") {
    return renderBanner("error", "El usuario admin debe tener al menos 3 caracteres.");
  }

  if (error === "user-exists") {
    return renderBanner("error", "Ya existe un usuario admin con ese nombre.");
  }

  if (error === "user-reserved") {
    return renderBanner("error", "Ese usuario esta reservado por el sistema.");
  }

  if (error === "user-forbidden") {
    return renderBanner("error", "Solo un superadmin puede administrar usuarios.");
  }

  if (error === "user-not-found") {
    return renderBanner("error", "No se encontro el usuario admin.");
  }

  if (error === "user-last-superadmin") {
    return renderBanner("error", "Debe quedar al menos un superadmin habilitado.");
  }

  if (error === "user-self-delete") {
    return renderBanner("error", "No puedes borrar tu propio usuario activo.");
  }

  if (error === "user-self-disable") {
    return renderBanner("error", "No puedes deshabilitar tu propio usuario activo.");
  }

  if (error === "user-self-demote") {
    return renderBanner(
      "error",
      "No puedes quitarte permisos de superadmin desde tu propia sesion.",
    );
  }

  if (error === "product-not-found") {
    return renderBanner("error", "No se encontro el articulo seleccionado.");
  }

  if (error === "product-image-invalid") {
    return renderBanner(
      "error",
      "Revisa las imagenes: usa URLs http(s) o rutas locales que empiecen con /.",
    );
  }

  if (error === "product-invalid") {
    return renderBanner(
      "error",
      "Revisa descripcion, precio, marca y categoria. El precio debe ser mayor a cero.",
    );
  }

  if (error === "product-image-file") {
    return renderBanner(
      "error",
      "No se pudieron procesar los archivos. Usa JPG, PNG, WEBP, GIF o AVIF de hasta 8 MB.",
    );
  }

  if (error === "product-image-storage") {
    return renderBanner(
      "error",
      "Falta configurar el almacenamiento de imagenes en .env: carpeta compartida o FTP.",
    );
  }

  if (error === "product-image-save") {
    return renderBanner(
      "error",
      "No se pudieron guardar las imagenes del articulo.",
    );
  }

  return null;
}

async function loadAdminProductsPaneData(
  productSearchQuery: string | undefined,
  selectedProductId: string | undefined,
) {
  const normalizedSearchQuery = (productSearchQuery || "").trim();
  const normalizedSelectedProductId = (selectedProductId || "").trim();

  try {
    await ensureProductImageSchemaReady();

    try {
      await ensureProductImageStorageReady();
    } catch (error) {
      console.error(
        "[admin-products] No se pudo preparar la carpeta de imagenes.",
        error,
      );
    }

    const initialResults = await searchProductsForAdmin(normalizedSearchQuery, 60);
    const knownIds = new Set(initialResults.map((entry) => entry.product.id));
    const supplementalIds = new Set<string>();

    initialResults.forEach((entry) => {
      if (!isAdminChildProductCode(entry.product.code)) {
        return;
      }

      const parentCode = getAdminParentProductCode(entry.product.code);
      if (parentCode && !knownIds.has(parentCode)) {
        supplementalIds.add(parentCode);
      }
    });

    if (normalizedSelectedProductId) {
      if (!knownIds.has(normalizedSelectedProductId)) {
        supplementalIds.add(normalizedSelectedProductId);
      }

      if (isAdminChildProductCode(normalizedSelectedProductId)) {
        const selectedParentCode = getAdminParentProductCode(normalizedSelectedProductId);
        if (selectedParentCode && !knownIds.has(selectedParentCode)) {
          supplementalIds.add(selectedParentCode);
        }
      }
    }

    const supplementalResults =
      supplementalIds.size > 0
        ? await getAdminProductsByIds(Array.from(supplementalIds))
        : [];
    const searchResults = Array.from(
      new Map(
        [...initialResults, ...supplementalResults].map((entry) => [entry.product.id, entry]),
      ).values(),
    );
    let selectedProduct =
      searchResults.find((entry) => entry.product.id === normalizedSelectedProductId) || null;

    if (selectedProduct && isAdminChildProductCode(selectedProduct.product.code)) {
      const parentCode = getAdminParentProductCode(selectedProduct.product.code);
      selectedProduct =
        searchResults.find((entry) => entry.product.id === parentCode) || selectedProduct;
    }

    return {
      searchResults,
      selectedProduct,
      loadError: null,
    };
  } catch (error) {
    return {
      searchResults: [] as AdminProductImageEntry[],
      selectedProduct: null,
      loadError:
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los articulos.",
    };
  }
}

function SystemPane(props: {
  activeSection: AdminSystemSection;
  productSearchQuery: string;
  searchResults: AdminProductImageEntry[];
  selectedProduct: AdminProductImageEntry | null;
  loadError: string | null;
}) {
  const {
    activeSection,
    productSearchQuery,
    searchResults,
    selectedProduct,
    loadError,
  } = props;
  const productGroups = buildAdminProductImageGroups(searchResults);
  const selectedGroup =
    selectedProduct
      ? productGroups.find(
          (group) =>
            group.editEntry.product.id === selectedProduct.product.id ||
            group.parentCode === getAdminParentProductCode(selectedProduct.product.code),
        ) || null
      : null;

  const editorCloseHref = buildAdminHref({
    view: "system",
    system: activeSection,
    system_q: productSearchQuery,
  });
  const editorReturnTo = selectedGroup
    ? buildAdminHref({
        view: "system",
        system: activeSection,
        system_q: productSearchQuery,
        system_article: selectedGroup.editEntry.product.id,
      })
    : editorCloseHref;

  return (
    <section className="admin-pane space-y-4">
      <nav
        className="flex gap-2 overflow-x-auto rounded-[18px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-2"
        aria-label="Secciones del sistema"
      >
        {ADMIN_SYSTEM_SECTIONS.map((section) => (
          <Link
            key={section}
            href={buildAdminHref({
              view: "system",
              system: section,
              system_q: section === activeSection ? productSearchQuery : null,
              system_article:
                section === activeSection && selectedProduct
                  ? selectedProduct.product.id
                  : null,
            })}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeSection === section
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>{getAdminSystemSectionLabel(section)}</span>
          </Link>
        ))}
      </nav>

      <form action="/admin" className="space-y-4">
        <input type="hidden" name="view" value="system" />
        <input type="hidden" name="system" value={activeSection} />
        <AdminPageHeader
          title={getAdminSystemSectionLabel(activeSection)}
          subtitle="Busca un articulo y edita descripcion, precio, marca, categoria e imagenes desde un solo panel."
          searchDefaultValue={productSearchQuery}
          resultCount={productGroups.length}
          searchName="system_q"
          searchPlaceholder="Buscar por codigo, descripcion o EAN"
          eyebrow="Sistema"
        />
      </form>

      {loadError ? (
        <section className="admin-section-card">
          <div className="message error">{loadError}</div>
        </section>
      ) : null}

      <AdminSystemArticleImageEditorFrame
        activeSection={activeSection}
        productSearchQuery={productSearchQuery}
        closeHref={editorCloseHref}
        returnTo={editorReturnTo}
        entry={selectedGroup?.editEntry || null}
        publishedProduct={selectedGroup?.imageEntry.product || null}
        variantSummary={
          selectedGroup
            ? {
                parentCode: selectedGroup.parentCode,
                hasRealParent: Boolean(selectedGroup.parentEntry),
                variantCount: selectedGroup.children.length,
                totalStock: selectedGroup.groupStock,
                colorLabels: selectedGroup.colorLabels,
                sizeLabels: selectedGroup.sizeLabels,
                variants: selectedGroup.children.map((child) => ({
                  id: child.product.id,
                  code: child.product.code,
                  description: child.product.description,
                  sizeLabel: getAdminVariantLabel(child.product),
                  colorLabel:
                    extractAdminVariantColor({
                      childEntry: child,
                      parentDescription: selectedGroup.displayEntry.product.description,
                    }) || "Sin dato",
                  stock: child.product.stock,
                })),
              }
            : null
        }
      />

      <section className="admin-section-card">
        <div className="admin-section-heading">
          <div>
            <span className="admin-pane-kicker">Listado</span>
            <h3>Resultados del catalogo</h3>
          </div>
        </div>

        {productGroups.length === 0 ? (
          <EmptyState
            title="Sin articulos"
            message={
              productSearchQuery
                ? "No hubo coincidencias para la busqueda actual."
                : "Todavia no se cargaron articulos para mostrar en esta vista."
            }
            compact
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Articulo</th>
                  <th>Imagen</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {productGroups.map((group) => (
                  <Fragment key={group.parentCode}>
                    <tr key={group.parentCode}>
                      <td>
                        <strong>{group.displayEntry.product.description}</strong>
                        <small>Cod. {group.editEntry.product.code}</small>
                        {group.children.length > 0 ? (
                          <small>
                            {group.children.length} variante{group.children.length === 1 ? "" : "s"} disponible{group.children.length === 1 ? "" : "s"}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        {group.imageEntry.product.imageGalleryUrls.length > 0 ? (
                          <>
                            <strong>
                              {group.imageEntry.product.imageMode === "illustrative"
                                ? `Ilustrativa (${group.imageEntry.product.imageGalleryUrls.length})`
                                : `${group.imageEntry.product.imageGalleryUrls.length} imagen${group.imageEntry.product.imageGalleryUrls.length === 1 ? "" : "es"}`}
                            </strong>
                            {group.imageEntry.product.imageMode === "illustrative" ? (
                              <small>
                                {group.imageEntry.product.imageNote || "Se esta usando una imagen ilustrativa."}
                              </small>
                            ) : (
                              <small>
                                {group.editEntry.imageOverride ? "Personalizada desde el admin." : "Imagen del sistema."}
                              </small>
                            )}
                          </>
                        ) : (
                          <small>Sin imagen</small>
                        )}
                      </td>
                      <td>{formatCurrency(group.displayEntry.product.price)}</td>
                      <td>{group.groupStock.toFixed(0)}</td>
                      <td>
                        <Link
                          href={buildAdminHref({
                            view: "system",
                            system: activeSection,
                            system_q: productSearchQuery,
                            system_article: group.editEntry.product.id,
                          })}
                          className="admin-ghost-button"
                        >
                          Editar
                        </Link>
                      </td>
                    </tr>
                    {group.children.length > 0 ? (
                      <tr key={`${group.parentCode}-children`}>
                        <td colSpan={5}>
                          <details
                            className="rounded-[16px] border border-dashed border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-4 py-3"
                            open={selectedGroup?.parentCode === group.parentCode}
                          >
                            <summary className="cursor-pointer text-sm font-medium text-[color:var(--admin-title)]">
                              Ver talles y colores
                            </summary>
                            <div className="mt-3 space-y-3">
                              <div className="flex flex-wrap gap-2 text-xs text-[color:var(--admin-text)]">
                                <span className="admin-inline-badge">
                                  Colores: {group.colorLabels.length > 0 ? group.colorLabels.join(", ") : "Sin dato"}
                                </span>
                                <span className="admin-inline-badge">
                                  Talles: {group.sizeLabels.length > 0 ? group.sizeLabels.join(", ") : "Sin dato"}
                                </span>
                              </div>
                              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {group.children.map((child) => (
                                  <article
                                    key={child.product.id}
                                    className="rounded-[14px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-3 py-3"
                                  >
                                    <strong className="block text-sm text-[color:var(--admin-title)]">
                                      {getAdminVariantLabel(child.product)}
                                    </strong>
                                    <p className="mt-1 text-xs text-[color:var(--admin-text)]">
                                      {extractAdminVariantColor({
                                        childEntry: child,
                                        parentDescription: group.displayEntry.product.description,
                                      }) || "Sin color detectado"}
                                    </p>
                                    <p className="mt-1 text-xs text-[color:var(--admin-text)]">
                                      Cod. {child.product.code}
                                    </p>
                                    <p className="mt-1 text-xs text-[color:var(--admin-text)]">
                                      Stock {child.product.stock.toFixed(0)}
                                    </p>
                                  </article>
                                ))}
                              </div>
                            </div>
                          </details>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function OrdersPane(props: {
  ordersSnapshot: AdminOrdersSnapshot;
  activeOrderView: OrderListView;
  baseOrderFilters: ReturnType<typeof normalizeOrderFilters>;
  currentOrdersHref: string;
}) {
  const { ordersSnapshot, activeOrderView, baseOrderFilters, currentOrdersHref } = props;

  return (
    <section className="space-y-4">
      <form action="/admin" className="space-y-4">
        <AdminPageHeader
          title="Pedidos"
          subtitle="Bandeja operativa para revisar pagos, avanzar estados y abrir el detalle solo cuando hace falta."
          searchDefaultValue={baseOrderFilters.q}
          resultCount={ordersSnapshot.orders.length}
        />

        <OrderTabs
          activeValue={activeOrderView}
          tabs={ADMIN_ORDER_VIEWS.map((orderView) => ({
            value: orderView,
            label: getAdminOrderViewLabel(orderView),
            count: getSummaryCount(ordersSnapshot.summary, orderView),
            href: buildAdminHref({
              view: "orders",
              vista: orderView,
              q: baseOrderFilters.q,
              estado: baseOrderFilters.estado,
              estado_pago: baseOrderFilters.estado_pago,
              tipo_pedido: baseOrderFilters.tipo_pedido,
              fecha_desde: baseOrderFilters.fecha_desde,
              fecha_hasta: baseOrderFilters.fecha_hasta,
            }),
          }))}
        />

        <OrderFiltersBar
          activeOrderView={activeOrderView}
          filters={baseOrderFilters}
          clearHref={buildAdminHref({
            view: "orders",
            vista: activeOrderView,
          })}
        />
      </form>

      {ordersSnapshot.orders.length === 0 ? (
        <EmptyState
          title="Sin pedidos para mostrar"
          message={
            baseOrderFilters.q ||
            baseOrderFilters.estado ||
            baseOrderFilters.estado_pago ||
            baseOrderFilters.tipo_pedido ||
            baseOrderFilters.fecha_desde ||
            baseOrderFilters.fecha_hasta
              ? "No hubo resultados para los filtros actuales. Ajusta la busqueda o limpia los filtros."
              : "Todavia no hay pedidos cargados en esta vista."
          }
          compact
        />
      ) : (
        <OrdersTable orders={ordersSnapshot.orders} returnTo={currentOrdersHref} />
      )}
    </section>
  );
}

function UsersPane(props: {
  sessionUser: {
    id: number;
    username: string;
    superAdmin: boolean;
  };
  adminUsers: Awaited<ReturnType<typeof listAdminUsers>>;
  showUserCreateForm: boolean;
  showUserEditForm: boolean;
  editingUser: Awaited<ReturnType<typeof listAdminUsers>>[number] | null;
}) {
  const { sessionUser, adminUsers, showUserCreateForm, showUserEditForm, editingUser } = props;

  return (
    <section className="admin-pane">
      <div className="admin-pane-header">
        <div>
          <span className="admin-pane-kicker">Seguridad</span>
          <h2>Usuarios del panel</h2>
          <p>Gestiona accesos internos y permisos operativos.</p>
        </div>

        <div className="admin-pane-actions">
          <span className="admin-inline-badge">Sesion: {sessionUser.username}</span>
          <span className="admin-inline-badge">
            Perfil: {sessionUser.superAdmin ? "Superadmin" : "Operador"}
          </span>
          {sessionUser.superAdmin ? (
            <Link
              href={buildAdminHref({ view: "users", create: true })}
              className="admin-ghost-button"
            >
              Nuevo usuario
            </Link>
          ) : null}
        </div>
      </div>

      {showUserCreateForm ? (
        <section className="admin-section-card">
          <div className="admin-section-heading">
            <div>
              <span className="admin-pane-kicker">Alta</span>
              <h3>Nuevo usuario</h3>
            </div>
            <Link href={buildAdminHref({ view: "users" })} className="admin-ghost-button">
              Cerrar
            </Link>
          </div>

          <div className="message">
            Las claves se guardan protegidas y deben cumplir:{" "}
            {ADMIN_PASSWORD_POLICY_HINT.toLowerCase()}
          </div>

          <form action={createAdminUserAction} className="admin-config-form">
            <input type="hidden" name="mode" value="admin" />

            <div className="admin-config-grid">
              <label className="admin-config-field">
                <span>Usuario</span>
                <input name="username" required minLength={3} />
              </label>

              <label className="admin-config-field">
                <span>Clave</span>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  pattern={ADMIN_PASSWORD_PATTERN}
                  title={ADMIN_PASSWORD_POLICY_HINT}
                />
              </label>

              <label className="admin-config-field">
                <span>Confirmar clave</span>
                <input
                  name="passwordConfirm"
                  type="password"
                  required
                  minLength={8}
                  pattern={ADMIN_PASSWORD_PATTERN}
                  title={ADMIN_PASSWORD_POLICY_HINT}
                />
              </label>

              <label className="admin-boolean-field">
                <span className="admin-boolean-control">
                  <input name="superAdmin" type="checkbox" />
                  <strong>Superadmin</strong>
                </span>
              </label>

              <label className="admin-boolean-field">
                <span className="admin-boolean-control">
                  <input name="enabled" type="checkbox" defaultChecked />
                  <strong>Habilitado</strong>
                </span>
              </label>
            </div>

            <div className="admin-form-actions">
              <button type="submit" className="submit-order-button">
                Crear usuario admin
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {showUserEditForm ? (
        <section className="admin-section-card">
          <div className="admin-section-heading">
            <div>
              <span className="admin-pane-kicker">Edicion</span>
              <h3>Editar usuario</h3>
            </div>
            <Link href={buildAdminHref({ view: "users" })} className="admin-ghost-button">
              Cerrar
            </Link>
          </div>

          {editingUser ? (
            <>
              <div className="message">
                Si dejas la clave vacia, se mantiene la actual. La nueva clave debe
                cumplir: {ADMIN_PASSWORD_POLICY_HINT.toLowerCase()}
              </div>

              <form action={updateAdminUserAction} className="admin-config-form">
                <input type="hidden" name="userId" value={editingUser.id} />

                <div className="admin-config-grid">
                  <label className="admin-config-field">
                    <span>Usuario</span>
                    <input
                      name="username"
                      required
                      minLength={3}
                      defaultValue={editingUser.username}
                    />
                  </label>

                  <label className="admin-config-field">
                    <span>Nueva clave</span>
                    <input
                      name="password"
                      type="password"
                      minLength={8}
                      pattern={ADMIN_PASSWORD_PATTERN}
                      title={ADMIN_PASSWORD_POLICY_HINT}
                    />
                  </label>

                  <label className="admin-config-field">
                    <span>Confirmar nueva clave</span>
                    <input
                      name="passwordConfirm"
                      type="password"
                      minLength={8}
                      pattern={ADMIN_PASSWORD_PATTERN}
                      title={ADMIN_PASSWORD_POLICY_HINT}
                    />
                  </label>

                  <label className="admin-boolean-field">
                    <span className="admin-boolean-control">
                      <input
                        name="superAdmin"
                        type="checkbox"
                        defaultChecked={editingUser.superAdmin}
                      />
                      <strong>Superadmin</strong>
                    </span>
                  </label>

                  <label className="admin-boolean-field">
                    <span className="admin-boolean-control">
                      <input
                        name="enabled"
                        type="checkbox"
                        defaultChecked={editingUser.enabled}
                      />
                      <strong>Habilitado</strong>
                    </span>
                  </label>
                </div>

                <div className="admin-form-actions">
                  <button type="submit" className="submit-order-button">
                    Guardar cambios
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="message error">
              No se encontro el usuario que querias editar.
            </div>
          )}
        </section>
      ) : null}

      <section className="admin-section-card">
        <div className="admin-section-heading">
          <div>
            <span className="admin-pane-kicker">Listado</span>
            <h3>Usuarios existentes</h3>
          </div>
        </div>

        {!sessionUser.superAdmin ? (
          <div className="message">
            Tu usuario no es superadmin. Puedes ver las cuentas, pero no crear,
            editar o borrar.
          </div>
        ) : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Perfil</th>
                <th>Estado</th>
                <th>Alta</th>
                <th>Actualizacion</th>
                {sessionUser.superAdmin ? <th>Acciones</th> : null}
              </tr>
            </thead>
            <tbody>
              {adminUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.username}</strong>
                    <small>ID {user.id}</small>
                  </td>
                  <td>
                    <strong>{user.superAdmin ? "Superadmin" : "Operador"}</strong>
                  </td>
                  <td>
                    <strong>{user.enabled ? "Habilitado" : "Deshabilitado"}</strong>
                  </td>
                  <td>{formatDateTime(user.createdAt)}</td>
                  <td>{formatDateTime(user.updatedAt)}</td>
                  {sessionUser.superAdmin ? (
                    <td className="admin-user-actions-cell">
                      <div className="admin-user-action-row">
                        <Link
                          href={buildAdminHref({
                            view: "users",
                            editUser: user.id,
                          })}
                          className="admin-ghost-button"
                        >
                          Editar
                        </Link>

                        {user.id === sessionUser.id ? (
                          <span className="admin-table-note">Sesion actual</span>
                        ) : (
                          <form action={deleteAdminUserAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <button type="submit" className="admin-danger-button">
                              Borrar
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function ConfigPane(props: {
  configFields: Awaited<ReturnType<typeof getAdminConfigFields>>;
  activeConfigSlug: string;
}) {
  const { configFields, activeConfigSlug } = props;

  return (
    <section className="admin-pane">
      <AdminConfigWorkspace
        fields={configFields}
        activeSection={activeConfigSlug}
        saveAction={saveAdminSettingsAction}
      />
    </section>
  );
}

function HelpPane(props: {
  storeName: string;
  configFields: Awaited<ReturnType<typeof getAdminConfigFields>>;
  showTechnicalSection: boolean;
}) {
  const { storeName, configFields, showTechnicalSection } = props;

  return (
    <section className="admin-pane">
      <AdminHelpWorkspace
        storeName={storeName}
        configFields={configFields}
        showTechnicalSection={showTechnicalSection}
      />
    </section>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const [
    {
      saved,
      status,
      view,
      vista,
      q,
      estado,
      estado_pago,
      tipo_pedido,
      fecha_desde,
      fecha_hasta,
      system,
      system_q,
      system_article,
      config,
      error,
      create,
      editUser,
      productQ,
      product,
    },
    cookieStore,
  ] = await Promise.all([searchParams, cookies()]);
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const sessionUser = await getAdminSessionUser(token);

  if (!sessionUser) {
    redirect("/admin/login");
  }

  const activeView = normalizeView(view);
  const activeSystemSection = normalizeAdminSystemSection(
    system || (activeView === "system" ? "articulos" : undefined),
  );
  const activeSystemQuery = (system_q || productQ || "").trim();
  const activeSystemArticle = (system_article || product || "").trim();
  const activeOrderView = normalizeAdminOrderView(vista || status);
  const baseOrderFilters = normalizeOrderFilters({
    q,
    estado,
    estado_pago,
    tipo_pedido,
    fecha_desde,
    fecha_hasta,
    limit: null,
  });
  const [
    settings,
    serverSettings,
    configFields,
    filteredOrders,
    summaryOrders,
    adminUsers,
    stateColorStyle,
    initialWatchSnapshot,
    productsPaneData,
  ] = await Promise.all([
    getPublicStoreSettings(),
    getServerSettings(),
    getAdminConfigFields(),
    getOrders({
      ...baseOrderFilters,
      vista: activeOrderView === "pedidos" ? null : activeOrderView,
      limit: 120,
    }),
    getOrders({
      ...baseOrderFilters,
      vista: null,
      limit: null,
    }),
    listAdminUsers(),
    getAdminOrderStateCssVariables(),
    getWatchSnapshot(),
    activeView === "system"
      ? loadAdminProductsPaneData(activeSystemQuery, activeSystemArticle)
      : Promise.resolve({
          searchResults: [] as AdminProductImageEntry[],
          selectedProduct: null,
          loadError: null,
        }),
  ]);
  const ordersSnapshot = buildAdminOrdersSnapshot({
    orders: filteredOrders,
    allOrders: summaryOrders,
  });
  const activeConfigSlug = config || "negocio";
  const viewMeta = getViewMeta(activeView);
  const userCreateErrors = new Set([
    "user-create",
    "password-match",
    "user-password-policy",
    "user-username",
    "user-exists",
    "user-reserved",
  ]);
  const userEditErrors = new Set([
    "user-create",
    "password-match",
    "user-password-policy",
    "user-username",
    "user-exists",
    "user-reserved",
    "user-not-found",
    "user-last-superadmin",
    "user-self-disable",
    "user-self-demote",
  ]);
  const requestedEditUserId = normalizePositiveInt(editUser);
  const editingUser = requestedEditUserId
    ? adminUsers.find((user) => user.id === requestedEditUserId) || null
    : null;
  const showUserCreateForm =
    sessionUser.superAdmin &&
    (create === "1" || userCreateErrors.has(error || ""));
  const showUserEditForm =
    sessionUser.superAdmin &&
    (Boolean(editingUser) ||
      (requestedEditUserId !== null && userEditErrors.has(error || "")));
  const currentOrdersHref = buildAdminHref({
    view: "orders",
    vista: activeOrderView,
    q: baseOrderFilters.q,
    estado: baseOrderFilters.estado,
    estado_pago: baseOrderFilters.estado_pago,
    tipo_pedido: baseOrderFilters.tipo_pedido,
    fecha_desde: baseOrderFilters.fecha_desde,
    fecha_hasta: baseOrderFilters.fecha_hasta,
  });
  const showTechnicalHelp =
    sessionUser.username.trim().toLowerCase() === "useralfa";

  return (
    <main className="admin-page" style={stateColorStyle}>
      <section className="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-4 lg:px-6">
        <header className="flex flex-col gap-4 rounded-[22px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
              Admin
            </div>
            <div className="text-lg font-semibold text-[color:var(--admin-title)]">
              {settings.storeName}
            </div>
            <p className="text-sm text-[color:var(--admin-text)]">{viewMeta.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AdminThemeToggle />
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[color:var(--admin-pane-line)] px-4 text-sm font-medium text-[color:var(--admin-title)] transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            >
              Ver tienda
            </Link>
            <form action={logoutAdminAction}>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[color:var(--admin-accent)] px-4 text-sm font-semibold text-white transition hover:bg-[color:var(--admin-accent-strong)]"
              >
                Cerrar sesion
              </button>
            </form>
          </div>
        </header>

        <FlashMessages saved={saved} error={error} />
        <AdminLiveOrderWatcher
          initialSnapshot={initialWatchSnapshot}
          ordersHref={currentOrdersHref}
          refreshOnNewOrders={activeView === "orders"}
        />

        <nav
          className="flex gap-2 overflow-x-auto rounded-[18px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-2"
          aria-label="Secciones del panel"
        >
          <Link
            href={currentOrdersHref}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "orders"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Pedidos</span>
            <small className={activeView === "orders" ? "text-white/80" : "text-[color:var(--admin-text)]"}>
              {ordersSnapshot.summary.total}
            </small>
          </Link>
          <Link
            href={buildAdminHref({ view: "pickups" })}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "pickups"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Retiros</span>
            <small className={activeView === "pickups" ? "text-white/80" : "text-[color:var(--admin-text)]"}>
              {ordersSnapshot.summary.pendientes_retiro}
            </small>
          </Link>
          <Link
            href={buildAdminHref({ view: "users" })}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "users"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Usuarios</span>
            <small className={activeView === "users" ? "text-white/80" : "text-[color:var(--admin-text)]"}>
              {adminUsers.length}
            </small>
          </Link>
          <Link
            href={buildAdminHref({
              view: "system",
              system: activeSystemSection,
              system_q: activeSystemQuery,
              system_article: activeSystemArticle,
            })}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "system"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Sistema</span>
            <small className={activeView === "system" ? "text-white/80" : "text-[color:var(--admin-text)]"}>
              Catalogo
            </small>
          </Link>
          <Link
            href={buildAdminHref({ view: "config", config: activeConfigSlug })}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "config"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Configuracion</span>
            <small className={activeView === "config" ? "text-white/80" : "text-[color:var(--admin-text)]"}>
              8
            </small>
          </Link>
          <Link
            href={buildAdminHref({ view: "help" })}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "help"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Ayuda</span>
            <small className={activeView === "help" ? "text-white/80" : "text-[color:var(--admin-text)]"}>
              Guia
            </small>
          </Link>
        </nav>

        {activeView === "orders" ? (
          <OrdersPane
            ordersSnapshot={ordersSnapshot}
            activeOrderView={activeOrderView}
            baseOrderFilters={baseOrderFilters}
            currentOrdersHref={currentOrdersHref}
          />
        ) : activeView === "pickups" ? (
          <PickupDeskPane
            requirePickupFullName={serverSettings.requerirNombreApellidoAlRetirar}
            requirePickupDni={serverSettings.requerirDniAlRetirar}
          />
        ) : activeView === "users" ? (
          <UsersPane
            sessionUser={sessionUser}
            adminUsers={adminUsers}
            showUserCreateForm={showUserCreateForm}
            showUserEditForm={showUserEditForm}
            editingUser={editingUser}
          />
        ) : activeView === "system" ? (
          <SystemPane
            activeSection={activeSystemSection}
            productSearchQuery={activeSystemQuery}
            searchResults={productsPaneData.searchResults}
            selectedProduct={productsPaneData.selectedProduct}
            loadError={productsPaneData.loadError}
          />
        ) : activeView === "help" ? (
          <HelpPane
            storeName={settings.storeName}
            configFields={configFields}
            showTechnicalSection={showTechnicalHelp}
          />
        ) : (
            <ConfigPane
              configFields={configFields}
              activeConfigSlug={activeConfigSlug}
            />
        )}
      </section>
    </main>
  );
}
