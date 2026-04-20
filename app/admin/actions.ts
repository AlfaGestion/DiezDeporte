"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  InvalidOrderTransitionError,
  OrderNotFoundError,
  OrderValidationError,
} from "@/lib/models/order";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getCurrentAdminSessionUser,
  getAdminCookieOptions,
  isAdminConfigured,
  verifyAdminCredentials,
} from "@/lib/admin-auth";
import {
  avanzarEstadoPedido,
  updateOrderStatus,
} from "@/lib/services/orderService";
import type { OrderState } from "@/lib/types/order";
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUserErrorCode,
  updateAdminUser,
} from "@/lib/admin-users";
import { saveAdminConfig } from "@/lib/admin-config";
import { resolvePendingPaymentStatus } from "@/lib/web-payments";

async function requireAdminSession() {
  const user = await getCurrentAdminSessionUser();

  if (!user) {
    redirect("/admin/login");
  }

  return user;
}

function buildUsersRedirect(input: {
  error?: string;
  saved?: string;
  create?: boolean;
  editUser?: number;
}) {
  const params = new URLSearchParams({ view: "users" });

  if (input.saved) {
    params.set("saved", input.saved);
  }

  if (input.error) {
    params.set("error", input.error);
  }

  if (input.create) {
    params.set("create", "1");
  }

  if (input.editUser && Number.isFinite(input.editUser) && input.editUser > 0) {
    params.set("editUser", String(input.editUser));
  }

  return `/admin?${params.toString()}`;
}

function buildRedirectWithParams(
  basePath: string,
  params: Record<string, string | null | undefined>,
) {
  const url = new URL(basePath, "http://admin.local");

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  }

  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

function resolveAdminReturnTo(formData: FormData, fallback = "/admin") {
  const returnTo =
    typeof formData.get("returnTo") === "string"
      ? String(formData.get("returnTo"))
      : "";

  if (returnTo.startsWith("/admin")) {
    return returnTo;
  }

  const legacyStatus =
    typeof formData.get("statusFilter") === "string"
      ? String(formData.get("statusFilter"))
      : "";

  if (legacyStatus && legacyStatus !== "orders") {
    return `/admin?status=${encodeURIComponent(legacyStatus)}`;
  }

  return fallback;
}

export async function loginAdminAction(formData: FormData) {
  const username =
    typeof formData.get("username") === "string"
      ? String(formData.get("username"))
      : "";
  const password =
    typeof formData.get("password") === "string"
      ? String(formData.get("password"))
      : "";

  if (!(await isAdminConfigured())) {
    redirect("/admin/login?error=setup");
  }

  const user = await verifyAdminCredentials(username, password);
  if (!user) {
    redirect("/admin/login?error=credentials");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    ADMIN_SESSION_COOKIE,
    createAdminSessionToken(user),
    getAdminCookieOptions(),
  );

  redirect("/admin");
}

export async function createAdminUserAction(formData: FormData) {
  const username =
    typeof formData.get("username") === "string"
      ? String(formData.get("username"))
      : "";
  const password =
    typeof formData.get("password") === "string"
      ? String(formData.get("password"))
      : "";
  const passwordConfirm =
    typeof formData.get("passwordConfirm") === "string"
      ? String(formData.get("passwordConfirm"))
      : "";
  const requestedSuperAdmin = formData.get("superAdmin") === "on";
  const requestedEnabled = formData.get("enabled") === "on";
  const mode =
    typeof formData.get("mode") === "string"
      ? String(formData.get("mode"))
      : "admin";

  const buildErrorRedirect = (errorCode: string) =>
    mode === "bootstrap"
      ? `/admin/login?error=${encodeURIComponent(errorCode)}`
      : buildUsersRedirect({
          error: errorCode,
          create: true,
        });

  if (password !== passwordConfirm) {
    redirect(buildErrorRedirect("password-match"));
  }

  const configured = await isAdminConfigured();

  if (!configured) {
    try {
      const user = await createAdminUser({
        username,
        password,
        superAdmin: true,
        enabled: true,
      });

      if (!user) {
        throw new Error("No se pudo crear el primer usuario admin.");
      }

      const cookieStore = await cookies();
      cookieStore.set(
        ADMIN_SESSION_COOKIE,
        createAdminSessionToken(user),
        getAdminCookieOptions(),
      );

      redirect("/admin?saved=user");
    } catch (error) {
      redirect(buildErrorRedirect(getAdminUserErrorCode(error)));
    }
  }

  const sessionUser = await requireAdminSession();
  if (!sessionUser.superAdmin) {
    redirect(buildErrorRedirect("user-forbidden"));
  }

  try {
    const user = await createAdminUser({
      username,
      password,
      superAdmin: requestedSuperAdmin,
      enabled: requestedEnabled,
    });

    if (!user) {
      throw new Error("No se pudo crear el usuario admin.");
    }
  } catch (error) {
    redirect(buildErrorRedirect(getAdminUserErrorCode(error)));
  }

  revalidatePath("/admin");
  redirect(buildUsersRedirect({ saved: "user" }));
}

export async function updateAdminUserAction(formData: FormData) {
  const sessionUser = await requireAdminSession();
  if (!sessionUser.superAdmin) {
    redirect(buildUsersRedirect({ error: "user-forbidden" }));
  }

  const userId = Number(formData.get("userId") || "");
  const username =
    typeof formData.get("username") === "string"
      ? String(formData.get("username"))
      : "";
  const password =
    typeof formData.get("password") === "string"
      ? String(formData.get("password"))
      : "";
  const passwordConfirm =
    typeof formData.get("passwordConfirm") === "string"
      ? String(formData.get("passwordConfirm"))
      : "";
  const requestedSuperAdmin = formData.get("superAdmin") === "on";
  const requestedEnabled = formData.get("enabled") === "on";

  if ((password || passwordConfirm) && password !== passwordConfirm) {
    redirect(
      buildUsersRedirect({
        error: "password-match",
        editUser: userId,
      }),
    );
  }

  try {
    await updateAdminUser({
      id: userId,
      username,
      password: password || undefined,
      superAdmin: requestedSuperAdmin,
      enabled: requestedEnabled,
      actorUserId: sessionUser.id,
    });
  } catch (error) {
    redirect(
      buildUsersRedirect({
        error: getAdminUserErrorCode(error),
        editUser: userId,
      }),
    );
  }

  revalidatePath("/admin");
  redirect(buildUsersRedirect({ saved: "user-updated" }));
}

export async function deleteAdminUserAction(formData: FormData) {
  const sessionUser = await requireAdminSession();
  if (!sessionUser.superAdmin) {
    redirect(buildUsersRedirect({ error: "user-forbidden" }));
  }

  const userId = Number(formData.get("userId") || "");

  try {
    await deleteAdminUser({
      id: userId,
      actorUserId: sessionUser.id,
    });
  } catch (error) {
    redirect(
      buildUsersRedirect({
        error: getAdminUserErrorCode(error),
      }),
    );
  }

  revalidatePath("/admin");
  redirect(buildUsersRedirect({ saved: "user-deleted" }));
}

export async function logoutAdminAction() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
  redirect("/admin/login");
}

export async function saveAdminSettingsAction(formData: FormData) {
  await requireAdminSession();
  await saveAdminConfig(formData);
  revalidatePath("/admin");
  const activeConfig =
    typeof formData.get("activeConfig") === "string"
      ? String(formData.get("activeConfig"))
      : "";
  const suffix = activeConfig
    ? `?view=config&config=${encodeURIComponent(activeConfig)}&saved=config`
    : "?view=config&saved=config";
  redirect(`/admin${suffix}`);
}

export async function refreshAdminOrderAction(formData: FormData) {
  await requireAdminSession();

  const pendingOrderId = Number(formData.get("pendingOrderId") || "");
  const returnTo = resolveAdminReturnTo(formData);

  if (Number.isFinite(pendingOrderId) && pendingOrderId > 0) {
    await resolvePendingPaymentStatus({ pendingOrderId });
  }

  revalidatePath("/admin");
  redirect(buildRedirectWithParams(returnTo, { saved: "refresh", error: null }));
}

export async function advanceAdminOrderAction(formData: FormData) {
  await requireAdminSession();

  const orderId = Number(formData.get("orderId") || "");
  const returnTo = resolveAdminReturnTo(formData);

  try {
    if (Number.isFinite(orderId) && orderId > 0) {
      await avanzarEstadoPedido(orderId, { origin: "admin" });
    }
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      redirect(
        buildRedirectWithParams(returnTo, { error: "order-not-found", saved: null }),
      );
    }

    if (
      error instanceof InvalidOrderTransitionError ||
      error instanceof OrderValidationError
    ) {
      redirect(
        buildRedirectWithParams(returnTo, { error: "order-advance", saved: null }),
      );
    }

    redirect(buildRedirectWithParams(returnTo, { error: "order-advance", saved: null }));
  }

  revalidatePath("/admin");
  redirect(buildRedirectWithParams(returnTo, { saved: "advance", error: null }));
}

export async function updateAdminOrderStateAction(formData: FormData) {
  await requireAdminSession();

  const orderId = Number(formData.get("orderId") || "");
  const nextState =
    typeof formData.get("nextState") === "string"
      ? (String(formData.get("nextState")) as OrderState)
      : null;
  const returnTo = resolveAdminReturnTo(formData);

  if (!nextState) {
    redirect(buildRedirectWithParams(returnTo, { error: "order-update", saved: null }));
  }

  try {
    if (Number.isFinite(orderId) && orderId > 0) {
      await updateOrderStatus(orderId, nextState, { origin: "admin" });
    }
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      redirect(
        buildRedirectWithParams(returnTo, { error: "order-not-found", saved: null }),
      );
    }

    if (
      error instanceof InvalidOrderTransitionError ||
      error instanceof OrderValidationError
    ) {
      redirect(
        buildRedirectWithParams(returnTo, { error: "order-update", saved: null }),
      );
    }

    redirect(buildRedirectWithParams(returnTo, { error: "order-update", saved: null }));
  }

  revalidatePath("/admin");
  redirect(buildRedirectWithParams(returnTo, { saved: "state-updated", error: null }));
}
