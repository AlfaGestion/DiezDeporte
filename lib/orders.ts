import "server-only";
import type { ConnectionPool, IResult, Transaction } from "mssql";
import {
  buildOrderComment,
  buildOrderNotes,
  normalizeBranch,
  normalizeCode,
  normalizeNumber,
  toNumber,
  truncate,
} from "@/lib/commerce";
import { getProductsByIds } from "@/lib/catalog";
import { getConnection, sql } from "@/lib/db";
import { getServerSettings } from "@/lib/store-config";
import type {
  CreateOrderPayload,
  OrderSummary,
  Product,
} from "@/lib/types";

type Executor = ConnectionPool | Transaction;

type ConfigRow = {
  CLAVE: string;
  VALOR: string;
};

type HeaderInsertRow = {
  ID: number;
};

type SalesContext = {
  tc: string;
  branch: string;
  letter: string;
  customerAccount: string;
  vendorId: string;
  unitBusiness: string;
  priceListId: string;
  classPrice: number;
  saleReasonId: string;
  stockReasonId: string;
  documentType: string;
  ivaCondition: string;
  paymentCondition: string;
  orderUser: string;
  depositId: string | null;
  writeStockMovements: boolean;
  allowBackorders: boolean;
};

type OrderLine = {
  sequence: number;
  product: Product;
  quantity: number;
  lineNet: number;
  lineTax: number;
  lineTotal: number;
};

type ComprobanteParts = {
  idComprobante: string;
  sucursal: string;
  numero: string;
  letra: string;
};

async function getConfigurationRows(executor: Executor) {
  const request = createRequest(executor);

  const result = await request.query<ConfigRow>(`
    IF OBJECT_ID('dbo.TA_CONFIGURACION', 'U') IS NOT NULL
    BEGIN
      SELECT CLAVE, ISNULL(VALOR, '') AS VALOR
      FROM dbo.TA_CONFIGURACION WITH (NOLOCK)
      WHERE CLAVE IN (
        'APP_WEB_TC_DEFAULT_CARRO',
        'APP_WEB_BRANCH_DEFAULT_NP',
        'CUENTACONSUMIDORFINAL',
        'UNEGOCIO',
        'ClasePrecioVenta'
      );
    END
    ELSE
    BEGIN
      SELECT CAST('' AS nvarchar(100)) AS CLAVE, CAST('' AS nvarchar(100)) AS VALOR
      WHERE 1 = 0;
    END
  `);

  return new Map(
    result.recordset.map((row) => [row.CLAVE.trim(), row.VALOR.trim()]),
  );
}

async function resolveSalesContext(executor: Executor): Promise<SalesContext> {
  const settings = getServerSettings();
  const config = await getConfigurationRows(executor);

  return {
    tc: settings.orderTc || config.get("APP_WEB_TC_DEFAULT_CARRO") || "NP",
    branch:
      settings.orderBranch || config.get("APP_WEB_BRANCH_DEFAULT_NP") || "9999",
    letter: settings.orderLetter || "X",
    customerAccount:
      settings.customerAccount || config.get("CUENTACONSUMIDORFINAL") || "",
    vendorId: normalizeCode(settings.vendorId || "9999", 4),
    unitBusiness: normalizeCode(
      settings.unitBusiness || config.get("UNEGOCIO") || "1",
      4,
    ),
    priceListId: normalizeCode(settings.priceListId || "1", 4),
    classPrice:
      settings.classPrice ||
      Number(config.get("ClasePrecioVenta") || "1") ||
      1,
    saleReasonId: normalizeCode(settings.saleReasonId || "1", 4),
    stockReasonId: normalizeCode(settings.stockReasonId || "1", 4),
    documentType: normalizeCode(settings.documentType || "1", 4),
    ivaCondition: normalizeCode(settings.ivaCondition || "1", 4),
    paymentCondition: normalizeCode(settings.paymentCondition || "1", 4),
    orderUser: settings.orderUser || "web-shop",
    depositId: settings.stockDepositId
      ? normalizeCode(settings.stockDepositId, 4)
      : null,
    writeStockMovements: settings.writeStockMovements,
    allowBackorders: settings.allowBackorders,
  };
}

async function getNextComprobante(
  executor: Executor,
  tc: string,
  branch: string,
  letter: string,
): Promise<ComprobanteParts> {
  const normalizedBranch = normalizeBranch(branch);
  const normalizedLetter = (letter || "X").slice(0, 1).toUpperCase();

  try {
    const request = createRequest(executor);
    request.input("tc", sql.NVarChar(4), tc);
    request.input("branch", sql.NVarChar(4), normalizedBranch);
    request.input("letter", sql.NVarChar(1), normalizedLetter);

    const functionResult = await request.query<{ idComprobante: string }>(`
      IF OBJECT_ID('dbo.FN_OBTIENE_PROXIMO_NUMERO_CPTE') IS NOT NULL
      BEGIN
        SELECT dbo.FN_OBTIENE_PROXIMO_NUMERO_CPTE(@tc, @branch, @letter) AS idComprobante;
      END
      ELSE
      BEGIN
        SELECT CAST(NULL AS nvarchar(13)) AS idComprobante;
      END
    `);

    const value = functionResult.recordset[0]?.idComprobante?.trim();
    if (value && value.length >= 13) {
      return {
        idComprobante: value,
        sucursal: value.slice(0, 4),
        numero: value.slice(4, 12),
        letra: value.slice(12, 13) || normalizedLetter,
      };
    }
  } catch {
    // Fallback below when the function is unavailable in this installation.
  }

  const request = createRequest(executor);
  request.input("tc", sql.NVarChar(4), tc);
  request.input("branch", sql.NVarChar(4), normalizedBranch);
  request.input("letter", sql.NVarChar(1), normalizedLetter);

  const maxResult = await request.query<{ maxNumber: number | null }>(`
    SELECT MAX(TRY_CAST(NUMERO AS int)) AS maxNumber
    FROM dbo.V_MV_Cpte WITH (UPDLOCK, HOLDLOCK)
    WHERE TC = @tc
      AND SUCURSAL = @branch
      AND LETRA = @letter;
  `);

  const nextNumber = toNumber(maxResult.recordset[0]?.maxNumber) + 1;
  const numero = normalizeNumber(nextNumber);
  const idComprobante = `${normalizedBranch}${numero}${normalizedLetter}`;

  return {
    idComprobante,
    sucursal: normalizedBranch,
    numero,
    letra: normalizedLetter,
  };
}

function validatePayload(payload: CreateOrderPayload) {
  if (!payload.customer) {
    throw new Error("Faltan los datos del cliente.");
  }

  if (!payload.items || payload.items.length === 0) {
    throw new Error("El pedido no tiene artículos.");
  }

  const invalidItem = payload.items.find(
    (item) => !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0,
  );

  if (invalidItem) {
    throw new Error("Hay artículos con cantidad inválida.");
  }
}

function buildLines(
  payload: CreateOrderPayload,
  products: Product[],
  allowBackorders: boolean,
) {
  const productMap = new Map(products.map((product) => [product.id, product]));

  return payload.items.map<OrderLine>((item, index) => {
    const product = productMap.get(item.productId.trim());
    if (!product) {
      throw new Error(`No existe el artículo ${item.productId}.`);
    }

    if (!allowBackorders && item.quantity > product.stock) {
      throw new Error(
        `Stock insuficiente para ${product.description}. Disponible: ${product.stock}.`,
      );
    }

    return {
      sequence: index + 1,
      product,
      quantity: item.quantity,
      lineNet: product.netPrice * item.quantity,
      lineTax: product.taxAmount * item.quantity,
      lineTotal: product.price * item.quantity,
    };
  });
}

async function insertHeader(
  executor: Executor,
  context: SalesContext,
  comprobante: ComprobanteParts,
  payload: CreateOrderPayload,
  lines: OrderLine[],
) {
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const netTotal = lines.reduce((sum, line) => sum + line.lineNet, 0);
  const taxTotal = lines.reduce((sum, line) => sum + line.lineTax, 0);
  const maxTaxRate = Math.max(...lines.map((line) => line.product.taxRate), 0);
  const currency = lines[0]?.product.currency || "ARS";
  const request = createRequest(executor);

  request.input("tc", sql.NVarChar(4), context.tc);
  request.input("idComprobante", sql.NVarChar(13), comprobante.idComprobante);
  request.input("fecha", sql.DateTime, new Date());
  request.input("cuenta", sql.NVarChar(15), context.customerAccount || null);
  request.input("nombre", sql.NVarChar(50), truncate(payload.customer.fullName, 50));
  request.input("domicilio", sql.NVarChar(50), truncate(payload.customer.address, 50));
  request.input("telefono", sql.NVarChar(100), payload.customer.phone || null);
  request.input("localidad", sql.NVarChar(50), truncate(payload.customer.city, 50));
  request.input(
    "codigoPostal",
    sql.NVarChar(10),
    truncate(payload.customer.postalCode || "", 10) || null,
  );
  request.input("documentoTipo", sql.NVarChar(4), context.documentType);
  request.input(
    "documentoNumero",
    sql.NVarChar(13),
    truncate(payload.customer.documentNumber || "", 13) || null,
  );
  request.input("condicionIva", sql.NVarChar(4), context.ivaCondition);
  request.input("idCondCpraVta", sql.NVarChar(4), context.paymentCondition);
  request.input("comentarios", sql.NVarChar(100), buildOrderComment(payload.customer));
  request.input("observaciones", sql.NVarChar(sql.MAX), buildOrderNotes(payload.customer));
  request.input("importe", sql.Money, total);
  request.input("importeSinIva", sql.Money, netTotal);
  request.input("importeInsumos", sql.Money, netTotal);
  request.input("importeIva", sql.Money, taxTotal);
  request.input("netoGravado", sql.Money, netTotal);
  request.input("netoNoGravado", sql.Money, 0);
  request.input("moneda", sql.NVarChar(4), truncate(currency, 4));
  request.input("idVendedor", sql.NVarChar(4), context.vendorId);
  request.input("clasePrecio", sql.Int, context.classPrice);
  request.input("unegocioDestino", sql.NVarChar(4), context.unitBusiness);
  request.input("idLista", sql.NVarChar(4), context.priceListId);
  request.input("idMotivoCpraVta", sql.NVarChar(4), context.saleReasonId);
  request.input("idDeposito", sql.NVarChar(4), context.depositId);
  request.input("alicIva", sql.Float, maxTaxRate);
  request.input("unegocio", sql.NVarChar(4), context.unitBusiness);
  request.input("fechaHoraGrabacion", sql.DateTime, new Date());
  request.input("sucursal", sql.NVarChar(4), comprobante.sucursal);
  request.input("numero", sql.NVarChar(8), comprobante.numero);
  request.input("letra", sql.NVarChar(1), comprobante.letra);
  request.input("usuario", sql.NVarChar(50), truncate(context.orderUser, 50));

  const result: IResult<HeaderInsertRow> = await request.query(`
    INSERT INTO dbo.V_MV_Cpte (
      TC,
      IDCOMPROBANTE,
      IDCOMPLEMENTO,
      FECHA,
      FECHAESTFIN,
      FECHAESTINICIO,
      CUENTA,
      NOMBRE,
      DOMICILIO,
      TELEFONO,
      LOCALIDAD,
      CODIGOPOSTAL,
      DOCUMENTOTIPO,
      DOCUMENTONUMERO,
      CONDICIONIVA,
      IDCOND_CPRA_VTA,
      COMENTARIOS,
      OBSERVACIONES,
      IMPORTE,
      IMPORTE_S_IVA,
      ImporteInsumos,
      ImporteIva,
      NetoGravado,
      NetoNoGravado,
      MONEDA,
      IDVENDEDOR,
      CLASEPRECIO,
      UNEGOCIO_DESTINO,
      IdLista,
      IDMOTIVOCPRAVTA,
      IDDEPOSITO,
      AlicIva,
      UNEGOCIO,
      FechaHora_Grabacion,
      SUCURSAL,
      NUMERO,
      LETRA,
      Usuario,
      FINALIZADA,
      ANULADA,
      APROBADO,
      Complementario,
      Impreso,
      ExentoIVAServicios,
      ExentoIVAArticulos,
      ExentoIVAOtros
    )
    OUTPUT INSERTED.ID
    VALUES (
      @tc,
      @idComprobante,
      0,
      @fecha,
      @fecha,
      @fecha,
      @cuenta,
      @nombre,
      @domicilio,
      @telefono,
      @localidad,
      @codigoPostal,
      @documentoTipo,
      @documentoNumero,
      @condicionIva,
      @idCondCpraVta,
      @comentarios,
      @observaciones,
      @importe,
      @importeSinIva,
      @importeInsumos,
      @importeIva,
      @netoGravado,
      @netoNoGravado,
      @moneda,
      @idVendedor,
      @clasePrecio,
      @unegocioDestino,
      @idLista,
      @idMotivoCpraVta,
      @idDeposito,
      @alicIva,
      @unegocio,
      @fechaHoraGrabacion,
      @sucursal,
      @numero,
      @letra,
      @usuario,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
  `);

  return result.recordset[0]?.ID ?? null;
}

async function insertDetailLine(
  executor: Executor,
  context: SalesContext,
  comprobante: ComprobanteParts,
  line: OrderLine,
) {
  const request = createRequest(executor);

  request.input("tc", sql.NVarChar(4), context.tc);
  request.input("idComprobante", sql.NVarChar(13), comprobante.idComprobante);
  request.input("secuencia", sql.Int, line.sequence);
  request.input("clasePrecio", sql.SmallInt, context.classPrice);
  request.input("idArticulo", sql.NVarChar(25), line.product.id);
  request.input("descripcion", sql.NVarChar(100), truncate(line.product.description, 100));
  request.input("idUnidad", sql.NVarChar(4), normalizeCode(line.product.unitId || "1", 4));
  request.input("cantidadUd", sql.Float, line.quantity);
  request.input("cantidad", sql.Float, line.quantity);
  request.input("importeSinIva", sql.Money, line.product.netPrice);
  request.input("importe", sql.Money, line.product.netPrice);
  request.input("impuestos", sql.Money, line.lineTax);
  request.input("total", sql.Money, line.lineTotal);
  request.input("exento", sql.Bit, line.product.taxRate === 0 ? 1 : 0);
  request.input("idLista", sql.NVarChar(4), context.priceListId);
  request.input("porcDto", sql.Float, 0);
  request.input("importeDto", sql.Money, 0);
  request.input("alicIva", sql.Money, line.product.taxRate);
  request.input("idUnidadBase", sql.NVarChar(4), normalizeCode(line.product.unitId || "1", 4));
  request.input("totalFinal", sql.Money, line.lineTotal);
  request.input("codigoBarra", sql.NVarChar(25), line.product.barcode);
  request.input("presentacion", sql.NVarChar(50), truncate(line.product.presentation || "", 50));
  request.input("idTipo", sql.NVarChar(4), normalizeCode(line.product.typeId || "1", 4));
  request.input("costo", sql.Money, line.product.cost);
  request.input("equivUnidadBase", sql.Float, 1);
  request.input("idDeposito", sql.NVarChar(4), context.depositId);
  request.input("cantBl", sql.Float, 0);
  request.input("cantKg", sql.Float, 0);
  request.input("cantM3", sql.Float, 0);

  await request.query(`
    INSERT INTO dbo.V_MV_CpteInsumos (
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
      IMPUESTOS,
      TOTAL,
      EXENTO,
      IdLista,
      CLASEPRECIO,
      PorcDto,
      ImporteDto,
      AlicIVA,
      IDUNIDADBASE,
      TotalFinal,
      CODIGOBARRA,
      PRESENTACION,
      IdTipo,
      EQUIV_UDBASE,
      IdDeposito,
      SECUENCIA,
      CANT_BL,
      CANT_KG,
      CANT_M3
    )
    VALUES (
      @tc,
      @idComprobante,
      0,
      @idArticulo,
      @descripcion,
      @idUnidad,
      @cantidadUd,
      @cantidad,
      @costo,
      @importe,
      @importeSinIva,
      @impuestos,
      @total,
      @exento,
      @idLista,
      @clasePrecio,
      @porcDto,
      @importeDto,
      @alicIva,
      @idUnidadBase,
      @totalFinal,
      @codigoBarra,
      @presentacion,
      @idTipo,
      @equivUnidadBase,
      @idDeposito,
      @secuencia,
      @cantBl,
      @cantKg,
      @cantM3
    );
  `);
}

async function insertStockMovement(
  executor: Executor,
  context: SalesContext,
  comprobante: ComprobanteParts,
  line: OrderLine,
) {
  if (!context.writeStockMovements) return;

  const request = createRequest(executor);

  request.input("tc", sql.NVarChar(4), context.tc);
  request.input("idComprobante", sql.NVarChar(13), comprobante.idComprobante);
  request.input("secuencia", sql.Int, line.sequence);
  request.input("fecha", sql.DateTime, new Date());
  request.input("idArticulo", sql.NVarChar(25), line.product.id);
  request.input("descripcion", sql.NVarChar(100), truncate(line.product.description, 100));
  request.input("idUnidad", sql.NVarChar(4), normalizeCode(line.product.unitId || "1", 4));
  request.input("cantidadUd", sql.Float, line.quantity * -1);
  request.input("cantidad", sql.Float, line.quantity * -1);
  request.input("costo", sql.Money, line.product.cost);
  request.input("precioVenta", sql.Money, line.product.price);
  request.input("ivari", sql.Money, line.product.taxRate);
  request.input("impuestos", sql.Money, line.lineTax);
  request.input("idLista", sql.NVarChar(4), context.priceListId);
  request.input("clasePrecio", sql.SmallInt, context.classPrice);
  request.input("cuentaProveedor", sql.NVarChar(15), line.product.supplierAccount || "");
  request.input("idDeposito", sql.NVarChar(4), context.depositId);
  request.input("idMotivoStock", sql.NVarChar(4), context.stockReasonId);
  request.input("idUnidadBase", sql.NVarChar(4), normalizeCode(line.product.unitId || "1", 4));
  request.input("idVendedor", sql.NVarChar(4), context.vendorId);
  request.input("unegocio", sql.NVarChar(4), context.unitBusiness);
  request.input("importeSinIva", sql.Money, line.product.netPrice);
  request.input("udPr", sql.NVarChar(4), normalizeCode(line.product.unitId || "1", 4));
  request.input("importeUd", sql.Money, line.product.netPrice);
  request.input("cantBl", sql.Float, 0);
  request.input("cantKg", sql.Float, 0);
  request.input("cantM3", sql.Float, 0);

  await request.query(`
    INSERT INTO dbo.V_MV_Stock (
      TC,
      IDCOMPROBANTE,
      IDCOMPLEMENTO,
      SECUENCIA,
      FECHA,
      IDArticulo,
      Descripcion,
      IDUnidad,
      CantidadUD,
      Cantidad,
      Costo,
      PrecioVenta,
      IVARI,
      IMPUESTOS,
      IdLista,
      ClasePrecio,
      CuentaProveedor,
      IdDeposito,
      Revisado,
      Anulado,
      IdMotivoStock,
      IdUnidadBase,
      IDVENDEDOR,
      UNEGOCIO,
      IMPORTE_S_IVA,
      UD_PR,
      IMPORTE_UD,
      CANT_BL,
      CANT_KG,
      CANT_M3
    )
    VALUES (
      @tc,
      @idComprobante,
      0,
      @secuencia,
      @fecha,
      @idArticulo,
      @descripcion,
      @idUnidad,
      @cantidadUd,
      @cantidad,
      @costo,
      @precioVenta,
      @ivari,
      @impuestos,
      @idLista,
      @clasePrecio,
      @cuentaProveedor,
      @idDeposito,
      1,
      0,
      @idMotivoStock,
      @idUnidadBase,
      @idVendedor,
      @unegocio,
      @importeSinIva,
      @udPr,
      @importeUd,
      @cantBl,
      @cantKg,
      @cantM3
    );
  `);
}

export async function createOrder(payload: CreateOrderPayload): Promise<OrderSummary> {
  validatePayload(payload);

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const context = await resolveSalesContext(transaction);

    if (!context.customerAccount) {
      throw new Error(
        "No se encontró la cuenta cliente por defecto. Definí APP_CUSTOMER_ACCOUNT o CUENTACONSUMIDORFINAL.",
      );
    }

    const productIds = payload.items.map((item) => item.productId.trim());
    const products = await getProductsByIds(productIds, transaction);
    const lines = buildLines(payload, products, context.allowBackorders);
    const comprobante = await getNextComprobante(
      transaction,
      context.tc,
      context.branch,
      context.letter,
    );

    const headerId = await insertHeader(
      transaction,
      context,
      comprobante,
      payload,
      lines,
    );

    for (const line of lines) {
      await insertDetailLine(transaction, context, comprobante, line);
      await insertStockMovement(transaction, context, comprobante, line);
    }

    await transaction.commit();

    return {
      tc: context.tc,
      idComprobante: comprobante.idComprobante,
      internalId: headerId,
      total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
function createRequest(executor: Executor) {
  if ("begin" in executor) {
    return new sql.Request(executor);
  }

  return executor.request();
}
