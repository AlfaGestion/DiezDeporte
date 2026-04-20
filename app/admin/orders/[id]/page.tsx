import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  OrderActionsPanel,
} from "@/components/admin/order-actions-panel";
import { OrderCustomerCard } from "@/components/admin/order-customer-card";
import { OrderDeliveryCard } from "@/components/admin/order-delivery-card";
import { OrderDetailHeader } from "@/components/admin/order-detail-header";
import { OrderProductsCard } from "@/components/admin/order-products-card";
import { OrderTimeline } from "@/components/admin/order-timeline";
import { PickupRedeemPanel } from "@/components/admin/pickup-redeem-panel";
import { ErrorState } from "@/components/admin/error-state";
import { ADMIN_SESSION_COOKIE, getAdminSessionUser } from "@/lib/admin-auth";
import { getNextActionLabel, OrderNotFoundError } from "@/lib/models/order";
import { getOrderDetailById } from "@/lib/services/orderService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminOrderDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    returnTo?: string;
    embedded?: string;
  }>;
};

function isSafeReturnTo(value: string | undefined) {
  return Boolean(value && value.startsWith("/admin"));
}

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: AdminOrderDetailPageProps) {
  const [{ id }, { returnTo, embedded }, cookieStore] = await Promise.all([
    params,
    searchParams,
    cookies(),
  ]);
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const sessionUser = await getAdminSessionUser(token);

  if (!sessionUser) {
    redirect("/admin/login");
  }

  const orderId = Number(id);
  const isEmbedded = embedded === "1";
  const safeReturnTo =
    typeof returnTo === "string" && isSafeReturnTo(returnTo) ? returnTo : "/admin";
  const detailReturnTo = `/admin/orders/${orderId}?returnTo=${encodeURIComponent(
    safeReturnTo,
  )}${isEmbedded ? "&embedded=1" : ""}`;

  if (!Number.isFinite(orderId) || orderId <= 0) {
    return (
      <main className="admin-order-document">
        <section className="mx-auto max-w-6xl">
          <ErrorState title="Pedido invalido" message="El identificador del pedido no es valido." />
        </section>
      </main>
    );
  }

  try {
    const { order, logs, documentItems, documentNumber, documentTc } =
      await getOrderDetailById(orderId);
    const nextActionLabel = getNextActionLabel(order);
    const canMarkCancelled = !["ENTREGADO", "CANCELADO", "ERROR"].includes(order.estado);
    const canMarkError = !["ENTREGADO", "CANCELADO", "ERROR"].includes(order.estado);

    return (
      <main
        className={
          isEmbedded
            ? "admin-order-document admin-order-document-embedded"
            : "admin-order-document"
        }
      >
        <section className="mx-auto flex max-w-7xl flex-col gap-5">
          <OrderDetailHeader
            order={order}
            documentNumber={documentNumber}
            documentTc={documentTc}
            safeReturnTo={safeReturnTo}
            isEmbedded={isEmbedded}
          />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_340px]">
            <div className="space-y-5">
              <OrderProductsCard order={order} items={documentItems} />
              <OrderTimeline logs={logs} />
            </div>

            <aside className="space-y-5">
              <OrderActionsPanel
                order={order}
                returnTo={detailReturnTo}
                nextActionLabel={nextActionLabel}
                canMarkCancelled={canMarkCancelled}
                canMarkError={canMarkError}
              />
              {order.tipo_pedido === "retiro" ? <PickupRedeemPanel order={order} /> : null}
              <OrderCustomerCard order={order} />
              <OrderDeliveryCard
                order={order}
                documentNumber={documentNumber}
                documentTc={documentTc}
              />
            </aside>
          </div>
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return (
        <main className="admin-order-document">
          <section className="mx-auto max-w-6xl">
            <ErrorState
              title="Pedido no encontrado"
              message="No se encontro el pedido solicitado o ya no esta disponible."
              action={
                <Link href={safeReturnTo} className="inline-flex text-sm font-medium text-[color:var(--admin-accent)]">
                  Volver
                </Link>
              }
            />
          </section>
        </main>
      );
    }

    return (
      <main className="admin-order-document">
        <section className="mx-auto max-w-6xl">
          <ErrorState
            title="No se pudo cargar el pedido"
            message="Hubo un problema al obtener el detalle. Reintenta o vuelve al listado."
            action={
              <Link href={safeReturnTo} className="inline-flex text-sm font-medium text-[color:var(--admin-accent)]">
                Volver
              </Link>
            }
          />
        </section>
      </main>
    );
  }
}
