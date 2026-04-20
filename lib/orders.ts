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

type SqlErrorLike = Error & {
  number?: number;
  originalError?: { info?: { message?: string; number?: number }; message?: string; number?: number };
  precedingErrors?: Array<{ message?: string; number?: number }>;
};

const ORDER_INSERT_MAX_ATTEMPTS = 3;
const DUPLICATE_KEY_ERROR_NUMBERS = new Set([2601, 2627]);

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
};

export type CreateOrderOptions = {
  orderTc?: string;
  paymentCondition?: string;
  orderUser?: string;
};

export type OrderLine = {
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

export type OrderQuote = {
  lines: OrderLine[];
  total: number;
  itemCount: number;
  currency: string;
};

function setInput(request: ReturnType<typeof createRequest>, name: string, value: unknown) {
  request.input(name, value);
}

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

async function resolveSalesContext(
  executor: Executor,
  options: CreateOrderOptions = {},
): Promise<SalesContext> {
  const settings = await getServerSettings();
  const config = await getConfigurationRows(executor);

  return {
    tc:
      options.orderTc ||
      settings.orderTc ||
      config.get("APP_WEB_TC_DEFAULT_CARRO") ||
      "NP",
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
    paymentCondition: normalizeCode(
      options.paymentCondition || settings.paymentCondition || "1",
      4,
    ),
    orderUser: options.orderUser || settings.orderUser || "web-shop",
    depositId: settings.stockDepositId
      ? normalizeCode(settings.stockDepositId, 4)
      : null,
    writeStockMovements: settings.writeStockMovements,
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

  const request = createRequest(executor);
  setInput(request, "tc", tc);
  setInput(request, "branch", normalizedBranch);
  setInput(request, "letter", normalizedLetter);

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

export function validatePayload(payload: CreateOrderPayload) {
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

export async function quoteOrderPayload(
  payload: CreateOrderPayload,
  executor?: Executor,
): Promise<OrderQuote> {
  validatePayload(payload);

  const settings = await getServerSettings();
  const productIds = payload.items.map((item) => item.productId.trim());
  const products = await getProductsByIds(productIds, executor);
  const lines = buildLines(payload, products, settings.allowBackorders);

  return {
    lines,
    total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    currency: lines[0]?.product.currency || "ARS",
  };
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

  setInput(request, "tc", context.tc);
  setInput(request, "idComprobante", comprobante.idComprobante);
  setInput(request, "fecha", new Date());
  setInput(request, "cuenta", context.customerAccount || null);
  setInput(request, "nombre", truncate(payload.customer.fullName, 50));
  setInput(request, "domicilio", truncate(payload.customer.address, 50));
  setInput(request, "telefono", payload.customer.phone || null);
  setInput(request, "localidad", truncate(payload.customer.city, 50));
  setInput(
    request,
    "codigoPostal",
    truncate(payload.customer.postalCode || "", 10) || null,
  );
  setInput(request, "documentoTipo", context.documentType);
  setInput(
    request,
    "documentoNumero",
    truncate(payload.customer.documentNumber || "", 13) || null,
  );
  setInput(request, "condicionIva", context.ivaCondition);
  setInput(request, "idCondCpraVta", context.paymentCondition);
  setInput(request, "comentarios", buildOrderComment(payload.customer));
  setInput(request, "observaciones", buildOrderNotes(payload.customer));
  setInput(request, "importe", total);
  setInput(request, "importeSinIva", netTotal);
  setInput(request, "importeInsumos", netTotal);
  setInput(request, "importeIva", taxTotal);
  setInput(request, "netoGravado", netTotal);
  setInput(request, "netoNoGravado", 0);
  setInput(request, "moneda", truncate(currency, 4));
  setInput(request, "idVendedor", context.vendorId);
  setInput(request, "clasePrecio", context.classPrice);
  setInput(request, "unegocioDestino", context.unitBusiness);
  setInput(request, "idLista", context.priceListId);
  setInput(request, "idMotivoCpraVta", context.saleReasonId);
  setInput(request, "idDeposito", context.depositId);
  setInput(request, "alicIva", maxTaxRate);
  setInput(request, "unegocio", context.unitBusiness);
  setInput(request, "fechaHoraGrabacion", new Date());
  setInput(request, "sucursal", comprobante.sucursal);
  setInput(request, "numero", comprobante.numero);
  setInput(request, "letra", comprobante.letra);
  setInput(request, "usuario", truncate(context.orderUser, 50));

  const result: IResult<HeaderInsertRow> = await request.query(`
    SET DATEFORMAT dmy;

    DECLARE @InsertedHeader TABLE (
      ID numeric(18, 0)
    );

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
    OUTPUT INSERTED.ID INTO @InsertedHeader (ID)
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

    SELECT TOP (1) CAST(ID AS int) AS ID
    FROM @InsertedHeader;
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

  setInput(request, "tc", context.tc);
  setInput(request, "idComprobante", comprobante.idComprobante);
  setInput(request, "secuencia", line.sequence);
  setInput(request, "clasePrecio", context.classPrice);
  setInput(request, "idArticulo", line.product.id);
  setInput(request, "descripcion", truncate(line.product.description, 100));
  setInput(request, "idUnidad", normalizeCode(line.product.unitId || "1", 4));
  setInput(request, "cantidadUd", line.quantity);
  setInput(request, "cantidad", line.quantity);
  setInput(request, "importeSinIva", line.product.netPrice);
  setInput(request, "importe", line.product.netPrice);
  setInput(request, "impuestos", line.lineTax);
  setInput(request, "total", line.lineTotal);
  setInput(request, "exento", line.product.taxRate === 0 ? 1 : 0);
  setInput(request, "idLista", context.priceListId);
  setInput(request, "porcDto", 0);
  setInput(request, "importeDto", 0);
  setInput(request, "alicIva", line.product.taxRate);
  setInput(request, "idUnidadBase", normalizeCode(line.product.unitId || "1", 4));
  setInput(request, "totalFinal", line.lineTotal);
  setInput(request, "codigoBarra", line.product.barcode);
  setInput(request, "presentacion", truncate(line.product.presentation || "", 50));
  setInput(request, "idTipo", normalizeCode(line.product.typeId || "1", 4));
  setInput(request, "costo", line.product.cost);
  setInput(request, "equivUnidadBase", 1);
  setInput(request, "idDeposito", context.depositId);
  setInput(request, "cantBl", 0);
  setInput(request, "cantKg", 0);
  setInput(request, "cantM3", 0);

  await request.query(`
    SET DATEFORMAT dmy;

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

  setInput(request, "tc", context.tc);
  setInput(request, "idComprobante", comprobante.idComprobante);
  setInput(request, "secuencia", line.sequence);
  setInput(request, "fecha", new Date());
  setInput(request, "idArticulo", line.product.id);
  setInput(request, "descripcion", truncate(line.product.description, 100));
  setInput(request, "idUnidad", normalizeCode(line.product.unitId || "1", 4));
  setInput(request, "cantidadUd", line.quantity * -1);
  setInput(request, "cantidad", line.quantity * -1);
  setInput(request, "costo", line.product.cost);
  setInput(request, "precioVenta", line.product.price);
  setInput(request, "ivari", line.product.taxRate);
  setInput(request, "impuestos", line.lineTax);
  setInput(request, "idLista", context.priceListId);
  setInput(request, "clasePrecio", context.classPrice);
  setInput(request, "cuentaProveedor", line.product.supplierAccount || "");
  setInput(request, "idDeposito", context.depositId);
  setInput(request, "idMotivoStock", context.stockReasonId);
  setInput(request, "idUnidadBase", normalizeCode(line.product.unitId || "1", 4));
  setInput(request, "idVendedor", context.vendorId);
  setInput(request, "unegocio", context.unitBusiness);
  setInput(request, "importeSinIva", line.product.netPrice);
  setInput(request, "udPr", normalizeCode(line.product.unitId || "1", 4));
  setInput(request, "importeUd", line.product.netPrice);
  setInput(request, "cantBl", 0);
  setInput(request, "cantKg", 0);
  setInput(request, "cantM3", 0);

  await request.query(`
    SET DATEFORMAT dmy;

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

export async function createOrderWithExecutor(
  executor: Executor,
  payload: CreateOrderPayload,
  options: CreateOrderOptions = {},
): Promise<OrderSummary> {
  await createRequest(executor).query(`
    SET DATEFORMAT dmy;
  `);

  const context = await resolveSalesContext(executor, options);

  if (!context.customerAccount) {
    throw new Error(
      "No se encontrÃ³ la cuenta cliente por defecto. DefinÃ­ APP_CUSTOMER_ACCOUNT o CUENTACONSUMIDORFINAL.",
    );
  }

  const quote = await quoteOrderPayload(payload, executor);
  const lines = quote.lines;
  const comprobante = await getNextComprobante(
    executor,
    context.tc,
    context.branch,
    context.letter,
  );

  const headerId = await insertHeader(
    executor,
    context,
    comprobante,
    payload,
    lines,
  );

  for (const line of lines) {
    await insertDetailLine(executor, context, comprobante, line);
    await insertStockMovement(executor, context, comprobante, line);
  }

  return {
    tc: context.tc,
    idComprobante: comprobante.idComprobante,
    internalId: headerId,
    total: quote.total,
    itemCount: quote.itemCount,
  };
}

export async function createOrder(
  payload: CreateOrderPayload,
  options: CreateOrderOptions = {},
): Promise<OrderSummary> {
  validatePayload(payload);

  const pool = await getConnection();
  for (let attempt = 1; attempt <= ORDER_INSERT_MAX_ATTEMPTS; attempt += 1) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      const order = await createOrderWithExecutor(transaction, payload, options);
      await transaction.commit();
      return order;

    await createRequest(transaction).query(`
      SET DATEFORMAT dmy;
    `);

    const context = await resolveSalesContext(transaction, options);

    if (!context.customerAccount) {
      throw new Error(
        "No se encontró la cuenta cliente por defecto. Definí APP_CUSTOMER_ACCOUNT o CUENTACONSUMIDORFINAL.",
      );
    }

    const quote = await quoteOrderPayload(payload, transaction);
    const lines = quote.lines;
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
        total: quote.total,
        itemCount: quote.itemCount,
      };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Order rollback failed", rollbackError);
      }

      if (
        attempt < ORDER_INSERT_MAX_ATTEMPTS &&
        isDuplicateComprobanteError(error)
      ) {
        console.warn(
          `Duplicate comprobante detected on attempt ${attempt}. Retrying order insert.`,
        );
        continue;
      }

      throw normalizeOrderError(error);
    }
  }

  throw new Error("No se pudo grabar el pedido.");
}

function normalizeOrderError(error: unknown) {
  if (!(error instanceof Error)) {
    return new Error("No se pudo grabar el pedido.");
  }

  const messages = collectSqlErrorMessages(error as SqlErrorLike);
  const rootMessage =
    messages.find((message) => message !== "Transaction has been aborted.") ||
    error.message;

  const normalized = new Error(rootMessage);
  normalized.name = error.name;
  normalized.stack = error.stack;
  return normalized;
}

function collectSqlErrorMessages(error: SqlErrorLike) {
  const messages = new Set<string>();

  if (error.message?.trim()) {
    messages.add(error.message.trim());
  }

  const originalMessage = error.originalError?.info?.message || error.originalError?.message;
  if (originalMessage?.trim()) {
    messages.add(originalMessage.trim());
  }

  for (const precedingError of error.precedingErrors || []) {
    if (precedingError.message?.trim()) {
      messages.add(precedingError.message.trim());
    }
  }

  return Array.from(messages);
}

function collectSqlErrorNumbers(error: SqlErrorLike) {
  const numbers = new Set<number>();

  if (typeof error.number === "number") {
    numbers.add(error.number);
  }

  const originalNumber = error.originalError?.info?.number || error.originalError?.number;
  if (typeof originalNumber === "number") {
    numbers.add(originalNumber);
  }

  for (const precedingError of error.precedingErrors || []) {
    if (typeof precedingError.number === "number") {
      numbers.add(precedingError.number);
    }
  }

  return Array.from(numbers);
}

function isDuplicateComprobanteError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const sqlError = error as SqlErrorLike;
  const numbers = collectSqlErrorNumbers(sqlError);
  const hasDuplicateNumber = numbers.some((number) =>
    DUPLICATE_KEY_ERROR_NUMBERS.has(number),
  );

  if (!hasDuplicateNumber) {
    return false;
  }

  const messages = collectSqlErrorMessages(sqlError).map((message) =>
    message.toLowerCase(),
  );

  return messages.some(
    (message) =>
      message.includes("dbo.v_mv_cpte") ||
      message.includes("pk_v_mv_cpte") ||
      message.includes("idcomprobante"),
  );
}

function createRequest(executor: Executor) {
  if ("begin" in executor) {
    return new sql.Request(executor);
  }

  return executor.request();
}
