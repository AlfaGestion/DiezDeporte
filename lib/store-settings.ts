import "server-only";
import { parseBoolean } from "@/lib/commerce";
import { executeStatement, queryRows } from "@/lib/db";
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
    sendEmail: true,
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

function getStateEmailSubjectDefault(state: OrderState) {
  switch (state) {
    case "PENDIENTE":
      return "Recibimos tu pedido";
    case "APROBADO":
      return "Tu pedido ya fue aprobado";
    case "FACTURADO":
      return "Tu pedido fue confirmado";
    case "PREPARANDO":
      return "Estamos preparando tu pedido";
    case "LISTO_PARA_RETIRO":
      return "Tu pedido esta listo para retirar";
    case "ENVIADO":
      return "Tu pedido ya fue enviado";
    case "ENTREGADO":
      return "Tu pedido fue entregado";
    case "CANCELADO":
      return "Actualizacion sobre tu pedido";
    case "ERROR":
      return "Tuvimos un problema con tu pedido";
    default:
      return "";
  }
}

function getStateEmailBodyDefault(state: OrderState) {
  switch (state) {
    case "PENDIENTE":
      return "Hola {{nombre_cliente}},\n\nRecibimos tu pedido {{numero_pedido}} correctamente.\n\nNuestro equipo ya lo esta revisando y te iremos avisando cada novedad por este medio.\n\nPuedes seguir el estado desde aqui:\n{{link_seguimiento}}";
    case "APROBADO":
      return "Hola {{nombre_cliente}},\n\nTu pedido {{numero_pedido}} ya fue aprobado.\n\nEl siguiente paso es avanzar con la preparacion y la facturacion segun corresponda.\n\nPuedes seguir el estado desde aqui:\n{{link_seguimiento}}";
    case "FACTURADO":
      return "Hola {{nombre_cliente}},\n\nTu pedido {{numero_pedido}} fue confirmado correctamente.\n\nEn breve comenzamos a prepararlo para {{tipo_entrega}}.\n\nPuedes seguir el estado desde aqui:\n{{link_seguimiento}}";
    case "PREPARANDO":
      return "Hola {{nombre_cliente}},\n\nYa estamos preparando tu pedido {{numero_pedido}}.\n\nTe avisaremos en cuanto este listo para retirar o salga en camino.\n\nPuedes seguir el estado desde aqui:\n{{link_seguimiento}}";
    case "LISTO_PARA_RETIRO":
      return "Hola {{nombre_cliente}},\n\nTu pedido {{numero_pedido}} ya esta listo para retirar.\n\nCodigo de retiro: {{codigo_retiro}}\nDireccion del local: {{direccion_local}}\nHorario: {{horario_local}}\n\nDebajo encontraras tambien el enlace para abrir tu pedido con el QR.";
    case "ENVIADO":
      return "Hola {{nombre_cliente}},\n\nTu pedido {{numero_pedido}} ya fue despachado.\n\nPronto lo vas a recibir en la direccion indicada.\n\nPuedes seguir el estado desde aqui:\n{{link_seguimiento}}";
    case "ENTREGADO":
      return "Hola {{nombre_cliente}},\n\nTe confirmamos que tu pedido {{numero_pedido}} ya fue entregado.\n\nGracias por confiar en nosotros.";
    case "CANCELADO":
      return "Hola {{nombre_cliente}},\n\nTu pedido {{numero_pedido}} fue cancelado.\n\nSi necesitas volver a gestionarlo o tienes alguna duda, escribenos y te ayudamos.";
    case "ERROR":
      return "Hola {{nombre_cliente}},\n\nTuvimos un inconveniente con tu pedido.\n\nNuestro equipo ya lo esta revisando y te vamos a mantener informado.";
    default:
      return "";
  }
}

type FixedEmailDefinition = {
  keyPrefix: string;
  configPrefix: string;
  baseLabel: string;
  section: string;
  group: string;
  subjectFallback: string;
  bodyFallback: string;
  sendKey?: string;
  sendConfigKey?: string;
  sendLabel?: string;
  sendDescription?: string;
};

function buildFixedEmailDefinitions(input: FixedEmailDefinition) {
  const definitions: StoreSettingDefinition[] = [];

  if (input.sendKey && input.sendConfigKey) {
    definitions.push({
      key: input.sendKey,
      configKey: input.sendConfigKey,
      label: input.sendLabel || `Enviar ${input.baseLabel.toLowerCase()}`,
      description:
        input.sendDescription ||
        "Activa o desactiva el envio automatico de este email sin tocar codigo.",
      section: input.section,
      group: input.group,
      type: "boolean",
      fallback: "true",
    });
  }

  definitions.push(
    {
      key: `${input.keyPrefix}_SUBJECT`,
      configKey: `${input.configPrefix}Subject`,
      label: `Asunto ${input.baseLabel.toLowerCase()}`,
      description: "Si queda vacio se usa el asunto por defecto del sistema.",
      section: input.section,
      group: input.group,
      type: "text",
      fallback: input.subjectFallback,
    },
    {
      key: `${input.keyPrefix}_BODY`,
      configKey: `${input.configPrefix}Body`,
      label: `Cuerpo ${input.baseLabel.toLowerCase()}`,
      description:
        "Variables disponibles: {{nombre_cliente}}, {{numero_pedido}}, {{estado}}, {{monto_total}}, {{tipo_entrega}}, {{link_seguimiento}}, {{codigo_retiro}}, {{link_reintento}}, {{direccion_local}}, {{nombre_local}}, {{horario_local}}, {{email_contacto}}, {{telefono_contacto}}.",
      section: input.section,
      group: input.group,
      type: "textarea",
      fallback: input.bodyFallback,
    },
    {
      key: `${input.keyPrefix}_CC`,
      configKey: `${input.configPrefix}Cc`,
      label: `CC opcional ${input.baseLabel.toLowerCase()}`,
      description: "Puedes agregar uno o varios emails separados por coma para recibir copia.",
      section: input.section,
      group: input.group,
      type: "text",
      placeholder: "ventas@tu-negocio.com, deposito@tu-negocio.com",
    },
    {
      key: `${input.keyPrefix}_USE_BRANDING`,
      configKey: `${input.configPrefix}Branding`,
      label: "Usar branding visual",
      description: "Si esta activo, este email usa el diseño visual configurado para la tienda.",
      section: input.section,
      group: input.group,
      type: "boolean",
      fallback: "true",
    },
  );

  return definitions;
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
    key: "NEXT_PUBLIC_STORE_WELCOME_MESSAGE",
    configKey: "StoreWelcomeMessage",
    label: "Texto de bienvenida",
    description: "Mensaje principal que presenta la tienda al cliente.",
    section: "Configuracion web",
    group: "Identidad",
    type: "textarea",
    fallback:
      "Bienvenido a nuestra tienda online. Compra facil, segura y con atencion personalizada.",
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
    key: "NEXT_PUBLIC_STORE_HOURS",
    configKey: "StoreHours",
    label: "Horarios del local",
    description: "Horarios visibles para atencion, retiro y consultas.",
    section: "Configuracion web",
    group: "Contacto",
    type: "textarea",
    fallback: "Lunes a sabados de 9 a 13 hs y de 16 a 20 hs.",
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
  {
    key: "NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL",
    configKey: "ProductImageBaseUrl",
    label: "Base de imagenes del catalogo",
    description: "URL base si las imagenes de productos se sirven desde otra ubicacion.",
    section: "Configuracion web",
    group: "Catalogo y navegacion",
    type: "text",
    placeholder: "https://cdn.tu-dominio.com/productos",
  },
  {
    key: "ODOO_SHOP_URL",
    configKey: "OdooShopUrl",
    label: "URL del catalogo externo",
    description: "URL publica del catalogo origen usado para tomar banners, marcas o imagenes externas.",
    section: "Configuracion web",
    group: "Catalogo y navegacion",
    type: "text",
    placeholder: "https://tu-catalogo.odoo.com/shop",
  },
  {
    key: "ODOO_SYNC_IMAGES",
    configKey: "OdooSyncImages",
    label: "Sincronizar imagenes externas",
    description: "Si esta activo, la web intenta leer logos, hero, promos y fotos desde el catalogo externo configurado.",
    section: "Configuracion web",
    group: "Catalogo y navegacion",
    type: "boolean",
    fallback: "false",
  },
  {
    key: "ODOO_MAX_PAGES",
    configKey: "OdooMaxPages",
    label: "Paginas maximas a revisar",
    description: "Limite de paginas del catalogo externo a revisar cuando se buscan imagenes o marcas.",
    section: "Configuracion web",
    group: "Catalogo y navegacion",
    type: "text",
    placeholder: "24",
    fallback: "24",
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
    key: "APP_STOCK_RESERVATION_HOURS",
    configKey: "HorasReservaStockCheckout",
    label: "Horas de reserva de stock",
    description: "Tiempo sugerido para mantener reservado el stock del pedido mientras se procesa.",
    section: "Checkout",
    group: "Operativa",
    type: "text",
    fallback: "24",
    placeholder: "24",
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
  {
    key: "APP_PRODUCT_LIMIT",
    configKey: "LimiteProductos",
    label: "Cantidad maxima de productos",
    description: "Limite de productos a cargar en la tienda. Si dejas 0, la web muestra todos los articulos activos.",
    section: "Checkout",
    group: "Configuracion avanzada",
    type: "text",
    fallback: "0",
    placeholder: "0 = todos",
  },
  {
    key: "APP_PRICE_COLUMN",
    configKey: "ColumnaPrecio",
    label: "Columna de precio",
    description: "Define que lista o columna de precio usa la tienda al mostrar los productos.",
    section: "Checkout",
    group: "Configuracion avanzada",
    type: "text",
    fallback: "PRECIO1",
    placeholder: "PRECIO1",
  },
  {
    key: "APP_STOCK_DEPOSIT_ID",
    configKey: "DepositoStock",
    label: "Deposito de stock",
    description: "Deposito que se consulta para validar disponibilidad y grabar movimientos.",
    section: "Checkout",
    group: "Configuracion avanzada",
    type: "text",
    placeholder: "1",
  },
  {
    key: "APP_DEFAULT_TAX_RATE",
    configKey: "TasaIvaDefault",
    label: "IVA por defecto",
    description: "Porcentaje de IVA usado como valor general cuando hace falta calcular importes.",
    section: "Checkout",
    group: "Configuracion avanzada",
    type: "text",
    fallback: "21",
    placeholder: "21",
  },
  {
    key: "APP_PRICES_INCLUDE_TAX",
    configKey: "PreciosIncluyenIva",
    label: "Los precios incluyen IVA",
    description: "Indica si los precios base que usa la tienda ya incluyen impuestos.",
    section: "Checkout",
    group: "Configuracion avanzada",
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
    key: "APP_ORDER_MANUAL_APPROVAL",
    configKey: "AprobacionManualPedidos",
    label: "Aprobacion manual",
    description: "Si esta activo, el negocio revisa y aprueba los pedidos antes de seguir.",
    section: "Pedidos",
    group: "Workflow",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "APP_ORDER_MANUAL_INVOICING",
    configKey: "FacturacionManualPedidos",
    label: "Facturacion manual",
    description: "Si esta activo, la facturacion queda a cargo del equipo del local.",
    section: "Pedidos",
    group: "Workflow",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "APP_ORDER_FLOW_DESCRIPTION",
    configKey: "DescripcionFlujoPedidos",
    label: "Como quieres trabajar los pedidos",
    description: "Resumen interno para recordar como usa el negocio el flujo del admin.",
    section: "Pedidos",
    group: "Workflow",
    type: "textarea",
    fallback:
      "Revisamos el pedido, confirmamos pago o stock si hace falta y luego avanzamos a facturacion y preparacion.",
  },
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
  {
    key: "APP_VENDOR_ID",
    configKey: "VendedorPedido",
    label: "Vendedor",
    description: "Codigo interno del vendedor que queda asociado al pedido.",
    section: "Pedidos",
    group: "Configuracion avanzada",
    type: "text",
    placeholder: "9999",
    fallback: "9999",
  },
  {
    key: "APP_UNEGOCIO",
    configKey: "UnidadNegocio",
    label: "Unidad de negocio",
    description: "Unidad o negocio interno con el que se registra el pedido.",
    section: "Pedidos",
    group: "Configuracion avanzada",
    type: "text",
    placeholder: "1",
  },
  {
    key: "APP_PRICE_LIST_ID",
    configKey: "ListaPrecioPedido",
    label: "Lista de precio",
    description: "Lista de precio comercial que se usa al crear el pedido.",
    section: "Pedidos",
    group: "Configuracion avanzada",
    type: "text",
    placeholder: "1",
    fallback: "1",
  },
  {
    key: "APP_CLASS_PRICE",
    configKey: "ClasePrecioPedido",
    label: "Clase de precio",
    description: "Clase o categoria de precio usada para la operacion comercial.",
    section: "Pedidos",
    group: "Configuracion avanzada",
    type: "text",
    placeholder: "1",
    fallback: "1",
  },
  {
    key: "APP_SALE_REASON_ID",
    configKey: "MotivoVentaPedido",
    label: "Motivo de venta",
    description: "Motivo comercial asignado al pedido al grabarlo.",
    section: "Pedidos",
    group: "Configuracion avanzada",
    type: "text",
    placeholder: "1",
    fallback: "1",
  },
  {
    key: "APP_STOCK_REASON_ID",
    configKey: "MotivoStockPedido",
    label: "Motivo de stock",
    description: "Motivo de stock aplicado si el pedido genera movimientos.",
    section: "Pedidos",
    group: "Configuracion avanzada",
    type: "text",
    placeholder: "1",
    fallback: "1",
  },
  {
    key: "APP_DOCUMENT_TYPE",
    configKey: "TipoDocumentoPedido",
    label: "Tipo de documento",
    description: "Tipo de documento comercial usado al registrar al cliente o el comprobante.",
    section: "Pedidos",
    group: "Configuracion avanzada",
    type: "text",
    placeholder: "1",
    fallback: "1",
  },
  {
    key: "APP_IVA_CONDITION",
    configKey: "CondicionIvaPedido",
    label: "Condicion de IVA",
    description: "Condicion impositiva general aplicada al pedido web.",
    section: "Pedidos",
    group: "Configuracion avanzada",
    type: "text",
    placeholder: "1",
    fallback: "1",
  },
];

const PICKUP_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  {
    key: "APP_PICKUP_SCHEDULE",
    configKey: "RetiroDiasHorarios",
    label: "Dias y horarios para retirar",
    description: "Texto que se envia al cliente cuando el pedido esta listo. Si queda vacio, se usa el horario general del local.",
    section: "Retiro en local",
    group: "Disponibilidad",
    type: "textarea",
    placeholder: "Lunes a viernes de 9 a 13 hs y de 16 a 20 hs. Sabados de 9 a 13 hs.",
  },
  {
    key: "APP_GENERATE_PICKUP_QR",
    configKey: "GenerarQrRetiro",
    label: "Generar QR",
    description: "Crea automaticamente un QR para mostrar al retirar en el local.",
    section: "Retiro en local",
    group: "Trazabilidad",
    type: "boolean",
    fallback: "true",
  },
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

const EMAIL_BRANDING_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  {
    key: "APP_EMAIL_BRANDING_ENABLED",
    configKey: "EmailBrandingEnabled",
    label: "Usar branding visual",
    description: "Si esta activo, los emails se envian con diseño visual del local y bloques destacados.",
    section: "Emails",
    group: "Branding general",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "APP_EMAIL_PRIMARY_COLOR",
    configKey: "EmailPrimaryColor",
    label: "Color principal",
    description: "Color principal del encabezado y botones.",
    section: "Emails",
    group: "Branding general",
    type: "color",
    fallback: "#0f172a",
  },
  {
    key: "APP_EMAIL_ACCENT_COLOR",
    configKey: "EmailAccentColor",
    label: "Color secundario",
    description: "Color secundario usado para gradientes y acentos.",
    section: "Emails",
    group: "Branding general",
    type: "color",
    fallback: "#1d4ed8",
  },
  {
    key: "APP_EMAIL_HIGHLIGHT_COLOR",
    configKey: "EmailHighlightColor",
    label: "Color de destacados",
    description: "Color usado para bloques positivos o de accion destacada.",
    section: "Emails",
    group: "Branding general",
    type: "color",
    fallback: "#15803d",
  },
  {
    key: "APP_EMAIL_SHOW_CONTACT_BLOCK",
    configKey: "EmailShowContactBlock",
    label: "Mostrar bloque de contacto",
    description: "Agrega email, telefono, direccion y horarios del local al pie del mensaje.",
    section: "Emails",
    group: "Branding general",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "APP_EMAIL_FOOTER_NOTE",
    configKey: "EmailFooterNote",
    label: "Texto del pie",
    description: "Mensaje final que se muestra al pie de todos los emails con branding.",
    section: "Emails",
    group: "Branding general",
    type: "textarea",
    fallback:
      "Gracias por elegirnos. Si necesitas ayuda, responde este email o contactanos por nuestros canales habituales.",
  },
  {
    key: "APP_EMAIL_TRACKING_BUTTON_LABEL",
    configKey: "EmailTrackingButtonLabel",
    label: "Texto del boton de seguimiento",
    description: "Texto del boton principal para abrir el estado del pedido.",
    section: "Emails",
    group: "Branding general",
    type: "text",
    fallback: "Seguir mi pedido",
  },
  {
    key: "APP_EMAIL_PICKUP_BUTTON_LABEL",
    configKey: "EmailPickupButtonLabel",
    label: "Texto del boton de retiro",
    description: "Texto del boton principal para ver el pedido y el QR de retiro.",
    section: "Emails",
    group: "Branding general",
    type: "text",
    fallback: "Ver mi pedido y QR",
  },
];

const SMTP_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  {
    key: "SMTP_HOST",
    configKey: "SmtpHost",
    label: "Servidor SMTP",
    description: "Host del servidor de correo usado para enviar emails transaccionales.",
    section: "Emails",
    group: "Entrega tecnica",
    type: "text",
    placeholder: "smtp.gmail.com",
  },
  {
    key: "SMTP_PORT",
    configKey: "SmtpPort",
    label: "Puerto SMTP",
    description: "Puerto del servidor de correo.",
    section: "Emails",
    group: "Entrega tecnica",
    type: "text",
    placeholder: "587",
    fallback: "587",
  },
  {
    key: "SMTP_SECURE",
    configKey: "SmtpSecure",
    label: "Usar conexion segura",
    description: "Activalo si tu proveedor requiere conexion SSL/TLS desde el inicio.",
    section: "Emails",
    group: "Entrega tecnica",
    type: "boolean",
    fallback: "false",
  },
  {
    key: "SMTP_TIMEOUT_MS",
    configKey: "SmtpTimeoutMs",
    label: "Tiempo maximo de espera",
    description: "Milisegundos maximos antes de cortar un intento de envio.",
    section: "Emails",
    group: "Entrega tecnica",
    type: "text",
    placeholder: "8000",
    fallback: "8000",
  },
  {
    key: "SMTP_IGNORE_TLS_ERRORS",
    configKey: "SmtpIgnoreTlsErrors",
    label: "Ignorar errores TLS",
    description: "Solo usalo si tu proveedor lo necesita para completar la conexion.",
    section: "Emails",
    group: "Entrega tecnica",
    type: "boolean",
    fallback: "true",
  },
  {
    key: "SMTP_FROM_NAME",
    configKey: "SmtpFromName",
    label: "Nombre visible del remitente",
    description: "Nombre que ve el cliente como remitente principal.",
    section: "Emails",
    group: "Cuenta principal",
    type: "text",
    fallback: "Diez Deportes",
  },
  {
    key: "SMTP_FROM",
    configKey: "SmtpFrom",
    label: "Email visible del remitente",
    description: "Direccion visible del remitente principal.",
    section: "Emails",
    group: "Cuenta principal",
    type: "text",
    placeholder: "ventas@tu-negocio.com",
  },
  {
    key: "SMTP_USER",
    configKey: "SmtpUser",
    label: "Usuario SMTP",
    description: "Usuario o cuenta para autenticarse en el servidor SMTP principal.",
    section: "Emails",
    group: "Cuenta principal",
    type: "text",
    placeholder: "ventas@tu-negocio.com",
  },
  {
    key: "SMTP_PASS",
    configKey: "SmtpPass",
    label: "Clave SMTP",
    description: "Clave o password de aplicacion del remitente principal.",
    section: "Emails",
    group: "Cuenta principal",
    type: "password",
  },
  {
    key: "SMTP_FALLBACK_FROM_NAME",
    configKey: "SmtpFallbackFromName",
    label: "Nombre visible alternativo",
    description: "Nombre que usa la cuenta alternativa si el primer envio falla.",
    section: "Emails",
    group: "Cuenta alternativa",
    type: "text",
    fallback: "Diez Deportes",
  },
  {
    key: "SMTP_FALLBACK_FROM",
    configKey: "SmtpFallbackFrom",
    label: "Email visible alternativo",
    description: "Direccion visible de la cuenta alternativa.",
    section: "Emails",
    group: "Cuenta alternativa",
    type: "text",
    placeholder: "respaldo@tu-negocio.com",
  },
  {
    key: "SMTP_FALLBACK_USER",
    configKey: "SmtpFallbackUser",
    label: "Usuario SMTP alternativo",
    description: "Usuario o cuenta para autenticarse en el servidor SMTP alternativo.",
    section: "Emails",
    group: "Cuenta alternativa",
    type: "text",
    placeholder: "respaldo@tu-negocio.com",
  },
  {
    key: "SMTP_FALLBACK_PASS",
    configKey: "SmtpFallbackPass",
    label: "Clave SMTP alternativa",
    description: "Clave o password de aplicacion de la cuenta alternativa.",
    section: "Emails",
    group: "Cuenta alternativa",
    type: "password",
  },
];

const EMAIL_AND_DOCUMENT_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  ...buildFixedEmailDefinitions({
    keyPrefix: "APP_ORDER_RECEIVED_EMAIL",
    configPrefix: "PedidoRecibido",
    baseLabel: "pedido recibido",
    section: "Emails",
    group: "Pedido recibido",
    sendKey: "APP_SEND_ORDER_RECEIVED_EMAIL",
    sendConfigKey: "EnviarEmailPedidoRecibido",
    sendLabel: "Enviar email cuando entra un pedido",
    sendDescription: "Envia el primer email al cliente cuando el pedido queda registrado.",
    subjectFallback: "Recibimos tu pedido",
    bodyFallback:
      "Hola {{nombre_cliente}},\n\nRecibimos tu pedido {{numero_pedido}} correctamente.\n\nEstamos revisando el pago y te iremos avisando cada novedad.\n\nPuedes seguir el estado desde aqui:\n{{link_seguimiento}}\n\nGracias por comprar en {{nombre_local}}.",
  }),
  ...buildFixedEmailDefinitions({
    keyPrefix: "APP_PAYMENT_INIT_FAILURE_EMAIL",
    configPrefix: "FalloInicioPago",
    baseLabel: "error de inicio de pago",
    section: "Emails",
    group: "Error de inicio de pago",
    sendKey: "APP_SEND_PAYMENT_INIT_FAILURE_EMAIL",
    sendConfigKey: "EnviarEmailFalloInicioPago",
    sendLabel: "Enviar email si falla el inicio del pago",
    sendDescription: "Avisa al cliente cuando no se pudo iniciar el pago online.",
    subjectFallback: "Tuvimos un inconveniente al iniciar tu pago",
    bodyFallback:
      "Hola {{nombre_cliente}},\n\nTuvimos un inconveniente al iniciar tu pago online para el pedido {{numero_pedido}}.\n\nNo te preocupes: el pedido sigue registrado.\n\nPuedes seguirlo o reintentar el pago desde aqui:\n{{link_reintento}}\n\nSi prefieres, tambien puedes responder este email y coordinamos otra alternativa.",
  }),
  ...EMAIL_BRANDING_SETTING_DEFINITIONS,
  ...SMTP_SETTING_DEFINITIONS,
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
  ...buildFixedEmailDefinitions({
    keyPrefix: "APP_INVOICE_EMAIL",
    configPrefix: "FacturaEmail",
    baseLabel: "factura",
    section: "Facturacion y documentos",
    group: "Factura manual",
    subjectFallback: "Factura de tu compra",
    bodyFallback:
      "Hola {{nombre_cliente}},\n\nTe enviamos la factura correspondiente a tu pedido {{numero_pedido}}.\n\nAdjuntamos el comprobante en este email y quedamos a disposicion por cualquier consulta.\n\nGracias por comprar en {{nombre_local}}.",
  }),
];

const ORDER_STATE_SETTING_DEFINITIONS: StoreSettingDefinition[] = ORDER_STATES.flatMap(
  (state) => {
    const defaults = ORDER_STATE_VISUAL_DEFAULTS[state];
    const group = ORDER_STATE_LABELS[state];

    return [
      {
        key: buildStateEnvKey(state, "LABEL"),
        configKey: buildStateConfigKey(state, "Label"),
        label: "Nombre visible",
        description: "Nombre opcional para mostrar este estado con un texto mas cercano al negocio.",
        section: "Estados",
        group,
        type: "text" as const,
        fallback: "",
      },
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
        fallback: getStateEmailSubjectDefault(state),
      },
      {
        key: buildStateEnvKey(state, "EMAIL_BODY"),
        configKey: buildStateConfigKey(state, "EmailBody"),
        label: "Cuerpo",
        description:
          "Variables disponibles: {{nombre_cliente}}, {{numero_pedido}}, {{estado}}, {{monto_total}}, {{tipo_entrega}}, {{link_seguimiento}}, {{codigo_retiro}}, {{link_reintento}}, {{direccion_local}}, {{nombre_local}}, {{horario_local}}, {{email_contacto}}, {{telefono_contacto}}.",
        section: "Emails",
        group,
        type: "textarea" as const,
        fallback: getStateEmailBodyDefault(state),
      },
      {
        key: buildStateEnvKey(state, "EMAIL_CC"),
        configKey: buildStateConfigKey(state, "EmailCc"),
        label: "CC opcional",
        description: "Uno o varios emails separados por coma para copiar este aviso automatico.",
        section: "Emails",
        group,
        type: "text" as const,
        placeholder: "ventas@tu-negocio.com, deposito@tu-negocio.com",
        fallback: "",
      },
      {
        key: buildStateEnvKey(state, "USE_BRANDING"),
        configKey: buildStateConfigKey(state, "UseBranding"),
        label: "Usar branding visual",
        description: "Si esta activo, este estado usa el diseño visual configurado para los emails.",
        section: "Emails",
        group,
        type: "boolean" as const,
        fallback: "true",
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

async function readStoreConfigRows() {
  const configKeys = STORE_SETTING_DEFINITIONS.map((definition) => definition.configKey);
  const placeholders = configKeys.map((_, index) => `:key${index}`).join(", ");
  const params = Object.fromEntries([
    ["group", STORE_CONFIG_GROUP],
    ...configKeys.map((configKey, index) => [`key${index}`, configKey]),
  ]);
  const rows = await queryRows<ConfigRow>(
    `
      SELECT TRIM(CLAVE) AS CLAVE, COALESCE(VALOR, '') AS VALOR
      FROM dbo_TA_CONFIGURACION
      WHERE TRIM(COALESCE(GRUPO, '')) = :group
        AND TRIM(CLAVE) IN (${placeholders});
    `,
    params,
  );

  return new Map(
    rows.map((row) => [row.CLAVE.trim(), (row.VALOR || "").trim()]),
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
  const existingRows = await readStoreConfigRows();

  for (const definition of STORE_SETTING_DEFINITIONS) {
    const fieldWasRendered = formData.has(`__present__${definition.key}`);
    const rawValue = fieldWasRendered
      ? definition.type === "boolean"
        ? formData.get(definition.key) === "on"
          ? "true"
          : "false"
        : typeof formData.get(definition.key) === "string"
          ? String(formData.get(definition.key)).trim()
          : ""
      : resolveRawValue(definition, existingRows);

    process.env[definition.key] = rawValue;

    if (!fieldWasRendered) {
      continue;
    }

    const updateResult = await executeStatement(
      `
        UPDATE dbo_TA_CONFIGURACION
        SET VALOR = :value
        WHERE TRIM(COALESCE(GRUPO, '')) = :group
          AND TRIM(CLAVE) = :configKey;
      `,
      {
        group: STORE_CONFIG_GROUP,
        configKey: definition.configKey,
        value: rawValue,
      },
    );

    if (updateResult.affectedRows > 0) {
      continue;
    }

    await executeStatement(
      `
        INSERT INTO dbo_TA_CONFIGURACION (GRUPO, CLAVE, VALOR)
        VALUES (:group, :configKey, :value);
      `,
      {
        group: STORE_CONFIG_GROUP,
        configKey: definition.configKey,
        value: rawValue,
      },
    );
  }
}
