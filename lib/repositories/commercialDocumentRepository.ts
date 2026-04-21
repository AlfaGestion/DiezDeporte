import "server-only";
import { getConnection, sql } from "@/lib/db";
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
    nombre: trimToMax(order.nombre_cliente, 50),
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
    return `${baseUser}-mp`.slice(0, 250);
  }

  return baseUser.slice(0, 250);
}

async function resolveCustomerAccount(
  transaction: InstanceType<typeof sql.Transaction>,
  configuredAccount: string,
) {
  const preferred = trimOrNull(configuredAccount);

  if (preferred) {
    return preferred;
  }

  const directRequest = new sql.Request(transaction);
  directRequest.input("codigo", sql.NVarChar(15), "112010001");
  const directMatch = await directRequest.query<{ CODIGO: string }>(`
    SELECT TOP (1) CODIGO
    FROM dbo.VT_CLIENTES WITH (NOLOCK)
    WHERE CODIGO = @codigo;
  `);

  if (directMatch.recordset[0]?.CODIGO?.trim()) {
    return directMatch.recordset[0].CODIGO.trim();
  }

  const fallbackRequest = new sql.Request(transaction);
  const fallbackMatch = await fallbackRequest.query<{ CODIGO: string }>(`
    SELECT TOP (1) CODIGO
    FROM dbo.VT_CLIENTES WITH (NOLOCK)
    WHERE RAZON_SOCIAL LIKE '%Consumidor Final%'
       OR RAZON_SOCIAL LIKE '%CONSUMIDOR%'
    ORDER BY CODIGO;
  `);

  if (fallbackMatch.recordset[0]?.CODIGO?.trim()) {
    return fallbackMatch.recordset[0].CODIGO.trim();
  }

  throw new Error(
    "No se encontro un cliente para grabar el comprobante. Configura APP_CUSTOMER_ACCOUNT o crea un cliente generico en VT_CLIENTES.",
  );
}

async function createHeader(
  transaction: InstanceType<typeof sql.Transaction>,
  input: {
    customerAccount: string;
    vendorId: string;
    order: StoredOrder;
  },
) {
  const request = new sql.Request(transaction);
  request.input("pCliente", sql.NVarChar(15), input.customerAccount);
  request.input("pVendedor", sql.NVarChar(4), trimOrNull(input.vendorId) || "9999");
  request.input("pFecha", sql.DateTime, new Date(input.order.fecha_creacion));
  request.output("pResultado", sql.SmallInt);
  request.output("pMensaje", sql.VarChar(255));
  request.output("pIdComprobanteRES", sql.Int);

  const execution = await request.execute("dbo.wsSysMobileSPPedidosV_MV_CPTE");

  const result = Number(execution.output.pResultado || 0);
  const message = String(execution.output.pMensaje || "").trim();
  const headerId = Number(execution.output.pIdComprobanteRES || 0);

  if (result !== 11 || !Number.isFinite(headerId) || headerId <= 0) {
    throw new Error(
      message ||
        `No se pudo generar la cabecera del comprobante. Resultado=${String(result)}.`,
    );
  }

  return headerId;
}

async function createLine(
  transaction: InstanceType<typeof sql.Transaction>,
  input: {
    headerId: number;
    line: CommercialDocumentLine;
  },
) {
  const request = new sql.Request(transaction);
  request.input("pIdCpte", sql.Int, input.headerId);
  request.input("pIdArticulo", sql.NVarChar(25), input.line.articleId.trim());
  request.input("pCantidad", sql.Float, input.line.quantity);
  request.input("pImporteUnitario", sql.Money, input.line.unitPrice);
  request.input("pPorcDescuento", sql.Float, 0);
  request.output("pResultado", sql.SmallInt);
  request.output("pMensaje", sql.VarChar(255));
  request.output("pIdVMVCpteInsumosRES", sql.Int);

  const execution = await request.execute("dbo.wsSysMobileSPPedidosV_MV_CPTEINSUMOS");

  const result = Number(execution.output.pResultado || 0);
  const message = String(execution.output.pMensaje || "").trim();

  if (result !== 11) {
    throw new Error(
      message ||
        `No se pudo grabar el articulo ${input.line.articleId}. Resultado=${String(result)}.`,
    );
  }
}

async function stampHeaderMetadata(
  transaction: InstanceType<typeof sql.Transaction>,
  input: {
    headerId: number;
    order: StoredOrder;
    user: string;
  },
) {
  const headerPatch = buildCommercialDocumentHeaderPatch(input.order);
  const request = new sql.Request(transaction);
  request.input("id", sql.Int, input.headerId);
  request.input("modelo", sql.NVarChar(50), headerPatch.modelo);
  request.input("matricula", sql.NVarChar(20), headerPatch.matricula);
  request.input("serie", sql.NVarChar(20), headerPatch.serie);
  request.input("nombre", sql.NVarChar(50), headerPatch.nombre);
  request.input("domicilio", sql.NVarChar(50), headerPatch.domicilio);
  request.input("telefono", sql.NVarChar(100), headerPatch.telefono);
  request.input("localidad", sql.NVarChar(50), headerPatch.localidad);
  request.input("transporte", sql.NVarChar(15), headerPatch.transporte);
  request.input("transporteNombre", sql.NVarChar(100), headerPatch.transporteNombre);
  request.input(
    "transporteDomicilio",
    sql.NVarChar(100),
    headerPatch.transporteDomicilio,
  );
  request.input("fechaEntrega", sql.DateTime, headerPatch.fechaEntrega);
  request.input("usuario", sql.NVarChar(250), input.user);
  request.input("fecha", sql.DateTime, new Date(input.order.fecha_creacion));
  request.input(
    "observaciones",
    sql.NVarChar(250),
    buildDocumentObservations(input.order),
  );
  await request.query(`
    UPDATE dbo.V_MV_Cpte
    SET MODELO = @modelo,
        MATRICULA = @matricula,
        SERIE = @serie,
        NOMBRE = @nombre,
        DOMICILIO = @domicilio,
        TELEFONO = @telefono,
        LOCALIDAD = @localidad,
        TRANSPORTE = @transporte,
        TRANSPORTE_NOMBRE = @transporteNombre,
        TRANSPORTE_DOMICILIO = @transporteDomicilio,
        FechaEntrega = @fechaEntrega,
        Usuario = @usuario,
        FechaHora_Grabacion = @fecha,
        Observaciones = @observaciones
    WHERE ID = @id;
  `);
}

async function getHeaderById(
  transaction: InstanceType<typeof sql.Transaction>,
  headerId: number,
) {
  const request = new sql.Request(transaction);
  request.input("id", sql.Int, headerId);
  const result = await request.query<{
    ID: number;
    TC: string;
    IDCOMPROBANTE: string;
  }>(`
    SELECT TOP (1) ID, TC, IDCOMPROBANTE
    FROM dbo.V_MV_Cpte WITH (NOLOCK)
    WHERE ID = @id;
  `);

  const row = result.recordset[0];

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

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const customerAccount = await resolveCustomerAccount(
      transaction,
      input.settings.customerAccount,
    );
    const headerId = await createHeader(transaction, {
      customerAccount,
      vendorId: input.settings.vendorId,
      order: input.order,
    });

    for (const line of input.lines) {
      await createLine(transaction, {
        headerId,
        line,
      });
    }

    await stampHeaderMetadata(transaction, {
      headerId,
      order: input.order,
      user: resolveOrderUser(input.order, input.settings),
    });

    const header = await getHeaderById(transaction, headerId);
    await transaction.commit();

    return {
      ...header,
      customerAccount,
    };
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

export const createOrderNoteDocument = createCommercialDocument;

export async function syncCommercialDocumentHeader(order: StoredOrder) {
  const headerId = Number(order.metadata.documentInternalId || 0);

  if (!Number.isFinite(headerId) || headerId <= 0) {
    return false;
  }

  const headerPatch = buildCommercialDocumentHeaderPatch(order);
  const pool = await getConnection();
  const request = pool.request();
  request.input("id", sql.Int, headerId);
  request.input("modelo", sql.NVarChar(50), headerPatch.modelo);
  request.input("matricula", sql.NVarChar(20), headerPatch.matricula);
  request.input("serie", sql.NVarChar(20), headerPatch.serie);
  request.input("nombre", sql.NVarChar(50), headerPatch.nombre);
  request.input("domicilio", sql.NVarChar(50), headerPatch.domicilio);
  request.input("telefono", sql.NVarChar(100), headerPatch.telefono);
  request.input("localidad", sql.NVarChar(50), headerPatch.localidad);
  request.input("transporte", sql.NVarChar(15), headerPatch.transporte);
  request.input("transporteNombre", sql.NVarChar(100), headerPatch.transporteNombre);
  request.input(
    "transporteDomicilio",
    sql.NVarChar(100),
    headerPatch.transporteDomicilio,
  );
  request.input("fechaEntrega", sql.DateTime, headerPatch.fechaEntrega);
  request.input("observaciones", sql.NVarChar(250), buildDocumentObservations(order));
  const result = await request.query(`
    UPDATE dbo.V_MV_Cpte
    SET MODELO = @modelo,
        MATRICULA = @matricula,
        SERIE = @serie,
        NOMBRE = @nombre,
        DOMICILIO = @domicilio,
        TELEFONO = @telefono,
        LOCALIDAD = @localidad,
        TRANSPORTE = @transporte,
        TRANSPORTE_NOMBRE = @transporteNombre,
        TRANSPORTE_DOMICILIO = @transporteDomicilio,
        FechaEntrega = @fechaEntrega,
        Observaciones = @observaciones,
        FechaHora_Modificacion = SYSDATETIME()
    WHERE ID = @id;

    SELECT @@ROWCOUNT AS AffectedRows;
  `);

  return Number(result.recordset[0]?.AffectedRows || 0) > 0;
}
