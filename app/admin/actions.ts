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
  markOrderPaymentStatus,
  updateOrderStatus,
} from "@/lib/services/orderService";
import {
  adjustAdminSystemArticleStockService,
  createAdminSystemArticleService,
  createAdminSystemBrandService,
  createAdminSystemCategoryService,
  createAdminSystemStockMovementService,
  toggleAdminSystemArticleWebBlockedService,
  updateAdminSystemArticleService,
} from "@/lib/services/adminSystemService";
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

function buildSystemRedirect(input: {
  section?: string;
  query?: string | null;
  mode?: string | null;
  articleCode?: string | null;
  articlePage?: string | null;
  saved?: string;
  error?: string;
  detail?: string | null;
}) {
  const params = new URLSearchParams({
    view: "system",
    system: input.section || "articulos",
  });

  if (input.query) {
    params.set("system_q", input.query);
  }

  if (input.mode) {
    params.set("system_mode", input.mode);
  }

  if (input.articleCode) {
    params.set("system_article", input.articleCode);
  }

  if (
    (input.section || "articulos") === "articulos" &&
    input.articlePage &&
    Number(input.articlePage) > 1
  ) {
    params.set("system_article_page", input.articlePage);
  }

  if (input.saved) {
    params.set("saved", input.saved);
  }

  if (input.error) {
    params.set("error", input.error);
  }

  if (input.detail) {
    params.set("detail", input.detail.slice(0, 180));
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

function resolveSystemSection(formData: FormData, fallback = "articulos") {
  return typeof formData.get("systemSection") === "string"
    ? String(formData.get("systemSection"))
    : fallback;
}

function resolveSystemQuery(formData: FormData) {
  return typeof formData.get("systemQuery") === "string"
    ? String(formData.get("systemQuery"))
    : "";
}

function resolveSystemMode(formData: FormData) {
  return typeof formData.get("systemMode") === "string"
    ? String(formData.get("systemMode"))
    : "";
}

function resolveSystemArticle(formData: FormData) {
  return typeof formData.get("systemArticle") === "string"
    ? String(formData.get("systemArticle"))
    : "";
}

function isUserAlfa(username: string | null | undefined) {
  return (username || "").trim().toLowerCase() === "useralfa";
}

function resolveSystemArticlePage(formData: FormData) {
  return typeof formData.get("systemArticlePage") === "string"
    ? String(formData.get("systemArticlePage"))
    : "";
}

function getActionErrorDetail(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "No se pudo completar la operacion.";
}

export async function refreshAdminOrderMutation(input: {
  pendingOrderId: number;
}) {
  await requireAdminSession();

  try {
    if (Number.isFinite(input.pendingOrderId) && input.pendingOrderId > 0) {
      await resolvePendingPaymentStatus({ pendingOrderId: input.pendingOrderId });
    }
  } catch {
    return { ok: false as const, error: "order-refresh" as const };
  }

  revalidatePath("/admin");

  return { ok: true as const, saved: "refresh" as const };
}

export async function advanceAdminOrderMutation(input: { orderId: number }) {
  await requireAdminSession();

  try {
    if (Number.isFinite(input.orderId) && input.orderId > 0) {
      await avanzarEstadoPedido(input.orderId, { origin: "admin" });
    }
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return { ok: false as const, error: "order-not-found" as const };
    }

    if (
      error instanceof InvalidOrderTransitionError ||
      error instanceof OrderValidationError
    ) {
      return { ok: false as const, error: "order-advance" as const };
    }

    return { ok: false as const, error: "order-advance" as const };
  }

  revalidatePath("/admin");

  return { ok: true as const, saved: "advance" as const };
}

export async function updateAdminOrderStateMutation(input: {
  orderId: number;
  nextState: OrderState | null;
}) {
  await requireAdminSession();

  if (!input.nextState) {
    return { ok: false as const, error: "order-update" as const };
  }

  try {
    if (Number.isFinite(input.orderId) && input.orderId > 0) {
      await updateOrderStatus(input.orderId, input.nextState, { origin: "admin" });
    }
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return { ok: false as const, error: "order-not-found" as const };
    }

    if (
      error instanceof InvalidOrderTransitionError ||
      error instanceof OrderValidationError
    ) {
      return { ok: false as const, error: "order-update" as const };
    }

    return { ok: false as const, error: "order-update" as const };
  }

  revalidatePath("/admin");

  return { ok: true as const, saved: "state-updated" as const };
}

export async function approveAdminOrderPaymentMutation(input: { orderId: number }) {
  await requireAdminSession();

  try {
    if (Number.isFinite(input.orderId) && input.orderId > 0) {
      await markOrderPaymentStatus(input.orderId, "aprobado", null);
    }
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return { ok: false as const, error: "order-not-found" as const };
    }

    return { ok: false as const, error: "order-payment-update" as const };
  }

  revalidatePath("/admin");

  return { ok: true as const, saved: "payment-updated" as const };
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

export async function createAdminSystemArticleAction(formData: FormData) {
  const sessionUser = await requireAdminSession();
  const query = resolveSystemQuery(formData);
  const articlePage = resolveSystemArticlePage(formData);

  try {
    const article = await createAdminSystemArticleService({
      code:
        typeof formData.get("code") === "string"
          ? String(formData.get("code"))
          : "",
      description:
        typeof formData.get("description") === "string"
          ? String(formData.get("description"))
          : "",
      barcode:
        typeof formData.get("barcode") === "string"
          ? String(formData.get("barcode"))
          : "",
      supplierAccount:
        typeof formData.get("supplierAccount") === "string"
          ? String(formData.get("supplierAccount"))
          : "",
      supplierProductCode:
        typeof formData.get("supplierProductCode") === "string"
          ? String(formData.get("supplierProductCode"))
          : "",
      imagePath:
        typeof formData.get("imagePath") === "string"
          ? String(formData.get("imagePath"))
          : "",
      unitId:
        typeof formData.get("unitId") === "string"
          ? String(formData.get("unitId"))
          : "",
      brandId:
        typeof formData.get("brandId") === "string"
          ? String(formData.get("brandId"))
          : "",
      categoryId:
        typeof formData.get("categoryId") === "string"
          ? String(formData.get("categoryId"))
          : "",
      exempt: formData.get("exempt") === "on",
      weighable: formData.get("weighable") === "on",
      suspended: formData.get("suspended") === "on",
      suspendedForSales: formData.get("suspendedForSales") === "on",
      price:
        typeof formData.get("price") === "string"
          ? String(formData.get("price"))
          : "0",
      cost:
        typeof formData.get("cost") === "string"
          ? String(formData.get("cost"))
          : "0",
      taxRate:
        typeof formData.get("taxRate") === "string"
          ? String(formData.get("taxRate"))
          : "0",
      username: sessionUser.username,
    });

    revalidatePath("/admin");
    revalidatePath("/");
    redirect(
      buildSystemRedirect({
        section: "articulos",
        query: article.code || query,
        mode: "edit",
        articleCode: article.code,
        articlePage,
        saved: "system-article-created",
      }),
    );
  } catch (error) {
    redirect(
      buildSystemRedirect({
        section: "articulos",
        query,
        mode: "new",
        articlePage,
        error: "system-article-create",
        detail: getActionErrorDetail(error),
      }),
    );
  }
}

export async function updateAdminSystemArticleAction(formData: FormData) {
  const sessionUser = await requireAdminSession();
  const section = resolveSystemSection(formData, "articulos");
  const query = resolveSystemQuery(formData);
  const mode = resolveSystemMode(formData);
  const articleCode = resolveSystemArticle(formData);
  const articlePage = resolveSystemArticlePage(formData);

  try {
    await updateAdminSystemArticleService({
      code:
        typeof formData.get("code") === "string"
          ? String(formData.get("code"))
          : "",
      description:
        typeof formData.get("description") === "string"
          ? String(formData.get("description"))
          : "",
      barcode:
        typeof formData.get("barcode") === "string"
          ? String(formData.get("barcode"))
          : "",
      supplierAccount:
        typeof formData.get("supplierAccount") === "string"
          ? String(formData.get("supplierAccount"))
          : "",
      supplierProductCode:
        typeof formData.get("supplierProductCode") === "string"
          ? String(formData.get("supplierProductCode"))
          : "",
      imagePath:
        typeof formData.get("imagePath") === "string"
          ? String(formData.get("imagePath"))
          : "",
      unitId:
        typeof formData.get("unitId") === "string"
          ? String(formData.get("unitId"))
          : "",
      brandId:
        typeof formData.get("brandId") === "string"
          ? String(formData.get("brandId"))
          : "",
      categoryId:
        typeof formData.get("categoryId") === "string"
          ? String(formData.get("categoryId"))
          : "",
      exempt: formData.get("exempt") === "on",
      weighable: formData.get("weighable") === "on",
      suspended: formData.get("suspended") === "on",
      suspendedForSales: formData.get("suspendedForSales") === "on",
      price:
        typeof formData.get("price") === "string"
          ? String(formData.get("price"))
          : "0",
      cost:
        typeof formData.get("cost") === "string"
          ? String(formData.get("cost"))
          : "0",
      taxRate:
        typeof formData.get("taxRate") === "string"
          ? String(formData.get("taxRate"))
          : "0",
      username: sessionUser.username,
    });

    revalidatePath("/admin");
    revalidatePath("/");
    redirect(
      buildSystemRedirect({
        section,
        query,
        mode: mode || "edit",
        articleCode: articleCode || (
          typeof formData.get("code") === "string" ? String(formData.get("code")) : ""
        ),
        articlePage,
        saved: "system-article-updated",
      }),
    );
  } catch (error) {
    redirect(
      buildSystemRedirect({
        section,
        query,
        mode: mode || "edit",
        articleCode: articleCode || (
          typeof formData.get("code") === "string" ? String(formData.get("code")) : ""
        ),
        articlePage,
        error: "system-article-update",
        detail: getActionErrorDetail(error),
      }),
    );
  }
}

export async function toggleAdminSystemArticleWebBlockAction(formData: FormData) {
  const sessionUser = await requireAdminSession();
  const section = resolveSystemSection(formData, "articulos");
  const query = resolveSystemQuery(formData);
  const mode = resolveSystemMode(formData);
  const articleCode = resolveSystemArticle(formData);
  const articlePage = resolveSystemArticlePage(formData);

  try {
    const blocked =
      typeof formData.get("blocked") === "string"
        ? String(formData.get("blocked")) === "1"
        : false;

    await toggleAdminSystemArticleWebBlockedService({
      code:
        typeof formData.get("code") === "string"
          ? String(formData.get("code"))
          : "",
      blocked,
      username: sessionUser.username,
    });

    revalidatePath("/admin");
    revalidatePath("/");
    redirect(
      buildSystemRedirect({
        section,
        query,
        mode,
        articleCode,
        articlePage,
        saved: blocked ? "system-article-blocked" : "system-article-unblocked",
      }),
    );
  } catch (error) {
    redirect(
      buildSystemRedirect({
        section,
        query,
        mode,
        articleCode,
        articlePage,
        error: "system-article-block",
        detail: getActionErrorDetail(error),
      }),
    );
  }
}

export async function createAdminSystemStockMovementAction(formData: FormData) {
  const sessionUser = await requireAdminSession();

  if (!isUserAlfa(sessionUser.username)) {
    return {
      ok: false as const,
      error: "system-stock-update" as const,
      detail: "No tienes permiso para usar Stock desde este panel.",
    };
  }

  try {
    const movementNumber = await createAdminSystemStockMovementService({
      reasonId:
        typeof formData.get("reasonId") === "string"
          ? String(formData.get("reasonId"))
          : "",
      depositId:
        typeof formData.get("depositId") === "string"
          ? String(formData.get("depositId"))
          : "",
      linesJson:
        typeof formData.get("linesJson") === "string"
          ? String(formData.get("linesJson"))
          : "[]",
      observation:
        typeof formData.get("observation") === "string"
          ? String(formData.get("observation"))
          : "",
      username: sessionUser.username,
    });

    revalidatePath("/admin");
    revalidatePath("/");
    return {
      ok: true as const,
      saved: "system-stock-updated" as const,
      movementNumber,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: "system-stock-update" as const,
      detail: getActionErrorDetail(error),
    };
  }
}

export async function adjustAdminSystemArticleStockAction(formData: FormData) {
  const sessionUser = await requireAdminSession();

  if (!isUserAlfa(sessionUser.username)) {
    redirect(
      buildSystemRedirect({
        section: "articulos",
        error: "system-stock-update",
        detail: "No tienes permiso para usar Stock desde este panel.",
      }),
    );
  }

  const section = resolveSystemSection(formData, "stock");
  const query = resolveSystemQuery(formData);

  try {
    await adjustAdminSystemArticleStockService({
      code:
        typeof formData.get("code") === "string"
          ? String(formData.get("code"))
          : "",
      targetStock:
        typeof formData.get("targetStock") === "string"
          ? String(formData.get("targetStock"))
          : "0",
      defaultDepositId:
        typeof formData.get("defaultDepositId") === "string"
          ? String(formData.get("defaultDepositId"))
          : "",
      defaultStockReasonId:
        typeof formData.get("defaultStockReasonId") === "string"
          ? String(formData.get("defaultStockReasonId"))
          : "",
      username: sessionUser.username,
    });

    revalidatePath("/admin");
    revalidatePath("/");
    redirect(
      buildSystemRedirect({
        section,
        query,
        saved: "system-stock-updated",
      }),
    );
  } catch (error) {
    redirect(
      buildSystemRedirect({
        section,
        query,
        error: "system-stock-update",
        detail: getActionErrorDetail(error),
      }),
    );
  }
}

export async function createAdminSystemBrandAction(formData: FormData) {
  await requireAdminSession();

  try {
    await createAdminSystemBrandService({
      code:
        typeof formData.get("code") === "string"
          ? String(formData.get("code"))
          : "",
      description:
        typeof formData.get("description") === "string"
          ? String(formData.get("description"))
          : "",
    });

    revalidatePath("/admin");
    redirect(
      buildSystemRedirect({
        section: "marcas",
        saved: "system-brand-created",
      }),
    );
  } catch (error) {
    redirect(
      buildSystemRedirect({
        section: "marcas",
        error: "system-brand-create",
        detail: getActionErrorDetail(error),
      }),
    );
  }
}

export async function createAdminSystemCategoryAction(formData: FormData) {
  await requireAdminSession();

  try {
    await createAdminSystemCategoryService({
      code:
        typeof formData.get("code") === "string"
          ? String(formData.get("code"))
          : "",
      description:
        typeof formData.get("description") === "string"
          ? String(formData.get("description"))
          : "",
    });

    revalidatePath("/admin");
    redirect(
      buildSystemRedirect({
        section: "categorias",
        saved: "system-category-created",
      }),
    );
  } catch (error) {
    redirect(
      buildSystemRedirect({
        section: "categorias",
        error: "system-category-create",
        detail: getActionErrorDetail(error),
      }),
    );
  }
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
