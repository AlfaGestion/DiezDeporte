import "server-only";
import type { CSSProperties } from "react";
import { getStoredSettingValuesByEnvKey } from "@/lib/store-settings";
import type { OrderState, StoredOrder } from "@/lib/types/order";

type OrderStateColorConfig = {
  bg: string;
  text: string;
  border: string;
  dot: string;
};

export type OrderStateAutomationConfig = {
  sendEmailOnEnter: boolean;
  emailSubject: string;
  emailBody: string;
};

export type OrderStateConfig = {
  colors: OrderStateColorConfig;
  automation: OrderStateAutomationConfig;
};

const STATE_THEME_KEYS: Record<OrderState, string> = {
  PENDIENTE: "pendiente",
  APROBADO: "aprobado",
  FACTURADO: "facturado",
  PREPARANDO: "preparando",
  LISTO_PARA_RETIRO: "listo-retiro",
  ENVIADO: "enviado",
  ENTREGADO: "entregado",
  CANCELADO: "cancelado",
  ERROR: "error",
};

const DEFAULT_STATE_CONFIG: Record<OrderState, OrderStateConfig> = {
  PENDIENTE: {
    colors: { bg: "#fff4db", text: "#915d12", border: "#f4d38e", dot: "#dd9a1f" },
    automation: { sendEmailOnEnter: false, emailSubject: "", emailBody: "" },
  },
  APROBADO: {
    colors: { bg: "#e8f3ff", text: "#175d9c", border: "#b9d9f7", dot: "#2f84d8" },
    automation: { sendEmailOnEnter: false, emailSubject: "", emailBody: "" },
  },
  FACTURADO: {
    colors: { bg: "#eef0ff", text: "#4b4fc8", border: "#c9c7fb", dot: "#6a63db" },
    automation: { sendEmailOnEnter: true, emailSubject: "", emailBody: "" },
  },
  PREPARANDO: {
    colors: { bg: "#f2ecff", text: "#6e43c0", border: "#d8c4fb", dot: "#8b5cf6" },
    automation: { sendEmailOnEnter: false, emailSubject: "", emailBody: "" },
  },
  LISTO_PARA_RETIRO: {
    colors: { bg: "#e9f8ee", text: "#1d7a49", border: "#b9e6c7", dot: "#27a85e" },
    automation: { sendEmailOnEnter: true, emailSubject: "", emailBody: "" },
  },
  ENVIADO: {
    colors: { bg: "#e8f7fb", text: "#0f7490", border: "#b8e5f1", dot: "#0891b2" },
    automation: { sendEmailOnEnter: true, emailSubject: "", emailBody: "" },
  },
  ENTREGADO: {
    colors: { bg: "#e8f6ec", text: "#21673d", border: "#b7ddc1", dot: "#2f855a" },
    automation: { sendEmailOnEnter: false, emailSubject: "", emailBody: "" },
  },
  CANCELADO: {
    colors: { bg: "#eef2f6", text: "#546273", border: "#d3dbe5", dot: "#7b8794" },
    automation: { sendEmailOnEnter: false, emailSubject: "", emailBody: "" },
  },
  ERROR: {
    colors: { bg: "#fdeceb", text: "#b33b35", border: "#f5b8b3", dot: "#d64545" },
    automation: { sendEmailOnEnter: false, emailSubject: "", emailBody: "" },
  },
};

function readValue(map: Map<string, string>, key: string, fallback: string) {
  return (map.get(key) ?? fallback).trim() || fallback;
}

function readBoolean(map: Map<string, string>, key: string, fallback: boolean) {
  const rawValue = (map.get(key) ?? "").trim().toLowerCase();

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  return fallback;
}

function buildStateEnvKey(state: OrderState, suffix: string) {
  return `APP_STATE_${state}_${suffix}`;
}

export async function getOrderStateConfigs() {
  const settings = await getStoredSettingValuesByEnvKey();

  return Object.fromEntries(
    (Object.keys(DEFAULT_STATE_CONFIG) as OrderState[]).map((state) => {
      const defaults = DEFAULT_STATE_CONFIG[state];

      return [
        state,
        {
          colors: {
            bg: readValue(settings, buildStateEnvKey(state, "COLOR_BG"), defaults.colors.bg),
            text: readValue(settings, buildStateEnvKey(state, "COLOR_TEXT"), defaults.colors.text),
            border: readValue(
              settings,
              buildStateEnvKey(state, "COLOR_BORDER"),
              defaults.colors.border,
            ),
            dot: readValue(settings, buildStateEnvKey(state, "COLOR_DOT"), defaults.colors.dot),
          },
          automation: {
            sendEmailOnEnter: readBoolean(
              settings,
              buildStateEnvKey(state, "SEND_EMAIL"),
              defaults.automation.sendEmailOnEnter,
            ),
            emailSubject: (settings.get(buildStateEnvKey(state, "EMAIL_SUBJECT")) ?? "").trim(),
            emailBody: (settings.get(buildStateEnvKey(state, "EMAIL_BODY")) ?? "").trim(),
          },
        } satisfies OrderStateConfig,
      ];
    }),
  ) as Record<OrderState, OrderStateConfig>;
}

export async function getOrderStateAutomationConfig(state: OrderState) {
  const configs = await getOrderStateConfigs();
  return configs[state].automation;
}

export async function getAdminOrderStateCssVariables() {
  const configs = await getOrderStateConfigs();
  const style = {} as CSSProperties & Record<string, string>;

  for (const state of Object.keys(configs) as OrderState[]) {
    const themeKey = STATE_THEME_KEYS[state];
    const colors = configs[state].colors;
    style[`--order-state-${themeKey}-bg`] = colors.bg;
    style[`--order-state-${themeKey}-text`] = colors.text;
    style[`--order-state-${themeKey}-border`] = colors.border;
    style[`--order-state-${themeKey}-dot`] = colors.dot;
  }

  return style;
}

export function buildOrderTemplateVariables(order: StoredOrder, state: OrderState, trackingUrl: string | null) {
  return {
    nombre_cliente: order.nombre_cliente,
    numero_pedido: order.numero_pedido,
    estado: state,
    monto_total: new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(order.monto_total),
    tipo_entrega:
      order.metadata.deliveryMethod ||
      (order.tipo_pedido === "envio" ? "Envio a domicilio" : "Retiro en local"),
    link_seguimiento: trackingUrl || "",
    codigo_retiro: order.metadata.pickupCode || "",
  };
}

export function renderOrderTemplate(
  template: string,
  order: StoredOrder,
  state: OrderState,
  trackingUrl: string | null,
) {
  const variables = buildOrderTemplateVariables(order, state, trackingUrl);

  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => {
    const value = variables[key as keyof typeof variables];
    return value == null ? "" : String(value);
  });
}
