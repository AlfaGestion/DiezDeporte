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

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseHostWithInstance(rawServer: string) {
  const value = rawServer.trim();

  if (value.includes("\\")) {
    const [serverName, instanceName] = value.split("\\", 2);
    return {
      server: serverName?.trim() ?? "",
      instanceName: instanceName?.trim() || undefined,
      port: undefined as number | undefined,
    };
  }

  if (value.includes(",")) {
    const [serverName, rawPort] = value.split(",", 2);
    return {
      server: serverName?.trim() ?? "",
      instanceName: undefined,
      port: parsePositiveInt(rawPort, 1433),
    };
  }

  return {
    server: value,
    instanceName: undefined,
    port: undefined as number | undefined,
  };
}

function getSqlConfig(): mssql.config | string {
  const connectionString = process.env.DB_CONNECTION_STRING?.trim();
  const poolMax = parsePositiveInt(process.env.DB_POOL_MAX, 10);
  const poolIdleTimeoutMillis = parsePositiveInt(
    process.env.DB_POOL_IDLE_TIMEOUT_MS,
    30000,
  );
  const connectionTimeout = parsePositiveInt(
    process.env.DB_CONNECT_TIMEOUT_MS,
    15000,
  );
  const requestTimeout = parsePositiveInt(
    process.env.DB_REQUEST_TIMEOUT_MS,
    30000,
  );
  const encrypt = parseBoolean(process.env.DB_ENCRYPT, false);
  const trustServerCertificate = parseBoolean(process.env.DB_TRUST_CERT, true);

  if (connectionString) {
    return connectionString;
  }

  const rawServer = process.env.DB_SERVER?.trim();
  const database = process.env.DB_DATABASE?.trim();

  if (!rawServer || !database) {
    throw new Error(
      "Faltan DB_SERVER o DB_DATABASE en el entorno. Revisa el archivo .env.",
    );
  }

  const parsedServer = parseHostWithInstance(rawServer);
  const explicitPort = process.env.DB_PORT?.trim();
  const port = explicitPort
    ? parsePositiveInt(explicitPort, 1433)
    : parsedServer.instanceName
      ? undefined
      : (parsedServer.port ?? 1433);

  return {
    user: process.env.DB_USER?.trim(),
    password: process.env.DB_PASSWORD,
    server: parsedServer.server,
    database,
    port,
    pool: {
      max: poolMax,
      min: 0,
      idleTimeoutMillis: poolIdleTimeoutMillis,
    },
    connectionTimeout,
    requestTimeout,
    options: {
      encrypt,
      trustServerCertificate,
      ...(parsedServer.instanceName
        ? { instanceName: parsedServer.instanceName }
        : {}),
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
