import "server-only";
import { getServerSettings } from "@/lib/store-config";
import type { OrderState, StoredOrder } from "@/lib/types/order";

type MailTransport = {
  sendMail: (message: {
    from?: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<unknown>;
};

type SmtpAccount = {
  from: string;
  fromName: string;
  user: string;
  pass: string;
};

type SmtpConfig = {
  host: string | null;
  port: number;
  secure: boolean;
  timeoutMs: number;
  ignoreTlsErrors: boolean;
  accounts: SmtpAccount[];
};

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function buildDeliveryAddress(order: StoredOrder) {
  const parts = [
    order.metadata.customerAddress || order.direccion || null,
    order.metadata.customerCity || null,
    order.metadata.customerProvince || null,
    order.metadata.customerPostalCode || null,
  ].filter(Boolean);

  return parts.join(", ");
}

function buildItemsHtml(order: StoredOrder) {
  const items = order.metadata.items || [];

  if (items.length === 0) {
    return `
      <div style="padding:14px 16px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc;color:#475569;font-size:14px;">
        No pudimos adjuntar el detalle de articulos en este email, pero tu pedido ya fue despachado.
      </div>
    `;
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <thead>
        <tr>
          <th align="left" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Articulo</th>
          <th align="right" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Cantidad</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
              <tr>
                <td style="padding:12px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;">
                  ${escapeHtml(item.productId)}
                </td>
                <td align="right" style="padding:12px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;font-weight:600;">
                  ${escapeHtml(String(item.quantity || 0))}
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildDispatchedEmail(order: StoredOrder) {
  const trackingNumber = order.numero_seguimiento?.trim() || null;
  const deliveryAddress = buildDeliveryAddress(order);
  const customerNotes = order.metadata.customerNotes?.trim() || null;
  const textLines = [
    `Hola ${order.nombre_cliente},`,
    "",
    `Tu pedido ${order.numero_pedido} fue despachado.`,
    trackingNumber ? `Numero de seguimiento: ${trackingNumber}.` : null,
    deliveryAddress ? `Direccion de entrega: ${deliveryAddress}.` : null,
    "",
    "Detalle del pedido:",
    ...(order.metadata.items || []).map(
      (item) => `- ${item.productId} x ${item.quantity}`,
    ),
    "",
    `Total: ${formatCurrency(order.monto_total)}.`,
    "",
    "Gracias por comprar en Diez Deportes.",
  ].filter(Boolean);

  return {
    subject: "Tu pedido fue despachado",
    text: textLines.join("\n"),
    html: `
      <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ee;border-radius:24px;overflow:hidden;">
          <div style="padding:28px 32px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);color:#ffffff;">
            <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.78;">Diez Deportes</div>
            <h1 style="margin:10px 0 8px;font-size:28px;line-height:1.2;">Tu pedido ya fue despachado</h1>
            <p style="margin:0;font-size:15px;line-height:1.7;opacity:.92;">
              Pedido <strong>#${escapeHtml(order.numero_pedido)}</strong> para ${escapeHtml(order.nombre_cliente)}.
            </p>
          </div>

          <div style="padding:28px 32px;">
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
              Ya preparamos tu compra y la entregamos al correo o transporte. Debajo te dejamos un resumen para que tengas toda la informacion a mano.
            </p>

            <div style="margin:0 0 22px;padding:18px;border:1px solid #dbeafe;border-radius:18px;background:#eff6ff;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#1d4ed8;font-weight:700;">Seguimiento</div>
              <div style="margin-top:8px;font-size:22px;font-weight:700;color:#0f172a;">
                ${trackingNumber ? escapeHtml(trackingNumber) : "Se asignara en breve"}
              </div>
              <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#475569;">
                ${trackingNumber ? "Con este numero puedes identificar el envio con el transporte." : "El pedido ya salio. Si el numero de seguimiento no aparece todavia, te lo compartiremos apenas quede disponible."}
              </div>
            </div>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 14px;">
              <tr>
                <td width="50%" valign="top" style="padding:18px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
                  <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:700;">Entrega</div>
                  <div style="margin-top:10px;font-size:15px;line-height:1.7;color:#0f172a;">
                    ${deliveryAddress ? escapeHtml(deliveryAddress) : "Sin direccion informada"}
                  </div>
                </td>
                <td width="50%" valign="top" style="padding:18px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
                  <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:700;">Resumen</div>
                  <div style="margin-top:10px;font-size:15px;line-height:1.8;color:#0f172a;">
                    <div><strong>Estado:</strong> Despachado</div>
                    <div><strong>Total:</strong> ${escapeHtml(formatCurrency(order.monto_total))}</div>
                    <div><strong>Contacto:</strong> ${escapeHtml(order.telefono_cliente)}</div>
                  </div>
                </td>
              </tr>
            </table>

            <div style="margin-top:8px;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;background:#ffffff;">
              <div style="padding:16px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:700;">Detalle del pedido</div>
              </div>
              <div style="padding:0 18px 6px;">
                ${buildItemsHtml(order)}
              </div>
            </div>

            ${customerNotes ? `
              <div style="margin-top:22px;padding:16px 18px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#c2410c;font-weight:700;">Observaciones</div>
                <div style="margin-top:8px;font-size:14px;line-height:1.7;color:#7c2d12;">${escapeHtml(customerNotes)}</div>
              </div>
            ` : ""}

            <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#475569;">
              Gracias por elegir <strong>Diez Deportes</strong>. Si necesitas ayuda con tu envio, puedes responder este email y te damos una mano.
            </p>
          </div>
        </div>
      </div>
    `,
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

async function buildPublicOrderUrl(order: StoredOrder) {
  const baseUrl = trimTrailingSlash((await getServerSettings()).mercadoPagoPublicBaseUrl || "");

  if (!baseUrl) {
    return null;
  }

  const externalReference = order.metadata.externalReference || order.numero_pedido;
  return `${baseUrl}/pedido?externalReference=${encodeURIComponent(externalReference)}`;
}

function normalizeOptionalString(value: string | undefined | null) {
  const normalized = value?.trim() || "";
  return normalized || null;
}

function buildSmtpAccount(input: {
  from?: string | null;
  fromName?: string | null;
  user?: string | null;
  pass?: string | null;
}) {
  const user = normalizeOptionalString(input.user);
  const pass = normalizeOptionalString(input.pass);
  const from = normalizeOptionalString(input.from) || user;
  const fromName = normalizeOptionalString(input.fromName) || "Diez Deportes";

  if (!from || !user || !pass) {
    return null;
  }

  return {
    from,
    fromName,
    user,
    pass,
  } satisfies SmtpAccount;
}

function getSmtpConfig() {
  const host = normalizeOptionalString(process.env.SMTP_HOST);
  const port = Number(process.env.SMTP_PORT || "587");
  const fromName =
    normalizeOptionalString(process.env.SMTP_FROM_NAME) || "Diez Deportes";
  const fallbackFromName =
    normalizeOptionalString(process.env.SMTP_FALLBACK_FROM_NAME) || fromName;
  const primaryAccount = buildSmtpAccount({
    from: normalizeOptionalString(process.env.SMTP_FROM),
    fromName,
    user:
      normalizeOptionalString(process.env.SMTP_USER) ||
      normalizeOptionalString(process.env.SMTP_PRIMARY_USER),
    pass:
      normalizeOptionalString(process.env.SMTP_PASS) ||
      normalizeOptionalString(process.env.SMTP_PRIMARY_PASS),
  });
  const fallbackAccount = buildSmtpAccount({
    from: normalizeOptionalString(process.env.SMTP_FALLBACK_FROM),
    fromName: fallbackFromName,
    user: normalizeOptionalString(process.env.SMTP_FALLBACK_USER),
    pass: normalizeOptionalString(process.env.SMTP_FALLBACK_PASS),
  });
  const accounts = [primaryAccount, fallbackAccount].filter(
    (account): account is SmtpAccount => Boolean(account),
  );

  return {
    host,
    port,
    secure: String(process.env.SMTP_SECURE || "false").trim().toLowerCase() === "true",
    timeoutMs: Math.max(1000, Number(process.env.SMTP_TIMEOUT_MS || "8000") || 8000),
    ignoreTlsErrors:
      String(process.env.SMTP_IGNORE_TLS_ERRORS || "true")
        .trim()
        .toLowerCase() === "true",
    accounts,
  } satisfies SmtpConfig;
}

async function buildEmailContent(order: StoredOrder, state: OrderState) {
  if (state === "FACTURADO") {
    return {
      subject: "Tu pedido fue confirmado",
      text: `Hola ${order.nombre_cliente}, tu pedido ${order.numero_pedido} fue confirmado y ya esta en preparacion.`,
      html: `<p>Hola ${order.nombre_cliente},</p><p>Tu pedido <strong>${order.numero_pedido}</strong> fue confirmado y ya esta en preparacion.</p>`,
    };
  }

  if (state === "LISTO_PARA_RETIRO") {
    const pickupCode = order.metadata.pickupCode || "Sin codigo";
    const publicOrderUrl = await buildPublicOrderUrl(order);
    const linkBlock = publicOrderUrl
      ? `
        <div style="margin-top:22px;">
          <a
            href="${publicOrderUrl}"
            style="display:inline-flex;align-items:center;justify-content:center;padding:14px 20px;border-radius:14px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;"
          >
            Ver mi pedido y QR de retiro
          </a>
        </div>
      `
      : "";

    return {
      subject: "Tu pedido esta listo para retirar",
      text: [
        `Hola ${order.nombre_cliente},`,
        "",
        `Tu pedido ${order.numero_pedido} ya esta listo para retirar.`,
        `Codigo de retiro: ${pickupCode}.`,
        publicOrderUrl ? `Ver pedido y QR: ${publicOrderUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      html: `
        <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
          <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ee;border-radius:24px;overflow:hidden;">
            <div style="padding:28px 32px;background:linear-gradient(135deg,#14532d 0%,#15803d 100%);color:#ffffff;">
              <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.8;">Diez Deportes</div>
              <h1 style="margin:10px 0 8px;font-size:28px;line-height:1.2;">Tu pedido esta listo para retirar</h1>
              <p style="margin:0;font-size:15px;line-height:1.7;opacity:.92;">
                Pedido <strong>#${escapeHtml(order.numero_pedido)}</strong> listo para ${escapeHtml(order.nombre_cliente)}.
              </p>
            </div>

            <div style="padding:28px 32px;">
              <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
                Ya puedes pasar por el local. Para retirar, abre tu pedido desde el boton de abajo y muestra el QR junto con tu codigo.
              </p>

              <div style="padding:18px;border:1px solid #bbf7d0;border-radius:18px;background:#f0fdf4;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#15803d;font-weight:700;">Codigo de retiro</div>
                <div style="margin-top:8px;font-size:28px;font-weight:800;color:#14532d;">
                  ${escapeHtml(pickupCode)}
                </div>
                <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#475569;">
                  Si no puedes mostrar el QR, con este codigo tambien podemos identificar tu pedido en el local.
                </div>
              </div>

              ${linkBlock}

              ${
                publicOrderUrl
                  ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#64748b;">
                      Si el boton no abre, copia este enlace en tu navegador:<br />
                      <a href="${publicOrderUrl}" style="color:#0f172a;word-break:break-all;">${publicOrderUrl}</a>
                    </p>`
                  : ""
              }
            </div>
          </div>
        </div>
      `,
    };
  }

  if (state === "ENTREGADO" && order.tipo_pedido === "retiro") {
    const retiroPor = order.nombre_apellido_retiro || "Sin informar";
    const fechaRetiro = order.fecha_hora_retiro
      ? new Intl.DateTimeFormat("es-AR", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(order.fecha_hora_retiro))
      : "Sin fecha";

    return {
      subject: "Tu pedido fue retirado",
      text: `Tu pedido ${order.numero_pedido} fue retirado el dia y hora ${fechaRetiro} por ${retiroPor}.`,
      html: `
        <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
          <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ee;border-radius:24px;overflow:hidden;">
            <div style="padding:28px 32px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);color:#ffffff;">
              <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.8;">Diez Deportes</div>
              <h1 style="margin:10px 0 8px;font-size:28px;line-height:1.2;">Retiro registrado</h1>
              <p style="margin:0;font-size:15px;line-height:1.7;opacity:.92;">
                Tu pedido <strong>#${escapeHtml(order.numero_pedido)}</strong> ya figura como retirado.
              </p>
            </div>
            <div style="padding:28px 32px;">
              <p style="margin:0;font-size:15px;line-height:1.8;color:#334155;">
                Tu pedido <strong>${escapeHtml(order.numero_pedido)}</strong> fue retirado el dia y hora
                <strong> ${escapeHtml(fechaRetiro)}</strong> por <strong>${escapeHtml(retiroPor)}</strong>.
              </p>
            </div>
          </div>
        </div>
      `,
    };
  }

  return buildDispatchedEmail(order);
}

function createTransport(config: SmtpConfig, account: SmtpAccount): MailTransport {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodemailer = require("nodemailer") as {
    createTransport: (config: Record<string, unknown>) => MailTransport;
  };

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: account.user,
      pass: account.pass,
    },
    tls: config.ignoreTlsErrors
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
  });
}

export async function sendOrderStatusEmail(order: StoredOrder, state: OrderState) {
  const content = await buildEmailContent(order, state);
  const config = getSmtpConfig();

  if (!config.host || config.accounts.length === 0) {
    console.info("Email skipped because SMTP is not configured", {
      orderId: order.id,
      state,
      to: order.email_cliente,
    });
    return;
  }

  let lastError: unknown = null;

  for (const account of config.accounts) {
    try {
      const transport = createTransport(config, account);

      await transport.sendMail({
        from: `"${account.fromName}" <${account.from}>`,
        to: order.email_cliente,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });

      return;
    } catch (error) {
      lastError = error;
      console.error("SMTP send attempt failed", {
        orderId: order.id,
        state,
        to: order.email_cliente,
        from: account.from,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("No se pudo enviar el email con ninguna cuenta SMTP.");
}
