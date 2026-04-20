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

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim() || user || "";

  return {
    host,
    port,
    user,
    pass,
    from,
    secure: String(process.env.SMTP_SECURE || "false").trim().toLowerCase() === "true",
  };
}

function buildEmailContent(order: StoredOrder, state: OrderState) {
  if (state === "FACTURADO") {
    return {
      subject: `Pedido ${order.numero_pedido} facturado`,
      text: `Hola ${order.nombre_cliente}, tu pedido ${order.numero_pedido} fue facturado y ya puede avanzar a preparación.`,
      html: `<p>Hola ${order.nombre_cliente},</p><p>Tu pedido <strong>${order.numero_pedido}</strong> fue facturado y ya puede avanzar a preparación.</p>`,
    };
  }

  if (state === "LISTO_PARA_RETIRO") {
    const qrBlock = order.codigo_qr
      ? `<p>Mostrá este QR al retirar:</p><p><img src="${order.codigo_qr}" alt="QR del pedido ${order.numero_pedido}" /></p>`
      : "";

    return {
      subject: `Pedido ${order.numero_pedido} listo para retirar`,
      text: `Hola ${order.nombre_cliente}, tu pedido ${order.numero_pedido} está listo para retirar.`,
      html: `<p>Hola ${order.nombre_cliente},</p><p>Tu pedido <strong>${order.numero_pedido}</strong> está listo para retirar.</p>${qrBlock}`,
    };
  }

  return {
    subject: `Pedido ${order.numero_pedido} enviado`,
    text: `Hola ${order.nombre_cliente}, tu pedido ${order.numero_pedido} fue enviado.${order.numero_seguimiento ? ` Seguimiento: ${order.numero_seguimiento}.` : ""}`,
    html: `<p>Hola ${order.nombre_cliente},</p><p>Tu pedido <strong>${order.numero_pedido}</strong> fue enviado.</p>${order.numero_seguimiento ? `<p>Número de seguimiento: <strong>${order.numero_seguimiento}</strong></p>` : ""}`,
  };
}

async function getTransport(): Promise<{ transport: MailTransport | null; from: string }> {
  const config = getSmtpConfig();

  if (!config.host || !config.from) {
    return { transport: null, from: config.from };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require("nodemailer") as {
      createTransport: (config: Record<string, unknown>) => MailTransport;
    };

    return {
      transport: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      }),
      from: config.from,
    };
  } catch (error) {
    console.warn("Email transport unavailable", error);
    return { transport: null, from: config.from };
  }
}

export async function sendOrderStatusEmail(order: StoredOrder, state: OrderState) {
  const content = buildEmailContent(order, state);
  const { transport, from } = await getTransport();

  if (!transport) {
    console.info("Email skipped because SMTP is not configured", {
      orderId: order.id,
      state,
      to: order.email_cliente,
    });
    return;
  }

  await transport.sendMail({
    from,
    to: order.email_cliente,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}

