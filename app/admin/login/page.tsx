import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminUserAction, loginAdminAction } from "@/app/admin/actions";
import { AdminThemeToggle } from "@/components/admin-theme-toggle";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionUser,
  isAdminConfigured,
} from "@/lib/admin-auth";
import { getPublicStoreSettings } from "@/lib/store-config";
import {
  ADMIN_PASSWORD_PATTERN,
  ADMIN_PASSWORD_POLICY_HINT,
} from "@/lib/admin-users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function AdminLoginPage({
  searchParams,
}: LoginPageProps) {
  const [{ error }, cookieStore] = await Promise.all([searchParams, cookies()]);
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const [sessionUser, configured, settings] = await Promise.all([
    getAdminSessionUser(token),
    isAdminConfigured(),
    getPublicStoreSettings(),
  ]);

  if (sessionUser) {
    redirect("/admin");
  }

  const needsBootstrap = !configured;

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <div className="admin-login-layout">
          <div className="admin-login-copy">
            <div className="admin-login-topbar">
              <span className="admin-login-eyebrow">Panel Admin</span>
              <AdminThemeToggle />
            </div>

            <div className="admin-login-intro">
              <h1>{settings.storeName}</h1>
              <p>{settings.storeTagline}</p>
            </div>

            <div className="admin-login-highlights">
              <article className="admin-login-highlight">
                <strong>Pedidos y pagos</strong>
                <span>Seguimiento centralizado del checkout web.</span>
              </article>
              <article className="admin-login-highlight">
                <strong>Configuracion operativa</strong>
                <span>Parametros del checkout y Mercado Pago desde un mismo panel.</span>
              </article>
              <article className="admin-login-highlight">
                <strong>Acceso interno</strong>
                <span>Usuarios con permisos separados para operacion y administracion.</span>
              </article>
            </div>
          </div>

          <div className="admin-login-panel">
            <div className="admin-login-panel-copy">
              <span className="admin-pane-kicker">
                {needsBootstrap ? "Primer acceso" : "Ingreso"}
              </span>
              <h2>{needsBootstrap ? "Crear superadmin" : "Acceso interno"}</h2>
              <p>
                {needsBootstrap
                  ? "No hay usuarios habilitados todavia. Este alta se crea como superadmin."
                  : "Ingresa con tu usuario habilitado para administrar la tienda."}
              </p>
            </div>

            {error === "credentials" ? (
              <div className="message error">Usuario o clave incorrectos.</div>
            ) : null}

            {error === "setup" ? (
              <div className="message error">
                No hay usuarios admin habilitados. Crea el primer superadmin para
                continuar.
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

            {error === "user-create" ? (
              <div className="message error">
                No se pudo crear el usuario admin. Revisa si ya existe o si faltan
                datos.
              </div>
            ) : null}

            {needsBootstrap ? (
              <>
                <div className="message">
                  No hay usuarios admin habilitados en <code>TA_UsuariosWeb</code>.
                  Este alta se crea como <strong>superadmin</strong>.
                </div>

                <form action={createAdminUserAction} className="admin-login-form">
                  <input type="hidden" name="mode" value="bootstrap" />

                  <label className="field">
                    <span>Usuario</span>
                    <input name="username" required />
                  </label>

                  <label className="field">
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

                  <label className="field">
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

                  <div className="message">
                    La clave se guarda hasheada y debe cumplir:{" "}
                    {ADMIN_PASSWORD_POLICY_HINT.toLowerCase()}
                  </div>

                  <button type="submit" className="submit-order-button">
                    Crear primer usuario
                  </button>
                </form>
              </>
            ) : (
              <form action={loginAdminAction} className="admin-login-form">
                <label className="field">
                  <span>Usuario</span>
                  <input name="username" required />
                </label>

                <label className="field">
                  <span>Clave</span>
                  <input name="password" type="password" required />
                </label>

                <button type="submit" className="submit-order-button">
                  Entrar al panel
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
