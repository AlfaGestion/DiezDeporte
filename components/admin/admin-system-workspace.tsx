import Link from "next/link";
import {
  createAdminSystemArticleAction,
  createAdminSystemBrandAction,
  createAdminSystemCategoryAction,
  toggleAdminSystemArticleWebBlockAction,
  updateAdminSystemArticleAction,
} from "@/app/admin/actions";
import { AdminSystemStockBoard } from "@/components/admin/admin-system-stock-board";
import {
  type AdminSystemArticleRecord,
  type AdminSystemEditorMode,
  type AdminSystemLookupOption,
  type AdminSystemSection,
  type AdminSystemSummary,
  getAdminSystemSectionLabel,
} from "@/lib/admin-system";
import {
  adminCardClass,
  adminDangerButtonClass,
  adminInputClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  cn,
} from "@/components/admin/admin-ui";
import { formatCurrency } from "@/lib/commerce";

type AdminSystemWorkspaceProps = {
  activeSection: AdminSystemSection;
  visibleSections: readonly AdminSystemSection[];
  editorMode: AdminSystemEditorMode | null;
  searchQuery: string;
  summary: AdminSystemSummary;
  articles: AdminSystemArticleRecord[];
  articleCurrentPage: number;
  articlePageSize: number;
  articleTotalCount: number;
  articleTotalPages: number;
  stockArticles: AdminSystemArticleRecord[];
  stockCurrentPage: number;
  stockPageSize: number;
  stockTotalCount: number;
  stockTotalPages: number;
  selectedArticle: AdminSystemArticleRecord | null;
  nextArticleCode: string;
  brands: AdminSystemLookupOption[];
  categories: AdminSystemLookupOption[];
  units: AdminSystemLookupOption[];
  defaultStockReasonId: string;
  stockReasons: AdminSystemLookupOption[];
};

function buildSystemHref(
  section: AdminSystemSection,
  input?: {
    query?: string | null;
    mode?: AdminSystemEditorMode | null;
    articleCode?: string | null;
    articlePage?: number | null;
    stockPage?: number | null;
  },
) {
  const params = new URLSearchParams({
    view: "system",
    system: section,
  });

  if (input?.query?.trim()) {
    params.set("system_q", input.query.trim());
  }

  if (input?.mode) {
    params.set("system_mode", input.mode);
  }

  if (input?.articleCode?.trim()) {
    params.set("system_article", input.articleCode.trim());
  }

  if (section === "articulos" && input?.articlePage && input.articlePage > 1) {
    params.set("system_article_page", String(input.articlePage));
  }

  if (section === "stock" && input?.stockPage && input.stockPage > 1) {
    params.set("system_stock_page", String(input.stockPage));
  }

  return `/admin?${params.toString()}`;
}

function renderLookupOptions(options: AdminSystemLookupOption[]) {
  return options.map((option) => (
    <option key={`${option.value}-${option.code}`} value={option.value}>
      {option.code ? `${option.code} - ${option.label}` : option.label}
    </option>
  ));
}

function SearchToolbar({
  section,
  query,
  placeholder,
  newHref,
  currentPage,
}: {
  section: AdminSystemSection;
  query: string;
  placeholder: string;
  newHref?: string | null;
  currentPage?: number | null;
}) {
  return (
    <form
      action="/admin"
      className={cn(
        adminPanelClass,
        "flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-end lg:justify-between",
      )}
    >
      <input type="hidden" name="view" value="system" />
      <input type="hidden" name="system" value={section} />
      {section === "articulos" && currentPage && currentPage > 1 ? (
        <input type="hidden" name="system_article_page" value={String(currentPage)} />
      ) : null}

      <div className="grid flex-1 gap-1.5">
        <span className="text-xs font-medium text-[color:var(--admin-text)]">
          Buscar articulo
        </span>
        <input
          type="search"
          name="system_q"
          defaultValue={query}
          className={adminInputClass}
          placeholder={placeholder}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={adminPrimaryButtonClass}>
          Buscar
        </button>
        <Link href={buildSystemHref(section)} className={adminSecondaryButtonClass}>
          Limpiar
        </Link>
        {newHref ? (
          <Link href={newHref} className={adminSecondaryButtonClass}>
            Nuevo
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className={cn(adminCardClass, "px-4 py-4")}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[color:var(--admin-title)]">
        {value}
      </div>
      <div className="mt-1 text-sm text-[color:var(--admin-text)]">{helper}</div>
    </div>
  );
}

function ArticleEditorFrame(props: {
  mode: AdminSystemEditorMode;
  searchQuery: string;
  articlePage: number;
  nextArticleCode: string;
  selectedArticle: AdminSystemArticleRecord | null;
  brands: AdminSystemLookupOption[];
  categories: AdminSystemLookupOption[];
  units: AdminSystemLookupOption[];
}) {
  const {
    mode,
    searchQuery,
    articlePage,
    nextArticleCode,
    selectedArticle,
    brands,
    categories,
    units,
  } = props;
  const isNew = mode === "new";
  const action = isNew ? createAdminSystemArticleAction : updateAdminSystemArticleAction;
  const article = selectedArticle;
  const frameTitle = isNew ? "Nuevo articulo" : "Editar articulo";
  const frameHelper = isNew
    ? "Se propone un IdArticulo libre como en el sistema original. El resto arranca vacio."
    : "Revisa los datos del articulo y guarda los cambios desde este frame.";
  const closeHref = buildSystemHref("articulos", {
    query: searchQuery,
    articlePage,
  });
  const articleCode = isNew ? nextArticleCode : article?.code || "";

  return (
    <section className={cn(adminPanelClass, "px-4 py-4")}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
            Frame
          </div>
          <h3 className="mt-1 text-xl font-semibold text-[color:var(--admin-title)]">
            {frameTitle}
          </h3>
          <p className="mt-1 text-sm text-[color:var(--admin-text)]">{frameHelper}</p>
        </div>

        <Link href={closeHref} className={adminSecondaryButtonClass}>
          Cerrar
        </Link>
      </div>

      <form action={action} className="grid gap-3 xl:grid-cols-2">
        <input type="hidden" name="systemSection" value="articulos" />
        <input type="hidden" name="systemQuery" value={searchQuery} />
        <input type="hidden" name="systemMode" value={mode} />
        <input type="hidden" name="systemArticle" value={articleCode} />
        <input type="hidden" name="systemArticlePage" value={String(articlePage)} />

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            IdArticulo
          </span>
          <input
            name="code"
            defaultValue={articleCode}
            className={adminInputClass}
            readOnly={!isNew}
            required
          />
        </label>

        <label className="grid gap-1.5 xl:col-span-2">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Descripcion
          </span>
          <input
            name="description"
            defaultValue={article?.description || ""}
            className={adminInputClass}
            required
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Codigo de barras
          </span>
          <input
            name="barcode"
            defaultValue={article?.barcode || ""}
            className={adminInputClass}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Ruta imagen
          </span>
          <input
            name="imagePath"
            defaultValue={article?.imagePath || ""}
            className={adminInputClass}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Unidad
          </span>
          <select
            name="unitId"
            defaultValue={article?.unitId || ""}
            className={adminInputClass}
          >
            <option value="">Sin unidad</option>
            {renderLookupOptions(units)}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Marca
          </span>
          <select
            name="brandId"
            defaultValue={article?.brandId || ""}
            className={adminInputClass}
          >
            <option value="">Sin marca</option>
            {renderLookupOptions(brands)}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Categoria
          </span>
          <select
            name="categoryId"
            defaultValue={article?.categoryId || ""}
            className={adminInputClass}
          >
            <option value="">Sin categoria</option>
            {renderLookupOptions(categories)}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Cuenta proveedor
          </span>
          <input
            name="supplierAccount"
            defaultValue={article?.supplierAccount || ""}
            className={adminInputClass}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Codigo proveedor
          </span>
          <input
            name="supplierProductCode"
            defaultValue={article?.supplierProductCode || ""}
            className={adminInputClass}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Precio 1
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            name="price"
            defaultValue={String(article?.price || 0)}
            className={adminInputClass}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Costo
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            name="cost"
            defaultValue={String(article?.cost || 0)}
            className={adminInputClass}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Tasa IVA
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            name="taxRate"
            defaultValue={String(article?.taxRate || 0)}
            className={adminInputClass}
          />
        </label>

        <div className="grid gap-2 rounded-[18px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-card-bg)] px-4 py-4 xl:col-span-2">
          <div className="text-sm font-medium text-[color:var(--admin-title)]">
            Opciones del articulo
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-[color:var(--admin-title)]">
              <input name="exempt" type="checkbox" defaultChecked={article?.exempt || false} />
              Exento
            </label>
            <label className="flex items-center gap-2 text-sm text-[color:var(--admin-title)]">
              <input
                name="weighable"
                type="checkbox"
                defaultChecked={article?.weighable || false}
              />
              Pesable
            </label>
            <label className="flex items-center gap-2 text-sm text-[color:var(--admin-title)]">
              <input
                name="suspended"
                type="checkbox"
                defaultChecked={article?.suspended || false}
              />
              Suspendido general
            </label>
            <label className="flex items-center gap-2 text-sm text-[color:var(--admin-title)]">
              <input
                name="suspendedForSales"
                type="checkbox"
                defaultChecked={article?.suspendedForSales || false}
              />
              Suspendido para venta
            </label>
          </div>
        </div>

        <div className="flex items-end justify-end xl:col-span-2">
          <button type="submit" className={adminPrimaryButtonClass}>
            {isNew ? "Crear articulo" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ArticlesSection(props: {
  searchQuery: string;
  editorMode: AdminSystemEditorMode | null;
  articleCurrentPage: number;
  articlePageSize: number;
  articleTotalCount: number;
  articleTotalPages: number;
  nextArticleCode: string;
  selectedArticle: AdminSystemArticleRecord | null;
  articles: AdminSystemArticleRecord[];
  brands: AdminSystemLookupOption[];
  categories: AdminSystemLookupOption[];
  units: AdminSystemLookupOption[];
}) {
  const {
    searchQuery,
    editorMode,
    articleCurrentPage,
    articlePageSize,
    articleTotalCount,
    articleTotalPages,
    nextArticleCode,
    selectedArticle,
    articles,
    brands,
    categories,
    units,
  } = props;
  const newHref = buildSystemHref("articulos", {
    query: searchQuery,
    mode: "new",
    articlePage: articleCurrentPage,
  });
  const pageRangeLabel =
    articleTotalCount === 0
      ? "Sin articulos"
      : `${(articleCurrentPage - 1) * articlePageSize + 1}-${Math.min(
          articleCurrentPage * articlePageSize,
          articleTotalCount,
        )} de ${articleTotalCount}`;
  const previousPageHref =
    articleCurrentPage > 1
      ? buildSystemHref("articulos", {
          query: searchQuery,
          articlePage: articleCurrentPage - 1,
        })
      : null;
  const nextPageHref =
    articleCurrentPage < articleTotalPages
      ? buildSystemHref("articulos", {
          query: searchQuery,
          articlePage: articleCurrentPage + 1,
        })
      : null;

  return (
    <div className="space-y-4">
      <SearchToolbar
        section="articulos"
        query={searchQuery}
        placeholder="Codigo, descripcion o codigo de barras"
        newHref={newHref}
        currentPage={articleCurrentPage}
      />

      <div className={cn(editorMode ? "grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_440px]" : "")}>
        <section className={cn(adminPanelClass, "overflow-hidden")}>
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--admin-pane-line)] px-4 py-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Articulos
              </div>
              <h3 className="mt-1 text-xl font-semibold text-[color:var(--admin-title)]">
                Listado de articulos
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(adminCardClass, "px-3 py-2 text-sm text-[color:var(--admin-title)]")}>
                {pageRangeLabel}
              </span>
              <Link href={newHref} className={adminPrimaryButtonClass}>
                Nuevo
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-[color:var(--admin-pane-line)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-[color:var(--admin-title)]">
              Pagina {articleCurrentPage} de {articleTotalPages}
              <span className="ml-2 text-[color:var(--admin-text)]">
                Top de {articlePageSize} articulos por pagina
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {previousPageHref ? (
                <Link
                  href={previousPageHref}
                  replace
                  scroll={false}
                  className={adminSecondaryButtonClass}
                >
                  Anterior
                </Link>
              ) : (
                <span
                  className={cn(
                    adminSecondaryButtonClass,
                    "pointer-events-none opacity-50",
                  )}
                >
                  Anterior
                </span>
              )}
              {nextPageHref ? (
                <Link
                  href={nextPageHref}
                  replace
                  scroll={false}
                  className={adminSecondaryButtonClass}
                >
                  Siguiente
                </Link>
              ) : (
                <span
                  className={cn(
                    adminSecondaryButtonClass,
                    "pointer-events-none opacity-50",
                  )}
                >
                  Siguiente
                </span>
              )}
            </div>
          </div>

          {articles.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[color:var(--admin-text)]">
              No se encontraron articulos para el criterio actual.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--admin-pane-line)] bg-[color:var(--admin-card-bg)] text-left text-xs uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
                    <th className="px-4 py-3">Articulo</th>
                    <th className="px-4 py-3">Descripcion</th>
                    <th className="px-4 py-3">Marca</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3 text-right">Precio</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((article) => {
                    const editHref = buildSystemHref("articulos", {
                      query: searchQuery,
                      mode: "edit",
                      articleCode: article.code,
                      articlePage: articleCurrentPage,
                    });

                    return (
                      <tr
                        key={article.id}
                        className="border-t border-[color:var(--admin-pane-line)] text-[color:var(--admin-title)]"
                      >
                        <td className="px-4 py-3 font-semibold">{article.code}</td>
                        <td className="px-4 py-3">{article.description}</td>
                        <td className="px-4 py-3">{article.brandName || "Sin marca"}</td>
                        <td className="px-4 py-3">{article.categoryName || "Sin categoria"}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatCurrency(article.price)}
                        </td>
                        <td className="px-4 py-3">{article.stock.toFixed(0)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {article.webBlocked ? (
                              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                                Oculto web
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                                Visible web
                              </span>
                            )}
                            {article.suspended ? (
                              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-400/10 dark:text-slate-200">
                                Suspendido
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Link href={editHref} className={adminSecondaryButtonClass}>
                              Editar
                            </Link>
                            <form action={toggleAdminSystemArticleWebBlockAction}>
                              <input type="hidden" name="systemSection" value="articulos" />
                              <input type="hidden" name="systemQuery" value={searchQuery} />
                              <input type="hidden" name="systemMode" value={editorMode || ""} />
                              <input
                                type="hidden"
                                name="systemArticlePage"
                                value={String(articleCurrentPage)}
                              />
                              <input
                                type="hidden"
                                name="systemArticle"
                                value={selectedArticle?.code || ""}
                              />
                              <input type="hidden" name="code" value={article.code} />
                              <input
                                type="hidden"
                                name="blocked"
                                value={article.webBlocked ? "0" : "1"}
                              />
                              <button
                                type="submit"
                                className={
                                  article.webBlocked
                                    ? adminSecondaryButtonClass
                                    : adminDangerButtonClass
                                }
                              >
                                {article.webBlocked ? "Mostrar web" : "Ocultar web"}
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {editorMode ? (
          editorMode === "edit" && !selectedArticle ? (
            <section className={cn(adminPanelClass, "px-4 py-4")}>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                  Frame
                </div>
                <h3 className="mt-1 text-xl font-semibold text-[color:var(--admin-title)]">
                  Articulo no encontrado
                </h3>
                <p className="mt-1 text-sm text-[color:var(--admin-text)]">
                  No se pudo cargar el articulo solicitado. Vuelve al listado y selecciona otro.
                </p>
              </div>

              <Link
                href={buildSystemHref("articulos", {
                  query: searchQuery,
                  articlePage: articleCurrentPage,
                })}
                className={adminSecondaryButtonClass}
              >
                Volver al listado
              </Link>
            </section>
          ) : (
            <ArticleEditorFrame
              mode={editorMode}
              searchQuery={searchQuery}
              articlePage={articleCurrentPage}
              nextArticleCode={nextArticleCode}
              selectedArticle={selectedArticle}
              brands={brands}
              categories={categories}
              units={units}
            />
          )
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-[color:var(--admin-text)]">
          {pageRangeLabel} articulos cargados en esta consulta.
        </div>

        <div className="flex flex-wrap gap-2">
          {previousPageHref ? (
            <Link
              href={previousPageHref}
              replace
              scroll={false}
              className={adminSecondaryButtonClass}
            >
              Anterior
            </Link>
          ) : null}
          {nextPageHref ? (
            <Link
              href={nextPageHref}
              replace
              scroll={false}
              className={adminSecondaryButtonClass}
            >
              Siguiente
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LookupSection({
  title,
  description,
  section,
  createAction,
  items,
}: {
  title: string;
  description: string;
  section: AdminSystemSection;
  createAction: (formData: FormData) => void | Promise<void>;
  items: AdminSystemLookupOption[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className={cn(adminPanelClass, "px-4 py-4")}>
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
            Alta
          </div>
          <h3 className="mt-1 text-xl font-semibold text-[color:var(--admin-title)]">
            {title}
          </h3>
          <p className="mt-1 text-sm text-[color:var(--admin-text)]">{description}</p>
        </div>

        <form action={createAction} className="grid gap-3">
          <input type="hidden" name="systemSection" value={section} />
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-[color:var(--admin-text)]">
              Codigo
            </span>
            <input name="code" className={adminInputClass} placeholder="Opcional" />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-[color:var(--admin-text)]">
              Descripcion
            </span>
            <input name="description" className={adminInputClass} required />
          </label>

          <button type="submit" className={cn(adminPrimaryButtonClass, "w-full")}>
            Guardar
          </button>
        </form>
      </section>

      <section className={cn(adminPanelClass, "px-4 py-4")}>
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
            Existentes
          </div>
          <h3 className="mt-1 text-xl font-semibold text-[color:var(--admin-title)]">
            {title} cargadas
          </h3>
        </div>

        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={`${item.value}-${item.code}`}
              className="rounded-full border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-card-bg)] px-3 py-1.5 text-sm text-[color:var(--admin-title)]"
            >
              {item.code ? `${item.code} - ${item.label}` : item.label}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AdminSystemWorkspace(props: AdminSystemWorkspaceProps) {
  const {
    activeSection,
    visibleSections,
    editorMode,
    searchQuery,
    summary,
    articles,
    articleCurrentPage,
    articlePageSize,
    articleTotalCount,
    articleTotalPages,
    stockArticles,
    stockCurrentPage,
    stockPageSize,
    stockTotalCount,
    stockTotalPages,
    selectedArticle,
    nextArticleCode,
    brands,
    categories,
    units,
    defaultStockReasonId,
    stockReasons,
  } = props;

  return (
    <section className="admin-pane space-y-4">
      <div className={cn(adminPanelClass, "px-4 py-4")}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="admin-pane-kicker">Sistema</span>
            <h2 className="text-2xl font-semibold text-[color:var(--admin-title)]">
              Gestion del catalogo y maestros
            </h2>
            <p className="max-w-3xl text-sm text-[color:var(--admin-text)]">
              Administra articulos, oculta productos en la web, carga movimientos de stock y mantiene marcas y categorias.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-[color:var(--admin-text)]">
            <span className="rounded-full bg-[color:var(--admin-accent-soft)] px-3 py-1 font-medium text-[color:var(--admin-accent-strong)]">
              Deposito web: {summary.defaultDepositLabel || summary.defaultDepositId || "sin configurar"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Articulos"
          value={String(summary.articleCount)}
          helper="Registros cargados en el maestro"
        />
        <SummaryCard
          label="Bloqueados web"
          value={String(summary.blockedArticleCount)}
          helper="Ocultos en la tienda online"
        />
        <SummaryCard
          label="Marcas"
          value={String(summary.brandCount)}
          helper="Tipos de articulo disponibles"
        />
        <SummaryCard
          label="Categorias"
          value={String(summary.categoryCount)}
          helper="Rubros disponibles en el sistema"
        />
      </div>

      <nav
        className={cn(adminPanelClass, "overflow-x-auto px-2 py-2")}
        aria-label="Submenu de sistema"
      >
        <div className="flex min-w-max gap-2">
          {visibleSections.map((section) => (
            <Link
              key={section}
              href={buildSystemHref(section, {
                articlePage:
                  section === "articulos" && activeSection === "articulos"
                    ? articleCurrentPage
                    : null,
                stockPage:
                  section === "stock" && activeSection === "stock"
                    ? stockCurrentPage
                    : null,
              })}
              className={cn(
                "inline-flex items-center gap-2 rounded-[14px] px-4 py-2.5 text-sm transition",
                activeSection === section
                  ? "bg-[color:var(--admin-accent)] text-white"
                  : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
              )}
            >
              {getAdminSystemSectionLabel(section)}
            </Link>
          ))}
        </div>
      </nav>

      {activeSection === "articulos" ? (
        <ArticlesSection
          searchQuery={searchQuery}
          editorMode={editorMode}
          articleCurrentPage={articleCurrentPage}
          articlePageSize={articlePageSize}
          articleTotalCount={articleTotalCount}
          articleTotalPages={articleTotalPages}
          nextArticleCode={nextArticleCode}
          selectedArticle={selectedArticle}
          articles={articles}
          brands={brands}
          categories={categories}
          units={units}
        />
      ) : activeSection === "stock" ? (
        <AdminSystemStockBoard
          defaultDepositId={summary.defaultDepositId}
          defaultDepositLabel={summary.defaultDepositLabel}
          defaultStockReasonId={defaultStockReasonId}
          stockReasons={stockReasons}
          stockArticles={stockArticles}
          stockCurrentPage={stockCurrentPage}
          stockPageSize={stockPageSize}
          stockTotalCount={stockTotalCount}
          stockTotalPages={stockTotalPages}
          previousPageHref={
            stockCurrentPage > 1
              ? buildSystemHref("stock", { stockPage: stockCurrentPage - 1 })
              : null
          }
          nextPageHref={
            stockCurrentPage < stockTotalPages
              ? buildSystemHref("stock", { stockPage: stockCurrentPage + 1 })
              : null
          }
        />
      ) : activeSection === "marcas" ? (
        <LookupSection
          title="Marcas"
          description="Carga nuevas marcas para que queden disponibles al crear o editar articulos."
          section="marcas"
          createAction={createAdminSystemBrandAction}
          items={brands}
        />
      ) : (
        <LookupSection
          title="Categorias"
          description="Carga nuevas categorias para que queden disponibles en el maestro y en los filtros de la web."
          section="categorias"
          createAction={createAdminSystemCategoryAction}
          items={categories}
        />
      )}
    </section>
  );
}
