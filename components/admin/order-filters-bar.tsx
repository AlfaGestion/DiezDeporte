import Link from "next/link";
import type { OrderFilters, OrderListView } from "@/lib/types";
import {
  adminInputClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  cn,
} from "@/components/admin/admin-ui";

export function OrderFiltersBar({
  activeOrderView,
  filters,
  clearHref,
}: {
  activeOrderView: OrderListView;
  filters: OrderFilters;
  clearHref: string;
}) {
  return (
    <div className={cn(adminPanelClass, "px-4 py-4")}>
      <div className="grid gap-3 xl:grid-cols-[1.1fr_1fr_1fr_0.95fr_0.95fr_auto]">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">Estado de pago</span>
          <select name="estado_pago" defaultValue={filters.estado_pago || ""} className={adminInputClass}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">Tipo de pedido</span>
          <select name="tipo_pedido" defaultValue={filters.tipo_pedido || ""} className={adminInputClass}>
            <option value="">Todos</option>
            <option value="retiro">Retiro</option>
            <option value="envio">Envio</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">Estado</span>
          <select name="estado" defaultValue={filters.estado || ""} className={adminInputClass}>
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="APROBADO">Aprobado</option>
            <option value="FACTURADO">Facturado</option>
            <option value="PREPARANDO">Preparando</option>
            <option value="LISTO_PARA_RETIRO">Listo para retirar</option>
            <option value="ENVIADO">Enviado</option>
            <option value="ENTREGADO">Entregado</option>
            <option value="CANCELADO">Cancelado</option>
            <option value="ERROR">Error</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">Desde</span>
          <input type="date" name="fecha_desde" defaultValue={filters.fecha_desde || ""} className={adminInputClass} />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-[color:var(--admin-text)]">Hasta</span>
          <input type="date" name="fecha_hasta" defaultValue={filters.fecha_hasta || ""} className={adminInputClass} />
        </label>

        <div className="flex items-end gap-2 xl:justify-end">
          <button type="submit" className={cn(adminPrimaryButtonClass, "flex-1 xl:flex-none")}>
            Filtrar
          </button>
          <Link href={clearHref} className={cn(adminSecondaryButtonClass, "flex-1 xl:flex-none")}>
            Limpiar
          </Link>
        </div>
      </div>

      <input type="hidden" name="view" value="orders" />
      {activeOrderView !== "pedidos" ? <input type="hidden" name="vista" value={activeOrderView} /> : null}
    </div>
  );
}
