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
  getAdminCookieOptions,
  getAdminSessionUser,
  isAdminConfigured,
  verifyAdminCredentials,
} from "@/lib/admin-auth";
import { avanzarEstadoPedido } from "@/lib/services/orderService";
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUserErrorCode,
  updateAdminUser,
} from "@/lib/admin-users";
import { saveAdminConfig } from "@/lib/admin-config";
import { resolvePendingPaymentStatus } from "@/lib/web-payments";

async function requireAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const user = await getAdminSessionUser(token);

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
  const statusFilter =
    typeof formData.get("statusFilter") === "string"
      ? String(formData.get("statusFilter"))
      : "orders";

  if (Number.isFinite(pendingOrderId) && pendingOrderId > 0) {
    await resolvePendingPaymentStatus({ pendingOrderId });
  }

  revalidatePath("/admin");
  const suffix =
    statusFilter && statusFilter !== "orders"
      ? `?status=${encodeURIComponent(statusFilter)}&saved=refresh`
      : "?saved=refresh";
  redirect(`/admin${suffix}`);
}

export async function advanceAdminOrderAction(formData: FormData) {
  await requireAdminSession();

  const orderId = Number(formData.get("orderId") || "");
  const statusFilter =
    typeof formData.get("statusFilter") === "string"
      ? String(formData.get("statusFilter"))
      : "orders";

  try {
    if (Number.isFinite(orderId) && orderId > 0) {
      await avanzarEstadoPedido(orderId);
    }
  } catch (error) {
    const suffix =
      statusFilter && statusFilter !== "orders"
        ? `?status=${encodeURIComponent(statusFilter)}`
        : "";

    if (error instanceof OrderNotFoundError) {
      redirect(`/admin${suffix}${suffix ? "&" : "?"}error=order-not-found`);
    }

    if (
      error instanceof InvalidOrderTransitionError ||
      error instanceof OrderValidationError
    ) {
      redirect(`/admin${suffix}${suffix ? "&" : "?"}error=order-advance`);
    }

    redirect(`/admin${suffix}${suffix ? "&" : "?"}error=order-advance`);
  }

  revalidatePath("/admin");
  const suffix =
    statusFilter && statusFilter !== "orders"
      ? `?status=${encodeURIComponent(statusFilter)}&saved=advance`
      : "?saved=advance";
  redirect(`/admin${suffix}`);
}
