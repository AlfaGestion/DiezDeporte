import { EmptyState } from "@/components/admin/empty-state";
import { adminPanelClass, cn } from "@/components/admin/admin-ui";
import { formatCurrency } from "@/lib/commerce";
import type { OrderDocumentItem, StoredOrder } from "@/lib/types";

export function OrderProductsCard({
  order,
  items,
}: {
  order: StoredOrder;
  items: OrderDocumentItem[];
}) {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);

  if (items.length === 0) {
    return (
      <EmptyState
        title="Sin articulos visibles"
        message="No se encontraron lineas del comprobante ni detalle auxiliar para este pedido."
      />
    );
  }

  return (
    <section className={cn(adminPanelClass, "overflow-hidden")}>
      <div className="flex items-center justify-between px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--admin-title)]">Productos</h2>
          <p className="mt-1 text-sm text-[color:var(--admin-text)]">
            {items.length} lineas en el comprobante.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto border-t border-[color:var(--admin-pane-line)]">
        <table className="min-w-[760px] w-full border-collapse text-sm">
          <thead className="bg-[color:var(--admin-table-head-bg)] text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-table-head-text)]">
            <tr>
              <th className="px-5 py-4">#</th>
              <th className="px-5 py-4">Articulo</th>
              <th className="px-5 py-4">Descripcion</th>
              <th className="px-5 py-4 text-right">Cantidad</th>
              <th className="px-5 py-4 text-right">Unitario</th>
              <th className="px-5 py-4 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.tc}-${item.idComprobante}-${item.sequence}-${item.articleId}`} className="border-t border-[color:var(--admin-table-row-line)]">
                <td className="px-5 py-4 text-[color:var(--admin-text)]">{item.sequence || "-"}</td>
                <td className="px-5 py-4 font-medium text-[color:var(--admin-title)]">
                  {item.articleId || "Sin codigo"}
                </td>
                <td className="px-5 py-4 text-[color:var(--admin-title)]">{item.description || "Sin descripcion"}</td>
                <td className="px-5 py-4 text-right tabular-nums text-[color:var(--admin-title)]">
                  {item.quantity}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-[color:var(--admin-title)]">
                  {formatCurrency(item.unitPrice)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums font-medium text-[color:var(--admin-title)]">
                  {formatCurrency(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[color:var(--admin-table-row-line)] bg-[color:var(--admin-card-bg)]">
              <td colSpan={5} className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Subtotal
              </td>
              <td className="px-5 py-4 text-right tabular-nums font-semibold text-[color:var(--admin-title)]">
                {formatCurrency(subtotal || order.monto_total)}
              </td>
            </tr>
            <tr className="border-t border-[color:var(--admin-table-row-line)] bg-[color:var(--admin-accent-soft)]">
              <td colSpan={5} className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-title)]">
                Total pedido
              </td>
              <td className="px-5 py-4 text-right tabular-nums font-semibold text-[color:var(--admin-title)]">
                {formatCurrency(order.monto_total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
