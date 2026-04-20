import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { ConnectionPool, Transaction } from "mssql";
import { getConnection, sql } from "@/lib/db";

type Executor = ConnectionPool | Transaction;

const ADMIN_USERS_TABLE = "dbo.TA_UsuariosWeb";
const LEGACY_ADMIN_USERS_TABLE = "dbo.TA_UsuarioWeb";
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
  SuperAdmin: boolean;
  Habilitado: boolean;
  FechaAlta: Date;
  FechaModificacion: Date;
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

function createRequest(executor: Executor) {
  if ("begin" in executor) {
    return new sql.Request(executor);
  }

  return executor.request();
}

function setInput(
  request: ReturnType<typeof createRequest>,
  name: string,
  value: unknown,
) {
  request.input(name, value);
}

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
    createdAt: row.FechaAlta ? new Date(row.FechaAlta).toISOString() : "",
    updatedAt: row.FechaModificacion
      ? new Date(row.FechaModificacion).toISOString()
      : "",
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

  const sqlError = error as Error & {
    number?: number;
    originalError?: { info?: { number?: number; message?: string }; number?: number };
  };
  const number = sqlError.number || sqlError.originalError?.info?.number || sqlError.originalError?.number;

  if (number === 2601 || number === 2627) {
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

async function countOtherEnabledSuperAdmins(id: number, executor: Executor) {
  const request = createRequest(executor);
  setInput(request, "id", id);

  const result = await request.query<{ total: number }>(`
    SELECT COUNT(*) AS total
    FROM ${ADMIN_USERS_TABLE} WITH (UPDLOCK, HOLDLOCK)
    WHERE ID <> @id
      AND SuperAdmin = 1
      AND Habilitado = 1;
  `);

  return Number(result.recordset[0]?.total || 0);
}

async function withAdminUsersTransaction<T>(
  executor: Executor | undefined,
  callback: (runExecutor: Executor) => Promise<T>,
) {
  if (executor) {
    await ensureAdminUsersTable(executor);
    return callback(executor);
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    await ensureAdminUsersTable(transaction);
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getMutableAdminUser(id: number, executor: Executor) {
  const request = createRequest(executor);
  setInput(request, "id", id);

  const result = await request.query<AdminUserRow>(`
    SELECT TOP (1)
      CAST(ID AS int) AS ID,
      Usuario,
      Contrasena,
      SuperAdmin,
      Habilitado,
      FechaAlta,
      FechaModificacion
    FROM ${ADMIN_USERS_TABLE} WITH (UPDLOCK, HOLDLOCK)
    WHERE ID = @id;
  `);

  const row = result.recordset[0];
  return row ? mapAdminUser(row) : null;
}

async function assertUserMutationAllowed(
  currentUser: AdminUser,
  nextState: {
    superAdmin: boolean;
    enabled: boolean;
    actorUserId?: number;
  },
  executor: Executor,
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

async function removeSystemAdminFromDatabase(executor: Executor) {
  const request = createRequest(executor);
  setInput(request, "systemUsername", ADMIN_SYSTEM_USERNAME);

  await request.query(`
    DELETE FROM ${ADMIN_USERS_TABLE}
    WHERE LOWER(LTRIM(RTRIM(Usuario))) = LOWER(@systemUsername);
  `);
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

export async function ensureAdminUsersTable(executor?: Executor) {
  const connection = executor || (await getConnection());

  await createRequest(connection).query(`
    IF OBJECT_ID('${ADMIN_USERS_TABLE}', 'U') IS NULL
      AND OBJECT_ID('${LEGACY_ADMIN_USERS_TABLE}', 'U') IS NOT NULL
    BEGIN
      EXEC sp_rename '${LEGACY_ADMIN_USERS_TABLE}', 'TA_UsuariosWeb';
    END;

    IF OBJECT_ID('dbo.DF_TA_UsuarioWeb_SuperAdmin', 'D') IS NOT NULL
      AND OBJECT_ID('dbo.DF_TA_UsuariosWeb_SuperAdmin', 'D') IS NULL
    BEGIN
      EXEC sp_rename 'dbo.DF_TA_UsuarioWeb_SuperAdmin', 'DF_TA_UsuariosWeb_SuperAdmin', 'OBJECT';
    END;

    IF OBJECT_ID('dbo.DF_TA_UsuarioWeb_Habilitado', 'D') IS NOT NULL
      AND OBJECT_ID('dbo.DF_TA_UsuariosWeb_Habilitado', 'D') IS NULL
    BEGIN
      EXEC sp_rename 'dbo.DF_TA_UsuarioWeb_Habilitado', 'DF_TA_UsuariosWeb_Habilitado', 'OBJECT';
    END;

    IF OBJECT_ID('dbo.DF_TA_UsuarioWeb_FechaAlta', 'D') IS NOT NULL
      AND OBJECT_ID('dbo.DF_TA_UsuariosWeb_FechaAlta', 'D') IS NULL
    BEGIN
      EXEC sp_rename 'dbo.DF_TA_UsuarioWeb_FechaAlta', 'DF_TA_UsuariosWeb_FechaAlta', 'OBJECT';
    END;

    IF OBJECT_ID('dbo.DF_TA_UsuarioWeb_FechaModificacion', 'D') IS NOT NULL
      AND OBJECT_ID('dbo.DF_TA_UsuariosWeb_FechaModificacion', 'D') IS NULL
    BEGIN
      EXEC sp_rename 'dbo.DF_TA_UsuarioWeb_FechaModificacion', 'DF_TA_UsuariosWeb_FechaModificacion', 'OBJECT';
    END;

    IF EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'UX_TA_UsuarioWeb_Usuario'
        AND object_id = OBJECT_ID('${ADMIN_USERS_TABLE}')
    )
      AND NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'UX_TA_UsuariosWeb_Usuario'
          AND object_id = OBJECT_ID('${ADMIN_USERS_TABLE}')
      )
    BEGIN
      EXEC sp_rename 'dbo.TA_UsuariosWeb.UX_TA_UsuarioWeb_Usuario', 'UX_TA_UsuariosWeb_Usuario', 'INDEX';
    END;

    IF OBJECT_ID('${ADMIN_USERS_TABLE}', 'U') IS NULL
    BEGIN
      CREATE TABLE ${ADMIN_USERS_TABLE} (
        ID bigint IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        Usuario nvarchar(80) NOT NULL,
        Contrasena nvarchar(255) NOT NULL,
        SuperAdmin bit NOT NULL CONSTRAINT DF_TA_UsuariosWeb_SuperAdmin DEFAULT 0,
        Habilitado bit NOT NULL CONSTRAINT DF_TA_UsuariosWeb_Habilitado DEFAULT 1,
        FechaAlta datetime2 NOT NULL CONSTRAINT DF_TA_UsuariosWeb_FechaAlta DEFAULT SYSDATETIME(),
        FechaModificacion datetime2 NOT NULL CONSTRAINT DF_TA_UsuariosWeb_FechaModificacion DEFAULT SYSDATETIME()
      );
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'UX_TA_UsuariosWeb_Usuario'
        AND object_id = OBJECT_ID('${ADMIN_USERS_TABLE}')
    )
    BEGIN
      CREATE UNIQUE INDEX UX_TA_UsuariosWeb_Usuario
      ON ${ADMIN_USERS_TABLE} (Usuario);
    END;
  `);

  await removeSystemAdminFromDatabase(connection);
}

export async function countAdminUsers() {
  const pool = await getConnection();
  await ensureAdminUsersTable(pool);

  const result = await pool.request().query<{
    total: number;
    enabled: number;
  }>(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN Habilitado = 1 THEN 1 ELSE 0 END) AS enabled
    FROM ${ADMIN_USERS_TABLE} WITH (NOLOCK);
  `);

  return {
    total: Number(result.recordset[0]?.total || 0),
    enabled: Number(result.recordset[0]?.enabled || 0),
  };
}

export async function hasAdminUsers() {
  const counts = await countAdminUsers();
  return counts.enabled > 0;
}

export async function listAdminUsers() {
  const pool = await getConnection();
  await ensureAdminUsersTable(pool);

  const result = await pool.request().query<AdminUserRow>(`
    SELECT
      CAST(ID AS int) AS ID,
      Usuario,
      Contrasena,
      SuperAdmin,
      Habilitado,
      FechaAlta,
      FechaModificacion
    FROM ${ADMIN_USERS_TABLE} WITH (NOLOCK)
    ORDER BY Usuario ASC, ID ASC;
  `);

  return result.recordset.map(mapAdminUser);
}

export async function findAdminUserByUsername(username: string, executor?: Executor) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    return null;
  }

  if (isSystemAdminUsername(normalizedUsername)) {
    return getSystemAdminUser();
  }

  const connection = executor || (await getConnection());
  await ensureAdminUsersTable(connection);

  const request = createRequest(connection);
  setInput(request, "username", normalizedUsername);

  const result = await request.query<AdminUserRow>(`
    SELECT TOP (1)
      CAST(ID AS int) AS ID,
      Usuario,
      Contrasena,
      SuperAdmin,
      Habilitado,
      FechaAlta,
      FechaModificacion
    FROM ${ADMIN_USERS_TABLE} WITH (NOLOCK)
    WHERE LTRIM(RTRIM(Usuario)) = @username;
  `);

  const row = result.recordset[0];
  return row ? mapAdminUser(row) : null;
}

export async function findAdminUserById(id: number, executor?: Executor) {
  if (isSystemAdminUserId(id)) {
    return getSystemAdminUser();
  }

  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  const connection = executor || (await getConnection());
  await ensureAdminUsersTable(connection);

  const request = createRequest(connection);
  setInput(request, "id", id);

  const result = await request.query<AdminUserRow>(`
    SELECT TOP (1)
      CAST(ID AS int) AS ID,
      Usuario,
      Contrasena,
      SuperAdmin,
      Habilitado,
      FechaAlta,
      FechaModificacion
    FROM ${ADMIN_USERS_TABLE} WITH (NOLOCK)
    WHERE ID = @id;
  `);

  const row = result.recordset[0];
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
  executor?: Executor,
) {
  validateNewUser(input);

  const connection = executor || (await getConnection());
  await ensureAdminUsersTable(connection);

  const request = createRequest(connection);
  const username = normalizeUsername(input.username);

  setInput(request, "username", username);
  setInput(request, "passwordHash", hashPassword(input.password));
  setInput(request, "superAdmin", input.superAdmin ? 1 : 0);
  setInput(request, "enabled", input.enabled === false ? 0 : 1);

  try {
    const result = await request.query<{ ID: number }>(`
      INSERT INTO ${ADMIN_USERS_TABLE} (
        Usuario,
        Contrasena,
        SuperAdmin,
        Habilitado,
        FechaAlta,
        FechaModificacion
      )
      OUTPUT CAST(INSERTED.ID AS int) AS ID
      VALUES (
        @username,
        @passwordHash,
        @superAdmin,
        @enabled,
        SYSDATETIME(),
        SYSDATETIME()
      );
    `);

    const id = Number(result.recordset[0]?.ID || 0);
    return findAdminUserById(id, connection);
  } catch (error) {
    throw normalizeUserError(error);
  }
}

export async function updateAdminUser(
  input: UpdateAdminUserInput,
  executor?: Executor,
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

    const request = createRequest(runExecutor);
    const shouldUpdatePassword = validatePasswordForUpdate(input.password);

    setInput(request, "id", input.id);
    setInput(request, "username", normalizeUsername(input.username));
    setInput(request, "superAdmin", nextSuperAdmin ? 1 : 0);
    setInput(request, "enabled", nextEnabled ? 1 : 0);

    if (shouldUpdatePassword) {
      setInput(request, "passwordHash", hashPassword(input.password || ""));
    }

    try {
      await request.query(`
        UPDATE ${ADMIN_USERS_TABLE}
        SET
          Usuario = @username,
          SuperAdmin = @superAdmin,
          Habilitado = @enabled,
          FechaModificacion = SYSDATETIME()
          ${shouldUpdatePassword ? ", Contrasena = @passwordHash" : ""}
        WHERE ID = @id;
      `);
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
  executor?: Executor,
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

    const request = createRequest(runExecutor);
    setInput(request, "id", input.id);

    await request.query(`
      DELETE FROM ${ADMIN_USERS_TABLE}
      WHERE ID = @id;
    `);

    return currentUser;
  });
}
