import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { DbExecutor } from "@/lib/db";
import {
  executeStatement,
  normalizeDbDate,
  queryOne,
  queryRows,
  withTransaction,
} from "@/lib/db";

const ADMIN_USERS_TABLE = "dbo_TA_UsuariosWeb";
const PASSWORD_MIN_LENGTH = 8;
const USERNAME_MIN_LENGTH = 3;

export const ADMIN_SYSTEM_USER_ID = 0;
export const ADMIN_SYSTEM_USERNAME = "userAlfa";
const ADMIN_SYSTEM_PASSWORD = "Alfa@2587";
export const ADMIN_PASSWORD_PATTERN =
  `(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{${PASSWORD_MIN_LENGTH},}`;
export const ADMIN_PASSWORD_POLICY_HINT =
  `Minimo ${PASSWORD_MIN_LENGTH} caracteres, con al menos una mayuscula, una minuscula, un numero y un caracter especial.`;

const USERNAME_REQUIRED_ERROR = "El usuario admin es obligatorio.";
const USERNAME_LENGTH_ERROR =
  "El usuario admin debe tener al menos 3 caracteres.";
const PASSWORD_POLICY_ERROR =
  `La clave debe tener minimo ${PASSWORD_MIN_LENGTH} caracteres, con al menos una mayuscula, una minuscula, un numero y un caracter especial.`;
const DUPLICATE_USER_ERROR = "Ya existe un usuario admin con ese nombre.";
const RESERVED_USER_ERROR = "Ese usuario esta reservado por el sistema.";
const USER_NOT_FOUND_ERROR = "No se encontro el usuario admin.";
const LAST_SUPERADMIN_ERROR =
  "Debe quedar al menos un superadmin habilitado.";
const SELF_DELETE_ERROR = "No puedes borrar tu propio usuario activo.";
const SELF_DISABLE_ERROR = "No puedes deshabilitar tu propio usuario activo.";
const SELF_DEMOTE_ERROR =
  "No puedes quitarte permisos de superadmin desde tu propia sesion.";

type AdminUserRow = {
  ID: number;
  Usuario: string;
  Contrasena: string;
  SuperAdmin: number | boolean;
  Habilitado: number | boolean;
  FechaAlta: Date | string;
  FechaModificacion: Date | string;
};

export type AdminUser = {
  id: number;
  username: string;
  passwordHash: string;
  superAdmin: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type CreateAdminUserInput = {
  username: string;
  password: string;
  superAdmin?: boolean;
  enabled?: boolean;
};

type UpdateAdminUserInput = {
  id: number;
  username: string;
  password?: string;
  superAdmin?: boolean;
  enabled?: boolean;
  actorUserId?: number;
};

type DeleteAdminUserInput = {
  id: number;
  actorUserId?: number;
};

function normalizeUsername(value: string) {
  return value.trim();
}

function normalizeUsernameKey(value: string) {
  return normalizeUsername(value).toLocaleLowerCase("en-US");
}

function toSafeBuffer(value: string) {
  return Buffer.from(value.normalize("NFKC"), "utf8");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = toSafeBuffer(left);
  const rightBuffer = toSafeBuffer(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password.normalize("NFKC"), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function hasPasswordStrength(value: string) {
  return new RegExp(`^${ADMIN_PASSWORD_PATTERN}$`).test(value.normalize("NFKC"));
}

function verifyPassword(password: string, storedValue: string) {
  const normalizedStoredValue = storedValue.trim();

  if (!normalizedStoredValue) {
    return false;
  }

  if (!normalizedStoredValue.startsWith("scrypt:")) {
    return safeEqual(password, normalizedStoredValue);
  }

  const [, salt, expectedHash] = normalizedStoredValue.split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password.normalize("NFKC"), salt, 64).toString("hex");
  return safeEqual(actualHash, expectedHash);
}

function mapAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: Number(row.ID),
    username: row.Usuario.trim(),
    passwordHash: row.Contrasena,
    superAdmin: Boolean(row.SuperAdmin),
    enabled: Boolean(row.Habilitado),
    createdAt: normalizeDbDate(row.FechaAlta)?.toISOString() || "",
    updatedAt: normalizeDbDate(row.FechaModificacion)?.toISOString() || "",
  };
}

export function isSystemAdminUsername(value: string) {
  return normalizeUsernameKey(value) === normalizeUsernameKey(ADMIN_SYSTEM_USERNAME);
}

export function isSystemAdminUserId(id: number) {
  return Number(id) === ADMIN_SYSTEM_USER_ID;
}

export function getSystemAdminUser(): AdminUser {
  return {
    id: ADMIN_SYSTEM_USER_ID,
    username: ADMIN_SYSTEM_USERNAME,
    passwordHash: "",
    superAdmin: true,
    enabled: true,
    createdAt: "",
    updatedAt: "",
  };
}

export function authenticateSystemAdminUser(username: string, password: string) {
  if (!isSystemAdminUsername(username)) {
    return null;
  }

  if (!safeEqual(normalizeUsername(username), ADMIN_SYSTEM_USERNAME)) {
    return null;
  }

  if (!safeEqual(password, ADMIN_SYSTEM_PASSWORD)) {
    return null;
  }

  return getSystemAdminUser();
}

function normalizeUserError(error: unknown) {
  if (!(error instanceof Error)) {
    return new Error("No se pudo guardar el usuario admin.");
  }

  const mysqlError = error as Error & { code?: string };
  if (mysqlError.code === "ER_DUP_ENTRY") {
    return new Error(DUPLICATE_USER_ERROR);
  }

  return error;
}

function validateUsername(value: string) {
  const username = normalizeUsername(value);

  if (!username) {
    throw new Error(USERNAME_REQUIRED_ERROR);
  }

  if (username.length < USERNAME_MIN_LENGTH) {
    throw new Error(USERNAME_LENGTH_ERROR);
  }

  if (isSystemAdminUsername(username)) {
    throw new Error(RESERVED_USER_ERROR);
  }
}

function validateNewUser(input: CreateAdminUserInput) {
  validateUsername(input.username);

  if (!hasPasswordStrength(input.password || "")) {
    throw new Error(PASSWORD_POLICY_ERROR);
  }
}

function validatePasswordForUpdate(password: string | undefined) {
  if (!password) {
    return false;
  }

  if (!hasPasswordStrength(password)) {
    throw new Error(PASSWORD_POLICY_ERROR);
  }

  return true;
}

function validateAdminUserUpdate(input: UpdateAdminUserInput) {
  if (!Number.isFinite(input.id) || input.id <= 0) {
    throw new Error(USER_NOT_FOUND_ERROR);
  }

  validateUsername(input.username);
  validatePasswordForUpdate(input.password);
}

function validateDeleteAdminUserInput(input: DeleteAdminUserInput) {
  if (!Number.isFinite(input.id) || input.id <= 0) {
    throw new Error(USER_NOT_FOUND_ERROR);
  }
}

async function ensureAdminUsersUsernameIndex(executor?: DbExecutor) {
  const existingIndex = await queryOne<{ index_name: string }>(
    `
      SELECT index_name
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = :tableName
        AND index_name = 'UX_TA_UsuariosWeb_Usuario'
      LIMIT 1;
    `,
    { tableName: ADMIN_USERS_TABLE },
    executor,
  );

  if (existingIndex) {
    return;
  }

  try {
    await executeStatement(
      `ALTER TABLE ${ADMIN_USERS_TABLE} ADD UNIQUE KEY UX_TA_UsuariosWeb_Usuario (Usuario);`,
      undefined,
      executor,
    );
  } catch (error) {
    const normalized = normalizeUserError(error);
    if (normalized instanceof Error && normalized.message === DUPLICATE_USER_ERROR) {
      throw normalized;
    }
  }
}

async function removeSystemAdminFromDatabase(executor?: DbExecutor) {
  await executeStatement(
    `
      DELETE FROM ${ADMIN_USERS_TABLE}
      WHERE LOWER(TRIM(Usuario)) = LOWER(:systemUsername);
    `,
    { systemUsername: ADMIN_SYSTEM_USERNAME },
    executor,
  );
}

export async function ensureAdminUsersTable(executor?: DbExecutor) {
  await executeStatement(
    `
      CREATE TABLE IF NOT EXISTS ${ADMIN_USERS_TABLE} (
        ID BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        Usuario VARCHAR(80) NOT NULL,
        Contrasena VARCHAR(255) NOT NULL,
        SuperAdmin TINYINT(1) NOT NULL DEFAULT 0,
        Habilitado TINYINT(1) NOT NULL DEFAULT 1,
        FechaAlta DATETIME NOT NULL,
        FechaModificacion DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
    undefined,
    executor,
  );

  await ensureAdminUsersUsernameIndex(executor);
  await removeSystemAdminFromDatabase(executor);
}

async function countOtherEnabledSuperAdmins(id: number, executor: DbExecutor) {
  const row = await queryOne<{ total: number }>(
    `
      SELECT COUNT(*) AS total
      FROM ${ADMIN_USERS_TABLE}
      WHERE ID <> :id
        AND SuperAdmin = 1
        AND Habilitado = 1;
    `,
    { id },
    executor,
  );

  return Number(row?.total || 0);
}

async function withAdminUsersTransaction<T>(
  executor: DbExecutor | undefined,
  callback: (runExecutor: DbExecutor) => Promise<T>,
) {
  if (executor) {
    await ensureAdminUsersTable(executor);
    return callback(executor);
  }

  return withTransaction(async (transaction) => {
    await ensureAdminUsersTable(transaction);
    return callback(transaction);
  });
}

async function getMutableAdminUser(id: number, executor: DbExecutor) {
  const row = await queryOne<AdminUserRow>(
    `
      SELECT
        ID,
        Usuario,
        Contrasena,
        SuperAdmin,
        Habilitado,
        FechaAlta,
        FechaModificacion
      FROM ${ADMIN_USERS_TABLE}
      WHERE ID = :id
      FOR UPDATE;
    `,
    { id },
    executor,
  );

  return row ? mapAdminUser(row) : null;
}

async function assertUserMutationAllowed(
  currentUser: AdminUser,
  nextState: {
    superAdmin: boolean;
    enabled: boolean;
    actorUserId?: number;
  },
  executor: DbExecutor,
) {
  if (nextState.actorUserId && nextState.actorUserId === currentUser.id) {
    if (!nextState.enabled) {
      throw new Error(SELF_DISABLE_ERROR);
    }

    if (currentUser.superAdmin && !nextState.superAdmin) {
      throw new Error(SELF_DEMOTE_ERROR);
    }
  }

  if (
    currentUser.superAdmin &&
    currentUser.enabled &&
    (!nextState.superAdmin || !nextState.enabled)
  ) {
    const remainingSuperAdmins = await countOtherEnabledSuperAdmins(
      currentUser.id,
      executor,
    );

    if (remainingSuperAdmins <= 0) {
      throw new Error(LAST_SUPERADMIN_ERROR);
    }
  }
}

export function getAdminUserErrorCode(error: unknown) {
  if (!(error instanceof Error)) {
    return "user-create";
  }

  switch (error.message) {
    case USERNAME_REQUIRED_ERROR:
    case USERNAME_LENGTH_ERROR:
      return "user-username";
    case PASSWORD_POLICY_ERROR:
      return "user-password-policy";
    case DUPLICATE_USER_ERROR:
      return "user-exists";
    case RESERVED_USER_ERROR:
      return "user-reserved";
    case USER_NOT_FOUND_ERROR:
      return "user-not-found";
    case LAST_SUPERADMIN_ERROR:
      return "user-last-superadmin";
    case SELF_DELETE_ERROR:
      return "user-self-delete";
    case SELF_DISABLE_ERROR:
      return "user-self-disable";
    case SELF_DEMOTE_ERROR:
      return "user-self-demote";
    default:
      return "user-create";
  }
}

export async function countAdminUsers() {
  await ensureAdminUsersTable();
  const row = await queryOne<{ total: number; enabled: number }>(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN Habilitado = 1 THEN 1 ELSE 0 END) AS enabled
    FROM ${ADMIN_USERS_TABLE};
  `);

  return {
    total: Number(row?.total || 0),
    enabled: Number(row?.enabled || 0),
  };
}

export async function hasAdminUsers() {
  const counts = await countAdminUsers();
  return counts.enabled > 0;
}

export async function listAdminUsers() {
  await ensureAdminUsersTable();
  const rows = await queryRows<AdminUserRow>(`
    SELECT
      ID,
      Usuario,
      Contrasena,
      SuperAdmin,
      Habilitado,
      FechaAlta,
      FechaModificacion
    FROM ${ADMIN_USERS_TABLE}
    ORDER BY Usuario ASC, ID ASC;
  `);

  return rows.map(mapAdminUser);
}

export async function findAdminUserByUsername(
  username: string,
  executor?: DbExecutor,
) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    return null;
  }

  if (isSystemAdminUsername(normalizedUsername)) {
    return getSystemAdminUser();
  }

  await ensureAdminUsersTable(executor);
  const row = await queryOne<AdminUserRow>(
    `
      SELECT
        ID,
        Usuario,
        Contrasena,
        SuperAdmin,
        Habilitado,
        FechaAlta,
        FechaModificacion
      FROM ${ADMIN_USERS_TABLE}
      WHERE TRIM(Usuario) = :username
      LIMIT 1;
    `,
    { username: normalizedUsername },
    executor,
  );

  return row ? mapAdminUser(row) : null;
}

export async function findAdminUserById(id: number, executor?: DbExecutor) {
  if (isSystemAdminUserId(id)) {
    return getSystemAdminUser();
  }

  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  await ensureAdminUsersTable(executor);
  const row = await queryOne<AdminUserRow>(
    `
      SELECT
        ID,
        Usuario,
        Contrasena,
        SuperAdmin,
        Habilitado,
        FechaAlta,
        FechaModificacion
      FROM ${ADMIN_USERS_TABLE}
      WHERE ID = :id
      LIMIT 1;
    `,
    { id },
    executor,
  );

  return row ? mapAdminUser(row) : null;
}

export async function authenticateAdminUser(username: string, password: string) {
  const systemUser = authenticateSystemAdminUser(username, password);
  if (systemUser) {
    return systemUser;
  }

  const user = await findAdminUserByUsername(username);

  if (!user || !user.enabled) {
    return null;
  }

  return verifyPassword(password, user.passwordHash) ? user : null;
}

export async function createAdminUser(
  input: CreateAdminUserInput,
  executor?: DbExecutor,
) {
  validateNewUser(input);
  await ensureAdminUsersTable(executor);

  const username = normalizeUsername(input.username);
  const duplicate = await findAdminUserByUsername(username, executor);
  if (duplicate) {
    throw new Error(DUPLICATE_USER_ERROR);
  }

  try {
    const result = await executeStatement(
      `
        INSERT INTO ${ADMIN_USERS_TABLE} (
          Usuario,
          Contrasena,
          SuperAdmin,
          Habilitado,
          FechaAlta,
          FechaModificacion
        )
        VALUES (
          :username,
          :passwordHash,
          :superAdmin,
          :enabled,
          NOW(),
          NOW()
        );
      `,
      {
        username,
        passwordHash: hashPassword(input.password),
        superAdmin: input.superAdmin ? 1 : 0,
        enabled: input.enabled === false ? 0 : 1,
      },
      executor,
    );

    return findAdminUserById(Number(result.insertId || 0), executor);
  } catch (error) {
    throw normalizeUserError(error);
  }
}

export async function updateAdminUser(
  input: UpdateAdminUserInput,
  executor?: DbExecutor,
) {
  validateAdminUserUpdate(input);

  return withAdminUsersTransaction(executor, async (runExecutor) => {
    const currentUser = await getMutableAdminUser(input.id, runExecutor);
    if (!currentUser) {
      throw new Error(USER_NOT_FOUND_ERROR);
    }

    const nextSuperAdmin = input.superAdmin ?? currentUser.superAdmin;
    const nextEnabled = input.enabled ?? currentUser.enabled;
    await assertUserMutationAllowed(
      currentUser,
      {
        superAdmin: nextSuperAdmin,
        enabled: nextEnabled,
        actorUserId: input.actorUserId,
      },
      runExecutor,
    );

    const duplicate = await queryOne<{ ID: number }>(
      `
        SELECT ID
        FROM ${ADMIN_USERS_TABLE}
        WHERE TRIM(Usuario) = :username
          AND ID <> :id
        LIMIT 1;
      `,
      {
        id: input.id,
        username: normalizeUsername(input.username),
      },
      runExecutor,
    );

    if (duplicate) {
      throw new Error(DUPLICATE_USER_ERROR);
    }

    const shouldUpdatePassword = validatePasswordForUpdate(input.password);
    const params: Record<string, unknown> = {
      id: input.id,
      username: normalizeUsername(input.username),
      superAdmin: nextSuperAdmin ? 1 : 0,
      enabled: nextEnabled ? 1 : 0,
    };
    const setClauses = [
      "Usuario = :username",
      "SuperAdmin = :superAdmin",
      "Habilitado = :enabled",
      "FechaModificacion = NOW()",
    ];

    if (shouldUpdatePassword) {
      params.passwordHash = hashPassword(input.password || "");
      setClauses.push("Contrasena = :passwordHash");
    }

    try {
      await executeStatement(
        `
          UPDATE ${ADMIN_USERS_TABLE}
          SET ${setClauses.join(", ")}
          WHERE ID = :id;
        `,
        params,
        runExecutor,
      );
    } catch (error) {
      throw normalizeUserError(error);
    }

    const updatedUser = await findAdminUserById(input.id, runExecutor);
    if (!updatedUser) {
      throw new Error(USER_NOT_FOUND_ERROR);
    }

    return updatedUser;
  });
}

export async function deleteAdminUser(
  input: DeleteAdminUserInput,
  executor?: DbExecutor,
) {
  validateDeleteAdminUserInput(input);

  return withAdminUsersTransaction(executor, async (runExecutor) => {
    const currentUser = await getMutableAdminUser(input.id, runExecutor);
    if (!currentUser) {
      throw new Error(USER_NOT_FOUND_ERROR);
    }

    if (input.actorUserId && input.actorUserId === currentUser.id) {
      throw new Error(SELF_DELETE_ERROR);
    }

    await assertUserMutationAllowed(
      currentUser,
      {
        superAdmin: false,
        enabled: false,
        actorUserId: input.actorUserId,
      },
      runExecutor,
    );

    await executeStatement(
      `
        DELETE FROM ${ADMIN_USERS_TABLE}
        WHERE ID = :id;
      `,
      { id: input.id },
      runExecutor,
    );

    return currentUser;
  });
}
