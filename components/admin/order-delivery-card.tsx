import { adminCardClass, cn, formatAdminDateTime } from "@/components/admin/admin-ui";
import { PickupStatusBadge } from "@/components/admin/pickup-status-badge";
import { getOrderTypeLabel } from "@/lib/order-admin";
import type { StoredOrder } from "@/lib/types";

export function OrderDeliveryCard({
  order,
  documentNumber,
  documentTc,
}: {
  order: StoredOrder;
  documentNumber: string;
  documentTc: string | null;
}) {
  const isPickup = order.tipo_pedido === "retiro";
  const pickupCode = order.metadata.pickupCode || "Sin codigo";
  const qrPanelStyle = {
    background:
      "linear-gradient(180deg, color-mix(in srgb, var(--admin-accent) 8%, var(--surface) 92%), color-mix(in srgb, var(--surface-soft) 78%, var(--surface) 22%))",
  };

  return (
    <section className={cn(adminCardClass, "space-y-4 p-5")}>
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--admin-title)]">Entrega</h2>
        <p className="mt-1 text-sm text-[color:var(--admin-text)]">
          Modalidad, referencia operativa y seguimiento.
        </p>
      </div>

      <div className="rounded-[18px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
                {isPickup ? "Retiro en local" : "Entrega a domicilio"}
              </div>
              <div className="text-base font-semibold text-[color:var(--admin-title)]">
                {isPickup
                  ? "Presenta este codigo y el QR en el mostrador."
                  : order.metadata.customerAddress || order.direccion || "Sin direccion cargada"}
              </div>
              <div className="text-sm text-[color:var(--admin-text)]">
                {isPickup
                  ? `Codigo de retiro: ${pickupCode}`
                  : `${documentTc || "NP"} ${documentNumber}`}
              </div>
            </div>

            {isPickup ? (
              <PickupStatusBadge redeemed={order.retirado === "SI"} className="w-fit" />
            ) : null}
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Tipo
              </dt>
              <dd className="mt-1 text-sm font-medium text-[color:var(--admin-title)]">
                {getOrderTypeLabel(order.tipo_pedido)}
              </dd>
            </div>
            <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Referencia
              </dt>
              <dd className="mt-1 break-all text-sm font-medium text-[color:var(--admin-title)]">
                {isPickup ? pickupCode : `${documentTc || "NP"} ${documentNumber}`}
              </dd>
            </div>
            <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Direccion
              </dt>
              <dd className="mt-1 text-sm text-[color:var(--admin-title)]">
                {isPickup
                  ? "Retiro en local"
                  : order.metadata.customerAddress || order.direccion || "Sin direccion"}
              </dd>
            </div>
            <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Seguimiento
              </dt>
              <dd className="mt-1 text-sm text-[color:var(--admin-title)]">
                {isPickup ? "No aplica" : order.numero_seguimiento || "Sin seguimiento"}
              </dd>
            </div>
            {isPickup ? (
              <>
                <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                    Fecha de retiro
                  </dt>
                  <dd className="mt-1 text-sm text-[color:var(--admin-title)]">
                    {order.retirado === "SI"
                      ? formatAdminDateTime(order.fecha_hora_retiro)
                      : "Todavia no retirado"}
                  </dd>
                </div>
                <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                    Retirado por
                  </dt>
                  <dd className="mt-1 text-sm text-[color:var(--admin-title)]">
                    {order.nombre_apellido_retiro || "Sin registrar"}
                  </dd>
                </div>
                <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                    DNI
                  </dt>
                  <dd className="mt-1 text-sm text-[color:var(--admin-title)]">
                    {order.dni_retiro || "Sin registrar"}
                  </dd>
                </div>
                <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3 sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                    Observacion
                  </dt>
                  <dd className="mt-1 text-sm text-[color:var(--admin-title)]">
                    {order.observacion_retiro || "Sin observaciones"}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      {isPickup && order.codigo_qr ? (
        <div className="overflow-hidden rounded-[20px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)]">
          <div className="border-b border-[color:var(--admin-pane-line)] px-4 py-3">
            <div className="text-sm font-semibold text-[color:var(--admin-title)]">QR de retiro</div>
            <div className="mt-1 text-sm text-[color:var(--admin-text)]">
              Escanealo en mostrador o valida el codigo manualmente.
            </div>
          </div>
          <div className="grid place-items-center px-4 py-5" style={qrPanelStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.codigo_qr}
              alt={`QR del pedido ${order.numero_pedido}`}
              className="max-w-[220px] drop-shadow-[0_16px_26px_rgba(15,23,42,0.12)]"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
