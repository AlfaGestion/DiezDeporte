import "server-only";
import { parseBoolean } from "@/lib/commerce";
import { getConnection } from "@/lib/db";
import type { AdminConfigField, AdminConfigFieldType } from "@/lib/types";
import { ORDER_STATES, type OrderState } from "@/lib/types/order";

export const STORE_CONFIG_GROUP = "TiendaWeb";

type StoreSettingDefinition = {
  key: string;
  configKey: string;
  label: string;
  description: string;
  section: string;
  group?: string;
  type: AdminConfigFieldType;
  placeholder?: string;
  fallback?: string;
};

type ConfigRow = {
  CLAVE: string;
  VALOR: string;
};

type OrderStateVisualDefaults = {
  bg: string;
  text: string;
  border: string;
  dot: string;
  sendEmail: boolean;
};

const ORDER_STATE_LABELS: Record<OrderState, string> = {
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

const ORDER_STATE_VISUAL_DEFAULTS: Record<OrderState, OrderStateVisualDefaults> = {
  PENDIENTE: {
    bg: "#fff4db",
    text: "#915d12",
    border: "#f4d38e",
    dot: "#dd9a1f",
    sendEmail: false,
  },
  APROBADO: {
    bg: "#e8f3ff",
    text: "#175d9c",
    border: "#b9d9f7",
    dot: "#2f84d8",
    sendEmail: false,
  },
  FACTURADO: {
    bg: "#eef0ff",
    text: "#4b4fc8",
    border: "#c9c7fb",
    dot: "#6a63db",
    sendEmail: true,
  },
  PREPARANDO: {
    bg: "#f2ecff",
    text: "#6e43c0",
    border: "#d8c4fb",
    dot: "#8b5cf6",
    sendEmail: false,
  },
  LISTO_PARA_RETIRO: {
    bg: "#e9f8ee",
    text: "#1d7a49",
    border: "#b9e6c7",
    dot: "#27a85e",
    sendEmail: true,
  },
  ENVIADO: {
    bg: "#e8f7fb",
    text: "#0f7490",
    border: "#b8e5f1",
    dot: "#0891b2",
    sendEmail: true,
  },
  ENTREGADO: {
    bg: "#e8f6ec",
    text: "#21673d",
    border: "#b7ddc1",
    dot: "#2f855a",
    sendEmail: false,
  },
  CANCELADO: {
    bg: "#eef2f6",
    text: "#546273",
    border: "#d3dbe5",
    dot: "#7b8794",
    sendEmail: false,
  },
  ERROR: {
    bg: "#fdeceb",
    text: "#b33b35",
    border: "#f5b8b3",
    dot: "#d64545",
    sendEmail: false,
  },
};

function buildStateConfigKey(state: OrderState, suffix: string) {
  return `Estado${state}${suffix}`;
}

function buildStateEnvKey(state: OrderState, suffix: string) {
  return `APP_STATE_${state}_${suffix}`;
}

const WEB_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  {
    key: "NEXT_PUBLIC_STORE_NAME",
    configKey: "StoreName",
    label: "Nombre del local",
    description: "Nombre visible en la web publica, mails y metadata del sitio.",
    section: "Configuracion web",
    group: "Identidad",
    type: "text",
    fallback: "Diez Deportes",
  },
  {
    key: "NEXT_PUBLIC_STORE_TAGLINE",
    configKey: "StoreTagline",
    label: "Bajada comercial",
    description: "Texto corto debajo del nombre del local o en la portada.",
    section: "Configuracion web",
    group: "Identidad",
    type: "text",
    fallback: "Equipamiento deportivo con stock real y pedido directo",
  },
  {
    key: "NEXT_PUBLIC_STORE_LOGO_URL",
    configKey: "StoreLogoUrl",
    label: "Logo",
    description: "Ruta local o URL del logo principal de la web.",
    section: "Configuracion web",
    group: "Identidad",
    type: "text",
    placeholder: "/branding/logo-diez-deportes.png",
  },
  {
    key: "NEXT_PUBLIC_HERO_IMAGE_URL",
    configKey: "StoreHeroUrl",
    label: "Banner o fondo principal",
    description: "Imagen destacada de la home.",
    section: "Configuracion web",
    group: "Identidad",
    type: "text",
    placeholder: "/branding/hero-home.webp",
  },
  {
    key: "NEXT_PUBLIC_STORE_ADDRESS",
    configKey: "StoreAddress",
    label: "Direccion del local",
    description: "Direccion visible para retiro y contacto comercial.",
    section: "Configuracion web",
    group: "Contacto",
    type: "textarea",
    fallback: "Castelli, Av. Sarmiento esq, R8430 El Bolson, Rio Negro.",
  },
  {
    key: "NEXT_PUBLIC_SUPPORT_PHONE",
    configKey: "StorePhone",
    label: "Telefono",
    description: "Telefono principal para consultas.",
    section: "Configuracion web",
    group: "Contacto",
    type: "text",
    fallback: "+54 9 294 467-4525",
  },
  {
    key: "NEXT_PUBLIC_SUPPORT_EMAIL",
    configKey: "StoreEmail",
    label: "Email de contacto",
    description: "Email visible en la web publica y soporte comercial.",
    section: "Configuracion web",
    group: "Contacto",
    type: "text",
    fallback: "deportes10elbolson@yahoo.com.ar",
  },
  {
    key: "NEXT_PUBLIC_SUPPORT_WHATSAPP",
    configKey: "StoreWhatsapp",
    label: "WhatsApp",
    description: "Link de WhatsApp para atencion rapida.",
    section: "Configuracion web",
    group: "Contacto",
    type: "text",
    placeholder: "https://wa.me/549...",
  },
  {
    key: "NEXT_PUBLIC_FACEBOOK_URL",
    configKey: "StoreFacebookUrl",
    label: "Facebook",
    description: "Link publico a Facebook.",
    section: "Configuracion web",
    group: "Redes y textos",
    type: "text",
  },
  {
    key: "NEXT_PUBLIC_INSTAGRAM_URL",
    configKey: "StoreInstagramUrl",
    label: "Instagram",
    description: "Link publico a Instagram.",
    section: "Configuracion web",
    group: "Redes y textos",
    type: "text",
  },
  {
    key: "NEXT_PUBLIC_SUPPORT_BLURB",
    configKey: "StoreSupportBlurb",
    label: "Texto de ayuda",
    description: "Texto comercial o institucional visible en la web.",
    section: "Configuracion web",
    group: "Redes y textos",
    type: "textarea",
    fallback:
      "En Diez Deportes trabajamos para ofrecerte atencion personalizada, envios seguros a todo el pais y una experiencia de compra simple.",
  },
];

const CHECKOUT_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  {
    key: "APP_ALLOW_BACKORDERS",
    configKey: "PermitirSinStock",
    label: "Permitir vender sin stock",
    description: "Si esta activo, deja vender aunque el stock sea insuficiente.",
    section: "Checkout",
    group: "Validaciones",
    type: "boolean",
    fallback: "false",
  },
  {
    key: "APP_VALIDATE_STOCK_ON_CHECKOUT",
    configKey: "ValidarStockConfirmacion",
    label: "Validar stock al confirmar",
    description: "Revalida stock real antes de crear la NP y antes de iniciar Mercado Pago.",
    section: "Checkout",
    group: "Validaciones",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "APP_VALIDATE_PRICE_CLASS_ON_CHECKOUT",
    configKey: "ValidarPrecioConfirmacion",
    label: "Validar lista de precio",
    description: "Si cambia el precio vigente del articulo, frena el checkout para evitar inconsistencias.",
    section: "Checkout",
    group: "Validaciones",
    type: "boolean",
    fallback: "false",
  },
  {
    key: "APP_ALLOW_PICKUP_CHECKOUT_WITHOUT_ADDRESS",
    configKey: "PermitirRetiroSinDireccion",
    label: "Permitir retiro sin direccion",
    description: "Si esta activo, el checkout de retiro solo exige nombre, email y telefono.",
    section: "Checkout",
    group: "Formulario",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "APP_SEND_ORDER_RECEIVED_EMAIL",
    configKey: "EnviarEmailPedidoRecibido",
    label: "Enviar email de pedido recibido",
    description: "Envia el email inicial cuando la NP queda creada y el checkout ya fue iniciado.",
    section: "Checkout",
    group: "Emails",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "APP_ORDER_RECEIVED_EMAIL_SUBJECT",
    configKey: "PedidoRecibidoSubject",
    label: "Asunto pedido recibido",
    description: "Si queda vacio se usa el asunto por defecto del sistema.",
    section: "Checkout",
    group: "Emails",
    type: "text",
    fallback: "",
  },
  {
    key: "APP_ORDER_RECEIVED_EMAIL_BODY",
    configKey: "PedidoRecibidoBody",
    label: "Cuerpo pedido recibido",
    description: "Variables disponibles: {{nombre_cliente}}, {{numero_pedido}}, {{monto_total}}, {{tipo_entrega}}, {{link_seguimiento}}.",
    section: "Checkout",
    group: "Emails",
    type: "textarea",
    fallback: "",
  },
  {
    key: "APP_WRITE_STOCK_MOVEMENTS",
    configKey: "GrabarStock",
    label: "Grabar movimientos de stock",
    description: "Inserta movimientos en V_MV_Stock al finalizar el pedido.",
    section: "Checkout",
    group: "Operativa",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "NEXT_PUBLIC_SHOW_OUT_OF_STOCK",
    configKey: "MostrarSinStock",
    label: "Mostrar articulos sin stock",
    description: "Si esta activo, el catalogo sigue mostrando articulos agotados.",
    section: "Checkout",
    group: "Operativa",
    type: "boolean",
    fallback: "true",
  },
];

const PAYMENT_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  {
    key: "APP_MP_ACCESS_TOKEN",
    configKey: "Token",
    label: "Token de acceso MP",
    description: "Token privado para crear preferencias y consultar pagos.",
    section: "Pagos",
    group: "Mercado Pago",
    type: "password",
    placeholder: "APP_USR-...",
  },
  {
    key: "APP_PUBLIC_BASE_URL",
    configKey: "PublicBaseUrl",
    label: "URL publica",
    description: "Base publica usada por back URLs, webhook y links al pedido.",
    section: "Pagos",
    group: "Mercado Pago",
    type: "text",
    placeholder: "https://tu-dominio.com",
  },
  {
    key: "APP_MP_ORDER_TC",
    configKey: "TcPagosWeb",
    label: "TC pagos web",
    description: "Opcional. Si queda vacio usa APP_ORDER_TC.",
    section: "Pagos",
    group: "Mercado Pago",
    type: "text",
    placeholder: "NP",
  },
  {
    key: "APP_MP_STATEMENT_DESCRIPTOR",
    configKey: "DescriptorMercadoPago",
    label: "Descriptor",
    description: "Texto corto que puede aparecer en el resumen del pago.",
    section: "Pagos",
    group: "Mercado Pago",
    type: "text",
    placeholder: "DIEZDEPORTES",
  },
  {
    key: "APP_MP_BINARY_MODE",
    configKey: "BinaryMode",
    label: "Modo binario",
    description: "Cuando esta activo, Mercado Pago simplifica los estados posibles.",
    section: "Pagos",
    group: "Mercado Pago",
    type: "boolean",
    fallback: "false",
  },
  {
    key: "APP_MAX_PAYMENT_INIT_RETRIES",
    configKey: "MaxReintentosInicioPago",
    label: "Maximo de reintentos",
    description: "Cuantas veces se puede reintentar crear la preferencia para un pedido ya existente.",
    section: "Pagos",
    group: "Fallos y reintentos",
    type: "text",
    fallback: "3",
    placeholder: "3",
  },
  {
    key: "APP_SEND_PAYMENT_INIT_FAILURE_EMAIL",
    configKey: "EnviarEmailFalloInicioPago",
    label: "Enviar email si falla el inicio del pago",
    description: "Avisa al cliente cuando la preferencia no pudo crearse por un problema tecnico.",
    section: "Pagos",
    group: "Fallos y reintentos",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "APP_PAYMENT_INIT_FAILURE_EMAIL_SUBJECT",
    configKey: "FalloInicioPagoSubject",
    label: "Asunto fallo de pago",
    description: "Si queda vacio se usa el asunto por defecto.",
    section: "Pagos",
    group: "Fallos y reintentos",
    type: "text",
    fallback: "",
  },
  {
    key: "APP_PAYMENT_INIT_FAILURE_EMAIL_BODY",
    configKey: "FalloInicioPagoBody",
    label: "Cuerpo fallo de pago",
    description: "Variables disponibles: {{nombre_cliente}}, {{numero_pedido}}, {{link_seguimiento}}, {{tipo_entrega}}.",
    section: "Pagos",
    group: "Fallos y reintentos",
    type: "textarea",
    fallback: "",
  },
  {
    key: "APP_ALLOW_PICKUP_LOCAL_PAYMENT_ON_MP_FAILURE",
    configKey: "PermitirRetiroPagoLocalFallaMP",
    label: "Permitir retiro y pago local si falla MP",
    description: "Habilita la alternativa comercial para no perder una venta valida.",
    section: "Pagos",
    group: "Fallback comercial",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "APP_PENDING_STOCK_RESERVE_HOURS",
    configKey: "HorasReservaStockPagoPendiente",
    label: "Horas de reserva de stock",
    description: "Cuantas horas se reserva el stock si el cliente pasa a retiro y pago local.",
    section: "Pagos",
    group: "Fallback comercial",
    type: "text",
    fallback: "24",
    placeholder: "24",
  },
];

const ORDER_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  {
    key: "APP_ORDER_TC",
    configKey: "TcPedido",
    label: "TC por defecto",
    description: "Tipo de comprobante general para pedidos web.",
    section: "Pedidos",
    group: "Documento inicial",
    type: "text",
    placeholder: "NP",
    fallback: "NP",
  },
  {
    key: "APP_ORDER_BRANCH",
    configKey: "SucursalPedido",
    label: "Sucursal",
    description: "Sucursal usada al grabar comprobantes y numeracion.",
    section: "Pedidos",
    group: "Documento inicial",
    type: "text",
    placeholder: "9999",
  },
  {
    key: "APP_ORDER_LETTER",
    configKey: "LetraPedido",
    label: "Letra",
    description: "Letra del comprobante interno o NP.",
    section: "Pedidos",
    group: "Documento inicial",
    type: "text",
    placeholder: "X",
  },
  {
    key: "APP_PAYMENT_CONDITION",
    configKey: "CondicionPago",
    label: "Condicion de pago",
    description: "Codigo interno de condicion comercial.",
    section: "Pedidos",
    group: "Workflow",
    type: "text",
    placeholder: "1",
  },
  {
    key: "APP_CUSTOMER_ACCOUNT",
    configKey: "CuentaCliente",
    label: "Cuenta cliente",
    description: "Cuenta por defecto para consumidor final si no viene de configuracion SQL.",
    section: "Pedidos",
    group: "Workflow",
    type: "text",
    placeholder: "000001",
  },
  {
    key: "APP_ORDER_USER",
    configKey: "UsuarioPedido",
    label: "Usuario de grabacion",
    description: "Usuario tecnico registrado en la NP o pedido web.",
    section: "Pedidos",
    group: "Workflow",
    type: "text",
    placeholder: "web-shop",
  },
  {
    key: "APP_PENDING_ORDER_TTL_MINUTES",
    configKey: "MinutosVencimientoPedido",
    label: "Vencimiento impago",
    description: "Minutos maximos para mantener un pedido pendiente sin pago confirmado.",
    section: "Pedidos",
    group: "Workflow",
    type: "text",
    placeholder: "120",
    fallback: "120",
  },
];

const PICKUP_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  {
    key: "APP_REQUIRE_PICKUP_FULL_NAME",
    configKey: "RequerirNombreApellidoRetiro",
    label: "Requerir nombre y apellido",
    description: "Pide siempre nombre y apellido de quien retira.",
    section: "Retiro en local",
    group: "Trazabilidad",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "APP_REQUIRE_PICKUP_DNI",
    configKey: "RequerirDniRetiro",
    label: "Requerir DNI",
    description: "Si esta activo, el DNI es obligatorio al registrar la entrega.",
    section: "Retiro en local",
    group: "Trazabilidad",
    type: "boolean",
    fallback: "false",
  },
  {
    key: "APP_ALLOW_MANUAL_PICKUP_FINALIZATION",
    configKey: "PermitirFinalizarRetiroSinDatos",
    label: "Permitir finalizar sin datos",
    description: "Solo usar si el negocio acepta cerrar entregas sin dejar trazabilidad completa.",
    section: "Retiro en local",
    group: "Trazabilidad",
    type: "boolean",
    fallback: "false",
  },
];

const EMAIL_AND_DOCUMENT_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  {
    key: "APP_SEND_FACTURADO_EMAIL_PICKUP",
    configKey: "EnviarEmailFacturadoRetiro",
    label: "Enviar email al facturar retiro",
    description: "Define si el cambio a FACTURADO envia email automatico en pedidos de retiro.",
    section: "Facturacion y documentos",
    group: "Email automatico de facturado",
    type: "boolean",
    fallback: "false",
  },
  {
    key: "APP_SEND_FACTURADO_EMAIL_SHIPMENT",
    configKey: "EnviarEmailFacturadoEnvio",
    label: "Enviar email al facturar envio",
    description: "Define si el cambio a FACTURADO envia email automatico en pedidos de envio.",
    section: "Facturacion y documentos",
    group: "Email automatico de facturado",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "APP_INVOICE_EMAIL_SUBJECT",
    configKey: "FacturaEmailSubject",
    label: "Asunto por defecto de factura",
    description: "Asunto sugerido para el envio manual de factura.",
    section: "Facturacion y documentos",
    group: "Factura manual",
    type: "text",
    fallback: "Factura de tu pedido NP {{numero_pedido}}",
  },
  {
    key: "APP_INVOICE_EMAIL_BODY",
    configKey: "FacturaEmailBody",
    label: "Cuerpo por defecto de factura",
    description: "Variables disponibles: {{nombre_cliente}}, {{numero_pedido}}, {{monto_total}}, {{tipo_entrega}}, {{link_seguimiento}}.",
    section: "Facturacion y documentos",
    group: "Factura manual",
    type: "textarea",
    fallback:
      "Hola {{nombre_cliente}},\n\nTe enviamos la factura correspondiente a tu pedido NP {{numero_pedido}}.\nAdjuntamos el comprobante en este email.\n\nGracias por comprar en Diez Deportes.",
  },
];

const ORDER_STATE_SETTING_DEFINITIONS: StoreSettingDefinition[] = ORDER_STATES.flatMap(
  (state) => {
    const defaults = ORDER_STATE_VISUAL_DEFAULTS[state];
    const group = ORDER_STATE_LABELS[state];

    return [
      {
        key: buildStateEnvKey(state, "COLOR_BG"),
        configKey: buildStateConfigKey(state, "ColorBg"),
        label: "Color de fondo",
        description: "Fondo del badge y del timeline.",
        section: "Estados",
        group,
        type: "color" as const,
        fallback: defaults.bg,
      },
      {
        key: buildStateEnvKey(state, "COLOR_TEXT"),
        configKey: buildStateConfigKey(state, "ColorText"),
        label: "Color de texto",
        description: "Color principal del texto del estado.",
        section: "Estados",
        group,
        type: "color" as const,
        fallback: defaults.text,
      },
      {
        key: buildStateEnvKey(state, "COLOR_BORDER"),
        configKey: buildStateConfigKey(state, "ColorBorder"),
        label: "Color de borde",
        description: "Borde del badge y codigo corto del timeline.",
        section: "Estados",
        group,
        type: "color" as const,
        fallback: defaults.border,
      },
      {
        key: buildStateEnvKey(state, "COLOR_DOT"),
        configKey: buildStateConfigKey(state, "ColorDot"),
        label: "Color de punto",
        description: "Punto o acento visual del estado.",
        section: "Estados",
        group,
        type: "color" as const,
        fallback: defaults.dot,
      },
      {
        key: buildStateEnvKey(state, "SEND_EMAIL"),
        configKey: buildStateConfigKey(state, "SendEmail"),
        label: "Enviar email al entrar",
        description: "Si queda activo, al entrar a este estado se revisa el asunto y cuerpo configurados.",
        section: "Emails",
        group,
        type: "boolean" as const,
        fallback: defaults.sendEmail ? "true" : "false",
      },
      {
        key: buildStateEnvKey(state, "EMAIL_SUBJECT"),
        configKey: buildStateConfigKey(state, "EmailSubject"),
        label: "Asunto",
        description: "Si queda vacio se usa el contenido por defecto del sistema.",
        section: "Emails",
        group,
        type: "text" as const,
        fallback: "",
      },
      {
        key: buildStateEnvKey(state, "EMAIL_BODY"),
        configKey: buildStateConfigKey(state, "EmailBody"),
        label: "Cuerpo",
        description: "Variables disponibles: {{nombre_cliente}}, {{numero_pedido}}, {{estado}}, {{monto_total}}, {{tipo_entrega}}, {{link_seguimiento}}, {{codigo_retiro}}.",
        section: "Emails",
        group,
        type: "textarea" as const,
        fallback: "",
      },
    ] satisfies StoreSettingDefinition[];
  },
);

export const STORE_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  ...WEB_SETTING_DEFINITIONS,
  ...CHECKOUT_SETTING_DEFINITIONS,
  ...PAYMENT_SETTING_DEFINITIONS,
  ...ORDER_SETTING_DEFINITIONS,
  ...PICKUP_SETTING_DEFINITIONS,
  ...EMAIL_AND_DOCUMENT_SETTING_DEFINITIONS,
  ...ORDER_STATE_SETTING_DEFINITIONS,
];

function setInput(
  request: { input(name: string, value: unknown): unknown },
  name: string,
  value: unknown,
) {
  request.input(name, value);
}

async function readStoreConfigRows() {
  const pool = await getConnection();
  const request = pool.request();
  const configKeys = STORE_SETTING_DEFINITIONS.map((definition) => definition.configKey);

  setInput(request, "group", STORE_CONFIG_GROUP);
  configKeys.forEach((configKey, index) => {
    setInput(request, `key${index}`, configKey);
  });

  const placeholders = configKeys.map((_, index) => `@key${index}`).join(", ");
  const result = await request.query<ConfigRow>(`
    IF OBJECT_ID('dbo.TA_CONFIGURACION', 'U') IS NOT NULL
    BEGIN
      SELECT LTRIM(RTRIM(CLAVE)) AS CLAVE, ISNULL(VALOR, '') AS VALOR
      FROM dbo.TA_CONFIGURACION WITH (NOLOCK)
      WHERE LTRIM(RTRIM(ISNULL(GRUPO, ''))) = @group
        AND LTRIM(RTRIM(CLAVE)) IN (${placeholders});
    END
    ELSE
    BEGIN
      SELECT CAST('' AS nvarchar(100)) AS CLAVE, CAST('' AS nvarchar(max)) AS VALOR
      WHERE 1 = 0;
    END
  `);

  return new Map(
    result.recordset.map((row) => [row.CLAVE.trim(), (row.VALOR || "").trim()]),
  );
}

function resolveRawValue(
  definition: StoreSettingDefinition,
  rows: Map<string, string>,
) {
  return rows.get(definition.configKey) ?? process.env[definition.key] ?? definition.fallback ?? "";
}

export async function getStoredSettingValuesByEnvKey() {
  const rows = await readStoreConfigRows();

  return new Map(
    STORE_SETTING_DEFINITIONS.map((definition) => [
      definition.key,
      resolveRawValue(definition, rows),
    ]),
  );
}

export async function getStoreConfigFields(): Promise<AdminConfigField[]> {
  const rows = await readStoreConfigRows();

  return STORE_SETTING_DEFINITIONS.map((definition) => {
    const rawValue = resolveRawValue(definition, rows);

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      section: definition.section,
      group: definition.group,
      type: definition.type,
      placeholder: definition.placeholder,
      value: definition.type === "boolean" ? parseBoolean(rawValue, false) : rawValue,
    };
  });
}

export function getStoreConfigSections(fields: AdminConfigField[]) {
  const sections = new Map<string, AdminConfigField[]>();

  for (const field of fields) {
    const items = sections.get(field.section) || [];
    items.push(field);
    sections.set(field.section, items);
  }

  return Array.from(sections.entries()).map(([name, items]) => ({
    name,
    fields: items,
  }));
}

export async function saveStoreConfig(formData: FormData) {
  const pool = await getConnection();

  for (const definition of STORE_SETTING_DEFINITIONS) {
    const rawValue =
      definition.type === "boolean"
        ? formData.get(definition.key) === "on"
          ? "true"
          : "false"
        : typeof formData.get(definition.key) === "string"
          ? String(formData.get(definition.key)).trim()
          : "";

    process.env[definition.key] = rawValue;

    const request = pool.request();
    setInput(request, "group", STORE_CONFIG_GROUP);
    setInput(request, "configKey", definition.configKey);
    setInput(request, "value", rawValue);

    await request.query(`
      IF OBJECT_ID('dbo.TA_CONFIGURACION', 'U') IS NULL
      BEGIN
        RAISERROR('No existe dbo.TA_CONFIGURACION.', 16, 1);
        RETURN;
      END

      IF EXISTS (
        SELECT 1
        FROM dbo.TA_CONFIGURACION
        WHERE LTRIM(RTRIM(ISNULL(GRUPO, ''))) = @group
          AND LTRIM(RTRIM(CLAVE)) = @configKey
      )
      BEGIN
        UPDATE dbo.TA_CONFIGURACION
        SET VALOR = @value
        WHERE LTRIM(RTRIM(ISNULL(GRUPO, ''))) = @group
          AND LTRIM(RTRIM(CLAVE)) = @configKey;
      END
      ELSE
      BEGIN
        INSERT INTO dbo.TA_CONFIGURACION (GRUPO, CLAVE, VALOR)
        VALUES (@group, @configKey, @value);
      END
    `);
  }
}
