import "server-only";
import { getServerSettings } from "@/lib/store-config";
import {
  createAdminSystemArticle,
  createAdminSystemBrand,
  createAdminSystemCategory,
  getAdminSystemArticleByCode,
  getAdminSystemCurrentStock,
  getNextAdminSystemArticleCode,
  getAdminSystemStockReasonId,
  getAdminSystemSummary,
  getNextAdminSystemBrandCode,
  getNextAdminSystemCategoryCode,
  insertAdminSystemStockMovement,
  insertAdminSystemStockAdjustment,
  isAdminSystemArticleWebBlocked,
  listAdminSystemArticles,
  listAdminSystemArticlesPage,
  listAdminSystemBrands,
  listAdminSystemCategories,
  listAdminSystemStockReasons,
  listAdminSystemUnits,
  setAdminSystemArticleWebBlocked,
  updateAdminSystemArticle,
} from "@/lib/repositories/adminSystemRepository";
import type {
  AdminSystemEditorMode,
  AdminSystemSection,
  AdminSystemSummary,
} from "@/lib/admin-system";

function normalizeText(value: string | null | undefined) {
  return value?.trim() || "";
}

function toNumber(value: string | number | null | undefined, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function assertRequired(value: string, label: string) {
  if (!normalizeText(value)) {
    throw new Error(`Completa ${label}.`);
  }
}

function normalizeOptionalForeignKey(value: string | null | undefined) {
  return typeof value === "string" && value.trim()
    ? value
    : null;
}

function normalizeArticleCode(value: string | null | undefined) {
  return normalizeText(value).toUpperCase();
}

export async function getAdminSystemWorkspaceData(input: {
  section: AdminSystemSection;
  query?: string | null;
  defaultDepositId?: string | null;
  articleCode?: string | null;
  articlePage?: number | null;
  stockPage?: number | null;
}) {
  const [summary, brands, categories, units, defaultStockReasonId, stockReasons, nextArticleCode] = await Promise.all([
    getAdminSystemSummary(input.defaultDepositId || null),
    listAdminSystemBrands(),
    listAdminSystemCategories(),
    listAdminSystemUnits(),
    getAdminSystemStockReasonId(null),
    listAdminSystemStockReasons(),
    getNextAdminSystemArticleCode(),
  ]);

  const shouldLoadArticles =
    input.section === "articulos";
  const shouldLoadStockArticles = input.section === "stock";
  const requestedArticlePage =
    typeof input.articlePage === "number" && Number.isFinite(input.articlePage)
      ? Math.max(1, Math.trunc(input.articlePage))
      : 1;
  const requestedStockPage =
    typeof input.stockPage === "number" && Number.isFinite(input.stockPage)
      ? Math.max(1, Math.trunc(input.stockPage))
      : 1;

  const [articlesPage, stockArticlesPage, selectedArticle] = await Promise.all([
    shouldLoadArticles
      ? listAdminSystemArticlesPage({
          query: input.query,
          depositId: summary.defaultDepositId || input.defaultDepositId || null,
          page: requestedArticlePage,
          pageSize: 100,
        })
      : Promise.resolve({
          items: [],
          totalCount: 0,
          currentPage: 1,
          pageSize: 100,
          totalPages: 1,
        }),
    shouldLoadStockArticles
      ? listAdminSystemArticlesPage({
          depositId: summary.defaultDepositId || input.defaultDepositId || null,
          page: requestedStockPage,
          pageSize: 100,
          sort: "stock_asc",
        })
      : Promise.resolve({
          items: [],
          totalCount: 0,
          currentPage: 1,
          pageSize: 100,
          totalPages: 1,
        }),
    input.articleCode
      ? getAdminSystemArticleByCode(
          input.articleCode,
          summary.defaultDepositId || input.defaultDepositId || null,
        )
      : Promise.resolve(null),
  ]);

  return {
    summary,
    brands,
    categories,
    units,
    articles: articlesPage.items,
    articleCurrentPage: articlesPage.currentPage,
    articlePageSize: articlesPage.pageSize,
    articleTotalCount: articlesPage.totalCount,
    articleTotalPages: articlesPage.totalPages,
    stockArticles: stockArticlesPage.items,
    stockCurrentPage: stockArticlesPage.currentPage,
    stockPageSize: stockArticlesPage.pageSize,
    stockTotalCount: stockArticlesPage.totalCount,
    stockTotalPages: stockArticlesPage.totalPages,
    defaultStockReasonId,
    stockReasons,
    nextArticleCode,
    selectedArticle,
  };
}

export async function createAdminSystemArticleService(input: {
  code: string;
  description: string;
  barcode?: string | null;
  supplierAccount?: string | null;
  supplierProductCode?: string | null;
  imagePath?: string | null;
  unitId?: string | null;
  brandId?: string | null;
  categoryId?: string | null;
  exempt?: boolean;
  weighable?: boolean;
  suspended?: boolean;
  suspendedForSales?: boolean;
  price?: string | number | null;
  cost?: string | number | null;
  taxRate?: string | number | null;
  username?: string | null;
}) {
  const code = normalizeArticleCode(input.code);
  const description = normalizeText(input.description);

  assertRequired(code, "el codigo del articulo");
  assertRequired(description, "la descripcion del articulo");

  const existing = await getAdminSystemArticleByCode(code);
  if (existing) {
    throw new Error(`Ya existe un articulo con el codigo ${code}.`);
  }

  const created = await createAdminSystemArticle({
    code,
    description,
    barcode: normalizeText(input.barcode) || null,
    supplierAccount: normalizeText(input.supplierAccount) || null,
    supplierProductCode: normalizeText(input.supplierProductCode) || null,
    imagePath: normalizeText(input.imagePath) || null,
    unitId: normalizeOptionalForeignKey(input.unitId),
    brandId: normalizeOptionalForeignKey(input.brandId),
    categoryId: normalizeOptionalForeignKey(input.categoryId),
    exempt: Boolean(input.exempt),
    weighable: Boolean(input.weighable),
    suspended: Boolean(input.suspended),
    suspendedForSales: Boolean(input.suspendedForSales),
    price: toNumber(input.price, 0),
    cost: toNumber(input.cost, 0),
    taxRate: toNumber(input.taxRate, 0),
    username: normalizeText(input.username) || null,
  });

  if (!created) {
    throw new Error(`No se pudo crear el articulo ${code}.`);
  }

  return created;
}

export async function updateAdminSystemArticleService(input: {
  code: string;
  description: string;
  barcode?: string | null;
  supplierAccount?: string | null;
  supplierProductCode?: string | null;
  imagePath?: string | null;
  unitId?: string | null;
  brandId?: string | null;
  categoryId?: string | null;
  exempt?: boolean;
  weighable?: boolean;
  suspended?: boolean;
  suspendedForSales?: boolean;
  price?: string | number | null;
  cost?: string | number | null;
  taxRate?: string | number | null;
  username?: string | null;
}) {
  const code = normalizeArticleCode(input.code);
  const description = normalizeText(input.description);

  assertRequired(code, "el codigo del articulo");
  assertRequired(description, "la descripcion del articulo");

  const updated = await updateAdminSystemArticle({
    code,
    description,
    barcode: normalizeText(input.barcode) || null,
    supplierAccount: normalizeText(input.supplierAccount) || null,
    supplierProductCode: normalizeText(input.supplierProductCode) || null,
    imagePath: normalizeText(input.imagePath) || null,
    unitId: normalizeOptionalForeignKey(input.unitId),
    brandId: normalizeOptionalForeignKey(input.brandId),
    categoryId: normalizeOptionalForeignKey(input.categoryId),
    exempt: Boolean(input.exempt),
    weighable: Boolean(input.weighable),
    suspended: Boolean(input.suspended),
    suspendedForSales: Boolean(input.suspendedForSales),
    price: toNumber(input.price, 0),
    cost: toNumber(input.cost, 0),
    taxRate: toNumber(input.taxRate, 0),
    username: normalizeText(input.username) || null,
  });

  if (!updated) {
    throw new Error(`No se encontro el articulo ${code}.`);
  }

  return updated;
}

export async function toggleAdminSystemArticleWebBlockedService(input: {
  code: string;
  blocked: boolean;
  username?: string | null;
}) {
  const code = normalizeArticleCode(input.code);
  assertRequired(code, "el codigo del articulo");

  const existing = await getAdminSystemArticleByCode(code);
  if (!existing) {
    throw new Error(`No se encontro el articulo ${code}.`);
  }

  return setAdminSystemArticleWebBlocked({
    articleCode: code,
    blocked: input.blocked,
    username: normalizeText(input.username) || null,
    reason: input.blocked ? "Bloqueado desde admin web" : null,
  });
}

export async function adjustAdminSystemArticleStockService(input: {
  code: string;
  targetStock: string | number | null | undefined;
  defaultDepositId?: string | null;
  defaultStockReasonId?: string | null;
  username?: string | null;
}) {
  const code = normalizeArticleCode(input.code);
  assertRequired(code, "el codigo del articulo");

  const summary: AdminSystemSummary = await getAdminSystemSummary(
    input.defaultDepositId || null,
  );
  const depositId = summary.defaultDepositId || normalizeText(input.defaultDepositId);

  if (!depositId) {
    throw new Error("No hay un deposito configurado para ajustar stock.");
  }

  const article = await getAdminSystemArticleByCode(code, depositId);
  if (!article) {
    throw new Error(`No se encontro el articulo ${code}.`);
  }

  const currentStock = await getAdminSystemCurrentStock({
    articleCode: code,
    depositId,
  });
  const nextStock = toNumber(input.targetStock, currentStock);
  const quantityDelta = nextStock - currentStock;

  if (Math.abs(quantityDelta) < 0.000001) {
    return {
      article,
      currentStock,
      nextStock,
      changed: false,
    };
  }

  const reasonId = await getAdminSystemStockReasonId(
    input.defaultStockReasonId || null,
  );

  if (!reasonId) {
    throw new Error("No hay un motivo de stock disponible para registrar el ajuste.");
  }

  await insertAdminSystemStockAdjustment({
    articleCode: code,
    depositId,
    reasonId,
    quantityDelta,
    username: normalizeText(input.username) || null,
  });

  return {
    article,
    currentStock,
    nextStock,
    changed: true,
  };
}

export async function createAdminSystemStockMovementService(input: {
  reasonId?: string | null;
  depositId?: string | null;
  linesJson?: string | null;
  observation?: string | null;
  username?: string | null;
}) {
  const reasonId = normalizeText(input.reasonId);
  const depositId = normalizeText(input.depositId);
  const observation = normalizeText(input.observation).slice(0, 50) || null;

  assertRequired(reasonId, "el motivo");
  assertRequired(depositId, "el deposito");

  let parsedLines: Array<{
    articleCode: string;
    quantityDelta: number;
  }> = [];

  try {
    const raw = JSON.parse(input.linesJson || "[]") as Array<{
      articleCode?: string;
      quantityDelta?: number | string;
    }>;

    parsedLines = raw
      .map((line) => ({
        articleCode: normalizeArticleCode(line.articleCode),
        quantityDelta: toNumber(line.quantityDelta, 0),
      }))
      .filter((line) => line.articleCode && Math.abs(line.quantityDelta) > 0.000001);
  } catch {
    throw new Error("Las lineas del movimiento no tienen un formato valido.");
  }

  if (parsedLines.length === 0) {
    throw new Error("Agrega al menos un articulo con cantidad distinta de cero.");
  }

  const mergedLines = Array.from(
    parsedLines.reduce((map, line) => {
      map.set(
        line.articleCode,
        (map.get(line.articleCode) || 0) + line.quantityDelta,
      );
      return map;
    }, new Map<string, number>()),
  )
    .map(([articleCode, quantityDelta]) => ({
      articleCode,
      quantityDelta,
    }))
    .filter((line) => Math.abs(line.quantityDelta) > 0.000001);

  if (mergedLines.length === 0) {
    throw new Error("Todas las lineas quedaron en cero.");
  }

  const settings = await getServerSettings();

  return insertAdminSystemStockMovement({
    depositId,
    reasonId,
    branch: settings.orderBranch || null,
    observation,
    username: normalizeText(input.username) || null,
    lines: mergedLines,
  });
}

export async function createAdminSystemBrandService(input: {
  code?: string | null;
  description: string;
}) {
  const description = normalizeText(input.description);
  assertRequired(description, "la descripcion de la marca");

  const generatedCode = String(
    await getNextAdminSystemBrandCode(),
  ).padStart(3, "0");
  const code = normalizeText(input.code) || generatedCode;
  assertRequired(code, "el codigo de la marca");

  const brands = await listAdminSystemBrands();
  if (brands.some((brand) => brand.code.toUpperCase() === code.toUpperCase())) {
    throw new Error(`Ya existe una marca con el codigo ${code}.`);
  }

  return createAdminSystemBrand({
    code,
    description,
  });
}

export async function createAdminSystemCategoryService(input: {
  code?: string | null;
  description: string;
}) {
  const description = normalizeText(input.description);
  assertRequired(description, "la descripcion de la categoria");

  const generatedCode = String(
    await getNextAdminSystemCategoryCode(),
  ).padStart(3, "0");
  const code = normalizeText(input.code) || generatedCode;
  assertRequired(code, "el codigo de la categoria");

  const categories = await listAdminSystemCategories();
  if (
    categories.some(
      (category) => category.code.toUpperCase() === code.toUpperCase(),
    )
  ) {
    throw new Error(`Ya existe una categoria con el codigo ${code}.`);
  }

  return createAdminSystemCategory({
    code,
    description,
  });
}

export async function getAdminSystemArticleBlockState(code: string) {
  return isAdminSystemArticleWebBlocked(normalizeArticleCode(code));
}

export function getAdminSystemArticleEditorState(input: {
  mode: AdminSystemEditorMode | null;
  selectedCode?: string | null;
}) {
  if (input.mode === "new") {
    return "new";
  }

  if (input.mode === "edit" && normalizeText(input.selectedCode)) {
    return "edit";
  }

  return null;
}
