import "server-only";
import {
  type DbExecutor,
  executeStatement,
  queryOne,
  queryRows,
  withTransaction,
} from "@/lib/db";
import { normalizeBranch, normalizeNumber } from "@/lib/commerce";
import { isPickupLocalPaymentOrder } from "@/lib/models/order";
import type { ServerSettings } from "@/lib/store-config";
import type { StoredOrder } from "@/lib/types/order";

type CommercialDocumentHeader = {
  id: number;
  tc: string;
  idComprobante: string;
};

type CommercialDocumentLine = {
  articleId: string;
  quantity: number;
  unitPrice: number;
};

type ProductLookupRow = {
  IDARTICULO: string;
  DESCRIPCION: string;
  IDUNIDAD: string | null;
  COSTO: number | null;
  CUENTAPROVEEDOR: string | null;
  TasaIVA: number | null;
  EXENTO: number | boolean | null;
  CODIGOBARRA: string | null;
  PRESENTACION: string | null;
  IDTIPO: string | null;
};

function trimOrNull(value: string | null | undefined) {
  const normalized = (value || "").trim();
  return normalized || null;
}

function trimToMax(value: string | null | undefined, maxLength: number) {
  const normalized = trimOrNull(value);
  return normalized ? normalized.slice(0, maxLength) : null;
}

function resolveDeliveryLabel(order: StoredOrder) {
  return order.tipo_pedido === "retiro" ? "Retiro local" : "Envio";
}

function resolveSerieLabel(order: StoredOrder) {
  if (isPickupLocalPaymentOrder(order) && order.estado_pago !== "aprobado") {
    return "Paga en local";
  }

  if (order.estado_pago === "aprobado") {
    return "Ya lo pago";
  }

  return null;
}

function resolvePickupPaymentLabel(order: StoredOrder) {
  return (
    trimOrNull(order.metadata.pickupPaymentAccountLabel) ||
    trimOrNull(order.metadata.pickupPaymentOptionalCode) ||
    null
  );
}

function resolvePickupRedeemerFullName(order: StoredOrder) {
  const fullName = trimOrNull(order.nombre_apellido_retiro);

  if (fullName) {
    return fullName;
  }

  return trimOrNull(
    [order.nombre_retiro, order.apellido_retiro].filter(Boolean).join(" "),
  );
}

function resolveDeliveryDate(order: StoredOrder) {
  if (order.fecha_hora_retiro) {
    return new Date(order.fecha_hora_retiro);
  }

  if (order.estado === "ENTREGADO") {
    return new Date(order.fecha_actualizacion);
  }

  return null;
}

function buildCommercialDocumentHeaderPatch(order: StoredOrder) {
  return {
    modelo: trimToMax(order.email_cliente, 50),
    matricula: trimToMax(resolveDeliveryLabel(order), 20),
    serie: trimToMax(resolveSerieLabel(order), 20),
    nombre: trimToMax(order.nombre_cliente, 50) || "Pedido web",
    domicilio: trimToMax(order.metadata.customerAddress || order.direccion, 50),
    telefono: trimToMax(order.telefono_cliente, 100),
    localidad: trimToMax(order.metadata.customerCity, 50),
    transporte: trimToMax(resolvePickupPaymentLabel(order), 15),
    transporteNombre: trimToMax(resolvePickupRedeemerFullName(order), 100),
    transporteDomicilio: trimToMax(order.dni_retiro, 100),
    fechaEntrega: resolveDeliveryDate(order),
  };
}

function buildDocumentObservations(order: StoredOrder) {
  const parts = [
    `NP / pedido web ${order.metadata.webOrderNumber || order.numero_pedido}`,
    order.email_cliente ? `Email: ${order.email_cliente}` : null,
    order.metadata.deliveryMethod ? `Entrega: ${order.metadata.deliveryMethod}` : null,
    order.metadata.paymentMethod ? `Pago: ${order.metadata.paymentMethod}` : null,
    order.metadata.customerNotes ? `Notas: ${order.metadata.customerNotes}` : null,
  ].filter(Boolean);

  return parts.join(" | ").slice(0, 250);
}

function resolveOrderUser(order: StoredOrder, settings: ServerSettings) {
  const baseUser = trimOrNull(settings.orderUser) || "web-shop";
  const paymentMethod = (order.metadata.paymentMethod || "").trim().toLowerCase();

  if (paymentMethod.includes("mercado pago") && !baseUser.endsWith("-mp")) {
    return `${baseUser}-mp`.slice(0, 50);
  }

  return baseUser.slice(0, 50);
}

async function resolveCustomerAccount(configuredAccount: string) {
  const preferred = trimOrNull(configuredAccount);

  if (preferred) {
    return preferred;
  }

  const directMatch = await queryOne<{ CODIGO: string }>(
    `
      SELECT TRIM(CODIGO) AS CODIGO
      FROM dbo_VT_CLIENTES
      WHERE TRIM(CODIGO) = :codigo
      LIMIT 1;
    `,
    { codigo: "112010001" },
  );

  if (directMatch?.CODIGO?.trim()) {
    return directMatch.CODIGO.trim();
  }

  const fallbackMatch = await queryOne<{ CODIGO: string }>(`
    SELECT TRIM(CODIGO) AS CODIGO
    FROM dbo_VT_CLIENTES
    WHERE UPPER(COALESCE(RAZON_SOCIAL, '')) LIKE '%CONSUMIDOR FINAL%'
       OR UPPER(COALESCE(RAZON_SOCIAL, '')) LIKE '%CONSUMIDOR%'
    ORDER BY CODIGO
    LIMIT 1;
  `);

  if (fallbackMatch?.CODIGO?.trim()) {
    return fallbackMatch.CODIGO.trim();
  }

  throw new Error(
    "No se encontro un cliente para grabar el comprobante. Configura APP_CUSTOMER_ACCOUNT o crea un cliente generico en VT_CLIENTES.",
  );
}

async function getNextHeaderNumber(input: {
  tc: string;
  branch: string;
  executor?: DbExecutor;
}) {
  const row = await queryOne<{ NEXT_NUMBER: number | null }>(
    `
      SELECT
        COALESCE(
          MAX(
            CASE
              WHEN TC = :tc
                AND TRIM(COALESCE(SUCURSAL, '')) = :branch
                AND TRIM(COALESCE(NUMERO, '')) REGEXP '^[0-9]+$'
              THEN CAST(TRIM(NUMERO) AS UNSIGNED)
              ELSE 0
            END
          ),
          0
        ) + 1 AS NEXT_NUMBER
      FROM dbo_V_MV_Cpte;
    `,
    {
      tc: input.tc,
      branch: input.branch,
    },
    input.executor,
  );

  return normalizeNumber(Number(row?.NEXT_NUMBER || 1));
}

async function getProductRowsByIds(productIds: string[]) {
  const normalizedIds = Array.from(
    new Set(productIds.map((value) => value.trim()).filter(Boolean)),
  );

  if (normalizedIds.length === 0) {
    return new Map<string, ProductLookupRow>();
  }

  const params = Object.fromEntries(
    normalizedIds.map((value, index) => [`productId${index}`, value]),
  );
  const placeholders = normalizedIds
    .map((_, index) => `:productId${index}`)
    .join(", ");
  const rows = await queryRows<ProductLookupRow>(
    `
      SELECT
        TRIM(IDARTICULO) AS IDARTICULO,
        DESCRIPCION,
        IDUNIDAD,
        COSTO,
        CUENTAPROVEEDOR,
        TasaIVA,
        EXENTO,
        CODIGOBARRA,
        Presentacion AS PRESENTACION,
        IDTIPO
      FROM dbo_V_MA_ARTICULOS
      WHERE TRIM(IDARTICULO) IN (${placeholders});
    `,
    params,
  );

  return new Map(rows.map((row) => [row.IDARTICULO.trim(), row]));
}

async function createHeader(input: {
  customerAccount: string;
  settings: ServerSettings;
  order: StoredOrder;
  executor?: DbExecutor;
}) {
  const branch = normalizeBranch(input.settings.orderBranch || "0");
  const tc = trimOrNull(input.settings.orderTc) || "NP";
  const number = await getNextHeaderNumber({ tc, branch, executor: input.executor });
  const idComprobante = `${branch}${number}`;
  const headerPatch = buildCommercialDocumentHeaderPatch(input.order);
  const orderDate = new Date(input.order.fecha_creacion);
  const total = Number(input.order.monto_total || 0);
  const result = await executeStatement(
    `
      INSERT INTO dbo_V_MV_Cpte (
        TC,
        IDCOMPROBANTE,
        IDCOMPLEMENTO,
        FECHA,
        CUENTA,
        MATRICULA,
        MODELO,
        SERIE,
        NOMBRE,
        DOMICILIO,
        TELEFONO,
        LOCALIDAD,
        DOCUMENTOTIPO,
        CONDICIONIVA,
        IDCOND_CPRA_VTA,
        CLASEPRECIO,
        OBSERVACIONES,
        IMPORTE,
        APROBADO,
        IdVendedor,
        ImporteInsumos,
        IdLista,
        SUCURSAL,
        NUMERO,
        LETRA,
        UNEGOCIO,
        Usuario,
        FechaHora_Grabacion,
        IDMOTIVOCPRAVTA,
        IdDeposito,
        IdMotivoStock,
        TRANSPORTE,
        TRANSPORTE_NOMBRE,
        TRANSPORTE_DOMICILIO,
        FechaEntrega
      )
      VALUES (
        :tc,
        :idComprobante,
        0,
        :fecha,
        :cuenta,
        :matricula,
        :modelo,
        :serie,
        :nombre,
        :domicilio,
        :telefono,
        :localidad,
        :documentoTipo,
        :condicionIva,
        :condicionPago,
        :clasePrecio,
        :observaciones,
        :importe,
        :aprobado,
        :idVendedor,
        :importeInsumos,
        :idLista,
        :sucursal,
        :numero,
        :letra,
        :uNegocio,
        :usuario,
        :fechaGrabacion,
        :motivoCompraVenta,
        :idDeposito,
        :idMotivoStock,
        :transporte,
        :transporteNombre,
        :transporteDomicilio,
        :fechaEntrega
      );
    `,
    {
      tc,
      idComprobante,
      fecha: orderDate,
      cuenta: input.customerAccount,
      matricula: headerPatch.matricula,
      modelo: headerPatch.modelo,
      serie: headerPatch.serie,
      nombre: headerPatch.nombre,
      domicilio: headerPatch.domicilio,
      telefono: headerPatch.telefono,
      localidad: headerPatch.localidad,
      documentoTipo: trimOrNull(input.settings.documentType),
      condicionIva: trimOrNull(input.settings.ivaCondition),
      condicionPago: trimOrNull(input.settings.paymentCondition),
      clasePrecio: Number(input.settings.classPrice || 1),
      observaciones: buildDocumentObservations(input.order),
      importe: total,
      aprobado: input.order.estado_pago === "aprobado" ? 1 : 0,
      idVendedor: trimOrNull(input.settings.vendorId),
      importeInsumos: total,
      idLista: trimOrNull(input.settings.priceListId),
      sucursal: branch,
      numero: number,
      letra: trimOrNull(input.settings.orderLetter) || "X",
      uNegocio: trimOrNull(input.settings.unitBusiness),
      usuario: resolveOrderUser(input.order, input.settings),
      fechaGrabacion: orderDate,
      motivoCompraVenta: trimOrNull(input.settings.saleReasonId),
      idDeposito: trimOrNull(input.settings.stockDepositId),
      idMotivoStock: trimOrNull(input.settings.stockReasonId),
      transporte: headerPatch.transporte,
      transporteNombre: headerPatch.transporteNombre,
      transporteDomicilio: headerPatch.transporteDomicilio,
      fechaEntrega: headerPatch.fechaEntrega,
    },
    input.executor,
  );

  return {
    id: Number(result.insertId || 0),
    tc,
    idComprobante,
  } satisfies CommercialDocumentHeader;
}

async function createLines(input: {
  header: CommercialDocumentHeader;
  lines: CommercialDocumentLine[];
  settings: ServerSettings;
  executor?: DbExecutor;
}) {
  const products = await getProductRowsByIds(
    input.lines.map((line) => line.articleId),
  );

  for (const [index, line] of input.lines.entries()) {
    const product = products.get(line.articleId.trim());

    if (!product) {
      throw new Error(`No se pudo grabar el articulo ${line.articleId}.`);
    }

    const quantity = Number(line.quantity || 0);
    const unitPrice = Number(line.unitPrice || 0);
    const total = Number((quantity * unitPrice).toFixed(4));
    const taxRate = Number(product.TasaIVA || 0);
    const exempt = Boolean(product.EXENTO);

    await executeStatement(
      `
        INSERT INTO dbo_V_MV_CpteInsumos (
          TC,
          IDCOMPROBANTE,
          IDCOMPLEMENTO,
          IDARTICULO,
          DESCRIPCION,
          IDUNIDAD,
          CANTIDADUD,
          CANTIDAD,
          COSTO,
          IMPORTE,
          IMPORTE_S_IVA,
          TOTAL,
          EXENTO,
          IdLista,
          CLASEPRECIO,
          AlicIVA,
          CuentaProveedor,
          CODIGOBARRA,
          PRESENTACION,
          IdTipo,
          SECUENCIA,
          TotalFinal
        )
        VALUES (
          :tc,
          :idComprobante,
          0,
          :articleId,
          :descripcion,
          :unidad,
          :cantidadUd,
          :cantidad,
          :costo,
          :importe,
          :importeSinIva,
          :total,
          :exento,
          :idLista,
          :clasePrecio,
          :alicIva,
          :cuentaProveedor,
          :codigoBarra,
          :presentacion,
          :idTipo,
          :secuencia,
          :totalFinal
        );
      `,
      {
        tc: input.header.tc,
        idComprobante: input.header.idComprobante,
        articleId: product.IDARTICULO,
        descripcion: trimToMax(product.DESCRIPCION, 100) || product.IDARTICULO,
        unidad: trimOrNull(product.IDUNIDAD),
        cantidadUd: quantity,
        cantidad: quantity,
        costo: Number(product.COSTO || 0),
        importe: unitPrice,
        importeSinIva: unitPrice,
        total,
        exento: exempt ? 1 : 0,
        idLista: trimOrNull(input.settings.priceListId),
        clasePrecio: Number(input.settings.classPrice || 1),
        alicIva: exempt ? 0 : taxRate,
        cuentaProveedor: trimOrNull(product.CUENTAPROVEEDOR) || "*",
        codigoBarra: trimOrNull(product.CODIGOBARRA),
        presentacion: trimOrNull(product.PRESENTACION),
        idTipo: trimOrNull(product.IDTIPO),
        secuencia: index + 1,
        totalFinal: total,
      },
      input.executor,
    );
  }
}

async function getHeaderById(headerId: number, executor?: DbExecutor) {
  const row = await queryOne<{
    ID: number;
    TC: string;
    IDCOMPROBANTE: string;
  }>(
    `
      SELECT ID, TC, IDCOMPROBANTE
      FROM dbo_V_MV_Cpte
      WHERE ID = :id
      LIMIT 1;
    `,
    { id: headerId },
    executor,
  );

  if (!row) {
    throw new Error("No se pudo leer el comprobante recien grabado.");
  }

  return {
    id: Number(row.ID),
    tc: row.TC.trim(),
    idComprobante: row.IDCOMPROBANTE.trim(),
  } satisfies CommercialDocumentHeader;
}

export async function createCommercialDocument(input: {
  order: StoredOrder;
  settings: ServerSettings;
  lines: CommercialDocumentLine[];
}) {
  if (input.lines.length === 0) {
    throw new Error("El pedido no tiene articulos para generar el comprobante.");
  }

  const customerAccount = await resolveCustomerAccount(input.settings.customerAccount);

  return withTransaction(async (transaction) => {
    const header = await createHeader({
      customerAccount,
      settings: input.settings,
      order: input.order,
      executor: transaction,
    });

    await createLines({
      header,
      lines: input.lines,
      settings: input.settings,
      executor: transaction,
    });

    const persistedHeader = await getHeaderById(header.id, transaction);

    return {
      ...persistedHeader,
      customerAccount,
    };
  });
}

export const createOrderNoteDocument = createCommercialDocument;

export async function syncCommercialDocumentHeader(order: StoredOrder) {
  const headerId = Number(order.metadata.documentInternalId || 0);

  if (!Number.isFinite(headerId) || headerId <= 0) {
    return false;
  }

  const headerPatch = buildCommercialDocumentHeaderPatch(order);
  const result = await executeStatement(
    `
      UPDATE dbo_V_MV_Cpte
      SET MODELO = :modelo,
          MATRICULA = :matricula,
          SERIE = :serie,
          NOMBRE = :nombre,
          DOMICILIO = :domicilio,
          TELEFONO = :telefono,
          LOCALIDAD = :localidad,
          TRANSPORTE = :transporte,
          TRANSPORTE_NOMBRE = :transporteNombre,
          TRANSPORTE_DOMICILIO = :transporteDomicilio,
          FechaEntrega = :fechaEntrega,
          Observaciones = :observaciones,
          FechaHora_Modificacion = NOW()
      WHERE ID = :id;
    `,
    {
      id: headerId,
      modelo: headerPatch.modelo,
      matricula: headerPatch.matricula,
      serie: headerPatch.serie,
      nombre: headerPatch.nombre,
      domicilio: headerPatch.domicilio,
      telefono: headerPatch.telefono,
      localidad: headerPatch.localidad,
      transporte: headerPatch.transporte,
      transporteNombre: headerPatch.transporteNombre,
      transporteDomicilio: headerPatch.transporteDomicilio,
      fechaEntrega: headerPatch.fechaEntrega,
      observaciones: buildDocumentObservations(order),
    },
  );

  return Number(result.affectedRows || 0) > 0;
}
