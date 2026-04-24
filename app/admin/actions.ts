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
import { getAdminProductsByIds } from "@/lib/catalog";
import { saveAdminArticleEdits } from "@/lib/admin-product-editor";
import { saveAdminConfig } from "@/lib/admin-config";
import {
  deleteManagedProductImages,
  isManagedProductImageUrl,
  saveUploadedProductImages,
} from "@/lib/product-image-storage";
import {
  getProductImageOverridesByProductIds,
  normalizeProductImageUrls,
  saveProductImageOverride,
} from "@/lib/repositories/productImageRepository";
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

type ProductImageManifestItem =
  | { type: "url"; value: string }
  | { type: "upload"; value: string };

function parseProductImageManifest(rawValue: string) {
  if (!rawValue.trim()) {
    return [] as ProductImageManifestItem[];
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        if (
          !item ||
          typeof item !== "object" ||
          !("type" in item) ||
          !("value" in item)
        ) {
          return null;
        }

        const type =
          item.type === "upload" || item.type === "url" ? item.type : null;
        const value = typeof item.value === "string" ? item.value.trim() : "";

        if (!type || !value) {
          return null;
        }

        return { type, value } satisfies ProductImageManifestItem;
      })
      .filter((item): item is ProductImageManifestItem => Boolean(item));
  } catch {
    return [];
  }
}

function arraysMatch(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
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

type AdminProductMutationError =
  | "product-not-found"
  | "product-invalid"
  | "product-image-invalid"
  | "product-image-file"
  | "product-image-save"
  | "product-image-storage";

type AdminProductMutationResult =
  | { ok: true; saved: "product-updated" | "product-image-cleared" }
  | { ok: false; error: AdminProductMutationError };

function normalizeComparableText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function toComparablePrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function getAdminProductMutationErrorCode(message: string): AdminProductMutationError {
  if (/APP_PRODUCT_IMAGE_UPLOAD_DIRECTORY|configura/i.test(message)) {
    return "product-image-storage";
  }

  if (/product-price-invalid|precio|descripcion|marca|categoria|variante|talle|color/i.test(message)) {
    return "product-invalid";
  }

  if (/http\(s\)|ruta local|permiten hasta|fuente de la imagen|solo se aceptan imagenes|maximo 8 mb|product-image-invalid/i.test(message)) {
    return "product-image-invalid";
  }

  if (/product-image-file/i.test(message)) {
    return "product-image-file";
  }

  return "product-image-save";
}

function didAdminVariantInputsChange(
  adminEntries: Awaited<ReturnType<typeof getAdminProductsByIds>>,
  requestedVariants: Array<{
    productId: string;
    size: string;
    color: string;
    price: number | null;
  }>,
) {
  const currentEntriesById = new Map(
    adminEntries.map((entry) => [entry.product.id, entry]),
  );

  return requestedVariants.some((variant) => {
    const currentEntry = currentEntriesById.get(variant.productId);
    if (!currentEntry) {
      return true;
    }

    return (
      normalizeComparableText(variant.size) !==
        normalizeComparableText(currentEntry.baseProduct.defaultSize) ||
      normalizeComparableText(variant.color) !==
        normalizeComparableText(currentEntry.baseProduct.defaultColor) ||
      toComparablePrice(variant.price) !==
        toComparablePrice(currentEntry.baseProduct.price)
    );
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

export async function saveAdminProductImagesAction(
  formData: FormData,
): Promise<AdminProductMutationResult> {
  const sessionUser = await requireAdminSession();
  const productId =
    typeof formData.get("productId") === "string"
      ? String(formData.get("productId"))
      : "";
  const parentCode =
    typeof formData.get("parentCode") === "string"
      ? String(formData.get("parentCode"))
      : "";
  const imageUrlsInput =
    typeof formData.get("imageUrls") === "string"
      ? String(formData.get("imageUrls"))
      : "";
  const imageManifestInput =
    typeof formData.get("imageManifest") === "string"
      ? String(formData.get("imageManifest"))
      : "";
  const productDescriptionInput =
    typeof formData.get("productDescription") === "string"
      ? String(formData.get("productDescription")).trim()
      : "";
  const productPriceInput =
    typeof formData.get("productPrice") === "string"
      ? String(formData.get("productPrice")).trim()
      : "";
  const productSizeInput =
    typeof formData.get("productSize") === "string"
      ? String(formData.get("productSize")).trim()
      : "";
  const productColorInput =
    typeof formData.get("productColor") === "string"
      ? String(formData.get("productColor")).trim()
      : "";
  const productBrandIdInput =
    typeof formData.get("productBrandId") === "string"
      ? String(formData.get("productBrandId"))
      : "";
  const productCategoryIdInput =
    typeof formData.get("productCategoryId") === "string"
      ? String(formData.get("productCategoryId"))
      : "";
  const variantIds = formData
    .getAll("variantId")
    .map((value) => (typeof value === "string" ? value : ""))
    .filter(Boolean);
  const variantSizes = formData.getAll("variantSize").map((value) =>
    typeof value === "string" ? value : "",
  );
  const variantColors = formData.getAll("variantColor").map((value) =>
    typeof value === "string" ? value : "",
  );
  const variantPrices = formData.getAll("variantPrice").map((value) =>
    typeof value === "string" ? value : "",
  );
  const imageManifest = parseProductImageManifest(imageManifestInput);
  const requestedImageUrls = imageManifest.length > 0
    ? []
    : parseProductImageUrlsInput(imageUrlsInput);
  const uploadedFiles = formData
    .getAll("newImages")
    .filter((value): value is File => value instanceof File);
  const uploadedClientIds = formData
    .getAll("newImageClientId")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  if (!productId) {
    return { ok: false, error: "product-not-found" };
  }

  if (
    variantIds.length !== variantSizes.length ||
    variantIds.length !== variantColors.length ||
    variantIds.length !== variantPrices.length
  ) {
    return { ok: false, error: "product-invalid" };
  }

  let parsedRequestedPrice: number | null = null;
  let requestedVariants: Array<{
    productId: string;
    size: string;
    color: string;
    price: number | null;
  }> = [];

  try {
    parsedRequestedPrice = parseAdminPriceInput(productPriceInput);

    requestedVariants = variantIds.map((variantId, index) => ({
      productId: variantId,
      size: variantSizes[index] || "",
      color: variantColors[index] || "",
      price: parseAdminPriceInput(variantPrices[index] || ""),
    }));
  } catch {
    return { ok: false, error: "product-invalid" };
  }

  const [adminEntries, currentImageOverrides] = await Promise.all([
    getAdminProductsByIds(Array.from(new Set([productId, ...variantIds]))),
    getProductImageOverridesByProductIds([productId]),
  ]);

  const currentImageOverride = currentImageOverrides.get(productId) || null;
  const currentEntry = adminEntries.find((entry) => entry.product.id === productId) || null;

  if (!currentEntry) {
    return { ok: false, error: "product-not-found" };
  }

  const requestedDescription =
    productDescriptionInput || currentEntry.baseProduct.description;
  const requestedPrice =
    parsedRequestedPrice ?? currentEntry.baseProduct.price;
  const requestedSize = productSizeInput;
  const requestedColor = productColorInput;
  const requestedBrandId =
    productBrandIdInput
    || currentEntry.baseProduct.typeId
    || currentEntry.product.typeId
    || "";
  const requestedCategoryId =
    productCategoryIdInput
    || currentEntry.baseProduct.categoryId
    || currentEntry.product.categoryId
    || "";
  const shouldSaveArticleEdits =
    normalizeComparableText(requestedDescription) !==
      normalizeComparableText(currentEntry.baseProduct.description) ||
    toComparablePrice(requestedPrice) !==
      toComparablePrice(currentEntry.baseProduct.price) ||
    normalizeComparableText(requestedSize) !==
      normalizeComparableText(currentEntry.baseProduct.defaultSize) ||
    normalizeComparableText(requestedColor) !==
      normalizeComparableText(currentEntry.baseProduct.defaultColor) ||
    normalizeComparableText(requestedBrandId) !==
      normalizeComparableText(currentEntry.baseProduct.typeId) ||
    normalizeComparableText(requestedCategoryId) !==
      normalizeComparableText(currentEntry.baseProduct.categoryId) ||
    didAdminVariantInputsChange(adminEntries, requestedVariants);

  if (
    shouldSaveArticleEdits &&
    (
      !requestedPrice ||
      !requestedDescription ||
      !requestedBrandId ||
      !requestedCategoryId
    )
  ) {
    return { ok: false, error: "product-invalid" };
  }

  let uploadedImageUrls: string[] = [];

  if (uploadedFiles.length > 0) {
    try {
      uploadedImageUrls = await saveUploadedProductImages({
        productId,
        files: uploadedFiles,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      return {
        ok: false,
        error:
          /APP_PRODUCT_IMAGE_UPLOAD_DIRECTORY|configura/i.test(message)
            ? "product-image-storage"
            : "product-image-file",
      };
    }
  }

  let finalImageUrls: string[] = [];

  try {
    if (imageManifest.length > 0) {
      if (uploadedClientIds.length !== uploadedImageUrls.length) {
        throw new Error("product-image-file");
      }

      const uploadedByClientId = new Map(
        uploadedClientIds.map((clientId, index) => [clientId, uploadedImageUrls[index]]),
      );

      finalImageUrls = normalizeProductImageUrls(
        imageManifest.flatMap((item) => {
          if (item.type === "url") {
            return [item.value];
          }

          const uploadedUrl = uploadedByClientId.get(item.value);
          if (!uploadedUrl) {
            throw new Error("product-image-invalid");
          }

          return [uploadedUrl];
        }),
      );
    } else {
      finalImageUrls = normalizeProductImageUrls([...requestedImageUrls, ...uploadedImageUrls]);
    }
  } catch (error) {
    if (uploadedImageUrls.length > 0) {
      await deleteManagedProductImages(uploadedImageUrls);
    }

    const message = error instanceof Error ? error.message : "";
    return { ok: false, error: getAdminProductMutationErrorCode(message) };
  }

  const baseImageUrls = currentEntry.baseProduct.imageGalleryUrls;
  let imageMutationApplied = false;

  try {
    if (finalImageUrls.length === 0) {
      if (currentImageOverride) {
        await saveProductImageOverride({
          productId,
          imageUrls: [],
          updatedBy: null,
        });
        imageMutationApplied = true;
      }
    } else if (arraysMatch(finalImageUrls, baseImageUrls)) {
      if (currentImageOverride) {
        await saveProductImageOverride({
          productId,
          imageUrls: [],
          updatedBy: null,
        });
        imageMutationApplied = true;
      }
    } else if (
      !currentImageOverride ||
      !arraysMatch(finalImageUrls, currentImageOverride.imageGalleryUrls)
    ) {
      await saveProductImageOverride({
        productId,
        imageUrls: finalImageUrls,
        updatedBy: sessionUser.username,
      });
      imageMutationApplied = true;
    }

    if (shouldSaveArticleEdits) {
      await saveAdminArticleEdits({
        productId,
        parentCode,
        description: requestedDescription,
        price: requestedPrice,
        size: requestedSize,
        color: requestedColor,
        brandId: requestedBrandId,
        categoryId: requestedCategoryId,
        variants: requestedVariants,
      });
    }
  } catch (error) {
    if (uploadedImageUrls.length > 0) {
      await deleteManagedProductImages(uploadedImageUrls);
    }

    if (imageMutationApplied) {
      try {
        await saveProductImageOverride({
          productId,
          imageUrls: currentImageOverride?.imageGalleryUrls || [],
          imageMode: currentImageOverride?.imageMode || "exact",
          imageNote: currentImageOverride?.imageNote || null,
          imageSourceUrl: currentImageOverride?.imageSourceUrl || null,
          updatedBy: currentImageOverride?.updatedBy || null,
        });
      } catch (restoreError) {
        console.error("[admin-products] No se pudo restaurar la galeria previa.", restoreError);
      }
    }

    const message = error instanceof Error ? error.message : "";
    return { ok: false, error: getAdminProductMutationErrorCode(message) };
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

  return { ok: true, saved: "product-updated" };
}

export async function clearAdminProductImagesAction(
  formData: FormData,
): Promise<AdminProductMutationResult> {
  await requireAdminSession();

  const productId =
    typeof formData.get("productId") === "string"
      ? String(formData.get("productId"))
      : "";

  if (!productId) {
    return { ok: false, error: "product-not-found" };
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
    return { ok: false, error: "product-image-save" };
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

  return { ok: true, saved: "product-image-cleared" };
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
