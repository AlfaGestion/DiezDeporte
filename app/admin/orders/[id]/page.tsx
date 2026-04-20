import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  advanceAdminOrderAction,
  refreshAdminOrderAction,
  updateAdminOrderStateAction,
} from "@/app/admin/actions";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionUser,
} from "@/lib/admin-auth";
import { formatCurrency } from "@/lib/commerce";
import { getNextActionLabel, OrderNotFoundError } from "@/lib/models/order";
import {
  getLogOriginLabel,
  getOrderStateLabel,
  getOrderStateTone,
  getOrderTypeLabel,
  getPaymentStatusLabel,
  getPaymentStatusTone,
} from "@/lib/order-admin";
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

function isSafeReturnTo(value: string | undefined) {
  return Boolean(value && value.startsWith("/admin"));
}

function AdminThemeBootScript() {
  const script = `
    (() => {
      try {
        const storageKey = "diezdeportes-theme";
        const savedTheme = window.localStorage.getItem(storageKey);
        const theme =
          savedTheme === "dark" || savedTheme === "light"
            ? savedTheme
            : window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light";

        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;

        if (document.body) {
          document.body.dataset.theme = theme;
          document.body.style.colorScheme = theme;
        }
      } catch (_error) {}
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
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
        <AdminThemeBootScript />
        <section className="admin-order-document-shell">
          <h1>Pedido invalido</h1>
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
    const subtotal = documentItems.reduce((sum, item) => sum + item.total, 0);
    const referenceLabel = order.tipo_pedido === "retiro" ? "Retiro" : "Referencia";
    const referenceValue =
      order.tipo_pedido === "retiro"
        ? order.metadata.pickupCode || "Sin codigo"
        : documentNumber;
    const referenceSecondary =
      order.tipo_pedido === "retiro"
        ? `QR: ${order.codigo_qr ? "Generado" : "No generado"}`
        : `Comprobante: ${documentTc || "NP"}`;

    return (
      <main
        className={
          isEmbedded
            ? "admin-order-document admin-order-document-embedded"
            : "admin-order-document"
        }
      >
        <AdminThemeBootScript />
        <section className="admin-order-document-shell admin-order-document-shell-invoice">
          {!isEmbedded ? (
            <div className="admin-order-document-topbar">
              <Link href={safeReturnTo} className="admin-ghost-button">
                Volver al listado
              </Link>

              <Link
                href={safeReturnTo}
                className="admin-detail-close-button"
                aria-label="Cerrar detalle"
              >
                X
              </Link>
            </div>
          ) : null}

          <header className="admin-order-invoice-header">
            <div>
              <span className="admin-pane-kicker">Comprobante</span>
              <h1>
                {documentTc || "NP"} {documentNumber}
              </h1>
              <p>
                Pedido #{order.id} | {getOrderTypeLabel(order.tipo_pedido)} | Emitido{" "}
                {formatDateTime(order.fecha_creacion)}
              </p>
            </div>

            <div className="admin-order-invoice-total">
              <span>Total</span>
              <strong>{formatCurrency(order.monto_total)}</strong>
              <small>Actualizado {formatDateTime(order.fecha_actualizacion)}</small>
            </div>
          </header>

          <div className="admin-order-detail-actions">
            {nextActionLabel ? (
              <form action={advanceAdminOrderAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="returnTo" value={detailReturnTo} />
                <button type="submit" className="submit-order-button">
                  {nextActionLabel}
                </button>
              </form>
            ) : null}

            <form action={refreshAdminOrderAction}>
              <input type="hidden" name="pendingOrderId" value={order.id} />
              <input type="hidden" name="returnTo" value={detailReturnTo} />
              <button type="submit" className="admin-ghost-button">
                Actualizar pago
              </button>
            </form>

            {canMarkCancelled ? (
              <form action={updateAdminOrderStateAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="nextState" value="CANCELADO" />
                <input type="hidden" name="returnTo" value={detailReturnTo} />
                <button type="submit" className="admin-danger-button">
                  Cancelar
                </button>
              </form>
            ) : null}

            {canMarkError ? (
              <form action={updateAdminOrderStateAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="nextState" value="ERROR" />
                <input type="hidden" name="returnTo" value={detailReturnTo} />
                <button type="submit" className="admin-ghost-button">
                  Marcar error
                </button>
              </form>
            ) : null}
          </div>

          <section className="admin-order-invoice-meta">
            <article className="admin-order-invoice-card">
              <span>Cliente</span>
              <strong>{order.nombre_cliente}</strong>
              <small>{order.email_cliente}</small>
              <small>{order.telefono_cliente}</small>
            </article>

            <article className="admin-order-invoice-card">
              <span>Entrega</span>
              <strong>{getOrderTypeLabel(order.tipo_pedido)}</strong>
              <small>{order.metadata.customerAddress || order.direccion || "Sin direccion"}</small>
              <small>{order.metadata.customerCity || "Sin localidad"}</small>
            </article>

            <article className="admin-order-invoice-card">
              <span>Estado del pedido</span>
              <strong>{getOrderStateLabel(order.estado)}</strong>
              <small>
                <span
                  className={`admin-status-badge status-${getOrderStateTone(
                    order.estado,
                  )}`}
                >
                  {getOrderStateLabel(order.estado)}
                </span>
              </small>
              <small>Proximo paso: {nextActionLabel || "Sin accion disponible"}</small>
            </article>

            <article className="admin-order-invoice-card">
              <span>Estado del pago</span>
              <strong>{getPaymentStatusLabel(order.estado_pago)}</strong>
              <small>
                <span
                  className={`admin-status-badge status-${getPaymentStatusTone(
                    order.estado_pago,
                  )}`}
                >
                  {getPaymentStatusLabel(order.estado_pago)}
                </span>
              </small>
              <small>ID pago: {order.id_pago || "Sin dato"}</small>
            </article>
          </section>

          <section className="admin-order-document-section admin-order-document-section-invoice">
            <div className="admin-order-document-section-head">
              <h2>Detalle de articulos</h2>
              <small>{documentItems.length} lineas</small>
            </div>

            {documentItems.length === 0 ? (
              <div className="admin-order-document-empty">
                No se encontraron articulos para este comprobante.
              </div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table admin-order-document-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Articulo</th>
                      <th>Descripcion</th>
                      <th>Cantidad</th>
                      <th>Precio unitario</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentItems.map((item) => (
                      <tr key={`${item.tc}-${item.idComprobante}-${item.sequence}-${item.articleId}`}>
                        <td>{item.sequence || "-"}</td>
                        <td>
                          <strong>{item.articleId || "Sin codigo"}</strong>
                        </td>
                        <td>{item.description || "Sin descripcion"}</td>
                        <td>{item.quantity}</td>
                        <td>{formatCurrency(item.unitPrice)}</td>
                        <td>{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5}>Subtotal</td>
                      <td>{formatCurrency(subtotal || order.monto_total)}</td>
                    </tr>
                    <tr>
                      <td colSpan={5}>Total pedido</td>
                      <td>{formatCurrency(order.monto_total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <section className="admin-order-document-grid admin-order-document-grid-secondary">
            <article className="admin-order-document-card">
              <span>Observaciones</span>
              <strong>{order.metadata.customerNotes || "Sin observaciones"}</strong>
              <small>Provincia: {order.metadata.customerProvince || "Sin provincia"}</small>
              <small>
                Codigo postal: {order.metadata.customerPostalCode || "Sin codigo postal"}
              </small>
            </article>

            <article className="admin-order-document-card">
              <span>Seguimiento</span>
              <strong>{order.numero_seguimiento || "Sin seguimiento"}</strong>
              <small>Preferencia: {order.metadata.preferenceId || "Sin preferencia"}</small>
              <small>Metodo: {order.metadata.paymentMethodId || "No informado"}</small>
            </article>

            <article className="admin-order-document-card">
              <span>{referenceLabel}</span>
              <strong>{referenceValue}</strong>
              <small>{referenceSecondary}</small>
              <small>Tipo de pago: {order.metadata.paymentTypeId || "No informado"}</small>
            </article>
          </section>

          <section className="admin-order-document-section">
            <div className="admin-order-document-section-head">
              <h2>Timeline</h2>
              <small>{logs.length} eventos</small>
            </div>

            {logs.length === 0 ? (
              <div className="admin-order-document-empty">
                No hay eventos registrados para este pedido.
              </div>
            ) : (
              <div className="admin-order-timeline">
                {logs.map((log) => (
                  <article key={log.id} className="admin-order-timeline-item">
                    <div>
                      <strong>{getOrderStateLabel(log.estadoNuevo)}</strong>
                      <small>
                        {log.estadoAnterior
                          ? `Desde ${getOrderStateLabel(log.estadoAnterior)}`
                          : "Alta inicial"}
                      </small>
                    </div>
                    <div>
                      <small>{getLogOriginLabel(log.origen)}</small>
                      <small>{formatDateTime(log.fecha)}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {order.codigo_qr ? (
            <section className="admin-order-document-section">
              <div className="admin-order-document-section-head">
                <h2>QR de retiro</h2>
                <small>{order.metadata.pickupCode || "Sin codigo"}</small>
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
          <AdminThemeBootScript />
          <section className="admin-order-document-shell">
            <h1>Pedido no encontrado</h1>
            <Link href={safeReturnTo} className="admin-ghost-button">
              Volver
            </Link>
          </section>
        </main>
      );
    }

    return (
      <main className="admin-order-document">
        <AdminThemeBootScript />
        <section className="admin-order-document-shell">
          <h1>No se pudo cargar el pedido</h1>
          <Link href={safeReturnTo} className="admin-ghost-button">
            Volver
          </Link>
        </section>
      </main>
    );
  }
}
