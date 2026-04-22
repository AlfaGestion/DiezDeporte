const fs = require("fs");
const path = require("path");
const sql = require("mssql");
const mysql = require("mysql2");
const mysqlPromise = require("mysql2/promise");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");
const DEFAULT_MYSQL_DATABASE = "diezdeportes_web";
const DEFAULT_BATCH_SIZE = 500;

const USED_OBJECTS = [
  "dbo.TA_CONFIGURACION",
  "dbo.TA_UsuariosWeb",
  "dbo.MA_CUENTAS",
  "dbo.WEB_V_MV_PEDIDOS",
  "dbo.WEB_V_MV_PEDIDOS_LOGS",
  "dbo.WEB_V_MA_ARTICULOS_BLOQUEADOS",
  "dbo.V_MA_ARTICULOS",
  "dbo.V_MV_Stock",
  "dbo.V_MV_Cpte",
  "dbo.V_MV_CpteInsumos",
  "dbo.VT_CLIENTES",
  "dbo.V_TA_TipoArticulo",
  "dbo.V_TA_Rubros",
  "dbo.V_TA_Unidad",
  "dbo.V_TA_DEPOSITO",
  "dbo.V_TA_MotivoStock",
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalIndex = line.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function normalizeName(fullName) {
  const [schema, name] = fullName.split(".");
  return {
    schema,
    name,
    mysqlName: `${schema}_${name}`,
  };
}

function escapeSqlServerName(name) {
  return `[${String(name).replace(/]/g, "]]")}]`;
}

function getSqlServerObjectReference(fullName) {
  const { schema, name } = normalizeName(fullName);
  return `${escapeSqlServerName(schema)}.${escapeSqlServerName(name)}`;
}

function resolveMysqlConfig() {
  const host =
    process.env.DONWEB_MYSQL_HOST?.trim() ||
    process.env.MYSQL_HOST?.trim() ||
    process.env.DB_MYSQL_HOST?.trim();
  const user =
    process.env.DONWEB_MYSQL_USER?.trim() ||
    process.env.MYSQL_USER?.trim() ||
    process.env.DB_MYSQL_USER?.trim();
  const password =
    process.env.DONWEB_MYSQL_PASSWORD ??
    process.env.MYSQL_PASSWORD ??
    process.env.DB_MYSQL_PASSWORD;
  const database =
    process.env.DONWEB_MYSQL_DATABASE?.trim() ||
    process.env.MYSQL_DATABASE?.trim() ||
    process.env.DB_MYSQL_DATABASE?.trim() ||
    DEFAULT_MYSQL_DATABASE;
  const port = Number(
    process.env.DONWEB_MYSQL_PORT ||
      process.env.MYSQL_PORT ||
      process.env.DB_MYSQL_PORT ||
      "3306",
  );

  if (!host || !user || password == null) {
    throw new Error(
      "Faltan credenciales MySQL. Usa DONWEB_MYSQL_HOST, DONWEB_MYSQL_USER y DONWEB_MYSQL_PASSWORD.",
    );
  }

  return {
    host,
    user,
    password,
    database,
    port,
  };
}

function resolveBatchSize() {
  const batchSize = Number(
    process.env.DONWEB_SYNC_BATCH_SIZE || DEFAULT_BATCH_SIZE,
  );

  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.floor(batchSize);
}

async function createSqlServerPool() {
  const server = process.env.DB_SERVER?.trim();
  const database = process.env.DB_DATABASE?.trim();

  if (!server || !database) {
    throw new Error("Faltan DB_SERVER o DB_DATABASE para conectar a SQL Server.");
  }

  return sql.connect({
    user: process.env.DB_USER?.trim(),
    password: process.env.DB_PASSWORD,
    server,
    database,
    port: Number(process.env.DB_PORT || "1433"),
    pool: {
      max: 4,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: ["1", "true", "yes", "si", "on"].includes(
        String(process.env.DB_ENCRYPT || "").trim().toLowerCase(),
      ),
      trustServerCertificate: !["0", "false", "no", "off"].includes(
        String(process.env.DB_TRUST_CERT || "true").trim().toLowerCase(),
      ),
    },
  });
}

async function getColumns(pool, fullName) {
  const request = pool.request();
  request.input("fullName", sql.NVarChar(256), fullName);

  const result = await request.query(`
    SELECT
      c.column_id AS columnId,
      c.name AS columnName
    FROM sys.columns c
    INNER JOIN sys.objects o
      ON o.object_id = c.object_id
    INNER JOIN sys.schemas s
      ON s.schema_id = o.schema_id
    WHERE CONCAT(s.name, '.', o.name) = @fullName
    ORDER BY c.column_id;
  `);

  return result.recordset.map((row) => row.columnName);
}

async function getSourceRowCount(pool, fullName) {
  const request = pool.request();
  const objectReference = getSqlServerObjectReference(fullName);
  const result = await request.query(
    `SELECT COUNT_BIG(1) AS total FROM ${objectReference};`,
  );
  return Number(result.recordset[0]?.total || 0);
}

async function getTargetRowCount(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total FROM ${mysql.escapeId(tableName)};`,
  );
  return Number(rows[0]?.total || 0);
}

async function ensureTargetTables(connection) {
  const [rows] = await connection.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE();
  `);

  const availableTables = new Set(rows.map((row) => row.table_name));
  const missingTables = USED_OBJECTS.map((name) => normalizeName(name).mysqlName).filter(
    (name) => !availableTables.has(name),
  );

  if (missingTables.length > 0) {
    throw new Error(
      `Faltan tablas en MySQL: ${missingTables.join(", ")}. Ejecuta antes el bootstrap.`,
    );
  }
}

async function clearTargetTable(connection, tableName) {
  try {
    await connection.query(`TRUNCATE TABLE ${mysql.escapeId(tableName)};`);
  } catch (error) {
    await connection.query(`DELETE FROM ${mysql.escapeId(tableName)};`);
  }
}

function normalizeMysqlValue(value) {
  if (value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

async function insertBatch(connection, tableName, columns, rows) {
  if (rows.length === 0) {
    return;
  }

  const placeholders = rows
    .map(() => `(${columns.map(() => "?").join(", ")})`)
    .join(", ");
  const values = [];

  for (const row of rows) {
    for (const columnName of columns) {
      values.push(normalizeMysqlValue(row[columnName]));
    }
  }

  const sqlText = `
    INSERT INTO ${mysql.escapeId(tableName)} (
      ${columns.map((columnName) => mysql.escapeId(columnName)).join(", ")}
    )
    VALUES ${placeholders};
  `;

  await connection.query(sqlText, values);
}

async function copyTable(pool, connection, fullName, batchSize) {
  const { mysqlName } = normalizeName(fullName);
  const columns = await getColumns(pool, fullName);

  if (columns.length === 0) {
    throw new Error(`No se encontraron columnas para ${fullName}.`);
  }

  const sourceRowCount = await getSourceRowCount(pool, fullName);
  const sourceObjectReference = getSqlServerObjectReference(fullName);
  const sourceColumnsSql = columns
    .map((columnName) => escapeSqlServerName(columnName))
    .join(", ");

  await clearTargetTable(connection, mysqlName);

  if (sourceRowCount === 0) {
    return {
      tableName: mysqlName,
      sourceRowCount,
      insertedRowCount: 0,
      targetRowCount: 0,
    };
  }

  let currentBatch = [];
  let insertedRowCount = 0;

  await new Promise((resolve, reject) => {
    const request = new sql.Request(pool);
    request.stream = true;
    let settled = false;
    let flushQueue = Promise.resolve();

    const rejectOnce = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const resolveOnce = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    const flushCurrentBatch = async () => {
      if (currentBatch.length === 0) {
        return;
      }

      const rowsToInsert = currentBatch;
      currentBatch = [];
      await insertBatch(connection, mysqlName, columns, rowsToInsert);
      insertedRowCount += rowsToInsert.length;
    };

    request.on("row", (row) => {
      currentBatch.push(row);

      if (currentBatch.length < batchSize) {
        return;
      }

      request.pause();
      flushQueue = flushQueue
        .then(() => flushCurrentBatch())
        .then(() => {
          if (!settled) {
            request.resume();
          }
        })
        .catch((error) => {
          try {
            request.cancel();
          } catch {
            // no-op
          }
          rejectOnce(error);
        });
    });

    request.on("error", (error) => {
      rejectOnce(error);
    });

    request.on("done", () => {
      flushQueue
        .then(() => flushCurrentBatch())
        .then(() => resolveOnce())
        .catch((error) => rejectOnce(error));
    });

    request.query(`SELECT ${sourceColumnsSql} FROM ${sourceObjectReference};`);
  });

  const targetRowCount = await getTargetRowCount(connection, mysqlName);

  return {
    tableName: mysqlName,
    sourceRowCount,
    insertedRowCount,
    targetRowCount,
  };
}

async function main() {
  loadEnvFile(ENV_PATH);

  const mysqlConfig = resolveMysqlConfig();
  const batchSize = resolveBatchSize();
  const sqlServerPool = await createSqlServerPool();
  const mysqlConnection = await mysqlPromise.createConnection({
    host: mysqlConfig.host,
    user: mysqlConfig.user,
    password: mysqlConfig.password,
    database: mysqlConfig.database,
    port: mysqlConfig.port,
    charset: "utf8mb4",
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  try {
    await ensureTargetTables(mysqlConnection);
    await mysqlConnection.query("SET FOREIGN_KEY_CHECKS = 0;");

    console.log(
      `Sincronizando ${USED_OBJECTS.length} tablas desde SQL Server hacia MySQL (${mysqlConfig.database})...`,
    );

    const results = [];
    for (const fullName of USED_OBJECTS) {
      console.log(`- Copiando ${fullName}...`);
      const result = await copyTable(
        sqlServerPool,
        mysqlConnection,
        fullName,
        batchSize,
      );
      results.push({ sourceName: fullName, ...result });
      console.log(
        `  OK ${result.insertedRowCount}/${result.sourceRowCount} filas -> ${result.tableName}`,
      );
    }

    const mismatches = results.filter(
      (result) => result.sourceRowCount !== result.targetRowCount,
    );

    console.log("");
    console.log("Resumen de sincronizacion:");
    for (const result of results) {
      console.log(
        `- ${result.sourceName}: SQL ${result.sourceRowCount} | MySQL ${result.targetRowCount}`,
      );
    }

    if (mismatches.length > 0) {
      throw new Error(
        `La sincronizacion termino con diferencias de conteo en: ${mismatches
          .map((result) => result.sourceName)
          .join(", ")}`,
      );
    }

    console.log("");
    console.log("Sincronizacion completa sin diferencias de conteo.");
  } finally {
    try {
      await mysqlConnection.query("SET FOREIGN_KEY_CHECKS = 1;");
    } catch {
      // no-op
    }
    await mysqlConnection.end();
    await sqlServerPool.close();
  }
}

main().catch((error) => {
  console.error("No se pudo sincronizar SQL Server con MySQL.");
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
