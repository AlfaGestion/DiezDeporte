"use client";

import Link from "next/link";
import { useDeferredValue, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { AdminConfigField } from "@/lib/types";
import { ORDER_STATES, type OrderState } from "@/lib/types/order";

type AdminConfigWorkspaceProps = {
  fields: AdminConfigField[];
  activeSection: string;
  saveAction: (formData: FormData) => void | Promise<void>;
};

type ConfigSection = {
  id: string;
  title: string;
  description: string;
  eyebrow: string;
};

const SECTIONS: ConfigSection[] = [
  {
    id: "negocio",
    title: "Informacion del negocio",
    description: "Edita lo que ve el cliente en la tienda, sin tecnicismos.",
    eyebrow: "Web",
  },
  {
    id: "checkout",
    title: "Checkout",
    description: "Configura como funciona la compra y que se valida antes de confirmar.",
    eyebrow: "Compra",
  },
  {
    id: "pagos",
    title: "Pagos",
    description: "Define como se comporta Mercado Pago y que pasa cuando algo falla.",
    eyebrow: "Cobros",
  },
  {
    id: "pedidos",
    title: "Pedidos",
    description: "Organiza el flujo interno para revisar, aprobar, facturar y preparar.",
    eyebrow: "Operacion",
  },
  {
    id: "retiro-local",
    title: "Retiro en local",
    description: "Controla como se entregan los pedidos y que datos pedir al retirar.",
    eyebrow: "Mostrador",
  },
  {
    id: "emails",
    title: "Emails",
    description: "Activa, edita y previsualiza los mensajes automaticos para cada momento.",
    eyebrow: "Comunicacion",
  },
  {
    id: "estados",
    title: "Estados del pedido",
    description: "Personaliza colores, nombres y automatizaciones de cada estado.",
    eyebrow: "Flujo",
  },
  {
    id: "facturacion",
    title: "Facturacion",
    description: "Ajusta el mail de factura y el comportamiento comercial al facturar.",
    eyebrow: "Documentos",
  },
];

const TEMPLATE_VARIABLES: Record<string, string> = {
  nombre_cliente: "Juan Perez",
  numero_pedido: "NP-10248",
  estado: "LISTO_PARA_RETIRO",
  monto_total: "$ 124.500",
  tipo_entrega: "Retiro en local",
  link_seguimiento: "https://mitienda.com/pedido/NP-10248",
  codigo_retiro: "WEB-2480-A91K",
  link_reintento: "https://mitienda.com/pago/reintentar/NP-10248",
};

const STATE_LABELS: Record<OrderState, string> = {
  PENDIENTE: "Pendiente",
  APROBADO: "Aprobado",
  FACTURADO: "Facturado",
  PREPARANDO: "Preparando",
  LISTO_PARA_RETIRO: "Listo para retirar",
  ENVIADO: "Enviado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
  ERROR: "Error",
};

function renderTemplate(template: string) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => {
    return TEMPLATE_VARIABLES[key] ?? "";
  });
}

function buildFieldMap(fields: AdminConfigField[]) {
  return Object.fromEntries(fields.map((field) => [field.key, field])) as Record<
    string,
    AdminConfigField | undefined
  >;
}

function normalizeSectionId(section: string) {
  return SECTIONS.some((item) => item.id === section) ? section : SECTIONS[0].id;
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[color:var(--admin-accent)] px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-wait disabled:opacity-70"
      disabled={pending}
    >
      {pending ? "Guardando cambios..." : "Guardar configuracion"}
    </button>
  );
}

export function AdminConfigWorkspace(props: AdminConfigWorkspaceProps) {
  const { fields, activeSection, saveAction } = props;
  const fieldMap = buildFieldMap(fields);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const deferredPreviewValues = useDeferredValue(previewValues);
  const currentSection = normalizeSectionId(activeSection);

  function getField(key: string) {
    return fieldMap[key] || null;
  }

  function getStringValue(key: string) {
    const draftValue = deferredPreviewValues[key];
    if (typeof draftValue === "string") {
      return draftValue;
    }

    const field = getField(key);

    if (!field) {
      return "";
    }

    return typeof field.value === "string" ? field.value : field.value ? "true" : "false";
  }

  function handlePreviewChange(key: string, value: string) {
    setPreviewValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function renderTextField(
    key: string,
    options?: {
      rows?: number;
      half?: boolean;
      help?: string;
    },
  ) {
    const field = getField(key);

    if (!field) {
      return null;
    }

    const label = field.label;
    const hint = options?.help || field.description;
    const sharedClasses =
      "mt-3 w-full rounded-2xl border border-[color:var(--admin-card-line)] bg-white px-4 py-3 text-sm text-[color:var(--admin-title)] outline-none transition placeholder:text-slate-400 focus:border-[color:var(--admin-accent)] focus:ring-4 focus:ring-[color:var(--admin-accent)]/10 dark:bg-slate-950/40";
    const wrapperClass = options?.half ? "lg:col-span-1" : "lg:col-span-2";

    return (
      <label
        key={field.key}
        className={`block rounded-[24px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${wrapperClass}`}
      >
        <span className="text-sm font-semibold text-[color:var(--admin-title)]">{label}</span>
        <p className="mt-1 text-sm leading-6 text-[color:var(--admin-text)]">{hint}</p>
        <input type="hidden" name={`__present__${field.key}`} value="1" />
        {field.type === "textarea" ? (
          <textarea
            name={field.key}
            rows={options?.rows || 5}
            defaultValue={String(field.value || "")}
            placeholder={field.placeholder}
            className={`${sharedClasses} resize-y`}
            onChange={(event) => handlePreviewChange(field.key, event.target.value)}
          />
        ) : (
          <input
            type={field.type}
            name={field.key}
            defaultValue={String(field.value || "")}
            placeholder={field.placeholder}
            className={sharedClasses}
            onChange={(event) => handlePreviewChange(field.key, event.target.value)}
          />
        )}
      </label>
    );
  }

  function renderBooleanField(key: string, options?: { tone?: string; help?: string }) {
    const field = getField(key);

    if (!field) {
      return null;
    }

    return (
      <label
        key={field.key}
        className={`flex items-start gap-4 rounded-[24px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
          options?.tone || ""
        }`}
      >
        <input type="hidden" name={`__present__${field.key}`} value="1" />
        <input
          type="checkbox"
          name={field.key}
          defaultChecked={Boolean(field.value)}
          className="mt-1 h-5 w-5 rounded border-slate-300 text-[color:var(--admin-accent)] focus:ring-[color:var(--admin-accent)]"
        />
        <span className="block">
          <span className="block text-sm font-semibold text-[color:var(--admin-title)]">
            {field.label}
          </span>
          <span className="mt-1 block text-sm leading-6 text-[color:var(--admin-text)]">
            {options?.help || field.description}
          </span>
        </span>
      </label>
    );
  }

  function renderColorField(key: string) {
    const field = getField(key);

    if (!field) {
      return null;
    }

    return (
      <label
        key={field.key}
        className="rounded-2xl border border-[color:var(--admin-card-line)] bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-slate-950/30"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
          {field.label}
        </span>
        <input type="hidden" name={`__present__${field.key}`} value="1" />
        <input
          type="color"
          name={field.key}
          defaultValue={String(field.value || "#000000")}
          className="mt-3 h-12 w-full cursor-pointer rounded-xl border border-[color:var(--admin-card-line)] bg-transparent"
          onChange={(event) => handlePreviewChange(field.key, event.target.value)}
        />
      </label>
    );
  }

  function renderBlock(
    title: string,
    description: string,
    children: ReactNode,
    options?: { columns?: string },
  ) {
    return (
      <section className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm">
        <div className="max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
            Bloque
          </div>
          <h3 className="mt-2 text-xl font-semibold text-[color:var(--admin-title)]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[color:var(--admin-text)]">{description}</p>
        </div>
        <div className={`mt-6 grid gap-5 ${options?.columns || "lg:grid-cols-2"}`}>{children}</div>
      </section>
    );
  }

  function renderEmailTemplateCard(input: {
    title: string;
    description: string;
    subjectKey: string;
    bodyKey: string;
    enabledKey?: string;
    note?: string;
  }) {
    const subject = getStringValue(input.subjectKey);
    const body = getStringValue(input.bodyKey);
    const previewSubject = renderTemplate(subject);
    const previewBody = renderTemplate(body);

    return (
      <section className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h3 className="text-xl font-semibold text-[color:var(--admin-title)]">{input.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--admin-text)]">{input.description}</p>
            {input.note ? (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--admin-accent)]">
                {input.note}
              </p>
            ) : null}
          </div>
          {input.enabledKey ? (
            <div className="min-w-[240px]">
              {renderBooleanField(input.enabledKey, {
                help: "Activa o desactiva este envio automatico sin tocar codigo.",
              })}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
          <div className="grid gap-4">
            {renderTextField(input.subjectKey, {
              half: false,
              rows: 1,
              help: "Asunto visible para el cliente.",
            })}
            {renderTextField(input.bodyKey, {
              half: false,
              rows: 8,
              help: "Cuerpo editable. Puedes escribirlo como mensaje simple y usar variables.",
            })}
          </div>

          <div className="rounded-[24px] border border-[color:var(--admin-card-line)] bg-white p-5 dark:bg-slate-950/30">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Vista previa
            </div>
            <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-slate-900">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Asunto</div>
              <div className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                {previewSubject || "Sin asunto"}
              </div>
              <div className="mt-5 text-xs uppercase tracking-[0.16em] text-slate-500">Mensaje</div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-300">
                {previewBody || "Sin contenido"}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderSectionContent() {
    switch (currentSection) {
      case "negocio":
        return (
          <div className="space-y-6">
            {renderBlock(
              "Identidad de la tienda",
              "Estos datos se muestran en la tienda online y ayudan a que el cliente reconozca tu negocio.",
              <>
                {renderTextField("NEXT_PUBLIC_STORE_NAME", { half: true })}
                {renderTextField("NEXT_PUBLIC_STORE_TAGLINE", { half: true })}
                {renderTextField("NEXT_PUBLIC_STORE_WELCOME_MESSAGE", { rows: 5 })}
                {renderTextField("NEXT_PUBLIC_STORE_LOGO_URL", {
                  half: true,
                  help: "Carga la ruta o URL del logo principal que quieres mostrar.",
                })}
                {renderTextField("NEXT_PUBLIC_HERO_IMAGE_URL", {
                  half: true,
                  help: "Carga la ruta o URL de la imagen de portada o banner principal.",
                })}
              </>,
            )}

            {renderBlock(
              "Contacto y presencia online",
              "Todo lo que el cliente necesita para ubicarse, escribirte o visitarte.",
              <>
                {renderTextField("NEXT_PUBLIC_STORE_ADDRESS")}
                {renderTextField("NEXT_PUBLIC_STORE_HOURS")}
                {renderTextField("NEXT_PUBLIC_SUPPORT_PHONE", { half: true })}
                {renderTextField("NEXT_PUBLIC_SUPPORT_EMAIL", { half: true })}
                {renderTextField("NEXT_PUBLIC_SUPPORT_WHATSAPP", { half: true })}
                {renderTextField("NEXT_PUBLIC_FACEBOOK_URL", { half: true })}
                {renderTextField("NEXT_PUBLIC_INSTAGRAM_URL", { half: true })}
                {renderTextField("NEXT_PUBLIC_SUPPORT_BLURB", { rows: 5 })}
              </>,
            )}
          </div>
        );
      case "checkout":
        return (
          <div className="space-y-6">
            {renderBlock(
              "Como funciona la compra",
              "Esto controla como avanza el proceso de compra y que validaciones haces antes de confirmar.",
              <>
                {renderBooleanField("APP_ALLOW_PICKUP_CHECKOUT_WITHOUT_ADDRESS")}
                {renderBooleanField("APP_VALIDATE_STOCK_ON_CHECKOUT")}
                {renderBooleanField("APP_VALIDATE_PRICE_CLASS_ON_CHECKOUT")}
                {renderBooleanField("APP_ALLOW_BACKORDERS")}
                {renderBooleanField("NEXT_PUBLIC_SHOW_OUT_OF_STOCK")}
                {renderBooleanField("APP_WRITE_STOCK_MOVEMENTS")}
                {renderTextField("APP_STOCK_RESERVATION_HOURS", { half: true })}
                {renderBooleanField("APP_SEND_ORDER_RECEIVED_EMAIL")}
              </>,
            )}
          </div>
        );
      case "pagos":
        return (
          <div className="space-y-6">
            {renderBlock(
              "Mercado Pago",
              "Completa estos datos para cobrar online y redirigir correctamente al cliente.",
              <>
                {renderTextField("APP_MP_ACCESS_TOKEN", {
                  half: false,
                  help: "Token privado de Mercado Pago para operar los cobros.",
                })}
                {renderTextField("APP_PUBLIC_BASE_URL", {
                  half: false,
                  help: "Direccion publica de tu tienda para links, retornos y seguimiento.",
                })}
                {renderTextField("APP_MP_ORDER_TC", { half: true })}
                {renderTextField("APP_MP_STATEMENT_DESCRIPTOR", { half: true })}
                {renderBooleanField("APP_MP_BINARY_MODE")}
              </>,
            )}

            {renderBlock(
              "Fallos, reintentos y alternativa comercial",
              "Define que hacer cuando el pago no puede iniciar o necesita otra salida comercial.",
              <>
                {renderTextField("APP_MAX_PAYMENT_INIT_RETRIES", { half: true })}
                {renderTextField("APP_PENDING_STOCK_RESERVE_HOURS", { half: true })}
                {renderBooleanField("APP_SEND_PAYMENT_INIT_FAILURE_EMAIL")}
                {renderBooleanField("APP_ALLOW_PICKUP_LOCAL_PAYMENT_ON_MP_FAILURE")}
              </>,
            )}
          </div>
        );
      case "pedidos":
        return (
          <div className="space-y-6">
            {renderBlock(
              "Flujo interno del negocio",
              "Ajusta como quieres trabajar los pedidos puertas adentro, sin depender del desarrollador.",
              <>
                {renderBooleanField("APP_ORDER_MANUAL_APPROVAL")}
                {renderBooleanField("APP_ORDER_MANUAL_INVOICING")}
                {renderTextField("APP_ORDER_FLOW_DESCRIPTION", { rows: 5 })}
              </>,
            )}

            {renderBlock(
              "Datos base del pedido",
              "Estos valores ayudan a grabar correctamente el pedido en el sistema comercial.",
              <>
                {renderTextField("APP_ORDER_TC", { half: true })}
                {renderTextField("APP_ORDER_BRANCH", { half: true })}
                {renderTextField("APP_ORDER_LETTER", { half: true })}
                {renderTextField("APP_PAYMENT_CONDITION", { half: true })}
                {renderTextField("APP_CUSTOMER_ACCOUNT", { half: true })}
                {renderTextField("APP_ORDER_USER", { half: true })}
                {renderTextField("APP_PENDING_ORDER_TTL_MINUTES", { half: true })}
              </>,
            )}
          </div>
        );
      case "retiro-local":
        return (
          <div className="space-y-6">
            {renderBlock(
              "Entrega en mostrador",
              "Esto controla como se entregan los pedidos en el local.",
              <>
                {renderTextField("APP_PICKUP_SCHEDULE", {
                  rows: 4,
                  help: "Texto que ve el cliente cuando el pedido esta listo para retirar. Si lo dejas vacio, usamos el horario general del local.",
                })}
                {renderBooleanField("APP_GENERATE_PICKUP_QR")}
                {renderBooleanField("APP_REQUIRE_PICKUP_FULL_NAME")}
                {renderBooleanField("APP_REQUIRE_PICKUP_DNI")}
                {renderBooleanField("APP_ALLOW_MANUAL_PICKUP_FINALIZATION")}
              </>,
            )}
          </div>
        );
      case "emails":
        return (
          <div className="space-y-6">
            <section className="rounded-[28px] border border-dashed border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Variables disponibles
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {Object.keys(TEMPLATE_VARIABLES).map((variable) => (
                  <div
                    key={variable}
                    className="rounded-2xl border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3 text-sm text-[color:var(--admin-title)]"
                  >
                    {`{{${variable}}}`}
                  </div>
                ))}
              </div>
            </section>

            {renderEmailTemplateCard({
              title: "Pedido recibido",
              description: "Es el primer mensaje que recibe el cliente cuando el pedido queda registrado.",
              enabledKey: "APP_SEND_ORDER_RECEIVED_EMAIL",
              subjectKey: "APP_ORDER_RECEIVED_EMAIL_SUBJECT",
              bodyKey: "APP_ORDER_RECEIVED_EMAIL_BODY",
            })}

            {renderEmailTemplateCard({
              title: "Problema con el pago",
              description: "Sirve para dar tranquilidad cuando el pago no puede iniciarse y ofrecer una salida clara.",
              enabledKey: "APP_SEND_PAYMENT_INIT_FAILURE_EMAIL",
              subjectKey: "APP_PAYMENT_INIT_FAILURE_EMAIL_SUBJECT",
              bodyKey: "APP_PAYMENT_INIT_FAILURE_EMAIL_BODY",
            })}

            {renderEmailTemplateCard({
              title: "Pedido facturado",
              description: "Mensaje automatico al entrar en FACTURADO.",
              enabledKey: "APP_STATE_FACTURADO_SEND_EMAIL",
              subjectKey: "APP_STATE_FACTURADO_EMAIL_SUBJECT",
              bodyKey: "APP_STATE_FACTURADO_EMAIL_BODY",
              note: "Puedes combinarlo con la politica de facturacion para retiro y envio.",
            })}

            {renderEmailTemplateCard({
              title: "Listo para retirar",
              description: "Avisa al cliente que ya puede pasar por el local y mostrar el codigo o QR.",
              enabledKey: "APP_STATE_LISTO_PARA_RETIRO_SEND_EMAIL",
              subjectKey: "APP_STATE_LISTO_PARA_RETIRO_EMAIL_SUBJECT",
              bodyKey: "APP_STATE_LISTO_PARA_RETIRO_EMAIL_BODY",
              note: "El sistema agrega automaticamente el codigo de retiro, los horarios configurados y el link al pedido con QR.",
            })}

            {renderEmailTemplateCard({
              title: "Pedido enviado",
              description: "Confirma que el pedido ya salio camino al cliente.",
              enabledKey: "APP_STATE_ENVIADO_SEND_EMAIL",
              subjectKey: "APP_STATE_ENVIADO_EMAIL_SUBJECT",
              bodyKey: "APP_STATE_ENVIADO_EMAIL_BODY",
            })}

            {renderEmailTemplateCard({
              title: "Pedido entregado",
              description: "Cierra la experiencia de compra con una comunicacion clara y profesional.",
              enabledKey: "APP_STATE_ENTREGADO_SEND_EMAIL",
              subjectKey: "APP_STATE_ENTREGADO_EMAIL_SUBJECT",
              bodyKey: "APP_STATE_ENTREGADO_EMAIL_BODY",
            })}

            {renderEmailTemplateCard({
              title: "Error",
              description: "Usalo para avisar que hubo un inconveniente y que el equipo ya lo esta revisando.",
              enabledKey: "APP_STATE_ERROR_SEND_EMAIL",
              subjectKey: "APP_STATE_ERROR_EMAIL_SUBJECT",
              bodyKey: "APP_STATE_ERROR_EMAIL_BODY",
            })}
          </div>
        );
      case "estados":
        return (
          <div className="grid gap-6">
            {ORDER_STATES.map((state) => {
              const bg = getStringValue(`APP_STATE_${state}_COLOR_BG`) || "#eef2ff";
              const text = getStringValue(`APP_STATE_${state}_COLOR_TEXT`) || "#111827";
              const border = getStringValue(`APP_STATE_${state}_COLOR_BORDER`) || "#cbd5e1";
              const dot = getStringValue(`APP_STATE_${state}_COLOR_DOT`) || "#475569";
              const visibleLabel =
                getStringValue(`APP_STATE_${state}_LABEL`) || STATE_LABELS[state];

              return (
                <section
                  key={state}
                  className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                        Estado
                      </div>
                      <h3 className="mt-2 text-xl font-semibold text-[color:var(--admin-title)]">
                        {STATE_LABELS[state]}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--admin-text)]">
                        Personaliza como se ve este estado y si debe enviar email al entrar.
                      </p>
                    </div>

                    <div
                      className="inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-semibold"
                      style={{
                        backgroundColor: bg,
                        color: text,
                        borderColor: border,
                      }}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: dot }}
                      />
                      {visibleLabel}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
                    <div className="grid gap-4">
                      {renderTextField(`APP_STATE_${state}_LABEL`, {
                        half: false,
                        help: "Nombre visible opcional para mostrar este estado de forma mas amigable.",
                      })}
                      {renderBooleanField(`APP_STATE_${state}_SEND_EMAIL`, {
                        help: "Si esta activo, se enviara el email configurado al entrar en este estado.",
                      })}
                      {renderTextField(`APP_STATE_${state}_EMAIL_SUBJECT`, {
                        half: false,
                        help: "Asunto del email para este estado.",
                      })}
                      {renderTextField(`APP_STATE_${state}_EMAIL_BODY`, {
                        half: false,
                        rows: 6,
                        help: "Texto del email para este estado. Puedes usar variables como {{nombre_cliente}} o {{numero_pedido}}.",
                      })}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {renderColorField(`APP_STATE_${state}_COLOR_BG`)}
                      {renderColorField(`APP_STATE_${state}_COLOR_TEXT`)}
                      {renderColorField(`APP_STATE_${state}_COLOR_BORDER`)}
                      {renderColorField(`APP_STATE_${state}_COLOR_DOT`)}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        );
      case "facturacion":
        return (
          <div className="space-y-6">
            {renderBlock(
              "Email de factura",
              "Configura el mensaje por defecto para enviar la factura de forma manual, clara y profesional.",
              <>
                {renderTextField("APP_INVOICE_EMAIL_SUBJECT", { half: false })}
                {renderTextField("APP_INVOICE_EMAIL_BODY", { rows: 8 })}
              </>,
            )}

            {renderBlock(
              "Comportamiento al facturar",
              "Decide si al pasar a facturado quieres avisar automaticamente segun el tipo de entrega.",
              <>
                {renderBooleanField("APP_SEND_FACTURADO_EMAIL_PICKUP")}
                {renderBooleanField("APP_SEND_FACTURADO_EMAIL_SHIPMENT")}
              </>,
            )}
          </div>
        );
      default:
        return null;
    }
  }

  const currentMeta = SECTIONS.find((section) => section.id === currentSection) || SECTIONS[0];

  return (
    <form action={saveAction} className="space-y-6" id="admin-config-workspace">
      <input type="hidden" name="activeConfig" value={currentSection} />

      <section className="rounded-[30px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              {currentMeta.eyebrow}
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--admin-title)]">
              Configuracion pensada para el negocio
            </h2>
            <p className="mt-3 text-sm leading-6 text-[color:var(--admin-text)]">
              Ordenamos la configuracion por tareas reales del dia a dia para que cualquier persona del negocio pueda manejar la tienda sin depender del desarrollador.
            </p>
          </div>

          <div className="grid min-w-[220px] gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Secciones
              </div>
              <div className="mt-2 text-2xl font-semibold text-[color:var(--admin-title)]">
                {SECTIONS.length}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Parametros
              </div>
              <div className="mt-2 text-2xl font-semibold text-[color:var(--admin-title)]">
                {fields.length}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start">
        <nav
          className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-4 shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-hidden"
          aria-label="Secciones de configuracion"
        >
          <div className="px-2 pb-4 pt-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Secciones
            </div>
            <p className="mt-2 text-sm leading-6 text-[color:var(--admin-text)]">
              Cada bloque funciona como una pestaña independiente para editar solo esa parte del negocio.
            </p>
          </div>

          <div className="grid gap-3 xl:max-h-[calc(100vh-10.5rem)] xl:overflow-y-auto xl:pr-1">
            {SECTIONS.map((section) => {
              const active = section.id === currentSection;

              return (
                <Link
                  key={section.id}
                  href={`/admin?view=config&config=${section.id}#admin-config-workspace`}
                  scroll={false}
                  className={`rounded-[22px] border px-4 py-4 transition ${
                    active
                      ? "border-[color:var(--admin-accent)] bg-[color:var(--admin-accent)] text-white shadow-[0_14px_34px_rgba(13,109,216,0.18)]"
                      : "border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] hover:-translate-y-[1px] hover:border-[color:var(--admin-accent)]/35"
                  }`}
                >
                  <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${active ? "text-white/75" : "text-[color:var(--admin-text)]"}`}>
                    {section.eyebrow}
                  </div>
                  <div className={`mt-1 text-sm font-semibold ${active ? "text-white" : "text-[color:var(--admin-title)]"}`}>
                    {section.title}
                  </div>
                  <div className={`mt-1 text-sm leading-6 ${active ? "text-white/82" : "text-[color:var(--admin-text)]"}`}>
                    {section.description}
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 space-y-7">
          <section className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              {currentMeta.eyebrow}
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--admin-title)]">
              {currentMeta.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--admin-text)]">
              {currentMeta.description}
            </p>
          </section>

          {renderSectionContent()}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-5 shadow-sm">
            <p className="text-sm leading-6 text-[color:var(--admin-text)]">
              Guarda solo cuando termines este bloque. Los cambios quedan listos para usar desde el admin actual.
            </p>
            <SaveButton />
          </div>
        </div>
      </div>
    </form>
  );
}
