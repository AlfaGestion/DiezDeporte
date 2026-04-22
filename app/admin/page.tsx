import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createAdminUserAction,
  deleteAdminUserAction,
  logoutAdminAction,
  saveAdminSettingsAction,
  updateAdminUserAction,
} from "@/app/admin/actions";
import { AdminHelpWorkspace } from "@/components/admin/admin-help-workspace";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminConfigWorkspace } from "@/components/admin/admin-config-workspace";
import { AdminSystemWorkspace } from "@/components/admin/admin-system-workspace";
import { AdminLiveOrderWatcher } from "@/components/admin/admin-live-order-watcher";
import { AdminThemeToggle } from "@/components/admin-theme-toggle";
import { cn } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/admin/empty-state";
import { OrderFiltersBar } from "@/components/admin/order-filters-bar";
import { PickupDeskPane } from "@/components/admin/pickup-desk-pane";
import { OrdersTable } from "@/components/admin/orders-table";
import { OrderTabs } from "@/components/admin/order-tabs";
import { getWatchSnapshot } from "@/lib/repositories/orderRepository";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionUser,
} from "@/lib/admin-auth";
import {
  getAdminConfigFields,
} from "@/lib/admin-config";
import {
  ADMIN_SYSTEM_SECTIONS,
  normalizeAdminSystemEditorMode,
  normalizeAdminSystemSection,
  type AdminSystemEditorMode,
  type AdminSystemSection,
} from "@/lib/admin-system";
import {
  ADMIN_PASSWORD_PATTERN,
  ADMIN_PASSWORD_POLICY_HINT,
  listAdminUsers,
} from "@/lib/admin-users";
import {
  ADMIN_ORDER_VIEWS,
  buildAdminOrdersSnapshot,
  getAdminOrderViewLabel,
  normalizeAdminOrderView,
} from "@/lib/order-admin";
import { getAdminOrderStateCssVariables } from "@/lib/order-state-config";
import { normalizeOrderFilters } from "@/lib/models/order";
import { getAdminSystemWorkspaceData } from "@/lib/services/adminSystemService";
import { getOrders } from "@/lib/services/orderService";
import { getPublicStoreSettings, getServerSettings } from "@/lib/store-config";
import type {
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
    system?: string;
    system_q?: string;
    system_mode?: string;
    system_article?: string;
    system_article_page?: string;
    system_stock_page?: string;
    config?: string;
    error?: string;
    detail?: string;
    create?: string;
    editUser?: string;
  }>;
};

type AdminView = "orders" | "pickups" | "users" | "system" | "config" | "help";

type AdminHrefInput = {
  view?: AdminView;
  vista?: OrderListView;
  q?: string | null;
  estado?: string | null;
  estado_pago?: string | null;
  tipo_pedido?: string | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  system?: AdminSystemSection;
  system_q?: string | null;
  system_mode?: AdminSystemEditorMode | null;
  system_article?: string | null;
  system_article_page?: number | null;
  system_stock_page?: number | null;
  config?: string;
  create?: boolean;
  editUser?: number;
};

function normalizeView(rawValue: string | undefined): AdminView {
  if (rawValue === "users") {
    return "users";
  }

  if (rawValue === "pickups" || rawValue === "retiros") {
    return "pickups";
  }

  if (rawValue === "config" || rawValue === "general") {
    return "config";
  }

  if (rawValue === "system" || rawValue === "sistema") {
    return "system";
  }

  if (rawValue === "help" || rawValue === "ayuda") {
    return "help";
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

  if (
    input.view !== "users" &&
    input.view !== "config" &&
    input.view !== "pickups" &&
    input.view !== "system" &&
    input.view !== "help"
  ) {
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

  if (input.view === "system") {
    if (input.system && input.system !== "articulos") {
      params.set("system", input.system);
    }

    if (input.system_q) {
      params.set("system_q", input.system_q);
    }

    if (input.system_mode) {
      params.set("system_mode", input.system_mode);
    }

    if (input.system_article) {
      params.set("system_article", input.system_article);
    }

    if (
      input.system === "articulos" &&
      input.system_article_page &&
      input.system_article_page > 1
    ) {
      params.set("system_article_page", String(input.system_article_page));
    }

    if (
      input.system === "stock" &&
      input.system_stock_page &&
      input.system_stock_page > 1
    ) {
      params.set("system_stock_page", String(input.system_stock_page));
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
    case "pickups":
      return {
        label: "Retiros",
        description: "Mostrador para validar codigos de retiro y registrar la entrega.",
      };
    case "config":
      return {
        label: "Configuracion",
        description: "Parametros del checkout y comportamiento comercial.",
      };
    case "system":
      return {
        label: "Sistema",
        description: "Mantenimiento de articulos, stock, marcas y categorias.",
      };
    case "help":
      return {
        label: "Ayuda",
        description: "Guia operativa e instructivo completo de uso del sistema.",
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
  detail,
}: {
  saved?: string;
  error?: string;
  detail?: string;
}) {
  const renderBanner = (
    tone: "success" | "error",
    message: string,
    extraDetail?: string,
  ) => (
    <div
      className={cn(
        "rounded-[18px] border px-4 py-3 text-sm",
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
          : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200",
      )}
    >
      <div>{message}</div>
      {extraDetail ? (
        <div className="mt-1 text-xs opacity-80">{extraDetail}</div>
      ) : null}
    </div>
  );

  if (saved === "config") {
    return renderBanner("success", "Configuracion guardada y aplicada al runtime actual.");
  }

  if (saved === "refresh") {
    return renderBanner("success", "Estado del pedido actualizado.");
  }

  if (saved === "advance") {
    return renderBanner("success", "Estado del pedido avanzado correctamente.");
  }

  if (saved === "state-updated") {
    return renderBanner("success", "Estado del pedido actualizado.");
  }

  if (saved === "payment-updated") {
    return renderBanner("success", "Pago del pedido actualizado.");
  }

  if (saved === "pickup-email-resent") {
    return renderBanner("success", "Email de retiro reenviado.");
  }

  if (saved === "user") {
    return renderBanner("success", "Usuario admin creado.");
  }

  if (saved === "user-updated") {
    return renderBanner("success", "Usuario admin actualizado.");
  }

  if (saved === "user-deleted") {
    return renderBanner("success", "Usuario admin eliminado.");
  }

  if (saved === "system-article-created") {
    return renderBanner("success", "Articulo creado correctamente.");
  }

  if (saved === "system-article-updated") {
    return renderBanner("success", "Articulo actualizado.");
  }

  if (saved === "system-article-blocked") {
    return renderBanner("success", "Articulo bloqueado en la web.");
  }

  if (saved === "system-article-unblocked") {
    return renderBanner("success", "Articulo habilitado otra vez en la web.");
  }

  if (saved === "system-stock-updated") {
    return renderBanner("success", "Stock actualizado.");
  }

  if (saved === "system-brand-created") {
    return renderBanner("success", "Marca creada correctamente.");
  }

  if (saved === "system-category-created") {
    return renderBanner("success", "Categoria creada correctamente.");
  }

  if (error === "order-not-found") {
    return renderBanner("error", "No se encontro el pedido solicitado.");
  }

  if (error === "order-advance") {
    return renderBanner(
      "error",
      "No se pudo avanzar el pedido. Revisa el flujo y el estado actual.",
    );
  }

  if (error === "order-refresh") {
    return renderBanner(
      "error",
      "No se pudo actualizar el estado del pago. Reintenta en unos segundos.",
    );
  }

  if (error === "order-update") {
    return renderBanner(
      "error",
      "No se pudo actualizar el pedido. Revisa la transicion solicitada.",
    );
  }

  if (error === "order-payment-update") {
    return renderBanner(
      "error",
      "No se pudo actualizar el estado del pago del pedido.",
    );
  }

  if (error === "pickup-email-resend") {
    return renderBanner(
      "error",
      "No se pudo reenviar el email de retiro.",
    );
  }

  if (error === "user-create") {
    return renderBanner(
      "error",
      "No se pudo crear el usuario admin. Revisa si ya existe o si faltan datos.",
    );
  }

  if (error === "password-match") {
    return renderBanner("error", "Las claves no coinciden.");
  }

  if (error === "user-password-policy") {
    return renderBanner("error", ADMIN_PASSWORD_POLICY_HINT);
  }

  if (error === "user-username") {
    return renderBanner("error", "El usuario admin debe tener al menos 3 caracteres.");
  }

  if (error === "user-exists") {
    return renderBanner("error", "Ya existe un usuario admin con ese nombre.");
  }

  if (error === "user-reserved") {
    return renderBanner("error", "Ese usuario esta reservado por el sistema.");
  }

  if (error === "user-forbidden") {
    return renderBanner("error", "Solo un superadmin puede administrar usuarios.");
  }

  if (error === "user-not-found") {
    return renderBanner("error", "No se encontro el usuario admin.");
  }

  if (error === "user-last-superadmin") {
    return renderBanner("error", "Debe quedar al menos un superadmin habilitado.");
  }

  if (error === "user-self-delete") {
    return renderBanner("error", "No puedes borrar tu propio usuario activo.");
  }

  if (error === "user-self-disable") {
    return renderBanner("error", "No puedes deshabilitar tu propio usuario activo.");
  }

  if (error === "user-self-demote") {
    return renderBanner(
      "error",
      "No puedes quitarte permisos de superadmin desde tu propia sesion.",
    );
  }

  if (error === "system-article-create") {
    return renderBanner("error", "No se pudo crear el articulo.", detail);
  }

  if (error === "system-article-update") {
    return renderBanner("error", "No se pudo actualizar el articulo.", detail);
  }

  if (error === "system-article-block") {
    return renderBanner("error", "No se pudo cambiar la visibilidad web del articulo.", detail);
  }

  if (error === "system-stock-update") {
    return renderBanner("error", "No se pudo registrar el movimiento de stock.", detail);
  }

  if (error === "system-brand-create") {
    return renderBanner("error", "No se pudo crear la marca.", detail);
  }

  if (error === "system-category-create") {
    return renderBanner("error", "No se pudo crear la categoria.", detail);
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
    <section className="space-y-4">
      <form action="/admin" className="space-y-4">
        <AdminPageHeader
          title="Pedidos"
          subtitle="Bandeja operativa para revisar pagos, avanzar estados y abrir el detalle solo cuando hace falta."
          searchDefaultValue={baseOrderFilters.q}
          resultCount={ordersSnapshot.orders.length}
        />

        <OrderTabs
          activeValue={activeOrderView}
          tabs={ADMIN_ORDER_VIEWS.map((orderView) => ({
            value: orderView,
            label: getAdminOrderViewLabel(orderView),
            count: getSummaryCount(ordersSnapshot.summary, orderView),
            href: buildAdminHref({
              view: "orders",
              vista: orderView,
              q: baseOrderFilters.q,
              estado: baseOrderFilters.estado,
              estado_pago: baseOrderFilters.estado_pago,
              tipo_pedido: baseOrderFilters.tipo_pedido,
              fecha_desde: baseOrderFilters.fecha_desde,
              fecha_hasta: baseOrderFilters.fecha_hasta,
            }),
          }))}
        />

        <OrderFiltersBar
          activeOrderView={activeOrderView}
          filters={baseOrderFilters}
          clearHref={buildAdminHref({
            view: "orders",
            vista: activeOrderView,
          })}
        />
      </form>

      {ordersSnapshot.orders.length === 0 ? (
        <EmptyState
          title="Sin pedidos para mostrar"
          message={
            baseOrderFilters.q ||
            baseOrderFilters.estado ||
            baseOrderFilters.estado_pago ||
            baseOrderFilters.tipo_pedido ||
            baseOrderFilters.fecha_desde ||
            baseOrderFilters.fecha_hasta
              ? "No hubo resultados para los filtros actuales. Ajusta la busqueda o limpia los filtros."
              : "Todavia no hay pedidos cargados en esta vista."
          }
          compact
        />
      ) : (
        <OrdersTable orders={ordersSnapshot.orders} returnTo={currentOrdersHref} />
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
  configFields: Awaited<ReturnType<typeof getAdminConfigFields>>;
  activeConfigSlug: string;
}) {
  const { configFields, activeConfigSlug } = props;

  return (
    <section className="admin-pane">
      <AdminConfigWorkspace
        fields={configFields}
        activeSection={activeConfigSlug}
        saveAction={saveAdminSettingsAction}
      />
    </section>
  );
}

function HelpPane(props: {
  storeName: string;
  configFields: Awaited<ReturnType<typeof getAdminConfigFields>>;
  showTechnicalSection: boolean;
}) {
  const { storeName, configFields, showTechnicalSection } = props;

  return (
    <section className="admin-pane">
      <AdminHelpWorkspace
        storeName={storeName}
        configFields={configFields}
        showTechnicalSection={showTechnicalSection}
      />
    </section>
  );
}

type SystemPaneProps = Awaited<ReturnType<typeof getAdminSystemWorkspaceData>> & {
  section: AdminSystemSection;
  visibleSections: readonly AdminSystemSection[];
  searchQuery: string;
  editorMode: AdminSystemEditorMode | null;
};

function SystemPane(props: SystemPaneProps) {
  return (
    <section className="admin-pane">
      <AdminSystemWorkspace
        activeSection={props.section}
        visibleSections={props.visibleSections}
        searchQuery={props.searchQuery}
        editorMode={props.editorMode}
        summary={props.summary}
        articles={props.articles}
        articleCurrentPage={props.articleCurrentPage}
        articlePageSize={props.articlePageSize}
        articleTotalCount={props.articleTotalCount}
        articleTotalPages={props.articleTotalPages}
        stockArticles={props.stockArticles}
        stockCurrentPage={props.stockCurrentPage}
        stockPageSize={props.stockPageSize}
        stockTotalCount={props.stockTotalCount}
        stockTotalPages={props.stockTotalPages}
        selectedArticle={props.selectedArticle}
        nextArticleCode={props.nextArticleCode}
        brands={props.brands}
        categories={props.categories}
        units={props.units}
        defaultStockReasonId={props.defaultStockReasonId}
        stockReasons={props.stockReasons}
      />
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
      system,
      system_q,
      system_mode,
      system_article,
      system_article_page,
      system_stock_page,
      config,
      error,
      detail,
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
  const requestedSystemSection = normalizeAdminSystemSection(system);
  const canAccessSystemStock =
    sessionUser.username.trim().toLowerCase() === "useralfa";
  const visibleSystemSections = canAccessSystemStock
    ? ADMIN_SYSTEM_SECTIONS
    : ADMIN_SYSTEM_SECTIONS.filter((section) => section !== "stock");
  const activeSystemSection =
    !canAccessSystemStock && requestedSystemSection === "stock"
      ? "articulos"
      : requestedSystemSection;
  const activeSystemMode = normalizeAdminSystemEditorMode(system_mode);
  const activeSystemArticle = system_article?.trim() || "";
  const systemSearchQuery = system_q?.trim() || "";
  const activeSystemArticlePage =
    activeSystemSection === "articulos"
      ? normalizePositiveInt(system_article_page) || 1
      : 1;
  const activeSystemStockPage =
    activeSystemSection === "stock"
      ? normalizePositiveInt(system_stock_page) || 1
      : 1;
  const baseOrderFilters = normalizeOrderFilters({
    q,
    estado,
    estado_pago,
    tipo_pedido,
    fecha_desde,
    fecha_hasta,
    limit: null,
  });
  const [
    settings,
    serverSettings,
    configFields,
    filteredOrders,
    summaryOrders,
    adminUsers,
    stateColorStyle,
    initialWatchSnapshot,
    systemWorkspaceData,
  ] = await Promise.all([
    getPublicStoreSettings(),
    getServerSettings(),
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
    getAdminOrderStateCssVariables(),
    getWatchSnapshot(),
    activeView === "system"
      ? getAdminSystemWorkspaceData({
          section: activeSystemSection,
          query: systemSearchQuery,
          articleCode: activeSystemArticle,
          articlePage: activeSystemArticlePage,
          stockPage: activeSystemStockPage,
        }).then((workspace) => ({
          ...workspace,
          section: activeSystemSection,
          visibleSections: visibleSystemSections,
          searchQuery: systemSearchQuery,
          editorMode: activeSystemMode,
        }))
      : Promise.resolve(null),
  ]);
  const ordersSnapshot = buildAdminOrdersSnapshot({
    orders: filteredOrders,
    allOrders: summaryOrders,
  });
  const activeConfigSlug = config || "negocio";
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
  const currentSystemHref = buildAdminHref({
    view: "system",
    system: activeSystemSection,
    system_q: systemSearchQuery,
    system_mode: activeSystemMode,
    system_article: activeSystemArticle || null,
    system_article_page:
      activeSystemSection === "articulos" ? activeSystemArticlePage : null,
    system_stock_page:
      activeSystemSection === "stock" ? activeSystemStockPage : null,
  });
  const showTechnicalHelp =
    sessionUser.username.trim().toLowerCase() === "useralfa";

  return (
    <main className="admin-page" style={stateColorStyle}>
      <section className="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-4 lg:px-6">
        <header className="flex flex-col gap-4 rounded-[22px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
              Admin
            </div>
            <div className="text-lg font-semibold text-[color:var(--admin-title)]">
              {settings.storeName}
            </div>
            <p className="text-sm text-[color:var(--admin-text)]">{viewMeta.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AdminThemeToggle />
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[color:var(--admin-pane-line)] px-4 text-sm font-medium text-[color:var(--admin-title)] transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            >
              Ver tienda
            </Link>
            <form action={logoutAdminAction}>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[color:var(--admin-accent)] px-4 text-sm font-semibold text-white transition hover:bg-[color:var(--admin-accent-strong)]"
              >
                Cerrar sesion
              </button>
            </form>
          </div>
        </header>

        <FlashMessages saved={saved} error={error} detail={detail} />
        <AdminLiveOrderWatcher
          initialSnapshot={initialWatchSnapshot}
          ordersHref={currentOrdersHref}
          refreshOnNewOrders={activeView === "orders"}
        />

        <nav
          className="flex gap-2 overflow-x-auto rounded-[18px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-2"
          aria-label="Secciones del panel"
        >
          <Link
            href={currentOrdersHref}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "orders"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Pedidos</span>
            <small
              className={
                activeView === "orders"
                  ? "text-white/80"
                  : "text-[color:var(--admin-text)]"
              }
            >
              {ordersSnapshot.summary.total}
            </small>
          </Link>
          <Link
            href={buildAdminHref({ view: "pickups" })}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "pickups"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Retiros</span>
            <small className={activeView === "pickups" ? "text-white/80" : "text-[color:var(--admin-text)]"}>
              {ordersSnapshot.summary.pendientes_retiro}
            </small>
          </Link>
          <Link
            href={buildAdminHref({ view: "users" })}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "users"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Usuarios</span>
            <small className={activeView === "users" ? "text-white/80" : "text-[color:var(--admin-text)]"}>
              {adminUsers.length}
            </small>
          </Link>
          <Link
            href={currentSystemHref}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "system"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Sistema</span>
            <small className={activeView === "system" ? "text-white/80" : "text-[color:var(--admin-text)]"}>
              {visibleSystemSections.length}
            </small>
          </Link>
          <Link
            href={buildAdminHref({ view: "config", config: activeConfigSlug })}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "config"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Configuracion</span>
            <small className={activeView === "config" ? "text-white/80" : "text-[color:var(--admin-text)]"}>
              8
            </small>
          </Link>
          <Link
            href={buildAdminHref({ view: "help" })}
            className={cn(
              "inline-flex min-w-[140px] items-center justify-between rounded-[14px] px-4 py-2.5 text-sm transition",
              activeView === "help"
                ? "bg-[color:var(--admin-accent)] text-white"
                : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            <span>Ayuda</span>
            <small className={activeView === "help" ? "text-white/80" : "text-[color:var(--admin-text)]"}>
              Guia
            </small>
          </Link>
        </nav>

        {activeView === "orders" ? (
          <OrdersPane
            ordersSnapshot={ordersSnapshot}
            activeOrderView={activeOrderView}
            baseOrderFilters={baseOrderFilters}
            currentOrdersHref={currentOrdersHref}
          />
        ) : activeView === "pickups" ? (
          <PickupDeskPane
            requirePickupFullName={serverSettings.requerirNombreApellidoAlRetirar}
            requirePickupDni={serverSettings.requerirDniAlRetirar}
          />
        ) : activeView === "users" ? (
          <UsersPane
            sessionUser={sessionUser}
            adminUsers={adminUsers}
            showUserCreateForm={showUserCreateForm}
            showUserEditForm={showUserEditForm}
            editingUser={editingUser}
          />
        ) : activeView === "system" ? (
          systemWorkspaceData ? (
            <SystemPane {...systemWorkspaceData} />
          ) : (
            <EmptyState
              title="No se pudo abrir Sistema"
              message="Revisa la conexion y vuelve a intentar."
              compact
            />
          )
        ) : activeView === "help" ? (
          <HelpPane
            storeName={settings.storeName}
            configFields={configFields}
            showTechnicalSection={showTechnicalHelp}
          />
        ) : (
            <ConfigPane
              configFields={configFields}
              activeConfigSlug={activeConfigSlug}
            />
        )}
      </section>
    </main>
  );
}
