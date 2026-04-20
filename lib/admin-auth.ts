import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  authenticateAdminUser,
  findAdminUserById,
  isSystemAdminUserId,
} from "@/lib/admin-users";

export const ADMIN_SESSION_COOKIE = "dd_admin_session";

export type AdminSessionUser = {
  id: number;
  username: string;
  superAdmin: boolean;
  enabled: boolean;
};

type SessionIdentity = {
  id: number;
  username: string;
  superAdmin: boolean;
  issuedAt: number;
};

function getAdminSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "diezdeportes-admin-dev-secret"
  );
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

function signPayload(payload: string) {
  return createHmac("sha256", getAdminSessionSecret())
    .update(payload)
    .digest("hex");
}

function parseAdminSessionToken(token: string | undefined): SessionIdentity | null {
  if (!token) return null;

  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0) return null;

  const payload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expectedSignature = signPayload(payload);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  const [idRaw, username, superAdminRaw, issuedAtRaw] = payload.split(":");
  const id = Number(idRaw);
  const issuedAt = Number(issuedAtRaw);

  if (!idRaw || !username || !superAdminRaw || !issuedAtRaw) {
    return null;
  }

  if (!Number.isFinite(id) || id < 0 || !Number.isFinite(issuedAt)) {
    return null;
  }

  const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - issuedAt > maxAgeMs) {
    return null;
  }

  return {
    id,
    username: username.trim(),
    superAdmin: superAdminRaw === "1",
    issuedAt,
  };
}

export async function isAdminConfigured() {
  return true;
}

export async function verifyAdminCredentials(username: string, password: string) {
  const user = await authenticateAdminUser(username, password);
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    superAdmin: user.superAdmin,
    enabled: user.enabled,
  } satisfies AdminSessionUser;
}

export function createAdminSessionToken(user: {
  id: number;
  username: string;
  superAdmin: boolean;
}) {
  const payload = `${user.id}:${user.username.trim()}:${user.superAdmin ? 1 : 0}:${Date.now()}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export async function getAdminSessionUser(token: string | undefined) {
  const session = parseAdminSessionToken(token);
  if (!session) {
    return null;
  }

  const user = await findAdminUserById(session.id);
  if (!user || !user.enabled) {
    return null;
  }

  if (!safeEqual(user.username, session.username)) {
    return null;
  }

  if (isSystemAdminUserId(session.id) && !user.superAdmin) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    superAdmin: user.superAdmin,
    enabled: user.enabled,
  } satisfies AdminSessionUser;
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  };
}
