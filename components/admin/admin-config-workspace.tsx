"use client";

import Link from "next/link";
import { useDeferredValue, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  EMAIL_PREVIEW_VALUES,
  EMAIL_VARIABLE_ORDER,
  renderEmailPreviewTemplate,
} from "@/lib/email-preview";
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
  helper: string;
  sectionCountLabel: string;
};

type EmailEditorDefinition = {
  id: string;
  title: string;
  description: string;
  enabledKey?: string;
  subjectKey: string;
  bodyKey: string;
  ccKey?: string;
  brandingKey?: string;
  note?: string;
  eyebrow: string;
};

const SECTIONS: ConfigSection[] = [
  {
    id: "negocio",
    title: "Web / Tienda",
    description: "Todo lo visible para la tienda publica, la identidad comercial y el catalogo.",
    eyebrow: "Tienda",
    helper:
      "Aqui ajustas lo que el cliente ve en la web: nombre, textos, imagenes, horarios, contacto y sincronizacion visual.",
    sectionCountLabel: "Tienda",
  },
  {
    id: "checkout",
    title: "Proceso de compra",
    description: "Reglas de compra online, validaciones, reservas y comportamiento inicial del pedido.",
    eyebrow: "Compra online",
    helper:
      "No quitamos flexibilidad. Solo ordenamos mejor todo lo que influye en la compra antes de que el pedido quede creado.",
    sectionCountLabel: "Compra",
  },
  {
    id: "pagos",
    title: "Pagos",
    description: "Mercado Pago, reintentos, sincronizacion y alternativas comerciales si algo falla.",
    eyebrow: "Cobros",
    helper:
      "Separa claramente la parte comercial de la tecnica para que el negocio pueda decidir como cobrar sin perder control.",
    sectionCountLabel: "Pagos",
  },
  {
    id: "pedidos",
    title: "Pedidos",
    description: "Flujo interno, aprobacion, facturacion manual, vencimientos y datos comerciales base.",
    eyebrow: "Operacion",
    helper:
      "Este bloque ordena como trabaja el equipo desde que el pedido entra hasta que queda listo para facturar o preparar.",
    sectionCountLabel: "Pedidos",
  },
  {
    id: "retiro-local",
    title: "Retiro en local",
    description: "QR, validaciones en mostrador, horarios y reglas de entrega para pickup.",
    eyebrow: "Mostrador",
    helper:
      "Todo lo que hace a la experiencia de retiro y a la trazabilidad de la entrega se concentra aqui.",
    sectionCountLabel: "Retiro",
  },
  {
    id: "emails",
    title: "Emails",
    description: "Branding, entrega SMTP, emails por evento y vista previa en tiempo real.",
    eyebrow: "Comunicacion",
    helper:
      "Los emails quedaron pensados como una herramienta comercial: claros, editables y configurables por evento o por estado.",
    sectionCountLabel: "Emails",
  },
  {
    id: "estados",
    title: "Estados del pedido",
    description: "Nombre visible, colores y automatizaciones para cada etapa del pedido.",
    eyebrow: "Flujo",
    helper:
      "Mantienes defaults, overrides y automatizaciones, pero con una presentacion mucho mas clara para operar.",
    sectionCountLabel: "Estados",
  },
  {
    id: "facturacion",
    title: "Facturacion y documentos",
    description: "Documento inicial, comprobantes, mail de factura y reglas de envio al facturar.",
    eyebrow: "Documentos",
    helper:
      "Aqui se concentra la parte documental del sistema: NP, comprobantes y comunicacion de factura.",
    sectionCountLabel: "Docs",
  },
  {
    id: "ayuda",
    title: "Ayuda y referencias",
    description: "Explicaciones cortas para orientar a usuarios no tecnicos dentro de la configuracion.",
    eyebrow: "Ayuda",
    helper:
      "Este bloque resume que tocar segun la necesidad del negocio y que revisar antes de guardar cambios importantes.",
    sectionCountLabel: "Ayuda",
  },
];

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

const SECTION_KEYS: Record<string, string[]> = {
  negocio: [
    "NEXT_PUBLIC_STORE_NAME",
    "NEXT_PUBLIC_STORE_TAGLINE",
    "NEXT_PUBLIC_STORE_WELCOME_MESSAGE",
    "NEXT_PUBLIC_STORE_LOGO_URL",
    "NEXT_PUBLIC_HERO_IMAGE_URL",
    "NEXT_PUBLIC_STORE_ADDRESS",
    "NEXT_PUBLIC_STORE_HOURS",
    "NEXT_PUBLIC_SUPPORT_PHONE",
    "NEXT_PUBLIC_SUPPORT_EMAIL",
    "NEXT_PUBLIC_SUPPORT_WHATSAPP",
    "NEXT_PUBLIC_FACEBOOK_URL",
    "NEXT_PUBLIC_INSTAGRAM_URL",
    "NEXT_PUBLIC_SUPPORT_BLURB",
    "NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL",
    "ODOO_SHOP_URL",
    "ODOO_SYNC_IMAGES",
    "ODOO_MAX_PAGES",
  ],
  checkout: [
    "APP_ALLOW_PICKUP_CHECKOUT_WITHOUT_ADDRESS",
    "APP_VALIDATE_STOCK_ON_CHECKOUT",
    "APP_VALIDATE_PRICE_CLASS_ON_CHECKOUT",
    "APP_ALLOW_BACKORDERS",
    "NEXT_PUBLIC_SHOW_OUT_OF_STOCK",
    "APP_WRITE_STOCK_MOVEMENTS",
    "APP_STOCK_RESERVATION_HOURS",
    "APP_PRODUCT_LIMIT",
    "APP_PRICE_COLUMN",
    "APP_STOCK_DEPOSIT_ID",
    "APP_DEFAULT_TAX_RATE",
    "APP_PRICES_INCLUDE_TAX",
  ],
  pagos: [
    "APP_MP_ACCESS_TOKEN",
    "APP_PUBLIC_BASE_URL",
    "APP_MP_ORDER_TC",
    "APP_MP_STATEMENT_DESCRIPTOR",
    "APP_MP_BINARY_MODE",
    "APP_MAX_PAYMENT_INIT_RETRIES",
    "APP_ALLOW_PICKUP_LOCAL_PAYMENT_ON_MP_FAILURE",
    "APP_PENDING_STOCK_RESERVE_HOURS",
  ],
  pedidos: [
    "APP_ORDER_MANUAL_APPROVAL",
    "APP_ORDER_MANUAL_INVOICING",
    "APP_ORDER_FLOW_DESCRIPTION",
    "APP_PAYMENT_CONDITION",
    "APP_CUSTOMER_ACCOUNT",
    "APP_ORDER_USER",
    "APP_PENDING_ORDER_TTL_MINUTES",
    "APP_VENDOR_ID",
    "APP_UNEGOCIO",
    "APP_PRICE_LIST_ID",
    "APP_CLASS_PRICE",
    "APP_SALE_REASON_ID",
    "APP_STOCK_REASON_ID",
    "APP_DOCUMENT_TYPE",
    "APP_IVA_CONDITION",
  ],
  "retiro-local": [
    "APP_PICKUP_SCHEDULE",
    "APP_GENERATE_PICKUP_QR",
    "APP_REQUIRE_PICKUP_FULL_NAME",
    "APP_REQUIRE_PICKUP_DNI",
    "APP_ALLOW_MANUAL_PICKUP_FINALIZATION",
  ],
  emails: [
    "APP_EMAIL_BRANDING_ENABLED",
    "APP_EMAIL_PRIMARY_COLOR",
    "APP_EMAIL_ACCENT_COLOR",
    "APP_EMAIL_HIGHLIGHT_COLOR",
    "APP_EMAIL_SHOW_CONTACT_BLOCK",
    "APP_EMAIL_FOOTER_NOTE",
    "APP_EMAIL_TRACKING_BUTTON_LABEL",
    "APP_EMAIL_PICKUP_BUTTON_LABEL",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_TIMEOUT_MS",
    "SMTP_IGNORE_TLS_ERRORS",
    "SMTP_FROM_NAME",
    "SMTP_FROM",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FALLBACK_FROM_NAME",
    "SMTP_FALLBACK_FROM",
    "SMTP_FALLBACK_USER",
    "SMTP_FALLBACK_PASS",
    "APP_SEND_ORDER_RECEIVED_EMAIL",
    "APP_ORDER_RECEIVED_EMAIL_SUBJECT",
    "APP_ORDER_RECEIVED_EMAIL_BODY",
    "APP_ORDER_RECEIVED_EMAIL_CC",
    "APP_ORDER_RECEIVED_EMAIL_USE_BRANDING",
    "APP_SEND_PAYMENT_INIT_FAILURE_EMAIL",
    "APP_PAYMENT_INIT_FAILURE_EMAIL_SUBJECT",
    "APP_PAYMENT_INIT_FAILURE_EMAIL_BODY",
    "APP_PAYMENT_INIT_FAILURE_EMAIL_CC",
    "APP_PAYMENT_INIT_FAILURE_EMAIL_USE_BRANDING",
    ...ORDER_STATES.flatMap((state) => [
      `APP_STATE_${state}_SEND_EMAIL`,
      `APP_STATE_${state}_EMAIL_SUBJECT`,
      `APP_STATE_${state}_EMAIL_BODY`,
      `APP_STATE_${state}_EMAIL_CC`,
      `APP_STATE_${state}_USE_BRANDING`,
    ]),
  ],
  estados: ORDER_STATES.flatMap((state) => [
    `APP_STATE_${state}_LABEL`,
    `APP_STATE_${state}_COLOR_BG`,
    `APP_STATE_${state}_COLOR_TEXT`,
    `APP_STATE_${state}_COLOR_BORDER`,
    `APP_STATE_${state}_COLOR_DOT`,
    `APP_STATE_${state}_SEND_EMAIL`,
    `APP_STATE_${state}_EMAIL_SUBJECT`,
    `APP_STATE_${state}_EMAIL_BODY`,
    `APP_STATE_${state}_EMAIL_CC`,
    `APP_STATE_${state}_USE_BRANDING`,
  ]),
  facturacion: [
    "APP_ORDER_TC",
    "APP_ORDER_BRANCH",
    "APP_ORDER_LETTER",
    "APP_SEND_FACTURADO_EMAIL_PICKUP",
    "APP_SEND_FACTURADO_EMAIL_SHIPMENT",
    "APP_INVOICE_EMAIL_SUBJECT",
    "APP_INVOICE_EMAIL_BODY",
    "APP_INVOICE_EMAIL_CC",
    "APP_INVOICE_EMAIL_USE_BRANDING",
  ],
  ayuda: [],
};

const FIXED_EMAIL_EDITORS: EmailEditorDefinition[] = [
  {
    id: "order-received",
    title: "Pedido recibido",
    description:
      "Primer mensaje que recibe el cliente. Tiene que transmitir tranquilidad y explicar que el pedido ya quedo registrado.",
    eyebrow: "Evento",
    enabledKey: "APP_SEND_ORDER_RECEIVED_EMAIL",
    subjectKey: "APP_ORDER_RECEIVED_EMAIL_SUBJECT",
    bodyKey: "APP_ORDER_RECEIVED_EMAIL_BODY",
    ccKey: "APP_ORDER_RECEIVED_EMAIL_CC",
    brandingKey: "APP_ORDER_RECEIVED_EMAIL_USE_BRANDING",
  },
  {
    id: "payment-init-failure",
    title: "Error al iniciar pago",
    description:
      "Sirve para contener al cliente, ofrecer reintento y mostrar una alternativa clara si el pago web falla.",
    eyebrow: "Evento",
    enabledKey: "APP_SEND_PAYMENT_INIT_FAILURE_EMAIL",
    subjectKey: "APP_PAYMENT_INIT_FAILURE_EMAIL_SUBJECT",
    bodyKey: "APP_PAYMENT_INIT_FAILURE_EMAIL_BODY",
    ccKey: "APP_PAYMENT_INIT_FAILURE_EMAIL_CC",
    brandingKey: "APP_PAYMENT_INIT_FAILURE_EMAIL_USE_BRANDING",
  },
];

function buildStateEmailEditors() {
  return ORDER_STATES.map((state) => ({
    id: `state-${state.toLowerCase()}`,
    title: STATE_LABELS[state],
    description: `Email automatico al entrar en ${STATE_LABELS[state]}. Puedes personalizar asunto, cuerpo y copias internas.`,
    eyebrow: "Estado",
    enabledKey: `APP_STATE_${state}_SEND_EMAIL`,
    subjectKey: `APP_STATE_${state}_EMAIL_SUBJECT`,
    bodyKey: `APP_STATE_${state}_EMAIL_BODY`,
    ccKey: `APP_STATE_${state}_EMAIL_CC`,
    brandingKey: `APP_STATE_${state}_USE_BRANDING`,
    note: `Codigo interno del estado: ${state}`,
  })) satisfies EmailEditorDefinition[];
}

function buildFieldMap(fields: AdminConfigField[]) {
  return Object.fromEntries(fields.map((field) => [field.key, field])) as Record<
    string,
    AdminConfigField | undefined
  >;
}

function normalizeSectionId(section: string) {
  if (section === "ayuda") {
    return "ayuda";
  }

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

function countVisibleItems(values: boolean[]) {
  return values.filter(Boolean).length;
}

export function AdminConfigWorkspace(props: AdminConfigWorkspaceProps) {
  const { fields, activeSection, saveAction } = props;
  const fieldMap = buildFieldMap(fields);
  const [previewValues, setPreviewValues] = useState<Record<string, string | boolean>>({});
  const [query, setQuery] = useState("");
  const deferredPreviewValues = useDeferredValue(previewValues);
  const deferredQuery = useDeferredValue(query).trim().toLowerCase();
  const currentSection = normalizeSectionId(activeSection);

  function getField(key: string) {
    return fieldMap[key] || null;
  }

  function handlePreviewChange(key: string, value: string | boolean) {
    setPreviewValues((current) => ({
      ...current,
      [key]: value,
    }));
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

  function getBooleanValue(key: string) {
    const draftValue = deferredPreviewValues[key];
    if (typeof draftValue === "boolean") {
      return draftValue;
    }

    const field = getField(key);
    return Boolean(field?.value);
  }

  function fieldMatchesQuery(field: AdminConfigField) {
    if (!deferredQuery) {
      return true;
    }

    const searchable = [
      field.label,
      field.description,
      field.group || "",
      field.key,
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(deferredQuery);
  }

  function cardMatchesQuery(title: string, description: string, keys: string[]) {
    if (!deferredQuery) {
      return true;
    }

    const text = `${title} ${description}`.toLowerCase();
    if (text.includes(deferredQuery)) {
      return true;
    }

    return keys.some((key) => {
      const field = getField(key);
      return field ? fieldMatchesQuery(field) : false;
    });
  }

  function collectVisibleKeys(keys: string[]) {
    return keys.filter((key) => {
      const field = getField(key);
      return field ? fieldMatchesQuery(field) : false;
    });
  }

  function renderFieldHeader(field: AdminConfigField, help?: string) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[color:var(--admin-title)]">{field.label}</div>
          <p className="mt-1 text-sm leading-6 text-[color:var(--admin-text)]">
            {help || field.description}
          </p>
        </div>
        <span className="rounded-full border border-[color:var(--admin-card-line)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--admin-text)]">
          {field.key}
        </span>
      </div>
    );
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
    if (!field || !fieldMatchesQuery(field)) {
      return null;
    }

    const wrapperClass = options?.half ? "xl:col-span-1" : "xl:col-span-2";
    const sharedClasses =
      "mt-4 w-full rounded-2xl border border-[color:var(--admin-card-line)] bg-white px-4 py-3 text-sm text-[color:var(--admin-title)] outline-none transition placeholder:text-slate-400 focus:border-[color:var(--admin-accent)] focus:ring-4 focus:ring-[color:var(--admin-accent)]/10 dark:bg-slate-950/40";

    return (
      <label
        key={field.key}
        className={`block rounded-[24px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${wrapperClass}`}
      >
        {renderFieldHeader(field, options?.help)}
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

  function renderBooleanField(
    key: string,
    options?: {
      help?: string;
      emphasis?: string;
    },
  ) {
    const field = getField(key);
    if (!field || !fieldMatchesQuery(field)) {
      return null;
    }

    const checked = getBooleanValue(key);

    return (
      <label
        key={field.key}
        className={`flex items-start gap-4 rounded-[24px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${options?.emphasis || ""}`}
      >
        <input type="hidden" name={`__present__${field.key}`} value="1" />
        <input
          type="checkbox"
          name={field.key}
          defaultChecked={checked}
          className="mt-1 h-5 w-5 rounded border-slate-300 text-[color:var(--admin-accent)] focus:ring-[color:var(--admin-accent)]"
          onChange={(event) => handlePreviewChange(field.key, event.target.checked)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-[color:var(--admin-title)]">{field.label}</div>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                checked
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"
                  : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
              }`}
            >
              {checked ? "Activo" : "Inactivo"}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-[color:var(--admin-text)]">
            {options?.help || field.description}
          </p>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--admin-text)]">
            {field.key}
          </div>
        </div>
      </label>
    );
  }

  function renderColorField(key: string) {
    const field = getField(key);
    if (!field || !fieldMatchesQuery(field)) {
      return null;
    }

    return (
      <label
        key={field.key}
        className="rounded-[24px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        {renderFieldHeader(field)}
        <input type="hidden" name={`__present__${field.key}`} value="1" />
        <div className="mt-4 flex items-center gap-4">
          <input
            type="color"
            name={field.key}
            defaultValue={String(field.value || "#000000")}
            className="h-14 w-20 cursor-pointer rounded-2xl border border-[color:var(--admin-card-line)] bg-transparent"
            onChange={(event) => handlePreviewChange(field.key, event.target.value)}
          />
          <div className="text-sm text-[color:var(--admin-text)]">{getStringValue(key)}</div>
        </div>
      </label>
    );
  }

  function renderFieldByKey(
    key: string,
    options?: {
      rows?: number;
      half?: boolean;
      help?: string;
      emphasis?: string;
    },
  ) {
    const field = getField(key);
    if (!field) {
      return null;
    }

    if (field.type === "boolean") {
      return renderBooleanField(key, {
        help: options?.help,
        emphasis: options?.emphasis,
      });
    }

    if (field.type === "color") {
      return renderColorField(key);
    }

    return renderTextField(key, {
      rows: options?.rows,
      half: options?.half,
      help: options?.help,
    });
  }

  function renderFieldGrid(
    keys: string[],
    options?: {
      columns?: string;
      overrides?: Record<string, { rows?: number; half?: boolean; help?: string }>;
    },
  ) {
    const visibleKeys = collectVisibleKeys(keys);
    if (visibleKeys.length === 0) {
      return null;
    }

    return (
      <div className={`grid gap-5 ${options?.columns || "xl:grid-cols-2"}`}>
        {visibleKeys.map((key) =>
          renderFieldByKey(key, options?.overrides?.[key] || { half: true }),
        )}
      </div>
    );
  }

  function renderInfoPanel(title: string, description: string, children?: ReactNode) {
    return (
      <section className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm">
        <div className="max-w-4xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
            Bloque
          </div>
          <h3 className="mt-2 text-xl font-semibold text-[color:var(--admin-title)]">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-[color:var(--admin-text)]">{description}</p>
        </div>
        {children ? <div className="mt-6">{children}</div> : null}
      </section>
    );
  }

  function renderSectionHero(meta: ConfigSection) {
    const sectionKeys = SECTION_KEYS[meta.id] || [];
    const visibleFieldCount = sectionKeys.length
      ? countVisibleItems(sectionKeys.map((key) => Boolean(getField(key))))
      : 0;

    return (
      <section className="rounded-[30px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              {meta.eyebrow}
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--admin-title)]">
              {meta.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[color:var(--admin-text)]">
              {meta.description}
            </p>
            <p className="mt-3 text-sm leading-6 text-[color:var(--admin-text)]">{meta.helper}</p>
          </div>

          <div className="grid min-w-[260px] gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Seccion actual
              </div>
              <div className="mt-2 text-xl font-semibold text-[color:var(--admin-title)]">
                {meta.sectionCountLabel}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Campos
              </div>
              <div className="mt-2 text-xl font-semibold text-[color:var(--admin-title)]">
                {visibleFieldCount}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderSearchPanel() {
    return (
      <section className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Buscar dentro de esta seccion
            </div>
            <p className="mt-2 text-sm leading-6 text-[color:var(--admin-text)]">
              Filtra por nombre, descripcion o clave tecnica para encontrar rapido el ajuste que necesitas.
            </p>
          </div>
          <div className="min-w-[280px] max-w-[420px] flex-1">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ej.: horario, Mercado Pago, factura, QR"
              className="w-full rounded-2xl border border-[color:var(--admin-card-line)] bg-white px-4 py-3 text-sm text-[color:var(--admin-title)] outline-none transition placeholder:text-slate-400 focus:border-[color:var(--admin-accent)] focus:ring-4 focus:ring-[color:var(--admin-accent)]/10 dark:bg-slate-950/40"
            />
          </div>
        </div>
      </section>
    );
  }

  function renderVariablePanel() {
    if (
      !cardMatchesQuery(
        "Variables",
        "Variables disponibles para emails y previsualizaciones.",
        EMAIL_VARIABLE_ORDER.map((variable) => `APP_EMAIL_${variable}`),
      )
    ) {
      return null;
    }

    return (
      <section className="rounded-[28px] border border-dashed border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Variables disponibles
            </div>
            <h3 className="mt-2 text-xl font-semibold text-[color:var(--admin-title)]">
              Atajos para personalizar mensajes sin tocar codigo
            </h3>
            <p className="mt-3 text-sm leading-6 text-[color:var(--admin-text)]">
              Puedes usar estas variables en asuntos y cuerpos. En la vista previa ya aparecen reemplazadas con datos de ejemplo.
            </p>
          </div>
          <div className="rounded-2xl border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3 text-sm text-[color:var(--admin-title)]">
            Ejemplo: {"{{nombre_cliente}}"}, {"{{numero_pedido}}"}, {"{{link_seguimiento}}"}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {EMAIL_VARIABLE_ORDER.map((variable) => (
            <div
              key={variable}
              className="rounded-2xl border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-4"
            >
              <div className="text-sm font-semibold text-[color:var(--admin-title)]">
                {`{{${variable}}}`}
              </div>
              <div className="mt-2 text-sm leading-6 text-[color:var(--admin-text)]">
                {EMAIL_PREVIEW_VALUES[variable]}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderEmailPreview(definition: EmailEditorDefinition) {
    const subject = renderEmailPreviewTemplate(getStringValue(definition.subjectKey));
    const body = renderEmailPreviewTemplate(getStringValue(definition.bodyKey));
    const useBranding = definition.brandingKey ? getBooleanValue(definition.brandingKey) : true;
    const primaryColor = getStringValue("APP_EMAIL_PRIMARY_COLOR") || "#0f172a";
    const accentColor = getStringValue("APP_EMAIL_ACCENT_COLOR") || "#1d4ed8";
    const highlightColor = getStringValue("APP_EMAIL_HIGHLIGHT_COLOR") || "#15803d";
    const footerNote = renderEmailPreviewTemplate(getStringValue("APP_EMAIL_FOOTER_NOTE"));
    const showContactBlock = getBooleanValue("APP_EMAIL_SHOW_CONTACT_BLOCK");
    const ctaLabel =
      definition.id.includes("pickup") || definition.id.includes("retiro")
        ? getStringValue("APP_EMAIL_PICKUP_BUTTON_LABEL") || "Ver mi pedido y QR"
        : getStringValue("APP_EMAIL_TRACKING_BUTTON_LABEL") || "Seguir mi pedido";

    if (!useBranding) {
      return (
        <div className="rounded-[24px] border border-[color:var(--admin-card-line)] bg-white p-5 dark:bg-slate-950/30">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
            Vista previa simple
          </div>
          <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-slate-900">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Asunto</div>
            <div className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              {subject || "Sin asunto"}
            </div>
            <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-300">
              {body || "Sin contenido"}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-[24px] border border-[color:var(--admin-card-line)] bg-white p-5 dark:bg-slate-950/30">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
          Vista previa comercial
        </div>
        <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-900">
          <div
            className="px-5 py-5 text-white"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
            }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
              {renderEmailPreviewTemplate(getStringValue("NEXT_PUBLIC_STORE_NAME") || "Tu tienda")}
            </div>
            <div className="mt-2 text-xl font-semibold">{subject || "Sin asunto"}</div>
            <div className="mt-2 text-sm leading-6 text-white/90">{definition.title}</div>
          </div>

          <div className="grid gap-4 p-5">
            <div className="rounded-[18px] border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
              <div className="whitespace-pre-wrap">{body || "Sin contenido"}</div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[18px] border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950/40">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Resumen del pedido
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  <div>Pedido: {EMAIL_PREVIEW_VALUES.numero_pedido}</div>
                  <div>Entrega: {EMAIL_PREVIEW_VALUES.tipo_entrega}</div>
                  <div>Total: {EMAIL_PREVIEW_VALUES.monto_total}</div>
                </div>
              </div>
              <div className="rounded-[18px] border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950/40">
                <div
                  className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white"
                  style={{ backgroundColor: highlightColor }}
                >
                  Llamado a la accion
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
                  El email puede mostrar un boton principal cuando corresponde.
                </div>
                <div
                  className="mt-4 inline-flex items-center justify-center rounded-[14px] px-4 py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {ctaLabel}
                </div>
              </div>
            </div>

            {showContactBlock ? (
              <div className="rounded-[18px] border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {renderEmailPreviewTemplate(getStringValue("NEXT_PUBLIC_STORE_NAME") || "Tu tienda")}
                </div>
                <div className="mt-2">
                  {EMAIL_PREVIEW_VALUES.email_contacto}
                  <br />
                  {EMAIL_PREVIEW_VALUES.telefono_contacto}
                  <br />
                  {EMAIL_PREVIEW_VALUES.direccion_local}
                  <br />
                  {EMAIL_PREVIEW_VALUES.horario_local}
                </div>
              </div>
            ) : null}

            {footerNote ? (
              <div className="text-sm leading-6 text-slate-500 dark:text-slate-400">{footerNote}</div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  function renderEmailEditor(definition: EmailEditorDefinition) {
    const relatedKeys = [
      definition.enabledKey,
      definition.subjectKey,
      definition.bodyKey,
      definition.ccKey,
      definition.brandingKey,
    ].filter(Boolean) as string[];

    if (!cardMatchesQuery(definition.title, definition.description, relatedKeys)) {
      return null;
    }

    return (
      <section
        key={definition.id}
        className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              {definition.eyebrow}
            </div>
            <h3 className="mt-2 text-xl font-semibold text-[color:var(--admin-title)]">
              {definition.title}
            </h3>
            <p className="mt-3 text-sm leading-6 text-[color:var(--admin-text)]">
              {definition.description}
            </p>
            {definition.note ? (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--admin-accent)]">
                {definition.note}
              </p>
            ) : null}
          </div>
          <div className="grid min-w-[260px] gap-3">
            {definition.enabledKey
              ? renderBooleanField(definition.enabledKey, {
                  help: "Activa o desactiva este envio automatico sin tocar codigo.",
                })
              : null}
            {definition.brandingKey
              ? renderBooleanField(definition.brandingKey, {
                  help: "Si lo desactivas, este email sale con formato simple.",
                })
              : null}
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <div className="grid gap-4">
            {definition.ccKey
              ? renderTextField(definition.ccKey, {
                  half: false,
                  rows: 1,
                  help: "Copia interna opcional. Puedes separar varios emails con coma.",
                })
              : null}
            {renderTextField(definition.subjectKey, {
              half: false,
              rows: 1,
              help: "Asunto visible para el cliente.",
            })}
            {renderTextField(definition.bodyKey, {
              half: false,
              rows: 9,
              help: "Mensaje editable con variables. Piensa este bloque como el texto comercial principal del email.",
            })}
          </div>
          {renderEmailPreview(definition)}
        </div>
      </section>
    );
  }

  function renderStateEditor(state: OrderState) {
    const title = STATE_LABELS[state];
    const visibleLabel = getStringValue(`APP_STATE_${state}_LABEL`) || title;
    const bg = getStringValue(`APP_STATE_${state}_COLOR_BG`) || "#eef2ff";
    const text = getStringValue(`APP_STATE_${state}_COLOR_TEXT`) || "#111827";
    const border = getStringValue(`APP_STATE_${state}_COLOR_BORDER`) || "#cbd5e1";
    const dot = getStringValue(`APP_STATE_${state}_COLOR_DOT`) || "#475569";
    const keys = [
      `APP_STATE_${state}_LABEL`,
      `APP_STATE_${state}_COLOR_BG`,
      `APP_STATE_${state}_COLOR_TEXT`,
      `APP_STATE_${state}_COLOR_BORDER`,
      `APP_STATE_${state}_COLOR_DOT`,
      `APP_STATE_${state}_SEND_EMAIL`,
      `APP_STATE_${state}_EMAIL_SUBJECT`,
      `APP_STATE_${state}_EMAIL_BODY`,
      `APP_STATE_${state}_EMAIL_CC`,
      `APP_STATE_${state}_USE_BRANDING`,
    ];

    if (!cardMatchesQuery(title, `Configuracion del estado ${title}`, keys)) {
      return null;
    }

    return (
      <section
        key={state}
        className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Estado interno
            </div>
            <h3 className="mt-2 text-xl font-semibold text-[color:var(--admin-title)]">{title}</h3>
            <p className="mt-3 text-sm leading-6 text-[color:var(--admin-text)]">
              Aqui defines como se muestra el estado, como se comunica y que look tiene dentro del admin.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[color:var(--admin-card-line)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--admin-text)]">
              Codigo: {state}
            </span>
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"
              style={{ backgroundColor: bg, color: text, borderColor: border }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
              {visibleLabel}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
          <div className="grid gap-4">
            {renderTextField(`APP_STATE_${state}_LABEL`, {
              half: false,
              help: "Nombre visible para mostrar este estado con una redaccion mas cercana al negocio.",
            })}
            {renderBooleanField(`APP_STATE_${state}_SEND_EMAIL`, {
              help: "Si esta activo, este estado puede disparar un email automaticamente al entrar.",
            })}
            {renderBooleanField(`APP_STATE_${state}_USE_BRANDING`, {
              help: "Activalo para usar el diseño visual de emails en este estado.",
            })}
            {renderTextField(`APP_STATE_${state}_EMAIL_CC`, {
              half: false,
              help: "Copia interna opcional para este estado.",
            })}
            {renderTextField(`APP_STATE_${state}_EMAIL_SUBJECT`, {
              half: false,
              help: "Asunto sugerido del email de este estado.",
            })}
            {renderTextField(`APP_STATE_${state}_EMAIL_BODY`, {
              half: false,
              rows: 7,
              help: "Mensaje editable con variables. Piensa este texto como la comunicacion oficial de esta etapa.",
            })}
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {renderColorField(`APP_STATE_${state}_COLOR_BG`)}
              {renderColorField(`APP_STATE_${state}_COLOR_TEXT`)}
              {renderColorField(`APP_STATE_${state}_COLOR_BORDER`)}
              {renderColorField(`APP_STATE_${state}_COLOR_DOT`)}
            </div>
            {renderEmailPreview({
              id: `preview-${state}`,
              title,
              description: "",
              eyebrow: "Estado",
              subjectKey: `APP_STATE_${state}_EMAIL_SUBJECT`,
              bodyKey: `APP_STATE_${state}_EMAIL_BODY`,
              ccKey: `APP_STATE_${state}_EMAIL_CC`,
              brandingKey: `APP_STATE_${state}_USE_BRANDING`,
            })}
          </div>
        </div>
      </section>
    );
  }

  function renderHelpContent() {
    const cards = [
      {
        title: "Si quieres cambiar como se ve la tienda",
        text: "Entra en Web / Tienda. Ahi ajustas logo, hero, horarios, contacto, redes, textos y sincronizacion visual.",
      },
      {
        title: "Si quieres cambiar como compra el cliente",
        text: "Entra en Proceso de compra. Ahi controlas stock, validaciones, reservas, impuestos y reglas del formulario.",
      },
      {
        title: "Si quieres cambiar cobros y alternativas",
        text: "Entra en Pagos. Ahi ajustas Mercado Pago, reintentos y la alternativa de retiro con pago local.",
      },
      {
        title: "Si quieres cambiar mensajes o branding de emails",
        text: "Entra en Emails. Ahi editas asuntos, cuerpos, copias internas, branding visual y la entrega SMTP.",
      },
      {
        title: "Si quieres cambiar colores o nombre de un estado",
        text: "Entra en Estados del pedido. Ahi se personaliza como se ve y como comunica cada etapa.",
      },
      {
        title: "Antes de guardar",
        text: "Revisa si el cambio afecta lo visual, la operacion comercial o el envio de emails. Guarda solo cuando termines ese bloque.",
      },
    ];

    if (
      deferredQuery &&
      !cards.some((card) =>
        `${card.title} ${card.text}`.toLowerCase().includes(deferredQuery),
      )
    ) {
      return null;
    }

    return (
      <div className="grid gap-6">
        {cards.map((card) => (
          <section
            key={card.title}
            className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-6 shadow-sm"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Referencia rapida
            </div>
            <h3 className="mt-2 text-xl font-semibold text-[color:var(--admin-title)]">{card.title}</h3>
            <p className="mt-3 text-sm leading-6 text-[color:var(--admin-text)]">{card.text}</p>
          </section>
        ))}
      </div>
    );
  }

  function renderCurrentSection() {
    switch (currentSection) {
      case "negocio":
        return (
          <div className="space-y-6">
            {renderInfoPanel(
              "Identidad y presencia comercial",
              "Todo lo que define la apariencia general de la tienda: marca, portada, mensaje de bienvenida y tono comercial.",
              renderFieldGrid(
                [
                  "NEXT_PUBLIC_STORE_NAME",
                  "NEXT_PUBLIC_STORE_TAGLINE",
                  "NEXT_PUBLIC_STORE_WELCOME_MESSAGE",
                  "NEXT_PUBLIC_STORE_LOGO_URL",
                  "NEXT_PUBLIC_HERO_IMAGE_URL",
                ],
                {
                  overrides: {
                    NEXT_PUBLIC_STORE_WELCOME_MESSAGE: { rows: 5, half: false },
                  },
                },
              ),
            )}

            {renderInfoPanel(
              "Contacto y confianza",
              "Estos datos sostienen la atencion al cliente y aparecen en puntos clave de la web y de los emails.",
              renderFieldGrid(
                [
                  "NEXT_PUBLIC_STORE_ADDRESS",
                  "NEXT_PUBLIC_STORE_HOURS",
                  "NEXT_PUBLIC_SUPPORT_PHONE",
                  "NEXT_PUBLIC_SUPPORT_EMAIL",
                  "NEXT_PUBLIC_SUPPORT_WHATSAPP",
                  "NEXT_PUBLIC_FACEBOOK_URL",
                  "NEXT_PUBLIC_INSTAGRAM_URL",
                  "NEXT_PUBLIC_SUPPORT_BLURB",
                ],
                {
                  overrides: {
                    NEXT_PUBLIC_STORE_ADDRESS: { rows: 4, half: false },
                    NEXT_PUBLIC_STORE_HOURS: { rows: 4, half: false },
                    NEXT_PUBLIC_SUPPORT_BLURB: { rows: 5, half: false },
                  },
                },
              ),
            )}

            {renderInfoPanel(
              "Catalogo, imagenes y origen visual",
              "Aqui controlas desde donde salen las imagenes del catalogo y si quieres sincronizar recursos visuales externos.",
              renderFieldGrid([
                "NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL",
                "ODOO_SHOP_URL",
                "ODOO_SYNC_IMAGES",
                "ODOO_MAX_PAGES",
              ]),
            )}
          </div>
        );

      case "checkout":
        return (
          <div className="space-y-6">
            {renderInfoPanel(
              "Reglas de compra",
              "Usa este bloque para decidir que valida la tienda cuando el cliente confirma el pedido y como se comporta el formulario.",
              renderFieldGrid([
                "APP_ALLOW_PICKUP_CHECKOUT_WITHOUT_ADDRESS",
                "APP_VALIDATE_STOCK_ON_CHECKOUT",
                "APP_VALIDATE_PRICE_CLASS_ON_CHECKOUT",
                "APP_ALLOW_BACKORDERS",
                "NEXT_PUBLIC_SHOW_OUT_OF_STOCK",
              ]),
            )}

            {renderInfoPanel(
              "Reserva, stock y operacion inicial",
              "Estas opciones afectan la reserva comercial, el movimiento de stock y la cantidad de productos que la tienda trabaja.",
              renderFieldGrid([
                "APP_WRITE_STOCK_MOVEMENTS",
                "APP_STOCK_RESERVATION_HOURS",
                "APP_PRODUCT_LIMIT",
                "APP_PRICE_COLUMN",
                "APP_STOCK_DEPOSIT_ID",
              ]),
            )}

            {renderInfoPanel(
              "Configuracion avanzada de importes",
              "Sirve para controlar impuestos y criterios base de precio sin tocar codigo.",
              renderFieldGrid(["APP_DEFAULT_TAX_RATE", "APP_PRICES_INCLUDE_TAX"]),
            )}

            {renderInfoPanel(
              "Mensajes del inicio de compra",
              "El email de pedido recibido se configura en la seccion Emails para mantener toda la comunicacion en un solo lugar.",
            )}
          </div>
        );

      case "pagos":
        return (
          <div className="space-y-6">
            {renderInfoPanel(
              "Cobro online",
              "Configuracion principal de Mercado Pago. Mezcla credenciales, retorno del pedido y reglas generales del cobro web.",
              renderFieldGrid([
                "APP_MP_ACCESS_TOKEN",
                "APP_PUBLIC_BASE_URL",
                "APP_MP_ORDER_TC",
                "APP_MP_STATEMENT_DESCRIPTOR",
                "APP_MP_BINARY_MODE",
              ]),
            )}

            {renderInfoPanel(
              "Reintentos y alternativa comercial",
              "Esto controla que hacer cuando el pago no se puede iniciar o cuando el negocio necesita sostener la venta por otra via.",
              renderFieldGrid([
                "APP_MAX_PAYMENT_INIT_RETRIES",
                "APP_ALLOW_PICKUP_LOCAL_PAYMENT_ON_MP_FAILURE",
                "APP_PENDING_STOCK_RESERVE_HOURS",
              ]),
            )}

            {renderInfoPanel(
              "Mensajes al cliente",
              "El email cuando falla el inicio del pago se edita en Emails para que todo el contenido comercial quede unificado.",
            )}
          </div>
        );

      case "pedidos":
        return (
          <div className="space-y-6">
            {renderInfoPanel(
              "Flujo de pedidos",
              "Define como trabaja el equipo internamente: aprobacion, facturacion manual, vencimiento del pendiente y descripcion operativa del flujo.",
              renderFieldGrid(
                [
                  "APP_ORDER_MANUAL_APPROVAL",
                  "APP_ORDER_MANUAL_INVOICING",
                  "APP_PENDING_ORDER_TTL_MINUTES",
                  "APP_ORDER_FLOW_DESCRIPTION",
                ],
                {
                  overrides: {
                    APP_ORDER_FLOW_DESCRIPTION: { rows: 5, half: false },
                  },
                },
              ),
            )}

            {renderInfoPanel(
              "Datos comerciales base",
              "Estos campos identifican con que cuenta, usuario y condicion comercial se registra el pedido web en el sistema.",
              renderFieldGrid([
                "APP_PAYMENT_CONDITION",
                "APP_CUSTOMER_ACCOUNT",
                "APP_ORDER_USER",
                "APP_VENDOR_ID",
                "APP_UNEGOCIO",
              ]),
            )}

            {renderInfoPanel(
              "Configuracion avanzada de integracion",
              "Opciones avanzadas del pedido que normalmente revisa un usuario con mas criterio comercial o tecnico.",
              renderFieldGrid([
                "APP_PRICE_LIST_ID",
                "APP_CLASS_PRICE",
                "APP_SALE_REASON_ID",
                "APP_STOCK_REASON_ID",
                "APP_DOCUMENT_TYPE",
                "APP_IVA_CONDITION",
              ]),
            )}
          </div>
        );

      case "retiro-local":
        return (
          <div className="space-y-6">
            {renderInfoPanel(
              "Experiencia del cliente",
              "Esto controla lo que ve o recibe el cliente cuando el pedido pasa a retiro en local.",
              renderFieldGrid(
                ["APP_PICKUP_SCHEDULE", "APP_GENERATE_PICKUP_QR"],
                {
                  overrides: {
                    APP_PICKUP_SCHEDULE: {
                      rows: 4,
                      half: false,
                      help: "Texto comercial de dias y horarios. Si lo dejas vacio, el sistema usa el horario general del local.",
                    },
                  },
                },
              ),
            )}

            {renderInfoPanel(
              "Control en mostrador",
              "Define cuanta trazabilidad quieres pedir al entregar el pedido en el local.",
              renderFieldGrid([
                "APP_REQUIRE_PICKUP_FULL_NAME",
                "APP_REQUIRE_PICKUP_DNI",
                "APP_ALLOW_MANUAL_PICKUP_FINALIZATION",
              ]),
            )}

            {renderInfoPanel(
              "Aclaracion operativa",
              "El medio de pago al retirar se toma desde las cuentas de cobro disponibles en el sistema comercial y se elige al cerrar el retiro.",
            )}
          </div>
        );

      case "emails":
        return (
          <div className="space-y-6">
            {renderVariablePanel()}

            {renderInfoPanel(
              "Branding general",
              "Controla la estetica global de los emails: colores, pie, contacto y textos de los botones.",
              renderFieldGrid(
                [
                  "APP_EMAIL_BRANDING_ENABLED",
                  "APP_EMAIL_PRIMARY_COLOR",
                  "APP_EMAIL_ACCENT_COLOR",
                  "APP_EMAIL_HIGHLIGHT_COLOR",
                  "APP_EMAIL_SHOW_CONTACT_BLOCK",
                  "APP_EMAIL_TRACKING_BUTTON_LABEL",
                  "APP_EMAIL_PICKUP_BUTTON_LABEL",
                  "APP_EMAIL_FOOTER_NOTE",
                ],
                {
                  overrides: {
                    APP_EMAIL_FOOTER_NOTE: { rows: 5, half: false },
                  },
                },
              ),
            )}

            {renderInfoPanel(
              "Entrega SMTP",
              "Aqui defines con que cuenta se envian los emails reales. Hay una cuenta principal y una alternativa de respaldo.",
              <div className="grid gap-6">
                {renderFieldGrid([
                  "SMTP_HOST",
                  "SMTP_PORT",
                  "SMTP_SECURE",
                  "SMTP_TIMEOUT_MS",
                  "SMTP_IGNORE_TLS_ERRORS",
                ])}
                {renderFieldGrid(["SMTP_FROM_NAME", "SMTP_FROM", "SMTP_USER", "SMTP_PASS"])}
                {renderFieldGrid([
                  "SMTP_FALLBACK_FROM_NAME",
                  "SMTP_FALLBACK_FROM",
                  "SMTP_FALLBACK_USER",
                  "SMTP_FALLBACK_PASS",
                ])}
              </div>,
            )}

            {FIXED_EMAIL_EDITORS.map((definition) => renderEmailEditor(definition))}

            {renderInfoPanel(
              "Emails automáticos por estado",
              "Debajo tienes cada estado como un evento editable. Si prefieres, tambien puedes revisar el mismo estado dentro de la seccion Estados del pedido.",
              <div className="grid gap-6">
                {buildStateEmailEditors().map((definition) => renderEmailEditor(definition))}
              </div>,
            )}
          </div>
        );

      case "estados":
        return (
          <div className="space-y-6">
            {ORDER_STATES.map((state) => renderStateEditor(state))}
          </div>
        );

      case "facturacion":
        return (
          <div className="space-y-6">
            {renderInfoPanel(
              "Documento inicial y numeracion",
              "Este bloque concentra el documento base del pedido web y los datos usados para numeracion interna.",
              renderFieldGrid(["APP_ORDER_TC", "APP_ORDER_BRANCH", "APP_ORDER_LETTER"]),
            )}

            {renderInfoPanel(
              "Comportamiento al facturar",
              "Decide si al pasar a facturado quieres comunicar automaticamente segun el tipo de entrega.",
              renderFieldGrid([
                "APP_SEND_FACTURADO_EMAIL_PICKUP",
                "APP_SEND_FACTURADO_EMAIL_SHIPMENT",
              ]),
            )}

            {renderEmailEditor({
              id: "manual-invoice",
              title: "Factura manual",
              description:
                "Este es el email base que usa el modal de factura cuando envias comprobantes manualmente desde el admin.",
              eyebrow: "Documento",
              subjectKey: "APP_INVOICE_EMAIL_SUBJECT",
              bodyKey: "APP_INVOICE_EMAIL_BODY",
              ccKey: "APP_INVOICE_EMAIL_CC",
              brandingKey: "APP_INVOICE_EMAIL_USE_BRANDING",
            })}
          </div>
        );

      case "ayuda":
        return renderHelpContent();

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
              Configuracion del negocio
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--admin-title)]">
              Todo configurable, mejor ordenado
            </h2>
            <p className="mt-3 text-sm leading-6 text-[color:var(--admin-text)]">
              Mantuvimos la idea original del sistema: que casi todo pueda resolverse desde el panel.
              La diferencia es que ahora cada bloque habla en lenguaje de negocio y separa mejor lo comercial, lo visual y lo avanzado.
            </p>
          </div>

          <div className="grid min-w-[220px] gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Bloques
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

      {renderSearchPanel()}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
        <nav
          className="rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-4 shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-hidden"
          aria-label="Secciones de configuracion"
        >
          <div className="px-2 pb-4 pt-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Bloques del negocio
            </div>
            <p className="mt-2 text-sm leading-6 text-[color:var(--admin-text)]">
              Cada bloque esta pensado para una tarea real: tienda, compra online, pagos, pedidos, retiro, emails, estados, documentos y ayuda.
            </p>
          </div>

          <div className="grid gap-3 xl:max-h-[calc(100vh-11rem)] xl:overflow-y-auto xl:pr-1">
            {SECTIONS.map((section) => {
              const active = section.id === currentSection;
              const total = SECTION_KEYS[section.id]?.length || 0;

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
                  <div
                    className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      active ? "text-white/75" : "text-[color:var(--admin-text)]"
                    }`}
                  >
                    {section.eyebrow}
                  </div>
                  <div
                    className={`mt-1 text-sm font-semibold ${
                      active ? "text-white" : "text-[color:var(--admin-title)]"
                    }`}
                  >
                    {section.title}
                  </div>
                  <div
                    className={`mt-1 text-sm leading-6 ${
                      active ? "text-white/82" : "text-[color:var(--admin-text)]"
                    }`}
                  >
                    {section.description}
                  </div>
                  <div
                    className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                      active ? "text-white/75" : "text-[color:var(--admin-text)]"
                    }`}
                  >
                    {total > 0 ? `${total} ajustes` : "Referencia"}
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 space-y-7">
          {renderSectionHero(currentMeta)}
          {renderCurrentSection()}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] p-5 shadow-sm">
            <p className="text-sm leading-6 text-[color:var(--admin-text)]">
              Guarda cuando termines este bloque. Los cambios quedan listos para usarse desde el runtime actual del admin.
            </p>
            <SaveButton />
          </div>
        </div>
      </div>
    </form>
  );
}
