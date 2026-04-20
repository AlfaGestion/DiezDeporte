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
import { AdminThemeToggle } from "@/components/admin-theme-toggle";
import { formatCurrency } from "@/lib/commerce";
import { getPublicStoreSettings } from "@/lib/store-config";
import { listAdminPendingOrders } from "@/lib/web-payments";
import type {
  AdminConfigField,
  AdminOrderStatusFilter,
  OrderState,
  PaymentFlowStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminPageProps = {
  searchParams: Promise<{
    saved?: string;
    status?: string;
    view?: string;
    config?: string;
    error?: string;
    create?: string;
    editUser?: string;
    detailOrder?: string;
  }>;
};

type AdminView = "orders" | "users" | "config";

type AdminGlyphKind =
  | "orders"
  | "users"
  | "config"
  | "store"
  | "payments"
  | "shield"
  | "blocks";

const STATUS_FILTERS: AdminOrderStatusFilter[] = [
  "orders",
  "pending",
  "processing",
  "approved",
  "finalized",
  "rejected",
  "cancelled",
  "error",
];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDateTime(value: string) {
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

function getStatusLabel(status: PaymentFlowStatus | "orders") {
  switch (status) {
    case "orders":
      return "Pedidos";
    case "pending":
      return "Pendientes";
    case "processing":
      return "Procesando";
    case "approved":
      return "Aprobados";
    case "finalized":
      return "Finalizados";
    case "rejected":
      return "Rechazados";
    case "cancelled":
      return "Cancelados";
    case "error":
      return "Con error";
    default:
      return status;
  }
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

function getOrderStateTone(state: OrderState) {
  switch (state) {
    case "ENTREGADO":
    case "LISTO_PARA_RETIRO":
    case "ENVIADO":
      return "success";
    case "FACTURADO":
    case "PREPARANDO":
    case "APROBADO":
      return "accent";
    case "CANCELADO":
    case "ERROR":
      return "danger";
    default:
      return "warning";
  }
}

function isPickupOrder(deliveryMethod: string) {
  return deliveryMethod.trim().toLowerCase().includes("retiro");
}

function getNextOrderActionLabel(
  state: OrderState,
  deliveryMethod: string,
) {
  switch (state) {
    case "PENDIENTE":
      return "Marcar aprobado";
    case "APROBADO":
      return "Facturar";
    case "FACTURADO":
      return "Pasar a preparando";
    case "PREPARANDO":
      return isPickupOrder(deliveryMethod) ? "Listo para retiro" : "Marcar enviado";
    case "LISTO_PARA_RETIRO":
      return "Marcar entregado";
    case "ENVIADO":
      return "Marcar entregado";
    default:
      return null;
  }
}

function normalizeStatusFilter(
  rawValue: string | undefined,
): AdminOrderStatusFilter {
  if (!rawValue) return "orders";

  return STATUS_FILTERS.includes(rawValue as AdminOrderStatusFilter)
    ? (rawValue as AdminOrderStatusFilter)
    : "orders";
}

function normalizeView(rawValue: string | undefined): AdminView {
  if (rawValue === "users") return "users";
  if (rawValue === "config" || rawValue === "general") return "config";
  return "orders";
}

function buildAdminHref(input: {
  view?: AdminView;
  status?: AdminOrderStatusFilter;
  config?: string;
  create?: boolean;
  editUser?: number;
  detailOrder?: number | null;
}) {
  const params = new URLSearchParams();

  if (input.view && input.view !== "orders") {
    params.set("view", input.view);
  }

  if (input.status && input.status !== "orders") {
    params.set("status", input.status);
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

  if (
    input.detailOrder &&
    Number.isFinite(input.detailOrder) &&
    input.detailOrder > 0
  ) {
    params.set("detailOrder", String(input.detailOrder));
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

function normalizePositiveInt(value: string | undefined) {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getViewMeta(view: AdminView) {
  switch (view) {
    case "orders":
      return {
        label: "Pedidos",
        description: "Seguimiento operativo de pagos y pedidos emitidos por la tienda web.",
      };
    case "users":
      return {
        label: "Usuarios",
        description: "Control de accesos internos para el panel administrativo.",
      };
    case "config":
      return {
        label: "Configuracion",
        description: "Parametros que impactan el checkout, pagos y comportamiento comercial.",
      };
    default:
      return {
        label: "Panel",
        description: "Centro de control interno.",
      };
  }
}

function getStatusCount(
  summary: {
    total: number;
    pending: number;
    processing: number;
    approved: number;
    finalized: number;
    rejected: number;
    cancelled: number;
    error: number;
  },
  status: AdminOrderStatusFilter,
) {
  if (status === "orders") {
    return summary.total;
  }

  return summary[status];
}

function AdminGlyph({ kind }: { kind: AdminGlyphKind }) {
  switch (kind) {
    case "orders":
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="3.5" width="16" height="17" rx="3" fill="none" />
          <path d="M8 8.5h8M8 12h8M8 15.5h5" fill="none" />
        </svg>
      );
    case "users":
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="none" />
          <path d="M15.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill="none" />
          <path d="M4.5 18.5c.8-2.2 2.6-3.5 4.5-3.5s3.7 1.3 4.5 3.5" fill="none" />
          <path d="M13.5 18.5c.6-1.7 1.9-2.7 3.4-2.7 1.4 0 2.7 1 3.3 2.7" fill="none" />
        </svg>
      );
    case "config":
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 7h12M6 17h12M9 7v10M15 7v10" fill="none" />
          <circle cx="9" cy="11" r="1.8" fill="none" />
          <circle cx="15" cy="13" r="1.8" fill="none" />
        </svg>
      );
    case "store":
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 9.5 5.4 5h13.2L20 9.5" fill="none" />
          <path d="M6 9.5h12V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9.5Z" fill="none" />
          <path d="M10 20v-5h4v5" fill="none" />
        </svg>
      );
    case "payments":
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3.5" y="6" width="17" height="12" rx="2.5" fill="none" />
          <path d="M3.5 10h17M7.5 14h3.5" fill="none" />
        </svg>
      );
    case "shield":
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3.5 6 6v5.5c0 4.1 2.6 7.3 6 9 3.4-1.7 6-4.9 6-9V6l-6-2.5Z" fill="none" />
          <path d="m9.4 12.1 1.8 1.9 3.5-4" fill="none" />
        </svg>
      );
    case "blocks":
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="4" width="7" height="7" rx="1.5" fill="none" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" fill="none" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" fill="none" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" fill="none" />
        </svg>
      );
    default:
      return null;
  }
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const [{ saved, status, view, config, error, create, editUser, detailOrder }, cookieStore] = await Promise.all([
    searchParams,
    cookies(),
  ]);
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const sessionUser = await getAdminSessionUser(token);

  if (!sessionUser) {
    redirect("/admin/login");
  }

  const activeView = normalizeView(view);
  const statusFilter = normalizeStatusFilter(status);
  const [settings, configFields, ordersSnapshot, adminUsers] = await Promise.all([
    getPublicStoreSettings(),
    getAdminConfigFields(),
    listAdminPendingOrders({ status: statusFilter, limit: 80 }),
    listAdminUsers(),
  ]);

  const sections = getAdminConfigSections(configFields);
  const activeConfigSlug = getActiveConfigSlug(config, sections);
  const activeSection =
    sections.find((section) => slugify(section.name) === activeConfigSlug) || null;
  const viewMeta = getViewMeta(activeView);
  const enabledUsersCount = adminUsers.filter((user) => user.enabled).length;
  const disabledUsersCount = adminUsers.length - enabledUsersCount;
  const superAdminCount = adminUsers.filter((user) => user.superAdmin).length;
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
  const ordersTabMeta =
    ordersSnapshot.summary.total === 1
      ? "1 pedido"
      : `${ordersSnapshot.summary.total} pedidos`;
  const usersTabMeta =
    adminUsers.length === 1 ? "1 usuario" : `${adminUsers.length} usuarios`;
  const configTabMeta =
    sections.length === 1 ? "1 bloque" : `${sections.length} bloques`;
  const requestedEditUserId = normalizePositiveInt(editUser);
  const detailOrderId = normalizePositiveInt(detailOrder);
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
  const adminTabs: Array<{
    view: AdminView;
    label: string;
    meta: string;
    icon: AdminGlyphKind;
  }> = [
    {
      view: "orders",
      label: "Pedidos",
      meta: ordersTabMeta,
      icon: "orders",
    },
    {
      view: "users",
      label: "Usuarios",
      meta: usersTabMeta,
      icon: "users",
    },
    {
      view: "config",
      label: "Configuracion",
      meta: configTabMeta,
      icon: "config",
    },
  ];
  const heroCards = [
    {
      icon: "shield" as const,
      label: "Sesion activa",
      value: sessionUser.superAdmin ? "Superadmin" : "Operador",
      detail: sessionUser.username,
    },
    {
      icon: "payments" as const,
      label: "Mercado Pago",
      value: settings.mercadoPagoEnabled ? "Activo" : "Pendiente",
      detail: settings.mercadoPagoEnabled
        ? "Checkout listo para cobrar"
        : "Faltan credenciales o URL publica",
    },
    {
      icon: "blocks" as const,
      label: "Configuracion",
      value: `${sections.length} bloques`,
      detail:
        configFields.length === 1
          ? "1 campo editable"
          : `${configFields.length} campos editables`,
    },
  ];

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <header className="admin-hero">
          <div className="admin-hero-copy">
            <span className="admin-eyebrow">Panel interno</span>
            <h1>{settings.storeName}</h1>
            <p>{settings.storeTagline}</p>

            <div className="admin-hero-pills">
              <span className="admin-hero-pill">
                <AdminGlyph kind="store" />
                Checkout web
              </span>
              <span className="admin-hero-pill">
                <AdminGlyph kind="orders" />
                {ordersTabMeta}
              </span>
              <span className="admin-hero-pill">
                <AdminGlyph kind="users" />
                {usersTabMeta}
              </span>
            </div>
          </div>

          <div className="admin-hero-side">
            <div className="admin-header-actions">
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

            <div className="admin-hero-grid">
              {heroCards.map((card) => (
                <article key={card.label} className="admin-hero-card">
                  <span className="admin-card-icon">
                    <AdminGlyph kind={card.icon} />
                  </span>
                  <div>
                    <span className="admin-card-label">{card.label}</span>
                    <strong>{card.value}</strong>
                    <small>{card.detail}</small>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </header>

        {saved === "config" ? (
          <div className="message success">
            Configuracion guardada en <code>TA_CONFIGURACION</code> y aplicada al
            runtime actual.
          </div>
        ) : null}

        {saved === "refresh" ? (
          <div className="message success">Estado del pedido actualizado.</div>
        ) : null}

        {saved === "advance" ? (
          <div className="message success">Estado del pedido avanzado correctamente.</div>
        ) : null}

        {saved === "user" ? (
          <div className="message success">Usuario admin creado.</div>
        ) : null}

        {saved === "user-updated" ? (
          <div className="message success">Usuario admin actualizado.</div>
        ) : null}

        {saved === "user-deleted" ? (
          <div className="message success">Usuario admin eliminado.</div>
        ) : null}

        {error === "user-create" ? (
          <div className="message error">
            No se pudo crear el usuario admin. Revisa si ya existe o si faltan
            datos.
          </div>
        ) : null}

        {error === "password-match" ? (
          <div className="message error">Las claves no coinciden.</div>
        ) : null}

        {error === "user-password-policy" ? (
          <div className="message error">{ADMIN_PASSWORD_POLICY_HINT}</div>
        ) : null}

        {error === "user-username" ? (
          <div className="message error">
            El usuario admin debe tener al menos 3 caracteres.
          </div>
        ) : null}

        {error === "user-exists" ? (
          <div className="message error">
            Ya existe un usuario admin con ese nombre.
          </div>
        ) : null}

        {error === "user-reserved" ? (
          <div className="message error">
            Ese usuario esta reservado por el sistema.
          </div>
        ) : null}

        {error === "user-forbidden" ? (
          <div className="message error">
            Solo un superadmin puede administrar usuarios.
          </div>
        ) : null}

        {error === "user-not-found" ? (
          <div className="message error">No se encontro el usuario admin.</div>
        ) : null}

        {error === "user-last-superadmin" ? (
          <div className="message error">
            Debe quedar al menos un superadmin habilitado.
          </div>
        ) : null}

        {error === "user-self-delete" ? (
          <div className="message error">
            No puedes borrar tu propio usuario activo.
          </div>
        ) : null}

        {error === "user-self-disable" ? (
          <div className="message error">
            No puedes deshabilitar tu propio usuario activo.
          </div>
        ) : null}

        {error === "user-self-demote" ? (
          <div className="message error">
            No puedes quitarte permisos de superadmin desde tu propia sesion.
          </div>
        ) : null}

        {error === "order-advance" ? (
          <div className="message error">
            No se pudo avanzar el pedido. Revisa el estado actual y las validaciones del flujo.
          </div>
        ) : null}

        {error === "order-not-found" ? (
          <div className="message error">No se encontro el pedido solicitado.</div>
        ) : null}

        <section className="admin-dashboard-layout">
          <aside className="admin-sidebar">
            <nav className="admin-tabs" aria-label="Secciones del panel">
              {adminTabs.map((tab) => (
                <Link
                  key={tab.view}
                  href={
                    tab.view === "orders"
                      ? buildAdminHref({ view: "orders", status: statusFilter })
                      : tab.view === "config"
                      ? buildAdminHref({
                          view: "config",
                          config: activeConfigSlug,
                        })
                      : buildAdminHref({ view: "users" })
                  }
                  className={
                    activeView === tab.view
                      ? "admin-tab-link active"
                      : "admin-tab-link"
                  }
                >
                  <span className="admin-tab-icon">
                    <AdminGlyph kind={tab.icon} />
                  </span>
                  <span className="admin-tab-copy">
                    <span className="admin-tab-label">{tab.label}</span>
                    <small className="admin-tab-meta">{tab.meta}</small>
                  </span>
                </Link>
              ))}
            </nav>

            <section className="admin-sidebar-card">
              <div className="admin-sidebar-card-head">
                <span className="admin-sidebar-kicker">Vista actual</span>
                <h2>{viewMeta.label}</h2>
              </div>
              <p>{viewMeta.description}</p>

              {activeView === "orders" ? (
                <div className="admin-sidebar-list">
                  {STATUS_FILTERS.map((filter) => (
                    <Link
                      key={filter}
                      href={buildAdminHref({ view: "orders", status: filter })}
                      className={
                        filter === statusFilter
                          ? "admin-sidebar-link active"
                          : "admin-sidebar-link"
                      }
                    >
                      <span>{getStatusLabel(filter)}</span>
                      <strong>{getStatusCount(ordersSnapshot.summary, filter)}</strong>
                    </Link>
                  ))}
                </div>
              ) : activeView === "users" ? (
                <div className="admin-sidebar-stats">
                  <article>
                    <span>Habilitados</span>
                    <strong>{enabledUsersCount}</strong>
                  </article>
                  <article>
                    <span>Superadmins</span>
                    <strong>{superAdminCount}</strong>
                  </article>
                  <article>
                    <span>Deshabilitados</span>
                    <strong>{disabledUsersCount}</strong>
                  </article>
                </div>
              ) : (
                <div className="admin-sidebar-list">
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
                            ? "admin-sidebar-link active"
                            : "admin-sidebar-link"
                        }
                      >
                        <span>{section.name}</span>
                        <strong>{section.fields.length}</strong>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>

          <div className="admin-stage">
            {activeView === "orders" ? (
              <section className="admin-pane">
                <div className="admin-pane-header">
                  <div>
                    <span className="admin-pane-kicker">Operacion</span>
                    <h2>Pedidos web</h2>
                    <p>
                      Seguimiento de pagos, aprobaciones y finalizacion de pedidos
                      creados desde la tienda.
                    </p>
                  </div>

                  <div className="admin-pane-actions">
                    <span className="admin-inline-badge">
                      Ultimos {ordersSnapshot.orders.length} registros
                    </span>
                  </div>
                </div>

                <div className="admin-overview-grid">
                  <article className="admin-overview-card">
                    <span>Total registrados</span>
                    <strong>{ordersSnapshot.summary.total}</strong>
                    <small>Incluye todos los estados del flujo.</small>
                  </article>
                  <article className="admin-overview-card tone-warning">
                    <span>Pendientes</span>
                    <strong>{ordersSnapshot.summary.pending}</strong>
                    <small>Esperando pago o confirmacion.</small>
                  </article>
                  <article className="admin-overview-card tone-accent">
                    <span>Procesando</span>
                    <strong>{ordersSnapshot.summary.processing}</strong>
                    <small>Pedidos en etapa de sincronizacion.</small>
                  </article>
                  <article className="admin-overview-card tone-success">
                    <span>Finalizados</span>
                    <strong>{ordersSnapshot.summary.finalized}</strong>
                    <small>Comprobante generado en el ERP.</small>
                  </article>
                  <article className="admin-overview-card tone-danger">
                    <span>Con error</span>
                    <strong>{ordersSnapshot.summary.error}</strong>
                    <small>Requieren revision manual.</small>
                  </article>
                </div>

                {ordersSnapshot.orders.length === 0 ? (
                  <div className="empty-state compact">
                    No hay pedidos para el filtro seleccionado.
                  </div>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Comprobante</th>
                          <th>Cliente</th>
                          <th>Entrega</th>
                          <th>Estado</th>
                          <th>Ultimo movimiento</th>
                          <th>Creacion</th>
                          <th>Pago MP</th>
                          <th>Total</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordersSnapshot.orders.map((order) => (
                          <tr key={order.pendingOrderId}>
                            <td>
                              <strong>
                                {order.order
                                  ? `${order.order.tc} ${order.order.idComprobante}`
                                  : order.orderNumber}
                              </strong>
                              <small>Pedido #{order.pendingOrderId}</small>
                              <small>Ref: {order.externalReference}</small>
                            </td>
                            <td>
                              <strong>{order.customerName || "Sin nombre"}</strong>
                              <small>{order.customerEmail || "Sin correo"}</small>
                              <small>
                                {order.customerPhone || "Sin telefono"}
                              </small>
                            </td>
                            <td>
                              <strong>{order.deliveryMethod || "Sin definir"}</strong>
                              <small>{order.customerCity || "Sin localidad"}</small>
                              <small>
                                {order.customerAddress || "Sin direccion"}
                              </small>
                            </td>
                            <td>
                              <span
                                className={`admin-status-badge status-${getOrderStateTone(
                                  order.orderState,
                                )}`}
                              >
                                {getOrderStateLabel(order.orderState)}
                              </span>
                              <small>{getStatusLabel(order.status)}</small>
                              {order.finalizationError ? (
                                <small>{order.finalizationError}</small>
                              ) : getNextOrderActionLabel(
                                  order.orderState,
                                  order.deliveryMethod,
                                ) ? (
                                <small>
                                  Sigue:{" "}
                                  {getNextOrderActionLabel(
                                    order.orderState,
                                    order.deliveryMethod,
                                  )}
                                </small>
                              ) : (
                                <small>Sin pasos pendientes</small>
                              )}
                            </td>
                            <td>{formatDateTime(order.updatedAt)}</td>
                            <td>{formatDateTime(order.createdAt)}</td>
                            <td>
                              <strong>{order.paymentStatus || "Sin dato"}</strong>
                              <small>
                                {order.paymentMethodId || "Metodo no informado"}
                                {order.paymentTypeId
                                  ? ` · ${order.paymentTypeId}`
                                  : ""}
                              </small>
                              <small>{order.paymentId || "Sin pago"}</small>
                            </td>
                            <td>
                              <strong>{formatCurrency(order.total)}</strong>
                              <small>{order.itemCount} unidades</small>
                            </td>
                            <td className="admin-actions-cell">
                              <div className="admin-order-actions admin-order-actions-stack">
                                {getNextOrderActionLabel(
                                  order.orderState,
                                  order.deliveryMethod,
                                ) ? (
                                  <form action={advanceAdminOrderAction}>
                                    <input
                                      type="hidden"
                                      name="orderId"
                                      value={order.pendingOrderId}
                                    />
                                    <input
                                      type="hidden"
                                      name="statusFilter"
                                      value={statusFilter}
                                    />
                                    <button
                                      type="submit"
                                      className="submit-order-button"
                                    >
                                      {getNextOrderActionLabel(
                                        order.orderState,
                                        order.deliveryMethod,
                                      )}
                                    </button>
                                  </form>
                                ) : null}

                                <form action={refreshAdminOrderAction}>
                                  <input
                                    type="hidden"
                                    name="pendingOrderId"
                                    value={order.pendingOrderId}
                                  />
                                  <input
                                    type="hidden"
                                    name="statusFilter"
                                    value={statusFilter}
                                  />
                                  <button
                                    type="submit"
                                    className="admin-ghost-button"
                                  >
                                    Actualizar
                                  </button>
                                </form>

                                {order.checkoutUrl ? (
                                  <a
                                    href={order.checkoutUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="admin-order-link"
                                  >
                                    Abrir pago
                                  </a>
                                ) : null}

                                <Link
                                  href={buildAdminHref({
                                    view: "orders",
                                    status: statusFilter,
                                    detailOrder: order.pendingOrderId,
                                  })}
                                  className="admin-ghost-button"
                                >
                                  Ver detalle
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : activeView === "users" ? (
              <section className="admin-pane">
                <div className="admin-pane-header">
                  <div>
                    <span className="admin-pane-kicker">Seguridad</span>
                    <h2>Usuarios del panel</h2>
                    <p>Gestiona accesos internos y permisos operativos.</p>
                  </div>

                  <div className="admin-pane-actions">
                    <span className="admin-inline-badge">
                      Sesion: {sessionUser.username}
                    </span>
                    <span className="admin-inline-badge">
                      Perfil: {sessionUser.superAdmin ? "Superadmin" : "Operador"}
                    </span>
                  </div>
                </div>

                <div className="admin-overview-grid">
                  <article className="admin-overview-card tone-success">
                    <span>Habilitados</span>
                    <strong>{enabledUsersCount}</strong>
                    <small>Pueden iniciar sesion.</small>
                  </article>
                  <article className="admin-overview-card">
                    <span>Total</span>
                    <strong>{adminUsers.length}</strong>
                    <small>Cuentas registradas en el panel.</small>
                  </article>
                  <article className="admin-overview-card tone-accent">
                    <span>Superadmins</span>
                    <strong>{superAdminCount}</strong>
                    <small>Usuarios con control total.</small>
                  </article>
                  <article className="admin-overview-card tone-danger">
                    <span>Deshabilitados</span>
                    <strong>{disabledUsersCount}</strong>
                    <small>No pueden iniciar sesion.</small>
                  </article>
                </div>

                {showUserCreateForm ? (
                  <section className="admin-section-card">
                    <div className="admin-section-heading">
                      <div>
                        <span className="admin-pane-kicker">Alta</span>
                        <h3>Nuevo usuario</h3>
                      </div>
                      <Link
                        href={buildAdminHref({ view: "users" })}
                        className="admin-ghost-button"
                      >
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
                          <small>Nombre de acceso al panel.</small>
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
                          <small>
                            La clave se guarda protegida y debe cumplir la politica
                            indicada.
                          </small>
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
                          <small>Debe coincidir con la clave principal.</small>
                        </label>

                        <label className="admin-boolean-field">
                          <span className="admin-boolean-control">
                            <input name="superAdmin" type="checkbox" />
                            <strong>Superadmin</strong>
                          </span>
                          <small>Puede crear otros usuarios admin.</small>
                        </label>

                        <label className="admin-boolean-field">
                          <span className="admin-boolean-control">
                            <input name="enabled" type="checkbox" defaultChecked />
                            <strong>Habilitado</strong>
                          </span>
                          <small>Si esta apagado, no puede iniciar sesion.</small>
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
                      <Link
                        href={buildAdminHref({ view: "users" })}
                        className="admin-ghost-button"
                      >
                        Cerrar
                      </Link>
                    </div>

                    {editingUser ? (
                      <>
                        <div className="message">
                          Si dejas la clave vacia, se mantiene la actual. La nueva
                          clave, si cargas una, debe cumplir:{" "}
                          {ADMIN_PASSWORD_POLICY_HINT.toLowerCase()}
                        </div>

                        <form
                          action={updateAdminUserAction}
                          className="admin-config-form"
                        >
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
                              <small>Nombre de acceso al panel.</small>
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
                              <small>Opcional. Solo si quieres reemplazar la actual.</small>
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
                              <small>Solo completa este campo si cambias la clave.</small>
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
                              <small>Puede crear, editar y borrar usuarios.</small>
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
                              <small>Si esta apagado, no puede iniciar sesion.</small>
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

                    {sessionUser.superAdmin ? (
                      <Link
                        href={buildAdminHref({ view: "users", create: true })}
                        className="admin-ghost-button"
                      >
                        Nuevo usuario
                      </Link>
                    ) : null}
                  </div>

                  {!sessionUser.superAdmin ? (
                    <div className="message">
                      Tu usuario no es superadmin. Puedes ver las cuentas, pero no
                      crear, editar o borrar.
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
                              <strong>
                                {user.enabled ? "Habilitado" : "Deshabilitado"}
                              </strong>
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
                                      <button
                                        type="submit"
                                        className="admin-danger-button"
                                      >
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
            ) : (
              <section className="admin-pane">
                <div className="admin-pane-header">
                  <div>
                    <span className="admin-pane-kicker">Parametros</span>
                    <h2>Configuracion del checkout</h2>
                    <p>
                      Los cambios impactan <code>TA_CONFIGURACION</code>, grupo{" "}
                      <code>TiendaWeb</code>, y se aplican sobre el runtime actual.
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
                    <small>Estado del checkout de cobro.</small>
                  </article>
                  <article className="admin-overview-card tone-warning">
                    <span>Backorders</span>
                    <strong>{settings.allowBackorders ? "Permitidos" : "Bloqueados"}</strong>
                    <small>Comportamiento comercial actual.</small>
                  </article>
                </div>

                <div className="admin-config-layout">
                  <nav
                    className="admin-config-nav"
                    aria-label="Bloques de configuracion"
                  >
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
            )}
          </div>
        </section>

        {activeView === "orders" && detailOrderId ? (
          <section className="admin-detail-frame-overlay" aria-label="Detalle del pedido">
            <div className="admin-detail-frame-shell">
              <div className="admin-detail-frame-topbar">
                <div>
                  <span className="admin-pane-kicker">Detalle</span>
                  <h3>Pedido #{detailOrderId}</h3>
                </div>
                <Link
                  href={buildAdminHref({
                    view: "orders",
                    status: statusFilter,
                  })}
                  className="admin-ghost-button"
                >
                  Cerrar
                </Link>
              </div>
              <iframe
                title={`Detalle del pedido ${detailOrderId}`}
                src={`/admin/orders/${detailOrderId}`}
                className="admin-detail-frame"
              />
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
