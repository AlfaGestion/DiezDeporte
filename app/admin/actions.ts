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
import type { OrderState } from "@/lib/types/order";
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUserErrorCode,
  updateAdminUser,
} from "@/lib/admin-users";
import { getAdminProductsByIds, getProductsByIds } from "@/lib/catalog";
import { saveAdminConfig } from "@/lib/admin-config";
import {
  deleteManagedProductImages,
  isManagedProductImageUrl,
  saveUploadedProductImages,
} from "@/lib/product-image-storage";
import {
  getProductImageOverridesByProductIds,
  saveProductImageOverride,
} from "@/lib/repositories/productImageRepository";
import {
  getProductAdminOverridesByProductIds,
  saveProductAdminOverride,
  type ProductAdminOverride,
} from "@/lib/repositories/productOverrideRepository";
import type { ProductImageMode } from "@/lib/types";
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
  error?: string;
  saved?: string;
  query?: string;
  articleCode?: string;
}) {
  const params = new URLSearchParams({
    view: "system",
    system: input.section || "articulos",
  });

  if (input.saved) {
    params.set("saved", input.saved);
  }

  if (input.error) {
    params.set("error", input.error);
  }

  if (input.query) {
    params.set("system_q", input.query);
  }

  if (input.articleCode) {
    params.set("system_article", input.articleCode);
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

function parseProductImageUrlsInput(rawValue: string) {
  return rawValue
    .split(/\r?\n/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseAdminPriceInput(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  let normalized = trimmed.replace(/\s+/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma > lastDot) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(/,/g, "");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("product-price-invalid");
  }

  return Math.round(parsed * 100) / 100;
}

async function restoreProductAdminOverride(
  productId: string,
  previousOverride: ProductAdminOverride | null,
) {
  if (!previousOverride) {
    await saveProductAdminOverride({
      productId,
      description: null,
      price: null,
      brand: null,
      category: null,
      updatedBy: null,
    });
    return;
  }

  await saveProductAdminOverride({
    productId,
    description: previousOverride.description,
    price: previousOverride.price,
    brand: previousOverride.brand,
    category: previousOverride.category,
    updatedBy: previousOverride.updatedBy,
  });
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

export async function saveAdminProductImagesAction(formData: FormData) {
  const sessionUser = await requireAdminSession();
  const systemSection =
    typeof formData.get("systemSection") === "string"
      ? String(formData.get("systemSection")).trim() || "articulos"
      : "articulos";
  const systemQuery =
    typeof formData.get("systemQuery") === "string"
      ? String(formData.get("systemQuery")).trim()
      : "";
  const productId =
    typeof formData.get("productId") === "string"
      ? String(formData.get("productId")).trim()
      : "";
  const returnTo = resolveAdminReturnTo(
    formData,
    buildSystemRedirect({
      section: systemSection,
      query: systemQuery,
      articleCode: productId,
    }),
  );
  const imageUrlsInput =
    typeof formData.get("imageUrls") === "string"
      ? String(formData.get("imageUrls"))
      : "";
  const imageModeInput =
    typeof formData.get("imageMode") === "string"
      ? String(formData.get("imageMode")).trim().toLowerCase()
      : "";
  const imageMode: ProductImageMode =
    imageModeInput === "illustrative" ? "illustrative" : "exact";
  const imageNoteInput =
    typeof formData.get("imageNote") === "string"
      ? String(formData.get("imageNote")).trim()
      : "";
  const imageSourceUrlInput =
    typeof formData.get("imageSourceUrl") === "string"
      ? String(formData.get("imageSourceUrl")).trim()
      : "";
  const productDescriptionInput =
    typeof formData.get("productDescription") === "string"
      ? String(formData.get("productDescription")).trim()
      : "";
  const productPriceInput =
    typeof formData.get("productPrice") === "string"
      ? String(formData.get("productPrice")).trim()
      : "";
  const productBrandInput =
    typeof formData.get("productBrand") === "string"
      ? String(formData.get("productBrand")).trim()
      : "";
  const productCategoryInput =
    typeof formData.get("productCategory") === "string"
      ? String(formData.get("productCategory")).trim()
      : "";
  const requestedImageUrls = parseProductImageUrlsInput(imageUrlsInput);
  const uploadedFiles = formData
    .getAll("newImages")
    .filter((value): value is File => value instanceof File);

  if (!productId) {
    redirect(
      buildRedirectWithParams(returnTo, {
        error: "product-not-found",
      }),
    );
  }

  let requestedPrice: number | null;

  try {
    requestedPrice = parseAdminPriceInput(productPriceInput);
  } catch {
    redirect(
      buildRedirectWithParams(returnTo, {
        error: "product-invalid",
      }),
    );
  }

  const [products, adminEntries, currentImageOverrides, currentDataOverrides] = await Promise.all([
    getProductsByIds([productId]),
    getAdminProductsByIds([productId]),
    getProductImageOverridesByProductIds([productId]),
    getProductAdminOverridesByProductIds([productId]),
  ]);

  if (products.length === 0) {
    redirect(
      buildRedirectWithParams(returnTo, {
        error: "product-not-found",
      }),
    );
  }

  const currentImageOverride = currentImageOverrides.get(productId) || null;
  const currentDataOverride = currentDataOverrides.get(productId) || null;
  const currentEntry = adminEntries[0] || null;

  if (!currentEntry) {
    redirect(
      buildRedirectWithParams(returnTo, {
        error: "product-not-found",
      }),
    );
  }

  const baseProduct = currentEntry.baseProduct;
  let uploadedImageUrls: string[] = [];

  try {
    uploadedImageUrls = await saveUploadedProductImages({
      productId,
      files: uploadedFiles,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    redirect(
      buildRedirectWithParams(returnTo, {
        error: /APP_PRODUCT_IMAGE_UPLOAD_DIRECTORY|configura/i.test(message)
          ? "product-image-storage"
          : "product-image-file",
      }),
    );
  }

  const finalImageUrls = [...requestedImageUrls, ...uploadedImageUrls];
  let contentSaved = false;

  try {
    await saveProductAdminOverride({
      productId,
      description:
        productDescriptionInput !== baseProduct.description
          ? productDescriptionInput
          : null,
      price:
        requestedPrice !== null &&
        requestedPrice !== Math.round(baseProduct.price * 100) / 100
          ? requestedPrice
          : null,
      brand:
        productBrandInput !== baseProduct.brand
          ? productBrandInput
          : null,
      category:
        productCategoryInput !== baseProduct.category
          ? productCategoryInput
          : null,
      updatedBy: sessionUser.username,
    });
    contentSaved = true;

    await saveProductImageOverride({
      productId,
      imageUrls: finalImageUrls,
      imageMode,
      imageNote:
        imageMode === "illustrative"
          ? imageNoteInput || "Imagen ilustrativa cargada desde el admin."
          : null,
      imageSourceUrl: imageMode === "illustrative" ? imageSourceUrlInput || null : null,
      updatedBy: sessionUser.username,
    });
  } catch (error) {
    if (uploadedImageUrls.length > 0) {
      await deleteManagedProductImages(uploadedImageUrls);
    }

    if (contentSaved) {
      try {
        await restoreProductAdminOverride(productId, currentDataOverride);
      } catch (restoreError) {
        console.error("[admin-products] No se pudo restaurar el override del articulo.", restoreError);
      }
    }

    const message = error instanceof Error ? error.message : "";
    const errorCode =
      /product-price-invalid|precio|descripcion|marca|categoria/i.test(message)
        ? "product-invalid"
        : /http\(s\)|ruta local|permiten hasta|fuente de la imagen/i.test(message)
          ? "product-image-invalid"
        : "product-image-save";

    redirect(
      buildRedirectWithParams(returnTo, {
        error: errorCode,
      }),
    );
  }

  const retainedUrls = new Set(finalImageUrls);
  const oldManagedUrls =
    currentImageOverride?.imageGalleryUrls.filter((url) => isManagedProductImageUrl(url)) || [];
  const orphanManagedUrls = oldManagedUrls.filter((url) => !retainedUrls.has(url));

  if (orphanManagedUrls.length > 0) {
    try {
      await deleteManagedProductImages(orphanManagedUrls);
    } catch (error) {
      console.error("[admin-products] No se pudieron borrar imagenes viejas.", error);
    }
  }

  revalidatePath("/");
  revalidatePath("/admin");

  redirect(
    buildRedirectWithParams(returnTo, {
      saved: "product-updated",
      error: null,
      system_article: productId,
    }),
  );
}

export async function clearAdminProductImagesAction(formData: FormData) {
  await requireAdminSession();

  const systemSection =
    typeof formData.get("systemSection") === "string"
      ? String(formData.get("systemSection")).trim() || "articulos"
      : "articulos";
  const systemQuery =
    typeof formData.get("systemQuery") === "string"
      ? String(formData.get("systemQuery")).trim()
      : "";
  const productId =
    typeof formData.get("productId") === "string"
      ? String(formData.get("productId")).trim()
      : "";
  const returnTo = resolveAdminReturnTo(
    formData,
    buildSystemRedirect({
      section: systemSection,
      query: systemQuery,
      articleCode: productId,
    }),
  );

  if (!productId) {
    redirect(
      buildRedirectWithParams(returnTo, {
        error: "product-not-found",
      }),
    );
  }

  const currentOverrides = await getProductImageOverridesByProductIds([productId]);
  const currentOverride = currentOverrides.get(productId) || null;

  try {
    await saveProductImageOverride({
      productId,
      imageUrls: [],
      updatedBy: null,
    });
  } catch {
    redirect(
      buildRedirectWithParams(returnTo, {
        error: "product-image-save",
      }),
    );
  }

  const managedUrls =
    currentOverride?.imageGalleryUrls.filter((url) => isManagedProductImageUrl(url)) || [];

  if (managedUrls.length > 0) {
    try {
      await deleteManagedProductImages(managedUrls);
    } catch (error) {
      console.error("[admin-products] No se pudieron borrar imagenes personalizadas.", error);
    }
  }

  revalidatePath("/");
  revalidatePath("/admin");

  redirect(
    buildRedirectWithParams(returnTo, {
      saved: "product-image-cleared",
      error: null,
      system_article: productId,
    }),
  );
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
