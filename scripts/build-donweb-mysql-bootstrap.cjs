const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SCHEMA_GENERATOR = path.join(
  PROJECT_ROOT,
  "scripts",
  "generate-donweb-mysql-schema.cjs",
);
const SCHEMA_FILE = path.join(
  PROJECT_ROOT,
  "database",
  "donweb",
  "mysql_used_objects.sql",
);
const OUTPUT_FILE = path.join(
  PROJECT_ROOT,
  "database",
  "donweb",
  "create_donweb_mysql.sql",
);
const DATABASE_NAME = "diezdeportes_web";

function ensureSchemaFile() {
  execFileSync(process.execPath, [SCHEMA_GENERATOR], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });

  if (!fs.existsSync(SCHEMA_FILE)) {
    throw new Error(`No se encontro el schema generado en ${SCHEMA_FILE}.`);
  }
}

function main() {
  ensureSchemaFile();

  const schemaSql = fs.readFileSync(SCHEMA_FILE, "utf8").trim();
  const bootstrapSql = [
    "-- Bootstrap MySQL para DonWeb",
    `-- Base destino: ${DATABASE_NAME}`,
    `-- Fecha: ${new Date().toISOString()}`,
    "",
    "SET NAMES utf8mb4;",
    `CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    `USE \`${DATABASE_NAME}\`;`,
    "",
    schemaSql,
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, bootstrapSql, "utf8");

  console.log(`Bootstrap MySQL generado en: ${OUTPUT_FILE}`);
}

main();
