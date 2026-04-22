import "server-only";
import { getProductsByIds } from "@/lib/catalog";
import { formatCurrency } from "@/lib/commerce";
import { getOrderStateAutomationConfig, renderOrderTemplate } from "@/lib/order-state-config";
import { getServerSettings } from "@/lib/store-config";
import { getStoredSettingValuesByEnvKey } from "@/lib/store-settings";
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

type EmailVisualConfig = {
  useBranding: boolean;
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  storeAddress: string;
  storeHours: string;
  primaryColor: string;
  accentColor: string;
  highlightColor: string;
  showContactBlock: boolean;
  footerNote: string;
  trackingButtonLabel: string;
  pickupButtonLabel: string;
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

async function getEmailVisualConfig() {
  const [settings, storedValues] = await Promise.all([
    getServerSettings(),
    getStoredSettingValuesByEnvKey().catch(() => new Map<string, string>()),
  ]);

  return {
    useBranding: settings.emailBrandingEnabled,
    storeName:
      storedValues.get("NEXT_PUBLIC_STORE_NAME")?.trim() ||
      process.env.NEXT_PUBLIC_STORE_NAME?.trim() ||
      "Tu tienda",
    supportEmail:
      storedValues.get("NEXT_PUBLIC_SUPPORT_EMAIL")?.trim() ||
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
      "",
    supportPhone:
      storedValues.get("NEXT_PUBLIC_SUPPORT_PHONE")?.trim() ||
      process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() ||
      "",
    storeAddress: storedValues.get("NEXT_PUBLIC_STORE_ADDRESS")?.trim() || "",
    storeHours:
      storedValues.get("NEXT_PUBLIC_STORE_HOURS")?.trim() ||
      settings.pickupAvailabilityText ||
      "",
    primaryColor: settings.emailPrimaryColor,
    accentColor: settings.emailAccentColor,
    highlightColor: settings.emailHighlightColor,
    showContactBlock: settings.emailShowContactBlock,
    footerNote: settings.emailFooterNote,
    trackingButtonLabel: settings.emailTrackingButtonLabel,
    pickupButtonLabel: settings.emailPickupButtonLabel,
  } satisfies EmailVisualConfig;
}

function buildMinimalEmailHtml(title: string, body: string) {
  return `
    <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d8e1ec;border-radius:24px;padding:28px 30px;">
        <h1 style="margin:0 0 18px;font-size:28px;line-height:1.2;color:#0f172a;">${escapeHtml(title)}</h1>
        <div style="padding:18px 20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;font-size:15px;line-height:1.8;color:#334155;">
          ${formatPlainTextAsHtml(body)}
        </div>
      </div>
    </div>
  `;
}

async function buildPlainTemplateHtml(
  title: string,
  body: string,
  options?: { useBranding?: boolean | null; eyebrow?: string | null },
) {
  const branding = await getEmailVisualConfig();
  const useBranding = options?.useBranding ?? branding.useBranding;

  if (!useBranding) {
    return buildMinimalEmailHtml(title, body);
  }

  const contactRows = [
    branding.supportEmail
      ? `Email: <a href="mailto:${escapeHtml(branding.supportEmail)}" style="color:${escapeHtml(branding.primaryColor)};text-decoration:none;">${escapeHtml(branding.supportEmail)}</a>`
      : null,
    branding.supportPhone
      ? `Telefono: <span style="color:${escapeHtml(branding.primaryColor)};">${escapeHtml(branding.supportPhone)}</span>`
      : null,
    branding.storeAddress
      ? `Direccion: <span style="color:${escapeHtml(branding.primaryColor)};">${escapeHtml(branding.storeAddress)}</span>`
      : null,
    branding.storeHours
      ? `Horarios: <span style="color:${escapeHtml(branding.primaryColor)};">${escapeHtml(branding.storeHours)}</span>`
      : null,
  ]
    .filter(Boolean)
    .join("<br />");

  return `
    <div style="margin:0;padding:28px;background:#eef3f8;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d8e1ec;border-radius:28px;overflow:hidden;box-shadow:0 18px 40px rgba(15,23,42,.08);">
        <div style="padding:30px 34px;background:linear-gradient(135deg,${escapeHtml(branding.primaryColor)} 0%,${escapeHtml(branding.accentColor)} 100%);color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.8;">${escapeHtml(options?.eyebrow || branding.storeName)}</div>
          <h1 style="margin:10px 0 0;font-size:30px;line-height:1.15;">${escapeHtml(title)}</h1>
        </div>
        <div style="padding:30px 34px;">
          <div style="padding:20px 22px;border:1px solid #e2e8f0;border-radius:20px;background:#f8fafc;font-size:15px;line-height:1.8;color:#334155;">
            ${formatPlainTextAsHtml(body)}
          </div>
          ${
            branding.showContactBlock && contactRows
              ? `
                <div style="margin-top:24px;padding:18px;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;font-size:13px;line-height:1.8;color:#64748b;">
                  <strong style="display:block;margin-bottom:8px;color:${escapeHtml(branding.primaryColor)};">${escapeHtml(branding.storeName)}</strong>
                  ${contactRows}
                </div>
              `
              : ""
          }
          ${
            branding.footerNote
              ? `
                <div style="margin-top:18px;font-size:13px;line-height:1.7;color:#64748b;">
                  ${formatPlainTextAsHtml(branding.footerNote)}
                </div>
              `
              : ""
          }
        </div>
      </div>
    </div>
  `;
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

  const products = await getProductsByIds(
    productIds,
    undefined,
    { includeWebBlocked: true },
  ).catch(() => []);
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
  const branding = await getEmailVisualConfig();
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
          <div style="padding:28px 32px;background:linear-gradient(135deg,${escapeHtml(branding.primaryColor)} 0%,${escapeHtml(branding.accentColor)} 100%);color:#ffffff;">
            <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.78;">${escapeHtml(branding.storeName)}</div>
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
                      style="display:inline-flex;align-items:center;justify-content:center;padding:14px 20px;border-radius:14px;background:${escapeHtml(branding.primaryColor)};color:#ffffff;text-decoration:none;font-weight:700;"
                    >
                      ${escapeHtml(branding.trackingButtonLabel)}
                    </a>
                  </div>
                  <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#64748b;">
                    Si el boton no abre, copia este enlace en tu navegador:<br />
                    <a href="${publicOrderUrl}" style="color:${escapeHtml(branding.primaryColor)};word-break:break-all;">${publicOrderUrl}</a>
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

async function buildDispatchedEmail(order: StoredOrder) {
  const branding = await getEmailVisualConfig();
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
    `Gracias por comprar en ${branding.storeName}.`,
  ].filter(Boolean);

  return {
    subject: "Tu pedido fue despachado",
    text: textLines.join("\n"),
    html: `
      <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ee;border-radius:24px;overflow:hidden;">
          <div style="padding:28px 32px;background:linear-gradient(135deg,${escapeHtml(branding.primaryColor)} 0%,${escapeHtml(branding.accentColor)} 100%);color:#ffffff;">
            <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.78;">${escapeHtml(branding.storeName)}</div>
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
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:${escapeHtml(branding.accentColor)};font-weight:700;">Seguimiento</div>
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
              Gracias por elegir <strong>${escapeHtml(branding.storeName)}</strong>. Si necesitas ayuda con tu envio, puedes responder este email y te damos una mano.
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
      html: await buildPlainTemplateHtml(
        "Tuvimos un inconveniente al iniciar tu pago",
        defaultBody,
      ),
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

function mergeEmailRecipients(...values: Array<string | null | undefined>) {
  const normalized = values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return normalized.length > 0 ? Array.from(new Set(normalized)).join(", ") : null;
}

async function applyBrandingPreference(
  content: {
    subject: string;
    text: string;
    html: string;
  },
  useBranding: boolean,
) {
  if (useBranding) {
    return content;
  }

  return {
    ...content,
    html: await buildPlainTemplateHtml(content.subject, content.text, {
      useBranding: false,
    }),
  };
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
    ? await renderOrderTemplate(subjectTemplate, order, state, trackingUrl)
    : baseContent.subject;
  const text = bodyTemplate
    ? await renderOrderTemplate(bodyTemplate, order, state, trackingUrl)
    : baseContent.text;

  return {
    subject,
    text,
    html: bodyTemplate ? await buildPlainTemplateHtml(subject, text) : baseContent.html,
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

async function getSmtpConfig() {
  const storedValues = await getStoredSettingValuesByEnvKey().catch(
    () => new Map<string, string>(),
  );
  const host =
    normalizeOptionalString(storedValues.get("SMTP_HOST")) ||
    normalizeOptionalString(process.env.SMTP_HOST);
  const port = Number(
    storedValues.get("SMTP_PORT") || process.env.SMTP_PORT || "587",
  );
  const fromName =
    normalizeOptionalString(storedValues.get("SMTP_FROM_NAME")) ||
    normalizeOptionalString(process.env.SMTP_FROM_NAME) ||
    normalizeOptionalString(process.env.NEXT_PUBLIC_STORE_NAME) ||
    "Diez Deportes";
  const fallbackFromName =
    normalizeOptionalString(storedValues.get("SMTP_FALLBACK_FROM_NAME")) ||
    normalizeOptionalString(process.env.SMTP_FALLBACK_FROM_NAME) ||
    fromName;
  const primaryAccount = buildSmtpAccount({
    from:
      normalizeOptionalString(storedValues.get("SMTP_FROM")) ||
      normalizeOptionalString(process.env.SMTP_FROM),
    fromName,
    user:
      normalizeOptionalString(storedValues.get("SMTP_USER")) ||
      normalizeOptionalString(process.env.SMTP_USER) ||
      normalizeOptionalString(process.env.SMTP_PRIMARY_USER),
    pass:
      normalizeOptionalString(storedValues.get("SMTP_PASS")) ||
      normalizeOptionalString(process.env.SMTP_PASS) ||
      normalizeOptionalString(process.env.SMTP_PRIMARY_PASS),
  });
  const fallbackAccount = buildSmtpAccount({
    from:
      normalizeOptionalString(storedValues.get("SMTP_FALLBACK_FROM")) ||
      normalizeOptionalString(process.env.SMTP_FALLBACK_FROM),
    fromName: fallbackFromName,
    user:
      normalizeOptionalString(storedValues.get("SMTP_FALLBACK_USER")) ||
      normalizeOptionalString(process.env.SMTP_FALLBACK_USER),
    pass:
      normalizeOptionalString(storedValues.get("SMTP_FALLBACK_PASS")) ||
      normalizeOptionalString(process.env.SMTP_FALLBACK_PASS),
  });
  const accounts = [primaryAccount, fallbackAccount].filter(
    (account): account is SmtpAccount => Boolean(account),
  );

  return {
    host,
    port,
    secure:
      String(storedValues.get("SMTP_SECURE") || process.env.SMTP_SECURE || "false")
        .trim()
        .toLowerCase() === "true",
    timeoutMs: Math.max(
      1000,
      Number(storedValues.get("SMTP_TIMEOUT_MS") || process.env.SMTP_TIMEOUT_MS || "8000") ||
        8000,
    ),
    ignoreTlsErrors:
      String(
        storedValues.get("SMTP_IGNORE_TLS_ERRORS") ||
          process.env.SMTP_IGNORE_TLS_ERRORS ||
          "true",
      )
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
  const branding = await getEmailVisualConfig();

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
            <div style="padding:28px 32px;background:linear-gradient(135deg,${escapeHtml(branding.primaryColor)} 0%,${escapeHtml(branding.accentColor)} 100%);color:#ffffff;">
              <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.78;">${escapeHtml(branding.storeName)}</div>
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
                        style="display:inline-flex;align-items:center;justify-content:center;padding:14px 20px;border-radius:14px;background:${escapeHtml(branding.primaryColor)};color:#ffffff;text-decoration:none;font-weight:700;"
                      >
                        ${escapeHtml(branding.trackingButtonLabel)}
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
            style="display:inline-flex;align-items:center;justify-content:center;padding:14px 20px;border-radius:14px;background:${escapeHtml(branding.primaryColor)};color:#ffffff;text-decoration:none;font-weight:700;"
          >
            ${escapeHtml(branding.pickupButtonLabel)}
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
            <div style="padding:28px 32px;background:linear-gradient(135deg,${escapeHtml(branding.highlightColor)} 0%,${escapeHtml(branding.accentColor)} 100%);color:#ffffff;">
              <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.8;">${escapeHtml(branding.storeName)}</div>
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
                      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:${escapeHtml(branding.accentColor)};font-weight:700;">Dias y horarios para retirar</div>
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
                      <a href="${publicOrderUrl}" style="color:${escapeHtml(branding.primaryColor)};word-break:break-all;">${publicOrderUrl}</a>
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
            <div style="padding:28px 32px;background:linear-gradient(135deg,${escapeHtml(branding.primaryColor)} 0%,${escapeHtml(branding.accentColor)} 100%);color:#ffffff;">
              <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.8;">${escapeHtml(branding.storeName)}</div>
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
    html: await buildPlainTemplateHtml(`Actualizacion de tu pedido: ${state}`, genericText),
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
  const branding = await getEmailVisualConfig();
  const order = await hydrateOrderItemsForEmail(input.order);
  const publicOrderUrl = await buildPublicOrderUrl(order);
  const fallbackSubject =
    normalizeOptionalString(settings.invoiceEmailSubject) ||
    `Factura de tu pedido NP ${order.numero_pedido}`;
  const fallbackBody =
    normalizeOptionalString(settings.invoiceEmailBody) ||
    `Hola ${order.nombre_cliente},\n\nTe enviamos la factura correspondiente a tu pedido NP ${order.numero_pedido}.\nAdjuntamos el comprobante en este email.\n\nGracias por comprar en ${branding.storeName}.`;
  const subject = await renderOrderTemplate(
    normalizeOptionalString(input.subject) || fallbackSubject,
    order,
    order.estado,
    publicOrderUrl,
  );
  const text = await renderOrderTemplate(
    normalizeOptionalString(input.message) || fallbackBody,
    order,
    order.estado,
    publicOrderUrl,
  );

  const useBranding = settings.invoiceEmailUseBranding;
  const html = await buildPlainTemplateHtml(subject, text, { useBranding });

  return sendEmail(
    order,
    {
      to: normalizeOptionalString(input.to) || order.email_cliente,
      cc: mergeEmailRecipients(input.cc, settings.invoiceEmailCc),
      subject,
      text,
      html,
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
  const config = await getSmtpConfig();

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
      ? await renderOrderTemplate(bodyTemplate, hydratedOrder, state, trackingUrl)
      : null;
    const baseContent = await buildEmailContent(hydratedOrder, state, {
      customMessage: pickupMessage,
    });

    const content = await applyBrandingPreference(
      {
        ...baseContent,
        subject: subjectTemplate
          ? await renderOrderTemplate(subjectTemplate, hydratedOrder, state, trackingUrl)
          : baseContent.subject,
      },
      stateConfig.useBranding,
    );

    return sendEmail(hydratedOrder, {
      ...content,
      cc: mergeEmailRecipients(stateConfig.emailCc),
    });
  }

  const baseContent = await buildEmailContent(hydratedOrder, state, options);
  const content = await applyBrandingPreference(
    await applyOrderTemplateOverrides(hydratedOrder, state, baseContent, {
      subject: stateConfig.emailSubject,
      body: stateConfig.emailBody,
    }),
    stateConfig.useBranding,
  );
  return sendEmail(hydratedOrder, {
    ...content,
    cc: mergeEmailRecipients(stateConfig.emailCc),
  });
}

export async function sendOrderReceivedEmail(order: StoredOrder) {
  const settings = await getServerSettings();
  const hydratedOrder = await hydrateOrderItemsForEmail(order);
  const content = await applyBrandingPreference(
    await buildOrderReceivedEmail(hydratedOrder),
    settings.orderReceivedEmailUseBranding,
  );
  return sendEmail(hydratedOrder, {
    ...content,
    cc: mergeEmailRecipients(settings.orderReceivedEmailCc),
  });
}

export async function sendPaymentInitFailureEmail(order: StoredOrder) {
  const settings = await getServerSettings();
  const hydratedOrder = await hydrateOrderItemsForEmail(order);
  const content = await applyBrandingPreference(
    await buildPaymentInitFailureEmail(hydratedOrder),
    settings.paymentInitFailureEmailUseBranding,
  );
  return sendEmail(hydratedOrder, {
    ...content,
    cc: mergeEmailRecipients(settings.paymentInitFailureEmailCc),
  });
}
