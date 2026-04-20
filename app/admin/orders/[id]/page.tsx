import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionUser,
} from "@/lib/admin-auth";
import { formatCurrency } from "@/lib/commerce";
import { OrderNotFoundError } from "@/lib/models/order";
import { getOrderById } from "@/lib/services/orderService";
import type { OrderState } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminOrderDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sin dato";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin dato";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getOrderStateLabel(state: OrderState) {
  switch (state) {
    case "PENDIENTE":
      return "Pendiente";
    case "APROBADO":
      return "Aprobado";
    case "FACTURADO":
      return "Facturado";
    case "PREPARANDO":
      return "Preparando";
    case "LISTO_PARA_RETIRO":
      return "Listo para retiro";
    case "ENVIADO":
      return "Enviado";
    case "ENTREGADO":
      return "Entregado";
    case "CANCELADO":
      return "Cancelado";
    case "ERROR":
      return "Error";
    default:
      return state;
  }
}

export default async function AdminOrderDetailPage({
  params,
}: AdminOrderDetailPageProps) {
  const [{ id }, cookieStore] = await Promise.all([params, cookies()]);
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const sessionUser = await getAdminSessionUser(token);

  if (!sessionUser) {
    redirect("/admin/login");
  }

  const orderId = Number(id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return (
      <main className="admin-order-document">
        <section className="admin-order-document-shell">
          <h1>Pedido inválido</h1>
        </section>
      </main>
    );
  }

  try {
    const order = await getOrderById(orderId);
    const items = order.metadata.items || [];

    return (
      <main className="admin-order-document">
        <section className="admin-order-document-shell">
          <header className="admin-order-document-header">
            <div>
              <span className="admin-pane-kicker">Detalle completo</span>
              <h1>{order.numero_pedido}</h1>
              <p>
                Pedido #{order.id} · Estado {getOrderStateLabel(order.estado)} · Pago{" "}
                {order.estado_pago}
              </p>
            </div>
            <div className="admin-order-document-total">
              <strong>{formatCurrency(order.monto_total)}</strong>
              <small>Actualizado {formatDateTime(order.fecha_actualizacion)}</small>
            </div>
          </header>

          <section className="admin-order-document-grid">
            <article className="admin-order-document-card">
              <span>Cliente</span>
              <strong>{order.nombre_cliente}</strong>
              <small>{order.email_cliente}</small>
              <small>{order.telefono_cliente}</small>
            </article>

            <article className="admin-order-document-card">
              <span>Entrega</span>
              <strong>{order.tipo_pedido}</strong>
              <small>{order.direccion || "Sin direccion"}</small>
              <small>{order.metadata.customerCity || "Sin localidad"}</small>
            </article>

            <article className="admin-order-document-card">
              <span>Pago</span>
              <strong>{order.estado_pago}</strong>
              <small>ID pago: {order.id_pago || "Sin dato"}</small>
              <small>
                Preferencia: {order.metadata.preferenceId || "Sin preferencia"}
              </small>
            </article>

            <article className="admin-order-document-card">
              <span>Operacion</span>
              <strong>{getOrderStateLabel(order.estado)}</strong>
              <small>Creado {formatDateTime(order.fecha_creacion)}</small>
              <small>
                Tracking: {order.numero_seguimiento || "Sin seguimiento"}
              </small>
            </article>
          </section>

          <section className="admin-order-document-section">
            <div className="admin-order-document-section-head">
              <h2>Artículos</h2>
              <small>{items.length} líneas</small>
            </div>

            {items.length === 0 ? (
              <div className="admin-order-document-empty">
                No hay detalle de artículos guardado en este pedido.
              </div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table admin-order-document-table">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={`${item.productId}-${index}`}>
                        <td>
                          <strong>{item.productId}</strong>
                        </td>
                        <td>{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-order-document-grid admin-order-document-grid-secondary">
            <article className="admin-order-document-card">
              <span>Observaciones</span>
              <strong>{order.metadata.customerNotes || "Sin notas"}</strong>
              <small>
                Provincia: {order.metadata.customerProvince || "Sin provincia"}
              </small>
              <small>
                Codigo postal: {order.metadata.customerPostalCode || "Sin codigo postal"}
              </small>
            </article>

            <article className="admin-order-document-card">
              <span>Mercado Pago</span>
              <strong>{order.metadata.paymentMethodId || "Sin metodo"}</strong>
              <small>{order.metadata.paymentTypeId || "Sin tipo"}</small>
              <small>
                Estado detalle: {order.metadata.paymentStatusDetail || "Sin detalle"}
              </small>
            </article>

            <article className="admin-order-document-card">
              <span>Referencia externa</span>
              <strong>{order.metadata.externalReference || order.numero_pedido}</strong>
              <small>QR: {order.codigo_qr ? "Disponible" : "No generado"}</small>
              <small>
                Facturado email:{" "}
                {formatDateTime(order.email_facturado_enviado_at)}
              </small>
            </article>
          </section>

          {order.codigo_qr ? (
            <section className="admin-order-document-section">
              <div className="admin-order-document-section-head">
                <h2>QR de retiro</h2>
              </div>
              <div className="admin-order-document-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={order.codigo_qr} alt={`QR del pedido ${order.numero_pedido}`} />
              </div>
            </section>
          ) : null}
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return (
        <main className="admin-order-document">
          <section className="admin-order-document-shell">
            <h1>Pedido no encontrado</h1>
          </section>
        </main>
      );
    }

    return (
      <main className="admin-order-document">
        <section className="admin-order-document-shell">
          <h1>No se pudo cargar el pedido</h1>
        </section>
      </main>
    );
  }
}
