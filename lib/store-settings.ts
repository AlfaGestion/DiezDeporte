import "server-only";
import { parseBoolean } from "@/lib/commerce";
import { getConnection } from "@/lib/db";
import type { AdminConfigField, AdminConfigFieldType } from "@/lib/types";

export const STORE_CONFIG_GROUP = "TiendaWeb";

type StoreSettingDefinition = {
  key: string;
  configKey: string;
  label: string;
  description: string;
  section: string;
  type: AdminConfigFieldType;
  placeholder?: string;
};

type ConfigRow = {
  CLAVE: string;
  VALOR: string;
};

export const STORE_SETTING_DEFINITIONS: StoreSettingDefinition[] = [
  {
    key: "APP_MP_ACCESS_TOKEN",
    configKey: "Token",
    label: "Token de acceso MP",
    description: "Token privado para crear preferencias y consultar pagos.",
    section: "Mercado Pago",
    type: "password",
    placeholder: "APP_USR-...",
  },
  {
    key: "APP_PUBLIC_BASE_URL",
    configKey: "PublicBaseUrl",
    label: "URL publica",
    description: "Base publica usada por back URLs y webhook.",
    section: "Mercado Pago",
    type: "text",
    placeholder: "https://tu-dominio.com",
  },
  {
    key: "APP_MP_ORDER_TC",
    configKey: "TcPagosWeb",
    label: "TC pagos web",
    description: "Opcional. Si queda vacio usa APP_ORDER_TC.",
    section: "Mercado Pago",
    type: "text",
    placeholder: "NP",
  },
  {
    key: "APP_MP_STATEMENT_DESCRIPTOR",
    configKey: "DescriptorMercadoPago",
    label: "Descriptor",
    description: "Texto corto que puede aparecer en el resumen del pago.",
    section: "Mercado Pago",
    type: "text",
    placeholder: "DIEZDEPORTES",
  },
  {
    key: "APP_MP_BINARY_MODE",
    configKey: "BinaryMode",
    label: "Modo binario",
    description: "Cuando esta activo, Mercado Pago simplifica los estados posibles.",
    section: "Mercado Pago",
    type: "boolean",
  },
  {
    key: "APP_ORDER_TC",
    configKey: "TcPedido",
    label: "TC por defecto",
    description: "Tipo de comprobante general para pedidos web.",
    section: "Pedido",
    type: "text",
    placeholder: "NP",
  },
  {
    key: "APP_ORDER_BRANCH",
    configKey: "SucursalPedido",
    label: "Sucursal",
    description: "Sucursal usada al grabar comprobantes finales.",
    section: "Pedido",
    type: "text",
    placeholder: "9999",
  },
  {
    key: "APP_ORDER_LETTER",
    configKey: "LetraPedido",
    label: "Letra",
    description: "Letra de comprobante para pedidos web.",
    section: "Pedido",
    type: "text",
    placeholder: "X",
  },
  {
    key: "APP_PAYMENT_CONDITION",
    configKey: "CondicionPago",
    label: "Condicion pago",
    description: "Codigo interno de condicion de compra/venta.",
    section: "Pedido",
    type: "text",
    placeholder: "1",
  },
  {
    key: "APP_CUSTOMER_ACCOUNT",
    configKey: "CuentaCliente",
    label: "Cuenta cliente",
    description:
      "Cuenta por defecto para consumidor final si no viene de configuracion SQL.",
    section: "Pedido",
    type: "text",
    placeholder: "000001",
  },
  {
    key: "APP_ORDER_USER",
    configKey: "UsuarioPedido",
    label: "Usuario grabacion",
    description: "Usuario tecnico registrado en el comprobante.",
    section: "Pedido",
    type: "text",
    placeholder: "web-shop",
  },
  {
    key: "APP_PENDING_ORDER_TTL_MINUTES",
    configKey: "MinutosVencimientoPedido",
    label: "Vencimiento impago",
    description: "Minutos maximos para mantener un pedido pendiente sin pago confirmado.",
    section: "Pedido",
    type: "text",
    placeholder: "120",
  },
  {
    key: "APP_ALLOW_BACKORDERS",
    configKey: "PermitirSinStock",
    label: "Permitir sin stock",
    description: "Si esta activo, deja vender aunque el stock sea insuficiente.",
    section: "Checkout",
    type: "boolean",
  },
  {
    key: "APP_WRITE_STOCK_MOVEMENTS",
    configKey: "GrabarStock",
    label: "Grabar stock",
    description: "Inserta movimientos en V_MV_Stock al finalizar el pedido.",
    section: "Checkout",
    type: "boolean",
  },
  {
    key: "NEXT_PUBLIC_SHOW_OUT_OF_STOCK",
    configKey: "MostrarSinStock",
    label: "Mostrar sin stock",
    description: "Si esta activo, el catalogo sigue mostrando articulos agotados.",
    section: "Checkout",
    type: "boolean",
  },
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
  return rows.get(definition.configKey) ?? process.env[definition.key] ?? "";
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
      type: definition.type,
      placeholder: definition.placeholder,
      value:
        definition.type === "boolean"
          ? parseBoolean(rawValue, false)
          : rawValue,
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
