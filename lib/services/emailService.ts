import "server-only";
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

function buildEmailContent(order: StoredOrder, state: OrderState) {
  if (state === "FACTURADO") {
    return {
      subject: "Tu pedido fue confirmado",
      text: `Hola ${order.nombre_cliente}, tu pedido ${order.numero_pedido} fue confirmado y ya esta en preparacion.`,
      html: `<p>Hola ${order.nombre_cliente},</p><p>Tu pedido <strong>${order.numero_pedido}</strong> fue confirmado y ya esta en preparacion.</p>`,
    };
  }

  if (state === "LISTO_PARA_RETIRO") {
    const pickupCode = order.metadata.pickupCode || "Sin codigo";
    const qrBlock = order.codigo_qr
      ? `<p>Presenta este QR al retirar:</p><p><img src="${order.codigo_qr}" alt="QR del pedido ${order.numero_pedido}" /></p>`
      : "";

    return {
      subject: "Tu pedido esta listo para retirar",
      text: `Hola ${order.nombre_cliente}, tu pedido ${order.numero_pedido} ya esta listo para retirar. Codigo de retiro: ${pickupCode}.`,
      html: `<p>Hola ${order.nombre_cliente},</p><p>Tu pedido <strong>${order.numero_pedido}</strong> ya esta listo para retirar.</p><p>Codigo de retiro: <strong>${pickupCode}</strong></p>${qrBlock}`,
    };
  }

  return {
    subject: "Tu pedido fue despachado",
    text: `Hola ${order.nombre_cliente}, tu pedido ${order.numero_pedido} fue despachado.${order.numero_seguimiento ? ` Seguimiento: ${order.numero_seguimiento}.` : ""}`,
    html: `<p>Hola ${order.nombre_cliente},</p><p>Tu pedido <strong>${order.numero_pedido}</strong> fue despachado.</p>${order.numero_seguimiento ? `<p>Numero de seguimiento: <strong>${order.numero_seguimiento}</strong></p>` : ""}`,
  };
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
  const content = buildEmailContent(order, state);
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
