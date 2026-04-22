import "server-only";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
} from "mysql2/promise";
import { parseBoolean } from "@/lib/commerce";

// `mysql2/promise` funciona bien en runtime de Next cuando se carga via `require`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mysql = require("mysql2/promise") as typeof import("mysql2/promise");

declare global {
  var __diezDeportesMysqlPool: Pool | undefined;
}

export type DbExecutor = Pool | PoolConnection;
export type DbTransaction = PoolConnection;

function readEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function getMysqlConfig() {
  const host = readEnvValue(
    "DB_MYSQL_HOST",
    "DONWEB_MYSQL_HOST",
    "MYSQL_HOST",
  );
  const database = readEnvValue(
    "DB_MYSQL_DATABASE",
    "DONWEB_MYSQL_DATABASE",
    "MYSQL_DATABASE",
  );

  if (!host || !database) {
    throw new Error(
      "Faltan DB_MYSQL_HOST o DB_MYSQL_DATABASE en el entorno. Revisá el archivo .env.",
    );
  }

  return {
    host,
    port: Number(
      readEnvValue("DB_MYSQL_PORT", "DONWEB_MYSQL_PORT", "MYSQL_PORT") || "3306",
    ),
    user: readEnvValue("DB_MYSQL_USER", "DONWEB_MYSQL_USER", "MYSQL_USER"),
    password:
      process.env.DB_MYSQL_PASSWORD ??
      process.env.DONWEB_MYSQL_PASSWORD ??
      process.env.MYSQL_PASSWORD ??
      "",
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    namedPlaceholders: true,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    multipleStatements: false,
    ssl: parseBoolean(process.env.DB_MYSQL_SSL, false)
      ? {
          rejectUnauthorized: !parseBoolean(
            process.env.DB_MYSQL_TRUST_CERT,
            true,
          ),
        }
      : undefined,
  };
}

export async function getConnection() {
  if (!global.__diezDeportesMysqlPool) {
    global.__diezDeportesMysqlPool = mysql.createPool(getMysqlConfig());
  }

  return global.__diezDeportesMysqlPool;
}

export async function queryRows<T>(
  sqlText: string,
  params?: Record<string, unknown> | unknown[],
  executor?: DbExecutor,
) {
  const connection = executor || (await getConnection());
  const [rows] = await connection.query(sqlText, params as never);
  return rows as T[];
}

export async function queryOne<T>(
  sqlText: string,
  params?: Record<string, unknown> | unknown[],
  executor?: DbExecutor,
) {
  const rows = await queryRows<T>(sqlText, params, executor);
  return rows[0] || null;
}

export async function executeStatement(
  sqlText: string,
  params?: Record<string, unknown> | unknown[],
  executor?: DbExecutor,
) {
  const connection = executor || (await getConnection());
  const [result] = await connection.execute(sqlText, params as never);
  return result as ResultSetHeader;
}

export async function withTransaction<T>(
  callback: (transaction: DbTransaction) => Promise<T>,
) {
  const pool = await getConnection();
  const transaction = await pool.getConnection();

  try {
    await transaction.beginTransaction();
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Preserve the original error when rollback fails.
    }
    throw error;
  } finally {
    transaction.release();
  }
}

export function normalizeDbDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
