import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  advanceAdminOrderAction,
  createAdminUserAction,
  deleteAdminUserAction,
  logoutAdminAction,
  refreshAdminOrderAction,
  saveAdminSettingsAction,
  updateAdminUserAction,
} from "@/app/admin/actions";
import { AdminOrderDetailFrameTrigger } from "@/components/admin-order-detail-frame-trigger";
import { AdminThemeToggle } from "@/components/admin-theme-toggle";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionUser,
} from "@/lib/admin-auth";
import {
  getAdminConfigFields,
  getAdminConfigSections,
} from "@/lib/admin-config";
import {
  ADMIN_PASSWORD_PATTERN,
  ADMIN_PASSWORD_POLICY_HINT,
  listAdminUsers,
} from "@/lib/admin-users";
import { formatCurrency } from "@/lib/commerce";
import {
  ADMIN_ORDER_VIEWS,
  buildAdminOrdersSnapshot,
  getAdminOrderViewLabel,
  getPaymentStatusTone,
  getOrderStateLabel,
  getOrderStateTone,
  getOrderTypeLabel,
  getPaymentStatusLabel,
  normalizeAdminOrderView,
} from "@/lib/order-admin";
import { normalizeOrderFilters } from "@/lib/models/order";
import { getOrders } from "@/lib/services/orderService";
import { getPublicStoreSettings } from "@/lib/store-config";
import type {
  AdminConfigField,
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
    config?: string;
    error?: string;
    create?: string;
    editUser?: string;
  }>;
};

type AdminView = "orders" | "users" | "config";

type AdminHrefInput = {
  view?: AdminView;
  vista?: OrderListView;
  q?: string | null;
  estado?: string | null;
  estado_pago?: string | null;
  tipo_pedido?: string | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  config?: string;
  create?: boolean;
  editUser?: number;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeView(rawValue: string | undefined): AdminView {
  if (rawValue === "users") {
    return "users";
  }

  if (rawValue === "config" || rawValue === "general") {
    return "config";
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

function buildAdminHref(input: AdminHrefInput) {
  const params = new URLSearchParams();

  if (input.view && input.view !== "orders") {
    params.set("view", input.view);
  }

  if (input.view !== "users" && input.view !== "config") {
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

function getActiveConfigSlug(
  rawValue: string | undefined,
  sections: Array<{ name: string; fields: AdminConfigField[] }>,
) {
  const availableSlugs = new Set(sections.map((section) => slugify(section.name)));
  const fallback = sections[0] ? slugify(sections[0].name) : "";

  if (rawValue && availableSlugs.has(rawValue)) {
    return rawValue;
  }

  return fallback;
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
    case "config":
      return {
        label: "Configuracion",
        description: "Parametros del checkout y comportamiento comercial.",
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
  if (saved === "config") {
    return (
      <div className="message success">
        Configuracion guardada y aplicada al runtime actual.
      </div>
    );
  }

  if (saved === "refresh") {
    return <div className="message success">Estado del pedido actualizado.</div>;
  }

  if (saved === "advance") {
    return (
      <div className="message success">
        Estado del pedido avanzado correctamente.
      </div>
    );
  }

  if (saved === "state-updated") {
    return <div className="message success">Estado del pedido actualizado.</div>;
  }

  if (saved === "user") {
    return <div className="message success">Usuario admin creado.</div>;
  }

  if (saved === "user-updated") {
    return <div className="message success">Usuario admin actualizado.</div>;
  }

  if (saved === "user-deleted") {
    return <div className="message success">Usuario admin eliminado.</div>;
  }

  if (error === "order-not-found") {
    return <div className="message error">No se encontro el pedido solicitado.</div>;
  }

  if (error === "order-advance") {
    return (
      <div className="message error">
        No se pudo avanzar el pedido. Revisa el flujo y el estado actual.
      </div>
    );
  }

  if (error === "order-update") {
    return (
      <div className="message error">
        No se pudo actualizar el pedido. Revisa la transicion solicitada.
      </div>
    );
  }

  if (error === "user-create") {
    return (
      <div className="message error">
        No se pudo crear el usuario admin. Revisa si ya existe o si faltan datos.
      </div>
    );
  }

  if (error === "password-match") {
    return <div className="message error">Las claves no coinciden.</div>;
  }

  if (error === "user-password-policy") {
    return <div className="message error">{ADMIN_PASSWORD_POLICY_HINT}</div>;
  }

  if (error === "user-username") {
    return (
      <div className="message error">
        El usuario admin debe tener al menos 3 caracteres.
      </div>
    );
  }

  if (error === "user-exists") {
    return (
      <div className="message error">
        Ya existe un usuario admin con ese nombre.
      </div>
    );
  }

  if (error === "user-reserved") {
    return (
      <div className="message error">
        Ese usuario esta reservado por el sistema.
      </div>
    );
  }

  if (error === "user-forbidden") {
    return (
      <div className="message error">
        Solo un superadmin puede administrar usuarios.
      </div>
    );
  }

  if (error === "user-not-found") {
    return <div className="message error">No se encontro el usuario admin.</div>;
  }

  if (error === "user-last-superadmin") {
    return (
      <div className="message error">
        Debe quedar al menos un superadmin habilitado.
      </div>
    );
  }

  if (error === "user-self-delete") {
    return (
      <div className="message error">
        No puedes borrar tu propio usuario activo.
      </div>
    );
  }

  if (error === "user-self-disable") {
    return (
      <div className="message error">
        No puedes deshabilitar tu propio usuario activo.
      </div>
    );
  }

  if (error === "user-self-demote") {
    return (
      <div className="message error">
        No puedes quitarte permisos de superadmin desde tu propia sesion.
      </div>
    );
  }

  return null;
}

function OrdersPane(props: {
  ordersSnapshot: AdminOrdersSnapshot;
  activeOrderView: OrderListView;
  baseOrderFilters: ReturnType<typeof normalizeOrderFilters>;
  currentOrdersHref: string;
}) {
  const { ordersSnapshot, activeOrderView, baseOrderFilters, currentOrdersHref } = props;

  return (
    <section className="admin-pane">
      <div className="admin-pane-header">
        <div>
          <span className="admin-pane-kicker">Operacion</span>
          <h2>Pedidos web</h2>
          <p>
            Listado central para revisar pagos, avanzar estados y abrir el detalle
            completo de cada pedido.
          </p>
        </div>

        <div className="admin-pane-actions">
          <span className="admin-inline-badge">
            Total: {ordersSnapshot.summary.total}
          </span>
          <span className="admin-inline-badge">
            Cancelados: {ordersSnapshot.summary.cancelados}
          </span>
          <span className="admin-inline-badge">
            Error: {ordersSnapshot.summary.error}
          </span>
        </div>
      </div>

      <nav className="admin-order-tabs-row" aria-label="Vistas de pedidos">
        {ADMIN_ORDER_VIEWS.map((orderView) => (
          <Link
            key={orderView}
            href={buildAdminHref({
              view: "orders",
              vista: orderView,
              q: baseOrderFilters.q,
              estado: baseOrderFilters.estado,
              estado_pago: baseOrderFilters.estado_pago,
              tipo_pedido: baseOrderFilters.tipo_pedido,
              fecha_desde: baseOrderFilters.fecha_desde,
              fecha_hasta: baseOrderFilters.fecha_hasta,
            })}
            className={
              orderView === activeOrderView
                ? "admin-order-tab active"
                : "admin-order-tab"
            }
          >
            <span>{getAdminOrderViewLabel(orderView)}</span>
            <strong>{getSummaryCount(ordersSnapshot.summary, orderView)}</strong>
          </Link>
        ))}
      </nav>

      <form action="/admin" className="admin-orders-filter-bar">
        <input type="hidden" name="view" value="orders" />
        {activeOrderView !== "pedidos" ? (
          <input type="hidden" name="vista" value={activeOrderView} />
        ) : null}

        <label className="admin-filter-field admin-filter-field-wide">
          <span>Buscar</span>
          <input
            type="search"
            name="q"
            defaultValue={baseOrderFilters.q || ""}
            placeholder="Numero, cliente o email"
          />
        </label>

        <label className="admin-filter-field">
          <span>Estado</span>
          <select name="estado" defaultValue={baseOrderFilters.estado || ""}>
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

        <label className="admin-filter-field">
          <span>Pago</span>
          <select name="estado_pago" defaultValue={baseOrderFilters.estado_pago || ""}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </label>

        <label className="admin-filter-field">
          <span>Tipo</span>
          <select name="tipo_pedido" defaultValue={baseOrderFilters.tipo_pedido || ""}>
            <option value="">Todos</option>
            <option value="retiro">Retiro</option>
            <option value="envio">Envio</option>
          </select>
        </label>

        <label className="admin-filter-field">
          <span>Desde</span>
          <input
            type="date"
            name="fecha_desde"
            defaultValue={baseOrderFilters.fecha_desde || ""}
          />
        </label>

        <label className="admin-filter-field">
          <span>Hasta</span>
          <input
            type="date"
            name="fecha_hasta"
            defaultValue={baseOrderFilters.fecha_hasta || ""}
          />
        </label>

        <div className="admin-filter-actions">
          <button type="submit" className="submit-order-button">
            Aplicar
          </button>
          <Link
            href={buildAdminHref({
              view: "orders",
              vista: activeOrderView,
            })}
            className="admin-ghost-button"
          >
            Limpiar
          </Link>
        </div>
      </form>

      {ordersSnapshot.orders.length === 0 ? (
        <div className="empty-state compact">
          No hay pedidos para el filtro seleccionado.
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Numero pedido</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Tipo pedido</th>
                <th>Estado</th>
                <th>Estado pago</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              {ordersSnapshot.orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.orderNumber}</strong>
                    <small>Ref: {order.externalReference}</small>
                  </td>
                  <td>
                    <strong>{formatDateTime(order.createdAt)}</strong>
                    <small>Act. {formatDateTime(order.updatedAt)}</small>
                  </td>
                  <td>
                    <strong>{order.customerName || "Sin nombre"}</strong>
                    <small>{order.customerEmail || "Sin correo"}</small>
                    <small>{order.customerPhone || "Sin telefono"}</small>
                  </td>
                  <td>
                    <strong>{formatCurrency(order.total)}</strong>
                    <small>{order.itemCount} unidades</small>
                  </td>
                  <td>
                    <strong>{getOrderTypeLabel(order.orderType)}</strong>
                    <small>{order.customerCity || "Sin localidad"}</small>
                    <small>{order.customerAddress || "Sin direccion"}</small>
                  </td>
                  <td>
                    <span
                      className={`admin-status-badge status-${getOrderStateTone(
                        order.orderState,
                      )}`}
                    >
                      {getOrderStateLabel(order.orderState)}
                    </span>
                    <small>
                      {order.nextActionLabel
                        ? `Sigue: ${order.nextActionLabel}`
                        : "Sin pasos pendientes"}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`admin-status-badge status-${getPaymentStatusTone(
                        order.paymentStatus,
                      )}`}
                    >
                      {getPaymentStatusLabel(order.paymentStatus)}
                    </span>
                    <small>
                      {order.paymentMethodId || "Metodo no informado"}
                      {order.paymentTypeId ? ` | ${order.paymentTypeId}` : ""}
                    </small>
                    <small>{order.paymentId || "Sin pago"}</small>
                  </td>
                  <td className="admin-actions-cell">
                    <div className="admin-order-actions admin-order-actions-stack">
                      {order.nextActionLabel ? (
                        <form action={advanceAdminOrderAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="returnTo" value={currentOrdersHref} />
                          <button type="submit" className="submit-order-button">
                            {order.nextActionLabel}
                          </button>
                        </form>
                      ) : null}

                      <form action={refreshAdminOrderAction}>
                        <input type="hidden" name="pendingOrderId" value={order.id} />
                        <input type="hidden" name="returnTo" value={currentOrdersHref} />
                        <button type="submit" className="admin-ghost-button">
                          Actualizar
                        </button>
                      </form>

                      <AdminOrderDetailFrameTrigger
                        orderId={order.id}
                        returnTo={currentOrdersHref}
                        className="admin-ghost-button"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  settings: Awaited<ReturnType<typeof getPublicStoreSettings>>;
  configFields: Awaited<ReturnType<typeof getAdminConfigFields>>;
  sections: Array<{ name: string; fields: AdminConfigField[] }>;
  activeConfigSlug: string;
}) {
  const { settings, configFields, sections, activeConfigSlug } = props;
  const activeSection =
    sections.find((section) => slugify(section.name) === activeConfigSlug) || null;

  return (
    <section className="admin-pane">
      <div className="admin-pane-header">
        <div>
          <span className="admin-pane-kicker">Parametros</span>
          <h2>Configuracion del checkout</h2>
          <p>
            Los cambios impactan <code>TA_CONFIGURACION</code> y se aplican sobre el
            runtime actual.
          </p>
        </div>

        <div className="admin-pane-actions">
          <span className="admin-inline-badge">
            Bloque activo: {activeSection?.name || "Sin bloque"}
          </span>
          <span className="admin-inline-badge">
            {activeSection ? `${activeSection.fields.length} campos` : "0 campos"}
          </span>
        </div>
      </div>

      <div className="admin-overview-grid">
        <article className="admin-overview-card">
          <span>Bloques</span>
          <strong>{sections.length}</strong>
          <small>Secciones editables del panel.</small>
        </article>
        <article className="admin-overview-card tone-accent">
          <span>Campos</span>
          <strong>{configFields.length}</strong>
          <small>Parametros administrables.</small>
        </article>
        <article className="admin-overview-card tone-success">
          <span>Mercado Pago</span>
          <strong>{settings.mercadoPagoEnabled ? "Listo" : "Pendiente"}</strong>
          <small>Estado actual del checkout.</small>
        </article>
        <article className="admin-overview-card tone-warning">
          <span>Backorders</span>
          <strong>{settings.allowBackorders ? "Permitidos" : "Bloqueados"}</strong>
          <small>Comportamiento comercial actual.</small>
        </article>
      </div>

      <div className="admin-config-layout">
        <nav className="admin-config-nav" aria-label="Bloques de configuracion">
          {sections.map((section) => {
            const sectionSlug = slugify(section.name);

            return (
              <Link
                key={section.name}
                href={buildAdminHref({
                  view: "config",
                  config: sectionSlug,
                })}
                className={
                  sectionSlug === activeConfigSlug
                    ? "admin-config-nav-link active"
                    : "admin-config-nav-link"
                }
              >
                <span>{section.name}</span>
                <small>{section.fields.length} campos</small>
              </Link>
            );
          })}
        </nav>

        <form action={saveAdminSettingsAction} className="admin-config-form">
          <input type="hidden" name="activeConfig" value={activeConfigSlug} />

          {sections.map((section) => {
            const sectionSlug = slugify(section.name);
            const isActive = sectionSlug === activeConfigSlug;

            return (
              <section
                key={section.name}
                className={
                  isActive
                    ? "admin-section-card"
                    : "admin-section-card admin-section-card-hidden"
                }
              >
                <div className="admin-section-heading">
                  <div>
                    <span className="admin-pane-kicker">Bloque</span>
                    <h3>{section.name}</h3>
                  </div>
                </div>

                <div className="admin-config-grid">
                  {section.fields.map((field) => (
                    <label
                      key={field.key}
                      className={
                        field.type === "boolean"
                          ? "admin-boolean-field"
                          : "admin-config-field"
                      }
                    >
                      {field.type === "boolean" ? (
                        <>
                          <span className="admin-boolean-control">
                            <input
                              type="checkbox"
                              name={field.key}
                              defaultChecked={Boolean(field.value)}
                            />
                            <strong>{field.label}</strong>
                          </span>
                          <small>{field.description}</small>
                        </>
                      ) : (
                        <>
                          <span>{field.label}</span>
                          <input
                            type={field.type}
                            name={field.key}
                            defaultValue={String(field.value || "")}
                            placeholder={field.placeholder}
                          />
                          <small>{field.description}</small>
                        </>
                      )}
                    </label>
                  ))}
                </div>
              </section>
            );
          })}

          <div className="admin-form-actions">
            <button type="submit" className="submit-order-button">
              Guardar configuracion
            </button>
          </div>
        </form>
      </div>
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
      config,
      error,
      create,
      editUser,
    },
    cookieStore,
  ] = await Promise.all([searchParams, cookies()]);
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const sessionUser = await getAdminSessionUser(token);

  if (!sessionUser) {
    redirect("/admin/login");
  }

  const activeView = normalizeView(view);
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
  const [settings, configFields, filteredOrders, summaryOrders, adminUsers] =
    await Promise.all([
      getPublicStoreSettings(),
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
    ]);
  const ordersSnapshot = buildAdminOrdersSnapshot({
    orders: filteredOrders,
    allOrders: summaryOrders,
  });
  const sections = getAdminConfigSections(configFields);
  const activeConfigSlug = getActiveConfigSlug(config, sections);
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

  return (
    <main className="admin-page">
      <section className="admin-shell admin-shell-simple">
        <header className="admin-toolbar">
          <div>
            <span className="admin-eyebrow">Panel interno</span>
            <h1>{settings.storeName}</h1>
            <p>{viewMeta.description}</p>
          </div>

          <div className="admin-toolbar-actions">
            <AdminThemeToggle />
            <Link href="/" className="admin-ghost-button">
              Ver tienda
            </Link>
            <form action={logoutAdminAction}>
              <button type="submit" className="submit-order-button">
                Cerrar sesion
              </button>
            </form>
          </div>
        </header>

        <FlashMessages saved={saved} error={error} />

        <nav className="admin-section-tabs" aria-label="Secciones del panel">
          <Link
            href={currentOrdersHref}
            className={activeView === "orders" ? "admin-section-tab active" : "admin-section-tab"}
          >
            <span>Pedidos</span>
            <small>{ordersSnapshot.summary.total}</small>
          </Link>
          <Link
            href={buildAdminHref({ view: "users" })}
            className={activeView === "users" ? "admin-section-tab active" : "admin-section-tab"}
          >
            <span>Usuarios</span>
            <small>{adminUsers.length}</small>
          </Link>
          <Link
            href={buildAdminHref({ view: "config", config: activeConfigSlug })}
            className={activeView === "config" ? "admin-section-tab active" : "admin-section-tab"}
          >
            <span>Configuracion</span>
            <small>{sections.length}</small>
          </Link>
        </nav>

        {activeView === "orders" ? (
          <OrdersPane
            ordersSnapshot={ordersSnapshot}
            activeOrderView={activeOrderView}
            baseOrderFilters={baseOrderFilters}
            currentOrdersHref={currentOrdersHref}
          />
        ) : activeView === "users" ? (
          <UsersPane
            sessionUser={sessionUser}
            adminUsers={adminUsers}
            showUserCreateForm={showUserCreateForm}
            showUserEditForm={showUserEditForm}
            editingUser={editingUser}
          />
        ) : (
          <ConfigPane
            settings={settings}
            configFields={configFields}
            sections={sections}
            activeConfigSlug={activeConfigSlug}
          />
        )}
      </section>
    </main>
  );
}
