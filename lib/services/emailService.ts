import "server-only";
import { getProductsByIds } from "@/lib/catalog";
import { getOrderStateAutomationConfig, renderOrderTemplate } from "@/lib/order-state-config";
import { getServerSettings } from "@/lib/store-config";
import { formatSqlServerLocalDateTime } from "@/lib/store-datetime";
import type { OrderState, StoredOrder } from "@/lib/types/order";

type MailTransport = {
  sendMail: (message: {
    from?: string;
    to: string;
    cc?: string | null;
    subject: string;
    text: string;
    html: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType?: string | null;
    }>;
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

type EmailContentOptions = {
  customMessage?: string | null;
};

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPlainTextAsHtml(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function getEmailBranding() {
  return {
    storeName: process.env.NEXT_PUBLIC_STORE_NAME?.trim() || "Tu tienda",
    supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "",
    supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || "",
  };
}

function buildPlainTemplateHtml(title: string, body: string) {
  const branding = getEmailBranding();

  return `
    <div style="margin:0;padding:28px;background:#eef3f8;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d8e1ec;border-radius:28px;overflow:hidden;box-shadow:0 18px 40px rgba(15,23,42,.08);">
        <div style="padding:30px 34px;background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.8;">${escapeHtml(branding.storeName)}</div>
          <h1 style="margin:10px 0 0;font-size:30px;line-height:1.15;">${escapeHtml(title)}</h1>
        </div>
        <div style="padding:30px 34px;">
          <div style="padding:20px 22px;border:1px solid #e2e8f0;border-radius:20px;background:#f8fafc;font-size:15px;line-height:1.8;color:#334155;">
            ${formatPlainTextAsHtml(body)}
          </div>
          <div style="margin-top:24px;padding-top:18px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.7;color:#64748b;">
            <strong style="color:#0f172a;">${escapeHtml(branding.storeName)}</strong><br />
            ${
              branding.supportEmail
                ? `Email: <a href="mailto:${escapeHtml(branding.supportEmail)}" style="color:#0f172a;text-decoration:none;">${escapeHtml(branding.supportEmail)}</a><br />`
                : ""
            }
            ${
              branding.supportPhone
                ? `Telefono: <span style="color:#0f172a;">${escapeHtml(branding.supportPhone)}</span>`
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;
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

function getOrderItems(order: StoredOrder) {
  return order.metadata.items || [];
}

function buildFallbackSizeLabel(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value);

  if (normalized) {
    return normalized;
  }

  return null;
}

function buildSizeLabelFromProductId(productId: string) {
  const variantSegments = String(productId || "")
    .split("|")
    .slice(1)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "-");

  return variantSegments.length > 0 ? variantSegments.join(" / ") : null;
}

function buildEmailItemLabel(item: NonNullable<StoredOrder["metadata"]["items"]>[number]) {
  const baseName = normalizeOptionalString(item.productName) || item.productId;
  const selectedSize =
    buildFallbackSizeLabel(item.selectedSize) || buildSizeLabelFromProductId(item.productId);

  return selectedSize ? `${baseName} - Talle ${selectedSize}` : baseName;
}

async function hydrateOrderItemsForEmail(order: StoredOrder) {
  const items = getOrderItems(order);

  if (items.length === 0) {
    return order;
  }

  const productIds = Array.from(new Set(items.map((item) => item.productId.trim()).filter(Boolean)));

  if (productIds.length === 0) {
    return order;
  }

  const products = await getProductsByIds(productIds).catch(() => []);
  const productMap = new Map(products.map((product) => [product.id.trim(), product]));
  let didChange = false;

  const nextItems = items.map((item) => {
    const product = productMap.get(item.productId.trim());
    const currentName = normalizeOptionalString(item.productName);
    const currentSize = buildFallbackSizeLabel(item.selectedSize);
    const resolvedName =
      currentName && currentName !== item.productId
        ? currentName
        : product?.description?.trim() || currentName || item.productId;
    const resolvedSize =
      currentSize ||
      buildFallbackSizeLabel(product?.defaultSize) ||
      buildSizeLabelFromProductId(item.productId);

    if (resolvedName !== (item.productName || item.productId) || resolvedSize !== (item.selectedSize || null)) {
      didChange = true;
    }

    return {
      ...item,
      productName: resolvedName,
      selectedSize: resolvedSize,
    };
  });

  if (!didChange) {
    return order;
  }

  return {
    ...order,
    metadata: {
      ...order.metadata,
      items: nextItems,
    },
  } satisfies StoredOrder;
}

function buildOrderDeliveryLabel(order: StoredOrder) {
  return (
    order.metadata.deliveryMethod ||
    (order.tipo_pedido === "envio" ? "Envio a domicilio" : "Retiro en local")
  );
}

function isLocalPickupPayment(order: StoredOrder) {
  return (order.metadata.paymentMethod || "").trim().toLowerCase() === "pago en local";
}

function buildOrderNextStep(order: StoredOrder) {
  const isMercadoPago = (order.metadata.paymentMethod || "")
    .toLowerCase()
    .includes("mercado pago");
  const isLocalPayment = isLocalPickupPayment(order);

  if (order.estado_pago === "aprobado" && order.estado === "APROBADO") {
    return "Tu pago fue aprobado. Ahora el pedido queda en control administrativo antes de facturarse.";
  }

  if (order.estado_pago === "pendiente") {
    if (isLocalPayment) {
      return "Elegiste pagar en el local al retirar. Te vamos a avisar cuando tu pedido este listo.";
    }

    return isMercadoPago
      ? "Tu pedido ya fue recibido. Mercado Pago todavia esta procesando o esperando la confirmacion del pago."
      : "Tu pedido ya fue recibido y quedo pendiente de gestion comercial.";
  }

  if (order.estado === "FACTURADO") {
    return "El pedido ya fue facturado y pasa a preparacion.";
  }

  if (order.estado === "LISTO_PARA_RETIRO") {
    return "Ya puedes pasar por el local con tu QR o tu codigo de retiro.";
  }

  if (order.estado === "ENVIADO") {
    return "Tu pedido ya salio del local y se encuentra en camino.";
  }

  return "Puedes seguir el estado actualizado desde el enlace de tu pedido.";
}

function buildItemsText(order: StoredOrder) {
  const items = getOrderItems(order);

  if (items.length === 0) {
    return ["- Sin detalle de articulos disponible."];
  }

  return items.map((item) => {
    const itemName = buildEmailItemLabel(item);
    const subtotal =
      Number(item.subtotal || 0) > 0
        ? ` - ${formatCurrency(Number(item.subtotal || 0))}`
        : "";

    return `- ${itemName} x ${item.quantity}${subtotal}`;
  });
}

function buildItemsHtml(order: StoredOrder) {
  const items = getOrderItems(order);

  if (items.length === 0) {
    return `
      <div style="padding:14px 16px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc;color:#475569;font-size:14px;">
        No pudimos adjuntar el detalle de articulos en este email, pero tu pedido ya quedo registrado.
      </div>
    `;
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <thead>
        <tr>
          <th align="left" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Articulo</th>
          <th align="right" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Cantidad</th>
          <th align="right" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
              <tr>
                <td style="padding:12px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;">
                  ${escapeHtml(buildEmailItemLabel(item))}
                </td>
                <td align="right" style="padding:12px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;font-weight:600;">
                  ${escapeHtml(String(item.quantity || 0))}
                </td>
                <td align="right" style="padding:12px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;font-weight:600;">
                  ${escapeHtml(
                    Number(item.subtotal || 0) > 0
                      ? formatCurrency(Number(item.subtotal || 0))
                      : "-",
                  )}
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

async function buildOrderReceivedEmail(order: StoredOrder) {
  const publicOrderUrl = await buildPublicOrderUrl(order);
  const settings = await getServerSettings();
  const deliveryLabel = buildOrderDeliveryLabel(order);
  const isMercadoPago = (order.metadata.paymentMethod || "")
    .toLowerCase()
    .includes("mercado pago");
  const isLocalPayment = isLocalPickupPayment(order);
  const textLines = [
    `Hola ${order.nombre_cliente},`,
    "",
    isMercadoPago
      ? `Recibimos tu pedido / NP ${order.numero_pedido} y ya iniciamos el proceso de pago.`
      : isLocalPayment
        ? `Recibimos tu pedido / NP ${order.numero_pedido} y quedo registrado para pagar en el local.`
      : `Recibimos tu pedido / NP ${order.numero_pedido}.`,
    buildOrderNextStep(order),
    "",
    "Resumen:",
    `- Cliente: ${order.nombre_cliente}`,
    `- Entrega: ${deliveryLabel}`,
    `- Total: ${formatCurrency(order.monto_total)}`,
    ...buildItemsText(order),
    publicOrderUrl ? "" : null,
    publicOrderUrl ? `Sigue tu pedido aqui: ${publicOrderUrl}` : null,
  ].filter(Boolean);

  return applyOrderTemplateOverrides(
    order,
    order.estado,
    {
      subject: isMercadoPago
        ? "Recibimos tu pedido / estamos procesando tu pago"
        : isLocalPayment
          ? "Recibimos tu pedido / pagas al retirar"
        : "Recibimos tu pedido",
      text: textLines.join("\n"),
      html: `
      <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ee;border-radius:24px;overflow:hidden;">
          <div style="padding:28px 32px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);color:#ffffff;">
            <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.78;">Diez Deportes</div>
            <h1 style="margin:10px 0 8px;font-size:28px;line-height:1.2;">Recibimos tu pedido</h1>
            <p style="margin:0;font-size:15px;line-height:1.7;opacity:.92;">
              Tu NP / pedido web <strong>#${escapeHtml(order.numero_pedido)}</strong> ya quedo registrada para ${escapeHtml(order.nombre_cliente)}.
            </p>
          </div>

          <div style="padding:28px 32px;">
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
              ${escapeHtml(buildOrderNextStep(order))}
            </p>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 14px;">
              <tr>
                <td width="50%" valign="top" style="padding:18px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
                  <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:700;">Pedido</div>
                  <div style="margin-top:10px;font-size:15px;line-height:1.8;color:#0f172a;">
                    <div><strong>NP:</strong> ${escapeHtml(order.numero_pedido)}</div>
                    <div><strong>Entrega:</strong> ${escapeHtml(deliveryLabel)}</div>
                    <div><strong>Total:</strong> ${escapeHtml(formatCurrency(order.monto_total))}</div>
                  </div>
                </td>
                <td width="50%" valign="top" style="padding:18px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
                  <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:700;">Siguiente paso</div>
                  <div style="margin-top:10px;font-size:15px;line-height:1.7;color:#0f172a;">
                    ${escapeHtml(buildOrderNextStep(order))}
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

            ${
              publicOrderUrl
                ? `
                  <div style="margin-top:22px;">
                    <a
                      href="${publicOrderUrl}"
                      style="display:inline-flex;align-items:center;justify-content:center;padding:14px 20px;border-radius:14px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;"
                    >
                      Seguir estado del pedido
                    </a>
                  </div>
                  <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#64748b;">
                    Si el boton no abre, copia este enlace en tu navegador:<br />
                    <a href="${publicOrderUrl}" style="color:#0f172a;word-break:break-all;">${publicOrderUrl}</a>
                  </p>
                `
                : ""
            }
          </div>
        </div>
      </div>
    `,
    },
    {
      subject: settings.orderReceivedEmailSubject,
      body: settings.orderReceivedEmailBody,
    },
  );
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
    `Entrega: ${buildOrderDeliveryLabel(order)}.`,
    deliveryAddress ? `Direccion de entrega: ${deliveryAddress}.` : null,
    "",
    "Detalle del pedido:",
    ...buildItemsText(order),
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

async function buildPaymentInitFailureEmail(order: StoredOrder) {
  const settings = await getServerSettings();
  const publicOrderUrl = await buildPublicOrderUrl(order);
  const fallbackAvailable = settings.permitirRetiroYPagoLocalSiFallaMP;
  const reserveHours = Math.max(1, settings.horasReservaStockPagoPendiente);
  const defaultBody = [
    `Hola ${order.nombre_cliente},`,
    "",
    "Tuvimos un inconveniente tecnico al iniciar tu pago online.",
    "Tu pedido ya fue recibido y sigue registrado en nuestro sistema.",
    publicOrderUrl ? `Puedes seguirlo desde aqui: ${publicOrderUrl}` : null,
    "Si quieres, puedes reintentar el pago en unos minutos.",
    fallbackAvailable
      ? `Tambien podemos pasarlo a retiro y pago en local, reservando el stock por ${reserveHours} horas.`
      : null,
    "",
    "Si necesitas ayuda, responde este email y lo resolvemos.",
  ]
    .filter(Boolean)
    .join("\n");

  return applyOrderTemplateOverrides(
    order,
    order.estado,
    {
      subject: "Tuvimos un inconveniente al iniciar tu pago",
      text: defaultBody,
      html: buildPlainTemplateHtml("Tuvimos un inconveniente al iniciar tu pago", defaultBody),
    },
    {
      subject: settings.paymentInitFailureEmailSubject,
      body: settings.paymentInitFailureEmailBody,
    },
  );
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

async function applyOrderTemplateOverrides(
  order: StoredOrder,
  state: OrderState,
  baseContent: {
    subject: string;
    text: string;
    html: string;
  },
  override?: {
    subject?: string | null;
    body?: string | null;
  },
) {
  const trackingUrl = await buildPublicOrderUrl(order);
  const subjectTemplate = normalizeOptionalString(override?.subject);
  const bodyTemplate = normalizeOptionalString(override?.body);

  if (!subjectTemplate && !bodyTemplate) {
    return baseContent;
  }

  const subject = subjectTemplate
    ? renderOrderTemplate(subjectTemplate, order, state, trackingUrl)
    : baseContent.subject;
  const text = bodyTemplate
    ? renderOrderTemplate(bodyTemplate, order, state, trackingUrl)
    : baseContent.text;

  return {
    subject,
    text,
    html: bodyTemplate ? buildPlainTemplateHtml(subject, text) : baseContent.html,
  };
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
  const fromName =
    normalizeOptionalString(input.fromName) ||
    normalizeOptionalString(process.env.NEXT_PUBLIC_STORE_NAME) ||
    "Diez Deportes";

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
    normalizeOptionalString(process.env.SMTP_FROM_NAME) ||
    normalizeOptionalString(process.env.NEXT_PUBLIC_STORE_NAME) ||
    "Diez Deportes";
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

async function buildEmailContent(
  order: StoredOrder,
  state: OrderState,
  options?: EmailContentOptions,
) {
  if (state === "FACTURADO") {
    const publicOrderUrl = await buildPublicOrderUrl(order);

    return {
      subject: "Tu pedido fue confirmado",
      text: [
        `Hola ${order.nombre_cliente},`,
        "",
        `Tu pedido / NP ${order.numero_pedido} fue confirmado.`,
        buildOrderNextStep(order),
        "",
        `Entrega: ${buildOrderDeliveryLabel(order)}.`,
        `Total: ${formatCurrency(order.monto_total)}.`,
        ...buildItemsText(order),
        publicOrderUrl ? "" : null,
        publicOrderUrl ? `Sigue tu pedido aqui: ${publicOrderUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      html: `
        <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
          <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ee;border-radius:24px;overflow:hidden;">
            <div style="padding:28px 32px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);color:#ffffff;">
              <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.78;">Diez Deportes</div>
              <h1 style="margin:10px 0 8px;font-size:28px;line-height:1.2;">Tu pedido fue confirmado</h1>
              <p style="margin:0;font-size:15px;line-height:1.7;opacity:.92;">
                La NP <strong>#${escapeHtml(order.numero_pedido)}</strong> ya quedo confirmada para ${escapeHtml(order.nombre_cliente)}.
              </p>
            </div>

            <div style="padding:28px 32px;">
              <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
                ${escapeHtml(buildOrderNextStep(order))}
              </p>

              <div style="margin-top:8px;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;background:#ffffff;">
                <div style="padding:16px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                  <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:700;">Detalle del pedido</div>
                </div>
                <div style="padding:0 18px 6px;">
                  ${buildItemsHtml(order)}
                </div>
              </div>

              ${
                publicOrderUrl
                  ? `
                    <div style="margin-top:22px;">
                      <a
                        href="${publicOrderUrl}"
                        style="display:inline-flex;align-items:center;justify-content:center;padding:14px 20px;border-radius:14px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;"
                      >
                        Seguir estado del pedido
                      </a>
                    </div>
                  `
                  : ""
              }
            </div>
          </div>
        </div>
      `,
    };
  }

  if (state === "LISTO_PARA_RETIRO") {
    const settings = await getServerSettings();
    const pickupCode = order.metadata.pickupCode || "Sin codigo";
    const publicOrderUrl = await buildPublicOrderUrl(order);
    const pickupSchedule = normalizeOptionalString(settings.pickupAvailabilityText);
    const pickupMessage =
      normalizeOptionalString(options?.customMessage) ||
      "Ya puedes pasar por el local. Para retirar, abre tu pedido desde el boton de abajo y muestra el QR junto con tu codigo.";
    const pickupMessageHtml = escapeHtml(pickupMessage).replace(/\r?\n/g, "<br />");
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
        pickupMessage,
        "",
        `Pedido ${order.numero_pedido}.`,
        `Codigo de retiro: ${pickupCode}.`,
        pickupSchedule ? `Dias y horarios para retirar: ${pickupSchedule}.` : null,
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
                ${pickupMessageHtml}
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

              ${
                pickupSchedule
                  ? `
                    <div style="margin-top:18px;padding:18px;border:1px solid #dbeafe;border-radius:18px;background:#f8fbff;">
                      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#1d4ed8;font-weight:700;">Dias y horarios para retirar</div>
                      <div style="margin-top:8px;font-size:15px;line-height:1.7;color:#334155;">
                        ${escapeHtml(pickupSchedule).replace(/\r?\n/g, "<br />")}
                      </div>
                    </div>
                  `
                  : ""
              }

              <div style="margin-top:18px;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;background:#ffffff;">
                <div style="padding:16px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                  <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:700;">Resumen del pedido</div>
                </div>
                <div style="padding:0 18px 6px;">
                  ${buildItemsHtml(order)}
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
      ? formatSqlServerLocalDateTime(order.fecha_hora_retiro)
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

  if (state === "ENVIADO") {
    return buildDispatchedEmail(order);
  }

  const genericText = [
    `Hola ${order.nombre_cliente},`,
    "",
    `Tu pedido ${order.numero_pedido} paso al estado ${state}.`,
    buildOrderNextStep(order),
  ].join("\n");

  return {
    subject: `Actualizacion de tu pedido: ${state}`,
    text: genericText,
    html: buildPlainTemplateHtml(`Actualizacion de tu pedido: ${state}`, genericText),
  };
}

export async function sendManualInvoiceEmail(input: {
  order: StoredOrder;
  to?: string | null;
  cc?: string | null;
  subject?: string | null;
  message?: string | null;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string | null;
  }>;
}) {
  const settings = await getServerSettings();
  const order = await hydrateOrderItemsForEmail(input.order);
  const publicOrderUrl = await buildPublicOrderUrl(order);
  const fallbackSubject =
    normalizeOptionalString(settings.invoiceEmailSubject) ||
    `Factura de tu pedido NP ${order.numero_pedido}`;
  const fallbackBody =
    normalizeOptionalString(settings.invoiceEmailBody) ||
    `Hola ${order.nombre_cliente},\n\nTe enviamos la factura correspondiente a tu pedido NP ${order.numero_pedido}.\nAdjuntamos el comprobante en este email.\n\nGracias por comprar en Diez Deportes.`;
  const subject = renderOrderTemplate(
    normalizeOptionalString(input.subject) || fallbackSubject,
    order,
    order.estado,
    publicOrderUrl,
  );
  const text = renderOrderTemplate(
    normalizeOptionalString(input.message) || fallbackBody,
    order,
    order.estado,
    publicOrderUrl,
  );

  return sendEmail(
    order,
    {
      to: normalizeOptionalString(input.to) || order.email_cliente,
      cc: normalizeOptionalString(input.cc),
      subject,
      text,
      html: buildPlainTemplateHtml(subject, text),
      attachments: input.attachments || [],
    },
  );
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

async function sendEmail(
  order: StoredOrder,
  content: {
    to?: string | null;
    cc?: string | null;
    subject: string;
    text: string;
    html: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType?: string | null;
    }>;
  },
) {
  const config = getSmtpConfig();

  if (!config.host || config.accounts.length === 0) {
    console.info("Email skipped because SMTP is not configured", {
      orderId: order.id,
      to: content.to || order.email_cliente,
      subject: content.subject,
    });
    return;
  }

  let lastError: unknown = null;

  for (const account of config.accounts) {
    try {
      const transport = createTransport(config, account);

      await transport.sendMail({
        from: `"${account.fromName}" <${account.from}>`,
        to: content.to || order.email_cliente,
        cc: content.cc || undefined,
        subject: content.subject,
        text: content.text,
        html: content.html,
        attachments: content.attachments,
      });

      return;
    } catch (error) {
      lastError = error;
      console.error("SMTP send attempt failed", {
        orderId: order.id,
        to: content.to || order.email_cliente,
        from: account.from,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("No se pudo enviar el email con ninguna cuenta SMTP.");
}

export async function sendOrderStatusEmail(
  order: StoredOrder,
  state: OrderState,
  options?: EmailContentOptions,
) {
  const hydratedOrder = await hydrateOrderItemsForEmail(order);
  const stateConfig = await getOrderStateAutomationConfig(state);

  if (state === "LISTO_PARA_RETIRO") {
    const trackingUrl = await buildPublicOrderUrl(hydratedOrder);
    const subjectTemplate = normalizeOptionalString(stateConfig.emailSubject);
    const bodyTemplate =
      normalizeOptionalString(options?.customMessage) ||
      normalizeOptionalString(stateConfig.emailBody);
    const pickupMessage = bodyTemplate
      ? renderOrderTemplate(bodyTemplate, hydratedOrder, state, trackingUrl)
      : null;
    const baseContent = await buildEmailContent(hydratedOrder, state, {
      customMessage: pickupMessage,
    });

    return sendEmail(hydratedOrder, {
      ...baseContent,
      subject: subjectTemplate
        ? renderOrderTemplate(subjectTemplate, hydratedOrder, state, trackingUrl)
        : baseContent.subject,
    });
  }

  const baseContent = await buildEmailContent(hydratedOrder, state, options);
  const content = await applyOrderTemplateOverrides(hydratedOrder, state, baseContent, {
    subject: stateConfig.emailSubject,
    body: stateConfig.emailBody,
  });
  return sendEmail(hydratedOrder, content);
}

export async function sendOrderReceivedEmail(order: StoredOrder) {
  const hydratedOrder = await hydrateOrderItemsForEmail(order);
  const content = await buildOrderReceivedEmail(hydratedOrder);
  return sendEmail(hydratedOrder, content);
}

export async function sendPaymentInitFailureEmail(order: StoredOrder) {
  const hydratedOrder = await hydrateOrderItemsForEmail(order);
  const content = await buildPaymentInitFailureEmail(hydratedOrder);
  return sendEmail(hydratedOrder, content);
}
