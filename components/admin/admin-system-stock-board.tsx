"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createAdminSystemStockMovementAction } from "@/app/admin/actions";
import {
  adminCardClass,
  adminInputClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  cn,
} from "@/components/admin/admin-ui";
import type { AdminSystemArticleRecord, AdminSystemLookupOption } from "@/lib/admin-system";

type StockSearchArticle = {
  code: string;
  description: string;
  brandName: string;
  categoryName: string;
  unitLabel: string | null;
  stock: number;
};

type StockMovementLine = StockSearchArticle & {
  quantityDelta: number;
};

type AdminSystemStockBoardProps = {
  defaultDepositId: string;
  defaultDepositLabel: string | null;
  defaultStockReasonId: string;
  stockReasons: AdminSystemLookupOption[];
  stockArticles: AdminSystemArticleRecord[];
  stockCurrentPage: number;
  stockPageSize: number;
  stockTotalCount: number;
  stockTotalPages: number;
  previousPageHref: string | null;
  nextPageHref: string | null;
};

function renderLookupOptions(options: AdminSystemLookupOption[]) {
  return options.map((option) => (
    <option key={`${option.value}-${option.code}`} value={option.value}>
      {option.code ? `${option.code} - ${option.label}` : option.label}
    </option>
  ));
}

function mapStockArticleToMovementLine(
  article: Pick<
    AdminSystemArticleRecord,
    "code" | "description" | "brandName" | "categoryName" | "unitLabel" | "stock"
  >,
): StockSearchArticle {
  return {
    code: article.code,
    description: article.description,
    brandName: article.brandName,
    categoryName: article.categoryName,
    unitLabel: article.unitLabel,
    stock: article.stock,
  };
}

export function AdminSystemStockBoard({
  defaultDepositId,
  defaultDepositLabel,
  defaultStockReasonId,
  stockReasons,
  stockArticles,
  stockCurrentPage,
  stockPageSize,
  stockTotalCount,
  stockTotalPages,
  previousPageHref,
  nextPageHref,
}: AdminSystemStockBoardProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const initialReasonId = defaultStockReasonId || stockReasons[0]?.value || "";
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [stockListQuery, setStockListQuery] = useState("");
  const deferredStockListQuery = useDeferredValue(stockListQuery.trim().toLowerCase());
  const [results, setResults] = useState<StockSearchArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReasonId, setSelectedReasonId] = useState(initialReasonId);
  const [lines, setLines] = useState<StockMovementLine[]>([]);
  const [submitState, setSubmitState] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const linesJson = useMemo(
    () =>
      JSON.stringify(
        lines.map((line) => ({
          articleCode: line.code,
          quantityDelta: line.quantityDelta,
        })),
      ),
    [lines],
  );
  const lineQuantities = useMemo(
    () => new Map(lines.map((line) => [line.code, line.quantityDelta])),
    [lines],
  );
  const pageRangeLabel = useMemo(() => {
    if (stockTotalCount === 0) {
      return "Sin articulos";
    }

    const pageStart = (stockCurrentPage - 1) * stockPageSize + 1;
    const pageEnd = Math.min(stockCurrentPage * stockPageSize, stockTotalCount);
    return `${pageStart}-${pageEnd} de ${stockTotalCount}`;
  }, [stockCurrentPage, stockPageSize, stockTotalCount]);
  const filteredStockArticles = useMemo(() => {
    if (!deferredStockListQuery) {
      return stockArticles;
    }

    return stockArticles.filter((article) => {
      const haystack = [
        article.code,
        article.description,
        article.barcode,
        article.supplierProductCode,
        article.brandName,
        article.categoryName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(deferredStockListQuery);
    });
  }, [deferredStockListQuery, stockArticles]);

  useEffect(() => {
    if (!deferredQuery) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(
      `/api/admin/system/articles?q=${encodeURIComponent(deferredQuery)}&depositId=${encodeURIComponent(defaultDepositId)}&limit=12`,
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { articles?: StockSearchArticle[]; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || "No se pudieron consultar los articulos.");
        }

        setResults(payload?.articles || []);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Stock search error", error);
        setResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [defaultDepositId, deferredQuery]);

  const addLine = (article: StockSearchArticle) => {
    setLines((current) => {
      const existing = current.find((line) => line.code === article.code);

      if (existing) {
        return current.map((line) =>
          line.code === article.code
            ? { ...line, quantityDelta: line.quantityDelta + 1 }
            : line,
        );
      }

      return [...current, { ...article, quantityDelta: 1 }];
    });

    setQuery("");
    setResults([]);
  };

  const updateQuantity = (code: string, nextValue: number) => {
    setLines((current) =>
      current.map((line) =>
        line.code === code ? { ...line, quantityDelta: nextValue } : line,
      ),
    );
  };

  const removeLine = (code: string) => {
    setLines((current) => current.filter((line) => line.code !== code));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitState(null);

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createAdminSystemStockMovementAction(formData);

      if (!result?.ok) {
        setSubmitState({
          type: "error",
          message: result?.detail || "No se pudo registrar el movimiento de stock.",
        });
        return;
      }

      formRef.current?.reset();
      setSelectedReasonId(initialReasonId);
      setLines([]);
      setQuery("");
      setResults([]);
      setSubmitState({
        type: "success",
        message: result.movementNumber
          ? `Movimiento ${result.movementNumber} grabado correctamente.`
          : "Movimiento grabado correctamente.",
      });
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <section className={cn(adminPanelClass, "px-4 py-4")}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Movimiento de stock
            </div>
            <h3 className="mt-1 text-xl font-semibold text-[color:var(--admin-title)]">
              Cargar movimiento
            </h3>
            <p className="mt-1 text-sm text-[color:var(--admin-text)]">
              Agrega los articulos, define la cantidad positiva o negativa y graba el movimiento con un motivo.
            </p>
          </div>

          <div className="rounded-full bg-[color:var(--admin-accent-soft)] px-3 py-1 text-sm font-medium text-[color:var(--admin-accent-strong)]">
            Deposito: {defaultDepositLabel || defaultDepositId || "sin configurar"}
          </div>
        </div>

        {submitState ? (
          <div
            className={cn(
              "mb-4 rounded-[18px] border px-4 py-3 text-sm",
              submitState.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200",
            )}
          >
            {submitState.message}
          </div>
        ) : null}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="systemSection" value="stock" />
          <input type="hidden" name="depositId" value={defaultDepositId} />
          <input type="hidden" name="linesJson" value={linesJson} />

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[color:var(--admin-text)]">
                Deposito
              </span>
              <input
                value={defaultDepositLabel || defaultDepositId || ""}
                className={cn(adminInputClass, "opacity-80")}
                readOnly
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[color:var(--admin-text)]">
                Motivo
              </span>
              <select
                name="reasonId"
                value={selectedReasonId}
                onChange={(event) => setSelectedReasonId(event.target.value)}
                className={adminInputClass}
                required
              >
                <option value="">Selecciona un motivo</option>
                {renderLookupOptions(stockReasons)}
              </select>
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-[color:var(--admin-text)]">
              Observacion
            </span>
            <textarea
              name="observation"
              rows={3}
              maxLength={50}
              className={cn(adminInputClass, "min-h-[96px] resize-y py-3")}
              placeholder="Detalle corto del movimiento"
            />
          </label>

          <div className="overflow-hidden rounded-[18px] border border-[color:var(--admin-pane-line)]">
            <div className="grid grid-cols-[140px_minmax(0,1fr)_120px_120px_120px] gap-0 bg-[color:var(--admin-card-bg)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
              <div>Articulo</div>
              <div>Descripcion</div>
              <div>Unidad</div>
              <div>Stock actual</div>
              <div>Cantidad</div>
            </div>

            {lines.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[color:var(--admin-text)]">
                Todavia no agregaste articulos al movimiento.
              </div>
            ) : (
              <div className="divide-y divide-[color:var(--admin-pane-line)]">
                {lines.map((line) => (
                  <div
                    key={line.code}
                    className="grid grid-cols-[140px_minmax(0,1fr)_120px_120px_120px_80px] gap-3 px-4 py-3"
                  >
                    <div className="text-sm font-semibold text-[color:var(--admin-title)]">
                      {line.code}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[color:var(--admin-title)]">
                        {line.description}
                      </div>
                      <div className="text-xs text-[color:var(--admin-text)]">
                        {[line.brandName, line.categoryName].filter(Boolean).join(" / ") || "Sin clasificacion"}
                      </div>
                    </div>
                    <div className="text-sm text-[color:var(--admin-title)]">
                      {line.unitLabel || "Sin unidad"}
                    </div>
                    <div className="text-sm text-[color:var(--admin-title)]">
                      {line.stock.toFixed(0)}
                    </div>
                    <input
                      type="number"
                      step="1"
                      value={String(line.quantityDelta)}
                      onChange={(event) =>
                        updateQuantity(line.code, Number(event.target.value || "0"))
                      }
                      className={cn(adminInputClass, "h-10")}
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(line.code)}
                      className={cn(adminSecondaryButtonClass, "h-10 px-3")}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className={adminPrimaryButtonClass}
              disabled={lines.length === 0 || isPending}
            >
              {isPending ? "Grabando..." : "Grabar movimiento"}
            </button>
          </div>
        </form>
        </section>

        <section className={cn(adminPanelClass, "px-4 py-4")}>
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
            Buscar articulos
          </div>
          <h3 className="mt-1 text-xl font-semibold text-[color:var(--admin-title)]">
            Consultar y agregar
          </h3>
          <p className="mt-1 text-sm text-[color:var(--admin-text)]">
            Escribe codigo, descripcion o codigo de barras para encontrar el articulo y sumarlo al movimiento.
          </p>
        </div>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Buscar articulo
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={adminInputClass}
            placeholder="Ej. 123, botin, reebok..."
          />
        </label>

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="text-sm text-[color:var(--admin-text)]">Buscando articulos...</div>
          ) : !deferredQuery ? (
            <div className="text-sm text-[color:var(--admin-text)]">
              Empieza a escribir para ver resultados.
            </div>
          ) : results.length === 0 ? (
            <div className="text-sm text-[color:var(--admin-text)]">
              No hay resultados para la busqueda actual.
            </div>
          ) : (
            results.map((article) => (
              <article
                key={article.code}
                className="rounded-[18px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-card-bg)] px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
                      {article.code}
                    </div>
                    <div className="text-sm font-semibold text-[color:var(--admin-title)]">
                      {article.description}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--admin-text)]">
                      {[article.brandName, article.categoryName].filter(Boolean).join(" / ") || "Sin clasificacion"}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--admin-text)]">
                      Stock actual: {article.stock.toFixed(0)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => addLine(article)}
                    className={cn(adminSecondaryButtonClass, "h-10 px-3")}
                  >
                    Agregar
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        </section>
      </div>

      <section className={cn(adminPanelClass, "px-4 py-4")}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Consulta de stock
            </div>
            <h3 className="mt-1 text-xl font-semibold text-[color:var(--admin-title)]">
              Articulos por pagina
            </h3>
            <p className="mt-1 text-sm text-[color:var(--admin-text)]">
              Se cargan 100 articulos por pagina, siempre ordenados del stock mas bajo al mas alto para que responda mas rapido.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className={cn(adminCardClass, "px-3 py-2 text-sm text-[color:var(--admin-title)]")}>
              {pageRangeLabel}
            </div>
            <div className={cn(adminCardClass, "px-3 py-2 text-sm text-[color:var(--admin-title)]")}>
              {filteredStockArticles.length} visibles en pagina
            </div>
          </div>
        </div>

        <label className="grid gap-1.5 lg:max-w-md">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">
            Filtrar listado
          </span>
          <input
            value={stockListQuery}
            onChange={(event) => setStockListQuery(event.target.value)}
            className={adminInputClass}
            placeholder="Codigo, descripcion, marca o categoria..."
          />
        </label>

        <div className="mt-4 flex flex-col gap-3 rounded-[18px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-card-bg)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-[color:var(--admin-title)]">
            Pagina {stockCurrentPage} de {stockTotalPages}
            <span className="ml-2 text-[color:var(--admin-text)]">
              Top de {stockPageSize} articulos por pagina
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

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--admin-pane-line)] bg-[color:var(--admin-card-bg)] text-left text-xs uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Articulo</th>
                <th className="px-4 py-3">Descripcion</th>
                <th className="px-4 py-3">Marca</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3 text-right">Accion</th>
              </tr>
            </thead>
            <tbody>
              {filteredStockArticles.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-sm text-[color:var(--admin-text)]"
                  >
                    No hay articulos para el filtro actual.
                  </td>
                </tr>
              ) : (
                filteredStockArticles.map((article) => (
                  <tr
                    key={`stock-${article.id}`}
                    className="border-t border-[color:var(--admin-pane-line)] text-[color:var(--admin-title)]"
                  >
                    <td className="px-4 py-3 font-semibold">{article.stock.toFixed(0)}</td>
                    <td className="px-4 py-3 font-medium">{article.code}</td>
                    <td className="px-4 py-3">{article.description}</td>
                    <td className="px-4 py-3">{article.brandName || "Sin marca"}</td>
                    <td className="px-4 py-3">{article.categoryName || "Sin categoria"}</td>
                    <td className="px-4 py-3">{article.unitLabel || "Sin unidad"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => addLine(mapStockArticleToMovementLine(article))}
                          className={cn(adminSecondaryButtonClass, "h-9 px-3 whitespace-nowrap")}
                        >
                          {lineQuantities.has(article.code)
                            ? `Sumar (${lineQuantities.get(article.code)})`
                            : "Agregar stock"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
      </section>
    </div>
  );
}
