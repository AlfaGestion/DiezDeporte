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
import { AdminArticleListGallery } from "@/components/admin/admin-article-list-gallery";
import { AdminSystemArticleImageEditorFrame } from "@/components/admin/admin-system-article-image-editor-frame";
import { AdminThemeToggle } from "@/components/admin-theme-toggle";
import {
  adminSecondaryButtonClass,
  cn,
} from "@/components/admin/admin-ui";
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
import {
  listAdminArticleBrandOptions,
  listAdminArticleCategoryOptions,
} from "@/lib/admin-product-editor";
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
import { getLegacyArticleParentId } from "@/lib/legacy-article-id";
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
    system_brand?: string;
    system_category?: string;
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
const ADMIN_INTEGER_FORMATTER = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 0,
});

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
  system_brand?: string | null;
  system_category?: string | null;
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
  return getLegacyArticleParentId(code);
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
  if (childEntry.product.defaultColor) {
    return childEntry.product.defaultColor;
  }

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

function getAdminArticleGallery(product: AdminProductImageEntry["product"]) {
  const gallery = product.imageGalleryUrls.length
    ? product.imageGalleryUrls
    : product.imageUrl
      ? [product.imageUrl]
      : [];

  return Array.from(new Set(gallery.filter(Boolean)));
}

function formatAdminInteger(value: number) {
  return ADMIN_INTEGER_FORMATTER.format(value);
}

function summarizeAdminLabels(labels: string[], limit = 4) {
  if (labels.length === 0) {
    return "Sin dato";
  }

  if (labels.length <= limit) {
    return labels.join(", ");
  }

  return `${labels.slice(0, limit).join(", ")} +${labels.length - limit}`;
}

function resolveAdminLookupLabel(
  options: Array<{ id: string; label: string }>,
  selectedId: string,
) {
  if (!selectedId) {
    return null;
  }

  return options.find((option) => option.id === selectedId)?.label || `ID ${selectedId}`;
}

function AdminSystemFilterSection(props: {
  title: string;
  selectedId: string;
  selectedLabel: string | null;
  options: Array<{ id: string; label: string }>;
  allHref: string;
  getOptionHref: (optionId: string) => string;
}) {
  const { title, selectedId, selectedLabel, options, allHref, getOptionHref } = props;
  const hasSelection = Boolean(selectedId);

  return (
    <details className="admin-filter-accordion" open={hasSelection || options.length <= 14}>
      <summary className="admin-filter-accordion-summary">
        <span className="admin-filter-accordion-title">{title}</span>
        <span className="admin-filter-accordion-trailing">
          {selectedLabel ? (
            <span className="admin-filter-current-chip" title={selectedLabel}>
              {selectedLabel}
            </span>
          ) : null}
          <span className="admin-filter-accordion-chevron" aria-hidden="true" />
        </span>
      </summary>

      <div className="admin-filter-chip-list">
        <Link href={allHref} className={cn("admin-filter-chip", !hasSelection && "is-active")}>
          Todas
        </Link>
        {options.map((option) => (
          <Link
            key={option.id}
            href={getOptionHref(option.id)}
            className={cn("admin-filter-chip", option.id === selectedId && "is-active")}
            title={option.label}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

function getAdminArticleBadgeToneClasses(
  tone: "neutral" | "accent" | "warning" | "success" | "danger",
) {
  switch (tone) {
    case "accent":
      return "border-[color:var(--admin-accent)]/20 bg-[color:var(--admin-accent-soft)] text-[color:var(--admin-accent-strong)]";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200";
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200";
    case "danger":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200";
    default:
      return "border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] text-[color:var(--admin-title)]";
  }
}

function getAdminArticleStockTone(stock: number) {
  if (stock <= 0) {
    return "danger" as const;
  }

  if (stock < 5) {
    return "warning" as const;
  }

  return "success" as const;
}

function getAdminArticleStockLabel(stock: number) {
  if (stock <= 0) {
    return "Sin stock";
  }

  if (stock < 5) {
    return "Stock bajo";
  }

  return "Disponible";
}

function getAdminArticleImageSummary(entry: AdminProductImageEntry) {
  const imageCount = getAdminArticleGallery(entry.product).length;

  if (imageCount === 0) {
    return {
      label: "Sin imagen",
      note: "Pendiente de carga en el sistema.",
      tone: "neutral" as const,
    };
  }

  if (entry.product.imageMode === "illustrative") {
    return {
      label: `Ilustrativa · ${imageCount}`,
      note: entry.product.imageNote || "Se esta usando una imagen ilustrativa.",
      tone: "warning" as const,
    };
  }

  return {
    label: `${imageCount} imagen${imageCount === 1 ? "" : "es"}`,
    note: entry.imageOverride
      ? "Personalizada desde el admin."
      : "Imagen del sistema.",
    tone: entry.imageOverride ? ("accent" as const) : ("neutral" as const),
  };
}

function getAdminGroupDisplayEntries(group: AdminProductImageGroup) {
  const primaryEntry = group.parentEntry || group.displayEntry;
  const secondaryEntries = group.parentEntry
    ? group.children
    : group.children.filter((child) => child.product.id !== primaryEntry.product.id);

  return {
    primaryEntry,
    secondaryEntries,
    allEntries: [primaryEntry, ...secondaryEntries],
  };
}

function AdminArticleListCard(props: {
  group: AdminProductImageGroup;
  activeSection: AdminSystemSection;
  productSearchQuery: string;
  activeBrandFilterId: string;
  activeCategoryFilterId: string;
  isSelectedGroup: boolean;
  selectedProductId: string | null;
}) {
  const {
    group,
    activeSection,
    productSearchQuery,
    activeBrandFilterId,
    activeCategoryFilterId,
    isSelectedGroup,
    selectedProductId,
  } = props;
  const { primaryEntry, secondaryEntries } = getAdminGroupDisplayEntries(group);
  const imageGallery = getAdminArticleGallery(primaryEntry.product);
  const imageSummary = getAdminArticleImageSummary(primaryEntry);
  const stockTone = getAdminArticleStockTone(group.groupStock);
  const editHref = buildAdminHref({
    view: "system",
    system: activeSection,
    system_q: productSearchQuery,
    system_brand: activeBrandFilterId || null,
    system_category: activeCategoryFilterId || null,
    system_article: primaryEntry.product.id,
  });
  const isPrimarySelected = selectedProductId === primaryEntry.product.id;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[24px] border transition",
        isSelectedGroup
          ? "border-[color:var(--admin-accent)]/35 bg-[color:var(--admin-pane-bg)] shadow-[0_20px_44px_rgba(13,109,216,0.12)]"
          : "border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
      )}
    >
      <div className="grid gap-4 p-4 xl:grid-cols-[220px_minmax(0,1fr)_220px] xl:p-5">
        <div className="space-y-3">
          <AdminArticleListGallery
            description={primaryEntry.product.description}
            code={primaryEntry.product.code}
            images={imageGallery}
          />
          <div className="rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
              Codigo
            </div>
            <div className="mt-1 break-all text-sm font-semibold text-[color:var(--admin-title)]">
              {primaryEntry.product.code}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-2">
            <span
              className={cn(
                "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold",
                isPrimarySelected
                  ? getAdminArticleBadgeToneClasses("accent")
                  : getAdminArticleBadgeToneClasses("neutral"),
              )}
            >
              {isPrimarySelected ? "En edicion" : group.parentEntry ? "Articulo base" : "Articulo"}
            </span>
            <span
              className={cn(
                "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold",
                getAdminArticleBadgeToneClasses(imageSummary.tone),
              )}
            >
              {imageSummary.label}
            </span>
            <span
              className={cn(
                "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold",
                group.children.length > 0
                  ? getAdminArticleBadgeToneClasses("accent")
                  : getAdminArticleBadgeToneClasses("neutral"),
              )}
            >
              {group.children.length > 0
                ? `${group.children.length} variante${group.children.length === 1 ? "" : "s"}`
                : "Sin variantes"}
            </span>
          </div>

          <div className="space-y-1">
            <h4 className="text-lg font-semibold leading-tight text-[color:var(--admin-title)]">
              {primaryEntry.product.description}
            </h4>
            <p className="text-sm text-[color:var(--admin-text)]">
              {group.parentEntry
                ? "Este articulo tiene su propia galeria y abajo se muestran los hijos por separado."
                : "Articulo simple o variante unica con galeria propia."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {primaryEntry.product.brand ? (
              <span className="admin-inline-badge">
                Marca: {primaryEntry.product.brand}
              </span>
            ) : null}
            {primaryEntry.product.category ? (
              <span className="admin-inline-badge">
                Categoria: {primaryEntry.product.category}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
                Precio
              </span>
              <strong className="mt-2 block text-base text-[color:var(--admin-title)]">
                {formatCurrency(primaryEntry.product.price)}
              </strong>
              <small className="mt-1 block text-xs text-[color:var(--admin-text)]">
                {group.children.length > 0 ? "Precio principal del grupo." : "Precio visible en catalogo."}
              </small>
            </div>

            <div className="rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
                Stock
              </span>
              <strong className="mt-2 block text-base text-[color:var(--admin-title)]">
                {formatAdminInteger(group.groupStock)}
              </strong>
              <small
                className={cn(
                  "mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                  getAdminArticleBadgeToneClasses(stockTone),
                )}
              >
                {getAdminArticleStockLabel(group.groupStock)}
              </small>
            </div>

            <div className="rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
                Imagenes
              </span>
              <strong className="mt-2 block text-base text-[color:var(--admin-title)]">
                {formatAdminInteger(imageGallery.length)}
              </strong>
              <small className="mt-1 block text-xs leading-5 text-[color:var(--admin-text)]">
                {imageSummary.note}
              </small>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
              Datos rapidos
            </div>
            <div className="mt-3 grid gap-3 text-sm">
              <div>
                <div className="text-[color:var(--admin-text)]">ID heredado</div>
                <div className="mt-1 break-all font-semibold text-[color:var(--admin-title)]">
                  {primaryEntry.product.id}
                </div>
              </div>
              <div>
                <div className="text-[color:var(--admin-text)]">Colores</div>
                <div className="mt-1 font-semibold text-[color:var(--admin-title)]">
                  {summarizeAdminLabels(group.colorLabels)}
                </div>
              </div>
              <div>
                <div className="text-[color:var(--admin-text)]">Talles</div>
                <div className="mt-1 font-semibold text-[color:var(--admin-title)]">
                  {summarizeAdminLabels(group.sizeLabels)}
                </div>
              </div>
            </div>
          </div>

          <Link
            href={editHref}
            scroll={false}
            className="inline-flex h-11 items-center justify-center rounded-[16px] bg-[color:var(--admin-accent)] px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(13,109,216,0.2)] transition hover:-translate-y-px hover:bg-[color:var(--admin-accent-strong)]"
          >
            {isPrimarySelected ? "Seguir editando" : "Editar articulo"}
          </Link>
        </div>
      </div>

      {secondaryEntries.length > 0 ? (
        <details
          className="border-t border-dashed border-[color:var(--admin-card-line)] px-4 pb-4 pt-4 xl:px-5 xl:pb-5"
          open={isSelectedGroup}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[color:var(--admin-title)] [&::-webkit-details-marker]:hidden">
            <span>{group.parentEntry ? "Ver articulos hijos" : "Ver articulos relacionados"}</span>
            <span className="text-xs font-medium text-[color:var(--admin-text)]">
              {secondaryEntries.length} articulo{secondaryEntries.length === 1 ? "" : "s"}
            </span>
          </summary>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[color:var(--admin-text)]">
            <span className="admin-inline-badge">
              Colores: {summarizeAdminLabels(group.colorLabels)}
            </span>
            <span className="admin-inline-badge">
              Talles: {summarizeAdminLabels(group.sizeLabels)}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {secondaryEntries.map((child) => {
              const childImageGallery = getAdminArticleGallery(child.product);
              const childImageSummary = getAdminArticleImageSummary(child);
              const childEditHref = buildAdminHref({
                view: "system",
                system: activeSection,
                system_q: productSearchQuery,
                system_brand: activeBrandFilterId || null,
                system_category: activeCategoryFilterId || null,
                system_article: child.product.id,
              });
              const isChildSelected = selectedProductId === child.product.id;

              return (
                <article
                  key={child.product.id}
                  className={cn(
                    "rounded-[18px] border px-4 py-4 transition",
                    isChildSelected
                      ? "border-[color:var(--admin-accent)]/35 bg-[color:var(--admin-pane-bg)] shadow-[0_14px_28px_rgba(13,109,216,0.12)]"
                      : "border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)]",
                  )}
                >
                  <div className="space-y-4">
                    <AdminArticleListGallery
                      description={child.product.description}
                      code={child.product.code}
                      images={childImageGallery}
                    />

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={cn(
                              "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold",
                              isChildSelected
                                ? getAdminArticleBadgeToneClasses("accent")
                                : getAdminArticleBadgeToneClasses("neutral"),
                            )}
                          >
                            {isChildSelected ? "En edicion" : "Hijo"}
                          </span>
                          <span
                            className={cn(
                              "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold",
                              getAdminArticleBadgeToneClasses(childImageSummary.tone),
                            )}
                          >
                            {childImageSummary.label}
                          </span>
                        </div>

                        <strong className="mt-3 block text-sm text-[color:var(--admin-title)]">
                          {child.product.description}
                        </strong>
                        <p className="mt-1 text-xs text-[color:var(--admin-text)]">
                          {getAdminVariantLabel(child.product)}
                          {" · "}
                          {extractAdminVariantColor({
                            childEntry: child,
                            parentDescription: group.displayEntry.product.description,
                          }) || "Sin color detectado"}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                          getAdminArticleBadgeToneClasses(
                            getAdminArticleStockTone(child.product.stock),
                          ),
                        )}
                      >
                        Stock {formatAdminInteger(child.product.stock)}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
                          Codigo
                        </div>
                        <div className="mt-1 break-all text-sm font-semibold text-[color:var(--admin-title)]">
                          {child.product.code}
                        </div>
                      </div>
                      <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
                          Precio
                        </div>
                        <div className="mt-1 text-sm font-semibold text-[color:var(--admin-title)]">
                          {formatCurrency(child.baseProduct.price)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-[color:var(--admin-text)]">
                        {childImageSummary.note}
                      </div>
                      <Link
                        href={childEditHref}
                        scroll={false}
                        className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[color:var(--admin-accent)] px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-[color:var(--admin-accent-strong)]"
                      >
                        {isChildSelected ? "Seguir editando" : "Editar hijo"}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      ) : null}
    </article>
  );
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

    if (input.system_brand) {
      params.set("system_brand", input.system_brand);
    }

    if (input.system_category) {
      params.set("system_category", input.system_category);
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
      "Revisa descripcion, precio, marca, categoria y variantes. Los precios deben ser mayores a cero.",
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
  brandFilterId: string | undefined,
  categoryFilterId: string | undefined,
) {
  const normalizedSearchQuery = (productSearchQuery || "").trim();
  const normalizedSelectedProductId = selectedProductId || "";
  const normalizedBrandFilterId = brandFilterId || "";
  const normalizedCategoryFilterId = categoryFilterId || "";

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

    const initialResults = await searchProductsForAdmin({
      query: normalizedSearchQuery,
      brandId: normalizedBrandFilterId,
      categoryId: normalizedCategoryFilterId,
      limit: 60,
    });
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
    const selectedProduct =
      searchResults.find((entry) => entry.product.id === normalizedSelectedProductId) || null;

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
  activeBrandFilterId: string;
  activeCategoryFilterId: string;
  searchResults: AdminProductImageEntry[];
  selectedProduct: AdminProductImageEntry | null;
  loadError: string | null;
  brandOptions: Awaited<ReturnType<typeof listAdminArticleBrandOptions>>;
  categoryOptions: Awaited<ReturnType<typeof listAdminArticleCategoryOptions>>;
}) {
  const {
    activeSection,
    productSearchQuery,
    activeBrandFilterId,
    activeCategoryFilterId,
    searchResults,
    selectedProduct,
    loadError,
    brandOptions,
    categoryOptions,
  } = props;
  const productGroups = buildAdminProductImageGroups(searchResults);
  const visibleArticleCount = productGroups.reduce(
    (sum, group) => sum + getAdminGroupDisplayEntries(group).allEntries.length,
    0,
  );
  const selectedGroup =
    selectedProduct
      ? productGroups.find(
          (group) => group.members.some((entry) => entry.product.id === selectedProduct.product.id),
        ) || null
      : null;
  const selectedEntry =
    selectedProduct && selectedGroup
      ? selectedGroup.members.find((entry) => entry.product.id === selectedProduct.product.id)
        || selectedProduct
      : selectedProduct;
  const shouldShowLinkedVariants =
    Boolean(selectedGroup?.parentEntry)
    && Boolean(selectedEntry)
    && selectedGroup?.parentEntry?.product.id === selectedEntry?.product.id;
  const activeBrandFilterLabel = resolveAdminLookupLabel(brandOptions, activeBrandFilterId);
  const activeCategoryFilterLabel = resolveAdminLookupLabel(
    categoryOptions,
    activeCategoryFilterId,
  );
  const hasActiveSystemFilters = Boolean(
    productSearchQuery || activeBrandFilterId || activeCategoryFilterId,
  );

  const editorCloseHref = buildAdminHref({
    view: "system",
    system: activeSection,
    system_q: productSearchQuery,
    system_brand: activeBrandFilterId || null,
    system_category: activeCategoryFilterId || null,
  });
  const editorReturnTo = selectedEntry
    ? buildAdminHref({
        view: "system",
        system: activeSection,
        system_q: productSearchQuery,
        system_brand: activeBrandFilterId || null,
        system_category: activeCategoryFilterId || null,
        system_article: selectedEntry.product.id,
      })
    : editorCloseHref;
  const clearFiltersHref = buildAdminHref({
    view: "system",
    system: activeSection,
  });
  const clearSearchHref = buildAdminHref({
    view: "system",
    system: activeSection,
    system_brand: activeBrandFilterId || null,
    system_category: activeCategoryFilterId || null,
  });

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
              system_brand: section === activeSection ? activeBrandFilterId || null : null,
              system_category:
                section === activeSection ? activeCategoryFilterId || null : null,
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
          resultCount={visibleArticleCount}
          searchName="system_q"
          searchPlaceholder="Buscar por codigo, descripcion o EAN"
          eyebrow="Sistema"
        />

        <section className="admin-section-card space-y-4 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="admin-pane-kicker">Filtros</span>
              <h3 className="text-lg font-semibold text-[color:var(--admin-title)]">
                Categorias y marcas
              </h3>
              <p className="mt-1 text-sm text-[color:var(--admin-text)]">
                Filtra el catalogo por categoria, marca o combinando ambos con la busqueda actual.
              </p>
            </div>

            {hasActiveSystemFilters ? (
              <Link href={clearFiltersHref} className={adminSecondaryButtonClass}>
                Limpiar filtros
              </Link>
            ) : null}
          </div>

          {productSearchQuery ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={clearSearchHref}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-4 text-sm text-[color:var(--admin-title)] transition hover:bg-white/70 dark:hover:bg-white/10"
              >
                <span>Busqueda: {productSearchQuery}</span>
                <strong aria-hidden="true">X</strong>
              </Link>
            </div>
          ) : null}

          <div className="admin-system-filter-stack">
            {categoryOptions.length > 0 ? (
              <AdminSystemFilterSection
                title="Categorias"
                selectedId={activeCategoryFilterId}
                selectedLabel={activeCategoryFilterLabel}
                options={categoryOptions}
                allHref={buildAdminHref({
                  view: "system",
                  system: activeSection,
                  system_q: productSearchQuery || null,
                  system_brand: activeBrandFilterId || null,
                })}
                getOptionHref={(optionId) =>
                  buildAdminHref({
                    view: "system",
                    system: activeSection,
                    system_q: productSearchQuery || null,
                    system_brand: activeBrandFilterId || null,
                    system_category: optionId,
                  })
                }
              />
            ) : null}

            {brandOptions.length > 0 ? (
              <AdminSystemFilterSection
                title="Marcas"
                selectedId={activeBrandFilterId}
                selectedLabel={activeBrandFilterLabel}
                options={brandOptions}
                allHref={buildAdminHref({
                  view: "system",
                  system: activeSection,
                  system_q: productSearchQuery || null,
                  system_category: activeCategoryFilterId || null,
                })}
                getOptionHref={(optionId) =>
                  buildAdminHref({
                    view: "system",
                    system: activeSection,
                    system_q: productSearchQuery || null,
                    system_brand: optionId,
                    system_category: activeCategoryFilterId || null,
                  })
                }
              />
            ) : null}
          </div>
        </section>
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
        entry={selectedEntry || null}
        publishedProduct={selectedEntry?.product || null}
        brandOptions={brandOptions.map((option) => ({
          id: option.id,
          label: option.label,
        }))}
        categoryOptions={categoryOptions.map((option) => ({
          id: option.id,
          label: option.label,
        }))}
        variantSummary={
          selectedGroup && shouldShowLinkedVariants
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
                  sizeLabel: child.baseProduct.defaultSize || getAdminVariantLabel(child.product),
                  colorLabel:
                    child.baseProduct.defaultColor || extractAdminVariantColor({
                      childEntry: child,
                      parentDescription: selectedGroup.displayEntry.product.description,
                    }) || "Sin dato",
                  price: child.baseProduct.price,
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
          {visibleArticleCount > 0 ? (
            <div className="text-sm text-[color:var(--admin-text)]">
              {visibleArticleCount} articulo{visibleArticleCount === 1 ? "" : "s"} visible{visibleArticleCount === 1 ? "" : "s"}
            </div>
          ) : null}
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
          <div className="space-y-4">
            <div className="admin-overview-grid">
              <article className="admin-overview-card">
                <span>Resultados</span>
                <strong>{formatAdminInteger(visibleArticleCount)}</strong>
                <small>Articulos individuales visibles para edicion.</small>
              </article>
              <article className="admin-overview-card tone-success">
                <span>Con imagen</span>
                <strong>
                  {formatAdminInteger(
                    productGroups.reduce(
                      (sum, group) =>
                        sum
                        + getAdminGroupDisplayEntries(group).allEntries.filter(
                          (entry) => getAdminArticleGallery(entry.product).length > 0,
                        ).length,
                      0,
                    ),
                  )}
                </strong>
                <small>Articulos que ya tienen al menos una imagen asociada.</small>
              </article>
              <article className="admin-overview-card">
                <span>Variantes</span>
                <strong>
                  {formatAdminInteger(
                    productGroups.reduce(
                      (sum, group) => sum + getAdminGroupDisplayEntries(group).secondaryEntries.length,
                      0,
                    ),
                  )}
                </strong>
                <small>Articulos hijos o relacionados visibles bajo cada grupo.</small>
              </article>
              <article className="admin-overview-card tone-warning">
                <span>Stock total</span>
                <strong>
                  {formatAdminInteger(
                    productGroups.reduce((sum, group) => sum + group.groupStock, 0),
                  )}
                </strong>
                <small>Unidades sumadas de los grupos listados.</small>
              </article>
            </div>

            <div className="space-y-4">
              {productGroups.map((group) => (
                <AdminArticleListCard
                  key={group.parentCode}
                  group={group}
                  activeSection={activeSection}
                  productSearchQuery={productSearchQuery}
                  activeBrandFilterId={activeBrandFilterId}
                  activeCategoryFilterId={activeCategoryFilterId}
                  isSelectedGroup={selectedGroup?.parentCode === group.parentCode}
                  selectedProductId={selectedEntry?.product.id || null}
                />
              ))}
            </div>
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
      system_brand,
      system_category,
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
  const activeSystemBrandId = system_brand || "";
  const activeSystemCategoryId = system_category || "";
  const activeSystemArticle = system_article || product || "";
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
    articleBrandOptions,
    articleCategoryOptions,
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
      ? loadAdminProductsPaneData(
          activeSystemQuery,
          activeSystemArticle,
          activeSystemBrandId,
          activeSystemCategoryId,
        )
      : Promise.resolve({
          searchResults: [] as AdminProductImageEntry[],
          selectedProduct: null,
          loadError: null,
        }),
    activeView === "system"
      ? listAdminArticleBrandOptions()
      : Promise.resolve([]),
    activeView === "system"
      ? listAdminArticleCategoryOptions()
      : Promise.resolve([]),
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
              system_brand: activeSystemBrandId || null,
              system_category: activeSystemCategoryId || null,
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
            activeBrandFilterId={activeSystemBrandId}
            activeCategoryFilterId={activeSystemCategoryId}
            searchResults={productsPaneData.searchResults}
            selectedProduct={productsPaneData.selectedProduct}
            loadError={productsPaneData.loadError}
            brandOptions={articleBrandOptions}
            categoryOptions={articleCategoryOptions}
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
