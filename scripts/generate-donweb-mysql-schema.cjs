const fs = require("fs");
const path = require("path");
const sql = require("mssql");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "database", "donweb");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "mysql_used_objects.sql");

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

const USED_STORED_PROCEDURES = [
  "dbo.wsSysMobileSPPedidosV_MV_CPTE",
  "dbo.wsSysMobileSPPedidosV_MV_CPTEINSUMOS",
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

function mapSqlServerTypeToMysql(column) {
  const dataType = String(column.dataType || "").toLowerCase();
  const maxLength = Number(column.maxLength || 0);
  const precision = Number(column.precision || 0);
  const scale = Number(column.scale || 0);

  switch (dataType) {
    case "bigint":
      return "BIGINT";
    case "int":
      return "INT";
    case "smallint":
      return "SMALLINT";
    case "tinyint":
      return "TINYINT";
    case "bit":
      return "TINYINT(1)";
    case "decimal":
    case "numeric":
      return `DECIMAL(${precision || 18}, ${scale || 0})`;
    case "money":
      return "DECIMAL(19, 4)";
    case "smallmoney":
      return "DECIMAL(10, 4)";
    case "float":
      return "DOUBLE";
    case "real":
      return "FLOAT";
    case "date":
      return "DATE";
    case "datetime":
    case "datetime2":
    case "smalldatetime":
      return "DATETIME";
    case "time":
      return "TIME";
    case "uniqueidentifier":
      return "CHAR(36)";
    case "char":
      return `CHAR(${Math.max(maxLength, 1)})`;
    case "nchar":
      return `CHAR(${Math.max(Math.floor(maxLength / 2), 1)})`;
    case "varchar":
      return maxLength < 0 ? "LONGTEXT" : `VARCHAR(${Math.max(maxLength, 1)})`;
    case "nvarchar":
      return maxLength < 0
        ? "LONGTEXT"
        : `VARCHAR(${Math.max(Math.floor(maxLength / 2), 1)})`;
    case "text":
    case "ntext":
      return "LONGTEXT";
    case "binary":
    case "varbinary":
    case "image":
      return "LONGBLOB";
    default:
      return "LONGTEXT";
  }
}

function mapDefaultValue(column) {
  const raw = String(column.defaultDefinition || "").trim();
  if (!raw) {
    return "";
  }

  const normalized = raw.replace(/^\(+|\)+$/g, "").trim();
  if (!normalized) {
    return "";
  }

  if (/^sysdatetime\(\)$/i.test(normalized) || /^getdate\(\)$/i.test(normalized)) {
    return " DEFAULT CURRENT_TIMESTAMP";
  }

  if (/^(0|1|-?\d+(\.\d+)?)$/i.test(normalized)) {
    return ` DEFAULT ${normalized}`;
  }

  if (/^N?'.*'$/i.test(normalized)) {
    const value = normalized.replace(/^N?'/i, "'").replace(/''/g, "'");
    return ` DEFAULT ${value}`;
  }

  return "";
}

function buildColumnLine(column, primaryKeys) {
  const mysqlType = mapSqlServerTypeToMysql(column);
  const nullable = column.isNullable ? "NULL" : "NOT NULL";
  const isIntegerIdentity =
    column.isIdentity &&
    ["bigint", "int", "smallint", "tinyint"].includes(
      String(column.dataType || "").toLowerCase(),
    );
  const autoIncrement = isIntegerIdentity ? " AUTO_INCREMENT" : "";
  const defaultValue =
    primaryKeys.includes(column.columnName) && isIntegerIdentity
      ? ""
      : mapDefaultValue(column);

  return `  \`${column.columnName}\` ${mysqlType} ${nullable}${autoIncrement}${defaultValue}`;
}

async function getObjectMetadata(pool, fullName) {
  const request = pool.request();
  request.input("fullName", sql.NVarChar(256), fullName);

  const objectResult = await request.query(`
    SELECT
      s.name AS schemaName,
      o.name AS objectName,
      o.type AS objectType
    FROM sys.objects o
    INNER JOIN sys.schemas s
      ON s.schema_id = o.schema_id
    WHERE CONCAT(s.name, '.', o.name) = @fullName;
  `);

  return objectResult.recordset[0] || null;
}

async function getColumns(pool, fullName) {
  const request = pool.request();
  request.input("fullName", sql.NVarChar(256), fullName);

  const result = await request.query(`
    SELECT
      c.column_id AS columnId,
      c.name AS columnName,
      t.name AS dataType,
      c.max_length AS maxLength,
      c.precision AS precision,
      c.scale AS scale,
      c.is_nullable AS isNullable,
      c.is_identity AS isIdentity,
      dc.definition AS defaultDefinition
    FROM sys.columns c
    INNER JOIN sys.objects o
      ON o.object_id = c.object_id
    INNER JOIN sys.schemas s
      ON s.schema_id = o.schema_id
    INNER JOIN sys.types t
      ON t.user_type_id = c.user_type_id
    LEFT JOIN sys.default_constraints dc
      ON dc.object_id = c.default_object_id
    WHERE CONCAT(s.name, '.', o.name) = @fullName
    ORDER BY c.column_id;
  `);

  return result.recordset;
}

async function getPrimaryKeys(pool, fullName) {
  const request = pool.request();
  request.input("fullName", sql.NVarChar(256), fullName);

  const result = await request.query(`
    SELECT c.name AS columnName
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic
      ON ic.object_id = i.object_id
      AND ic.index_id = i.index_id
    INNER JOIN sys.columns c
      ON c.object_id = ic.object_id
      AND c.column_id = ic.column_id
    INNER JOIN sys.objects o
      ON o.object_id = i.object_id
    INNER JOIN sys.schemas s
      ON s.schema_id = o.schema_id
    WHERE i.is_primary_key = 1
      AND CONCAT(s.name, '.', o.name) = @fullName
    ORDER BY ic.key_ordinal;
  `);

  return result.recordset.map((row) => row.columnName);
}

function buildCreateTableStatement(fullName, metadata, columns, primaryKeys) {
  const { mysqlName } = normalizeName(fullName);
  const sourceType = metadata.objectType === "V" ? "VIEW" : "TABLE";
  const effectivePrimaryKeys =
    primaryKeys.length > 0
      ? [...primaryKeys]
      : columns
          .filter((column) => column.isIdentity)
          .slice(0, 1)
          .map((column) => column.columnName);
  const lines = columns.map((column) =>
    buildColumnLine(column, effectivePrimaryKeys),
  );

  if (effectivePrimaryKeys.length > 0) {
    lines.push(
      `  PRIMARY KEY (${effectivePrimaryKeys
        .map((key) => `\`${key}\``)
        .join(", ")})`,
    );
  }

  return [
    `-- Fuente SQL Server: ${sourceType} ${fullName}`,
    `DROP TABLE IF EXISTS \`${mysqlName}\`;`,
    `CREATE TABLE \`${mysqlName}\` (`,
    `${lines.join(",\n")}`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    "",
  ].join("\n");
}

async function main() {
  loadEnvFile(ENV_PATH);

  const server = process.env.DB_SERVER?.trim();
  const database = process.env.DB_DATABASE?.trim();

  if (!server || !database) {
    throw new Error("Faltan DB_SERVER o DB_DATABASE para generar el schema.");
  }

  const pool = await sql.connect({
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

  try {
    const statements = [];
    const missingObjects = [];

    for (const fullName of USED_OBJECTS) {
      const metadata = await getObjectMetadata(pool, fullName);

      if (!metadata) {
        missingObjects.push(fullName);
        statements.push(`-- NO ENCONTRADO EN SQL SERVER: ${fullName}\n`);
        continue;
      }

      const columns = await getColumns(pool, fullName);
      const primaryKeys =
        metadata.objectType === "U" ? await getPrimaryKeys(pool, fullName) : [];

      statements.push(buildCreateTableStatement(fullName, metadata, columns, primaryKeys));
    }

    const header = [
      "-- Schema MySQL generado para DonWeb",
      `-- Base origen SQL Server: ${database}`,
      `-- Fecha: ${new Date().toISOString()}`,
      "--",
      "-- Objetos SQL Server relevados por esta web:",
      ...USED_OBJECTS.map((name) => `--   ${name}`),
      "--",
      "-- Procedimientos usados por la app y no convertidos automaticamente:",
      ...USED_STORED_PROCEDURES.map((name) => `--   ${name}`),
      "--",
      "-- Nota: las vistas SQL Server se exportan como tablas MySQL para facilitar la migracion.",
      "",
      "SET NAMES utf8mb4;",
      "SET FOREIGN_KEY_CHECKS = 0;",
      "",
    ].join("\n");

    const footer = [
      "SET FOREIGN_KEY_CHECKS = 1;",
      "",
    ].join("\n");

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, `${header}${statements.join("\n")}${footer}`, "utf8");

    console.log(`Schema MySQL generado en: ${OUTPUT_FILE}`);
    if (missingObjects.length > 0) {
      console.log("Objetos no encontrados:");
      for (const objectName of missingObjects) {
        console.log(`- ${objectName}`);
      }
    }
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error("No se pudo generar el schema MySQL para DonWeb.");
  console.error(error);
  process.exitCode = 1;
});
