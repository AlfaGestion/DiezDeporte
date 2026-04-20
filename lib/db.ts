import "server-only";
import type mssql from "mssql";
import { parseBoolean } from "@/lib/commerce";

// `mssql` es CommonJS. En runtime de Next conviene cargarlo con `require`
// para evitar desajustes de interoperabilidad en los tipos SQL.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sql = require("mssql") as typeof import("mssql");

declare global {
  var __diezDeportesSqlPool: Promise<mssql.ConnectionPool> | undefined;
}

function getSqlConfig(): mssql.config {
  const server = process.env.DB_SERVER?.trim();
  const database = process.env.DB_DATABASE?.trim();

  if (!server || !database) {
    throw new Error(
      "Faltan DB_SERVER o DB_DATABASE en el entorno. Revisá el archivo .env.",
    );
  }

  return {
    user: process.env.DB_USER?.trim(),
    password: process.env.DB_PASSWORD,
    server,
    database,
    port: Number(process.env.DB_PORT || "1433"),
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: parseBoolean(process.env.DB_ENCRYPT, false),
      trustServerCertificate: parseBoolean(process.env.DB_TRUST_CERT, true),
    },
  };
}

export async function getConnection() {
  if (!global.__diezDeportesSqlPool) {
    global.__diezDeportesSqlPool = new sql
      .ConnectionPool(getSqlConfig())
      .connect()
      .catch((error) => {
        global.__diezDeportesSqlPool = undefined;
        throw error;
      });
  }

  return global.__diezDeportesSqlPool;
}

export { sql };
