"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  adminCardClass,
  adminDangerButtonClass,
  adminInputClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminTextAreaClass,
  cn,
} from "@/components/admin/admin-ui";
import {
  clearAdminProductImagesAction,
  saveAdminProductImagesAction,
} from "@/app/admin/actions";
import { buildImageProxyUrl, formatCurrency } from "@/lib/commerce";
import {
  getLegacyArticleParentId,
} from "@/lib/legacy-article-id";
import type { Product } from "@/lib/types";
import type { ProductAdminOverride } from "@/lib/repositories/productOverrideRepository";

type EditorOverride = {
  imageGalleryUrls: string[];
  updatedAt: string | null;
  updatedBy: string | null;
} | null;

type EditorEntry = {
  product: Product;
  baseProduct: Product;
  imageOverride: EditorOverride;
  contentOverride: ProductAdminOverride | null;
};

type LookupOption = {
  id: string;
  label: string;
};

type VariantGroupSummary = {
  parentCode: string;
  hasRealParent: boolean;
  variantCount: number;
  totalStock: number;
  colorLabels: string[];
  sizeLabels: string[];
  variants: Array<{
    id: string;
    code: string;
    description: string;
    sizeLabel: string;
    colorLabel: string;
    price: number;
    stock: number;
  }>;
} | null;

type GalleryItem =
  | {
      id: string;
      type: "url";
      src: string;
      label: string;
    }
  | {
      id: string;
      type: "upload";
      src: string;
      label: string;
      clientId: string;
      file: File;
    };

type VariantDraft = {
  id: string;
  code: string;
  description: string;
  size: string;
  color: string;
  price: string;
  stock: number;
};

type GalleryManifestItem =
  | { type: "url"; value: string }
  | { type: "upload"; value: string };

type PreviewSurface = "checker" | "light" | "dark";

const CLIPBOARD_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const PREVIEW_SURFACE_OPTIONS: Array<{
  value: PreviewSurface;
  label: string;
}> = [
  { value: "checker", label: "Damero" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
];

function formatPriceInput(value: number) {
  return new Intl.NumberFormat("es-AR", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildClipboardFileName(index: number, type: string) {
  const extension = CLIPBOARD_EXTENSION_BY_TYPE[type] || "png";
  return `portapapeles-${Date.now()}-${index}.${extension}`;
}

function buildClientId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseClipboardText(value: string) {
  return value
    .split(/\r?\n/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createUrlGalleryItem(url: string) {
  return {
    id: buildClientId("gallery-url"),
    type: "url",
    src: url,
    label: url,
  } satisfies GalleryItem;
}

function createUploadGalleryItem(file: File) {
  return {
    id: buildClientId("gallery-upload"),
    type: "upload",
    src: URL.createObjectURL(file),
    label: file.name,
    clientId: buildClientId("file"),
    file,
  } satisfies GalleryItem;
}

function revokeGalleryItem(item: GalleryItem) {
  if (item.type === "upload") {
    URL.revokeObjectURL(item.src);
  }
}

function revokeGalleryItems(items: GalleryItem[]) {
  items.forEach((item) => revokeGalleryItem(item));
}

function getParentCode(entry: EditorEntry) {
  return getLegacyArticleParentId(entry.product.code);
}

function ensureCurrentOption(
  options: LookupOption[],
  selectedId: string,
  fallbackLabel: string,
) {
  if (!selectedId || options.some((option) => option.id === selectedId)) {
    return options;
  }

  return [
    {
      id: selectedId,
      label: fallbackLabel || `ID ${selectedId}`,
    },
    ...options,
  ];
}

function resolveOptionLabel(options: LookupOption[], selectedId: string, fallbackLabel: string) {
  return options.find((option) => option.id === selectedId)?.label || fallbackLabel || "Sin dato";
}

function normalizeGoogleSearchTerm(value: string | null | undefined) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();

  if (!normalized || normalized === "Sin dato" || /^ID\s+/i.test(normalized)) {
    return "";
  }

  return normalized;
}

function buildBackgroundRemovedFileName(label: string, fallbackCode: string) {
  const baseName = (label || fallbackCode || "articulo")
    .split(/[?#]/)[0]
    .split("/")
    .pop()
    ?.replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `${baseName || "articulo"}-sin-fondo.png`;
}

export function AdminSystemArticleImageEditorFrame(props: {
  activeSection: string;
  productSearchQuery: string;
  closeHref: string;
  returnTo: string;
  entry: EditorEntry | null;
  publishedProduct: Product | null;
  brandOptions: LookupOption[];
  categoryOptions: LookupOption[];
  variantSummary: VariantGroupSummary;
}) {
  const {
    activeSection,
    productSearchQuery,
    closeHref,
    returnTo,
    entry,
    publishedProduct,
    brandOptions,
    categoryOptions,
    variantSummary,
  } = props;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadItemsRef = useRef<GalleryItem[]>([]);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([]);
  const [urlDraft, setUrlDraft] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [replaceTargetIndex, setReplaceTargetIndex] = useState<number | null>(null);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);
  const [isBackgroundRemoving, setIsBackgroundRemoving] = useState(false);
  const [previewSurface, setPreviewSurface] = useState<PreviewSurface>("checker");
  const [submitMode, setSubmitMode] = useState<"save" | "clear" | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [isRefreshPending, startRefreshTransition] = useTransition();

  const applyGalleryUpdate = (updater: (current: GalleryItem[]) => GalleryItem[]) => {
    setGalleryItems((current) => {
      const next = updater(current);
      const keptIds = new Set(next.map((item) => item.id));

      current.forEach((item) => {
        if (!keptIds.has(item.id)) {
          revokeGalleryItem(item);
        }
      });

      return next;
    });
  };

  useEffect(() => {
    const uploadItems = galleryItems.filter(
      (item): item is Extract<GalleryItem, { type: "upload" }> => item.type === "upload",
    );
    uploadItemsRef.current = uploadItems;
  }, [galleryItems]);

  useEffect(() => {
    return () => {
      revokeGalleryItems(uploadItemsRef.current);
    };
  }, []);

  useEffect(() => {
    revokeGalleryItems(uploadItemsRef.current);
    uploadItemsRef.current = [];

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (!entry) {
      setDescription("");
      setPrice("");
      setSize("");
      setColor("");
      setBrandId("");
      setCategoryId("");
      setGalleryItems([]);
      setVariantDrafts([]);
      setUrlDraft("");
      setActiveImageIndex(0);
      setReplaceTargetIndex(null);
      setPasteMessage(null);
      setIsBackgroundRemoving(false);
      return;
    }

    const visibleUrls =
      publishedProduct?.imageGalleryUrls.length
        ? publishedProduct.imageGalleryUrls
        : entry.baseProduct.imageGalleryUrls;

    setDescription(entry.baseProduct.description);
    setPrice(formatPriceInput(entry.baseProduct.price));
    setSize(entry.baseProduct.defaultSize || entry.product.defaultSize || "");
    setColor(entry.baseProduct.defaultColor || entry.product.defaultColor || "");
    setBrandId(entry.baseProduct.typeId || entry.product.typeId || "");
    setCategoryId(entry.baseProduct.categoryId || entry.product.categoryId || "");
    setGalleryItems(visibleUrls.map((url) => createUrlGalleryItem(url)));
    setVariantDrafts(
      (variantSummary?.variants || []).map((variant) => ({
        id: variant.id,
        code: variant.code,
        description: variant.description,
        size: variant.sizeLabel || "",
        color: variant.colorLabel === "Sin dato" ? "" : variant.colorLabel,
        price: formatPriceInput(variant.price),
        stock: variant.stock,
      })),
    );
    setUrlDraft("");
    setActiveImageIndex(0);
    setReplaceTargetIndex(null);
    setPasteMessage(null);
    setIsBackgroundRemoving(false);
  }, [entry, publishedProduct, variantSummary]);

  useEffect(() => {
    setFeedback(null);
    setSubmitMode(null);
  }, [entry?.product.id]);

  useEffect(() => {
    if (galleryItems.length === 0) {
      setActiveImageIndex(0);
      return;
    }

    setActiveImageIndex((current) => Math.min(current, galleryItems.length - 1));
  }, [galleryItems.length]);

  if (!entry) {
    return null;
  }

  const currentGalleryItem = galleryItems[activeImageIndex] || null;
  const previewImageSrc = currentGalleryItem
    ? buildImageProxyUrl(currentGalleryItem.src, {
        transparentBackground: true,
      }) || currentGalleryItem.src
    : null;
  const uploadItems = galleryItems.filter(
    (item): item is Extract<GalleryItem, { type: "upload" }> => item.type === "upload",
  );
  const manifestItems: GalleryManifestItem[] = galleryItems.map((item) =>
    item.type === "upload"
      ? { type: "upload", value: item.clientId }
      : { type: "url", value: item.src },
  );
  const imageManifest = JSON.stringify(manifestItems);
  const hasCustomImages = Boolean(entry.imageOverride?.imageGalleryUrls.length);
  const parentCode = variantSummary?.parentCode || getParentCode(entry);
  const effectiveBrandOptions = ensureCurrentOption(
    brandOptions,
    brandId,
    entry.baseProduct.brand || entry.product.brand || `ID ${brandId}`,
  );
  const effectiveCategoryOptions = ensureCurrentOption(
    categoryOptions,
    categoryId,
    entry.baseProduct.category || entry.product.category || `ID ${categoryId}`,
  );
  const resolvedBrandLabel = resolveOptionLabel(
    effectiveBrandOptions,
    brandId,
    entry.baseProduct.brand || entry.product.brand,
  );
  const resolvedCategoryLabel = resolveOptionLabel(
    effectiveCategoryOptions,
    categoryId,
    entry.baseProduct.category || entry.product.category,
  );
  const hasSizeField = Boolean(entry.baseProduct.defaultSize || entry.product.defaultSize);
  const hasColorField = Boolean(entry.baseProduct.defaultColor || entry.product.defaultColor);
  const currentVariantDraft =
    variantDrafts.find((variant) => variant.id === entry.product.id) || null;
  const googleSearchTerms = [
    normalizeGoogleSearchTerm(description || entry.baseProduct.description),
    normalizeGoogleSearchTerm(resolvedBrandLabel),
    normalizeGoogleSearchTerm(resolvedCategoryLabel),
    normalizeGoogleSearchTerm(
      color
        || currentVariantDraft?.color
        || entry.baseProduct.defaultColor
        || entry.product.defaultColor,
    ),
  ].filter(Boolean);
  const googleSearchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
    googleSearchTerms.join(" "),
  )}`;
  const isBusy = submitMode !== null || isRefreshPending;

  const handleClose = () => {
    router.replace(closeHref, { scroll: false });
  };

  const handlePrevImage = () => {
    if (galleryItems.length === 0) {
      return;
    }

    setActiveImageIndex((current) =>
      current === 0 ? galleryItems.length - 1 : current - 1,
    );
  };

  const handleNextImage = () => {
    if (galleryItems.length === 0) {
      return;
    }

    setActiveImageIndex((current) =>
      current === galleryItems.length - 1 ? 0 : current + 1,
    );
  };

  const insertGalleryItems = (items: GalleryItem[], replaceIndex?: number | null) => {
    if (items.length === 0) {
      return;
    }

    applyGalleryUpdate((current) => {
      const next = [...current];

      if (
        replaceIndex !== null &&
        replaceIndex !== undefined &&
        replaceIndex >= 0 &&
        replaceIndex < next.length
      ) {
        next.splice(replaceIndex, 1, ...items);
        setActiveImageIndex(replaceIndex);
        return next;
      }

      next.push(...items);
      setActiveImageIndex(Math.max(0, next.length - items.length));
      return next;
    });
  };

  const appendFiles = (files: File[], replaceIndex?: number | null) => {
    const validFiles = files.filter(
      (file) =>
        file &&
        typeof file.size === "number" &&
        file.size > 0 &&
        file.type.startsWith("image/"),
    );

    if (validFiles.length === 0) {
      return;
    }

    insertGalleryItems(validFiles.map((file) => createUploadGalleryItem(file)), replaceIndex);
  };

  const insertUrls = (urls: string[], replaceIndex?: number | null) => {
    const cleanedUrls = urls.map((url) => url.trim()).filter(Boolean);

    if (cleanedUrls.length === 0) {
      return;
    }

    insertGalleryItems(cleanedUrls.map((url) => createUrlGalleryItem(url)), replaceIndex);
  };

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    appendFiles(Array.from(event.target.files || []), replaceTargetIndex);
    setReplaceTargetIndex(null);
    setPasteMessage(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUrlAdd = () => {
    insertUrls(parseClipboardText(urlDraft), replaceTargetIndex);
    setUrlDraft("");
    setReplaceTargetIndex(null);
    setPasteMessage(null);
  };

  const handleRemoveCurrentImage = () => {
    if (!currentGalleryItem) {
      return;
    }

    applyGalleryUpdate((current) => current.filter((item) => item.id !== currentGalleryItem.id));
  };

  const handlePromoteCurrentImage = () => {
    if (!currentGalleryItem || activeImageIndex === 0) {
      return;
    }

    applyGalleryUpdate((current) => {
      const next = [...current];
      const [selectedItem] = next.splice(activeImageIndex, 1);
      next.unshift(selectedItem);
      return next;
    });
    setActiveImageIndex(0);
  };

  const handleReplaceCurrentImage = () => {
    if (!currentGalleryItem) {
      return;
    }

    setReplaceTargetIndex(activeImageIndex);
    fileInputRef.current?.click();
  };

  const handleRemoveBackground = async () => {
    if (!currentGalleryItem || isBackgroundRemoving) {
      return;
    }

    setIsBackgroundRemoving(true);
    setPasteMessage(null);
    setFeedback(null);

    try {
      const formData = new FormData();

      if (currentGalleryItem.type === "upload") {
        formData.set(
          "sourceFile",
          currentGalleryItem.file,
          currentGalleryItem.file.name,
        );
      } else {
        formData.set("sourceUrl", currentGalleryItem.src);
      }

      const response = await fetch("/api/admin/image-background", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "No se pudo quitar el fondo.");
      }

      const processedBlob = await response.blob();
      const processedFile = new File(
        [processedBlob],
        buildBackgroundRemovedFileName(currentGalleryItem.label, entry.product.code),
        {
          type: "image/png",
          lastModified: Date.now(),
        },
      );
      const nextItem = createUploadGalleryItem(processedFile);

      applyGalleryUpdate((current) => {
        const targetIndex = current.findIndex((item) => item.id === currentGalleryItem.id);

        if (targetIndex === -1) {
          return [nextItem, ...current];
        }

        const next = [...current];
        next.splice(targetIndex, 1, nextItem);
        setActiveImageIndex(targetIndex);
        return next;
      });

      setPasteMessage("Fondo removido. La imagen procesada quedo lista para guardar.");
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo quitar el fondo de la imagen.",
      });
    } finally {
      setIsBackgroundRemoving(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      "read" in navigator.clipboard
    ) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        const pastedFiles: File[] = [];
        const pastedUrls: string[] = [];

        for (const item of clipboardItems) {
          for (const type of item.types) {
            if (type.startsWith("image/")) {
              const blob = await item.getType(type);
              pastedFiles.push(
                new File([blob], buildClipboardFileName(pastedFiles.length, blob.type), {
                  type: blob.type,
                  lastModified: Date.now(),
                }),
              );
            } else if (type === "text/plain") {
              const blob = await item.getType(type);
              pastedUrls.push(...parseClipboardText(await blob.text()));
            }
          }
        }

        if (pastedFiles.length > 0) {
          appendFiles(pastedFiles);
        }

        if (pastedUrls.length > 0) {
          insertUrls(pastedUrls);
        }

        if (pastedFiles.length > 0 || pastedUrls.length > 0) {
          setPasteMessage("Portapapeles incorporado al articulo.");
          return;
        }
      } catch {
        // fallback handled below
      }
    }

    setPasteMessage("Presiona Ctrl+V sobre el campo de URL para pegar una imagen o una direccion.");
  };

  const handleUrlInputPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const clipboardItems = Array.from(event.clipboardData.items || []);
    const pastedFiles = clipboardItems
      .filter((item) => item.type.startsWith("image/"))
      .map((item, index) => {
        const blob = item.getAsFile();

        if (!blob) {
          return null;
        }

        return new File([blob], buildClipboardFileName(index, blob.type), {
          type: blob.type,
          lastModified: Date.now(),
        });
      })
      .filter((file): file is File => Boolean(file));

    if (pastedFiles.length > 0) {
      event.preventDefault();
      appendFiles(pastedFiles);
      setPasteMessage(
        pastedFiles.length === 1
          ? "Se agrego 1 imagen desde el portapapeles."
          : `Se agregaron ${pastedFiles.length} imagenes desde el portapapeles.`,
      );
    }
  };

  const buildMutationFormData = () => {
    const formData = new FormData();

    formData.set("systemSection", activeSection);
    formData.set("systemQuery", productSearchQuery);
    formData.set("productId", entry.product.id);
    formData.set("parentCode", parentCode);
    formData.set("returnTo", returnTo);
    formData.set("imageManifest", imageManifest);
    formData.set("productDescription", description);
    formData.set("productPrice", price);
    formData.set("productSize", size);
    formData.set("productColor", color);
    formData.set("productBrandId", brandId);
    formData.set("productCategoryId", categoryId);

    variantDrafts.forEach((variant) => {
      formData.append("variantId", variant.id);
      formData.append("variantSize", variant.size);
      formData.append("variantColor", variant.color);
      formData.append("variantPrice", variant.price);
    });

    uploadItems.forEach((item) => {
      formData.append("newImageClientId", item.clientId);
      formData.append("newImages", item.file, item.file.name);
    });

    return formData;
  };

  const resolveMutationMessage = (result: Awaited<ReturnType<typeof saveAdminProductImagesAction>>) => {
    if (result.ok) {
      return {
        tone: "success" as const,
        message:
          result.saved === "product-image-cleared"
            ? "Se volvieron a usar las imagenes del sistema."
            : "Articulo actualizado.",
      };
    }

    switch (result.error) {
      case "product-not-found":
        return {
          tone: "error" as const,
          message: "No se encontro el articulo seleccionado.",
        };
      case "product-invalid":
        return {
          tone: "error" as const,
          message: "Revisa descripcion, precio, marca, categoria, talle, color y variantes.",
        };
      case "product-image-invalid":
        return {
          tone: "error" as const,
          message: "Revisa las imagenes: usa URLs http(s) o rutas locales que empiecen con /.",
        };
      case "product-image-file":
        return {
          tone: "error" as const,
          message: "No se pudieron preparar los archivos para subir. Reintenta.",
        };
      case "product-image-storage":
        return {
          tone: "error" as const,
          message: "El almacenamiento de imagenes no esta configurado correctamente.",
        };
      default:
        return {
          tone: "error" as const,
          message: "No se pudo guardar el articulo. Reintenta.",
        };
    }
  };

  const runMutation = async (mode: "save" | "clear") => {
    if (submitMode !== null) {
      return;
    }

    setSubmitMode(mode);
    setFeedback(null);

    try {
      const formData = buildMutationFormData();
      const result =
        mode === "clear"
          ? await clearAdminProductImagesAction(formData)
          : await saveAdminProductImagesAction(formData);

      if (result.ok) {
        if (mode === "save") {
          startRefreshTransition(() => {
            router.replace(closeHref, { scroll: false });
            router.refresh();
          });
          return;
        }

        setFeedback(resolveMutationMessage(result));
        startRefreshTransition(() => {
          router.refresh();
        });
        return;
      }

      setFeedback(resolveMutationMessage(result));
    } finally {
      setSubmitMode(null);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runMutation("save");
  };

  return (
    <div className="admin-detail-frame-overlay" onClick={handleClose}>
      <section
        className="admin-detail-frame-shell"
        style={{
          width: "min(1380px, 100%)",
          height: "min(92vh, 960px)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-detail-frame-topbar">
          <div>
            <span className="admin-pane-kicker">Edicion de articulos</span>
            <h3>{description || entry.baseProduct.description}</h3>
            <p className="mt-1 text-sm text-[color:var(--admin-text)]">
              Cod. {entry.product.code}
              {variantSummary?.variantCount
                ? ` | ${variantSummary.variantCount} variantes vinculadas`
                : ""}
            </p>
          </div>

          <button
            type="button"
            className="admin-detail-close-button"
            aria-label="Cerrar editor"
            onClick={handleClose}
          >
            X
          </button>
        </div>

        <div className="admin-detail-frame overflow-hidden rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--surface)]">
          <form
            onSubmit={handleSubmit}
            className="grid h-full min-h-0 gap-6 overflow-y-auto p-6 xl:grid-cols-[420px_minmax(0,1fr)]"
          >
            <input type="hidden" name="systemSection" value={activeSection} />
            <input type="hidden" name="systemQuery" value={productSearchQuery} />
            <input type="hidden" name="productId" value={entry.product.id} />
            <input type="hidden" name="parentCode" value={parentCode} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="imageManifest" value={imageManifest} />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              multiple
              className="hidden"
              onChange={handleFileSelection}
            />

            <aside className="xl:sticky xl:top-0 xl:self-start">
              <section className={cn(adminCardClass, "space-y-5 p-5")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-[color:var(--admin-title)]">
                      Imagen principal
                    </h3>
                    <p className="text-sm text-[color:var(--admin-text)]">
                      Una sola vista a la vez, sin repetir la galeria completa.
                    </p>
                  </div>
                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    <div
                      className="admin-editor-preview-toggle"
                      role="group"
                      aria-label="Fondo de previsualizacion"
                    >
                      {PREVIEW_SURFACE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={cn(
                            "admin-editor-preview-toggle-button",
                            previewSurface === option.value && "is-active",
                          )}
                          aria-pressed={previewSurface === option.value}
                          onClick={() => setPreviewSurface(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      className={cn(adminSecondaryButtonClass, "h-10 shrink-0")}
                      onClick={handleRemoveBackground}
                      disabled={!currentGalleryItem || isBackgroundRemoving}
                    >
                      {isBackgroundRemoving ? "Procesando..." : "Quitar fondo"}
                    </button>
                  </div>
                </div>

                <div
                  className={cn(
                    "admin-editor-preview-stage",
                    previewSurface === "checker" && "is-checker",
                    previewSurface === "light" && "is-light",
                    previewSurface === "dark" && "is-dark",
                  )}
                >
                  {currentGalleryItem ? (
                    <img
                      src={previewImageSrc || currentGalleryItem.src}
                      alt={description || entry.baseProduct.description}
                      className="max-h-[380px] max-w-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-sm text-[color:var(--admin-text)]">
                      Todavia no hay imagenes para este articulo.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={cn(adminSecondaryButtonClass, "h-10 min-w-[44px] px-3")}
                      onClick={handlePrevImage}
                      disabled={galleryItems.length <= 1}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className={cn(adminSecondaryButtonClass, "h-10 min-w-[44px] px-3")}
                      onClick={handleNextImage}
                      disabled={galleryItems.length <= 1}
                    >
                      →
                    </button>
                  </div>

                  <span className="text-sm font-medium text-[color:var(--admin-title)]">
                    {galleryItems.length > 0
                      ? `${activeImageIndex + 1} / ${galleryItems.length}`
                      : "Sin imagenes"}
                  </span>

                  <button
                    type="button"
                    className={adminSecondaryButtonClass}
                    onClick={() => {
                      setReplaceTargetIndex(null);
                      fileInputRef.current?.click();
                    }}
                  >
                    Agregar imagen
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    className={cn(adminSecondaryButtonClass, "w-full")}
                    onClick={() =>
                      window.open(googleSearchUrl, "_blank", "noopener,noreferrer")
                    }
                  >
                    Buscar en Google
                  </button>
                  <button
                    type="button"
                    className={cn(adminSecondaryButtonClass, "w-full")}
                    onClick={handlePasteFromClipboard}
                  >
                    Pegar
                  </button>
                  <button
                    type="button"
                    className={cn(adminSecondaryButtonClass, "w-full")}
                    onClick={() => {
                      setReplaceTargetIndex(null);
                      fileInputRef.current?.click();
                    }}
                  >
                    Buscar o adjuntar
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    value={urlDraft}
                    onChange={(event) => setUrlDraft(event.target.value)}
                    onPaste={handleUrlInputPaste}
                    className={adminInputClass}
                    placeholder="https://... o /ruta/local.jpg"
                  />
                  <button
                    type="button"
                    className={adminSecondaryButtonClass}
                    onClick={handleUrlAdd}
                  >
                    Agregar URL
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <button
                    type="button"
                    className={cn(adminSecondaryButtonClass, "w-full")}
                    onClick={handleReplaceCurrentImage}
                    disabled={!currentGalleryItem}
                  >
                    Reemplazar
                  </button>
                  <button
                    type="button"
                    className={cn(adminSecondaryButtonClass, "w-full")}
                    onClick={handlePromoteCurrentImage}
                    disabled={!currentGalleryItem || activeImageIndex === 0}
                  >
                    Usar de portada
                  </button>
                  <button
                    type="button"
                    className={cn(adminDangerButtonClass, "w-full")}
                    onClick={handleRemoveCurrentImage}
                    disabled={!currentGalleryItem}
                  >
                    Eliminar
                  </button>
                </div>

                {pasteMessage ? (
                  <p className="rounded-[14px] bg-[color:var(--admin-accent-soft)] px-3 py-2 text-sm text-[color:var(--admin-accent-strong)]">
                    {pasteMessage}
                  </p>
                ) : null}

                <div className="rounded-[16px] border border-dashed border-[color:var(--admin-card-line)] px-4 py-3 text-sm text-[color:var(--admin-text)]">
                  {currentGalleryItem ? (
                    <>
                      {currentGalleryItem.type === "upload"
                        ? "Archivo listo para subir"
                        : "Imagen ya guardada o tomada del sistema"}
                      :{" "}
                      <strong className="text-[color:var(--admin-title)]">
                        {currentGalleryItem.label}
                      </strong>
                    </>
                  ) : (
                    <>
                      Puedes combinar URLs existentes con archivos nuevos y el orden se
                      respeta al guardar.
                    </>
                  )}
                </div>

                {hasCustomImages ? (
                  <button
                    type="button"
                    className={cn(adminDangerButtonClass, "w-full")}
                    disabled={isBusy}
                    onClick={() => {
                      void runMutation("clear");
                    }}
                  >
                    {submitMode === "clear" ? "Quitando..." : "Volver a imagenes del sistema"}
                  </button>
                ) : null}
              </section>
            </aside>

            <div className="space-y-5">
              {feedback ? (
                <div
                  className={cn(
                    "rounded-[18px] border px-4 py-3 text-sm",
                    feedback.tone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                      : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200",
                  )}
                >
                  {feedback.message}
                </div>
              ) : null}

              <section className={cn(adminCardClass, "space-y-5 p-5")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[color:var(--admin-title)]">
                      Datos principales
                    </h3>
                    <p className="mt-1 text-sm text-[color:var(--admin-text)]">
                      Descripcion, precio, marca, categoria y atributos visibles del articulo sin tener que bajar una pantalla larga.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-[color:var(--admin-pane-bg)] px-3 py-1.5 text-[color:var(--admin-title)]">
                      Cod. {entry.product.code}
                    </span>
                    <span className="rounded-full bg-[color:var(--admin-pane-bg)] px-3 py-1.5 text-[color:var(--admin-title)]">
                      Stock {entry.product.stock.toFixed(0)}
                    </span>
                    {hasSizeField ? (
                      <span className="rounded-full bg-[color:var(--admin-pane-bg)] px-3 py-1.5 text-[color:var(--admin-title)]">
                        Talle {size || "Sin dato"}
                      </span>
                    ) : null}
                    {hasColorField ? (
                      <span className="rounded-full bg-[color:var(--admin-pane-bg)] px-3 py-1.5 text-[color:var(--admin-title)]">
                        Color {color || "Sin dato"}
                      </span>
                    ) : null}
                    {variantSummary?.variantCount ? (
                      <span className="rounded-full bg-[color:var(--admin-pane-bg)] px-3 py-1.5 text-[color:var(--admin-title)]">
                        Variantes {variantSummary.variantCount}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="product-description"
                    className="text-sm font-semibold text-[color:var(--admin-title)]"
                  >
                    Descripcion
                  </label>
                  <textarea
                    id="product-description"
                    name="productDescription"
                    rows={4}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className={adminTextAreaClass}
                    placeholder={entry.baseProduct.description}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="product-price"
                      className="text-sm font-semibold text-[color:var(--admin-title)]"
                    >
                      Precio
                    </label>
                    <input
                      id="product-price"
                      name="productPrice"
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                      className={adminInputClass}
                      inputMode="decimal"
                      placeholder={formatPriceInput(entry.baseProduct.price)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="product-brand"
                      className="text-sm font-semibold text-[color:var(--admin-title)]"
                    >
                      Marca
                    </label>
                    <select
                      id="product-brand"
                      name="productBrandId"
                      value={brandId}
                      onChange={(event) => setBrandId(event.target.value)}
                      className={adminInputClass}
                    >
                      <option value="">Seleccionar marca</option>
                      {effectiveBrandOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="product-category"
                      className="text-sm font-semibold text-[color:var(--admin-title)]"
                    >
                      Categoria
                    </label>
                    <select
                      id="product-category"
                      name="productCategoryId"
                      value={categoryId}
                      onChange={(event) => setCategoryId(event.target.value)}
                      className={adminInputClass}
                    >
                      <option value="">Seleccionar categoria</option>
                      {effectiveCategoryOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {hasSizeField ? (
                    <div className="space-y-2">
                      <label
                        htmlFor="product-size"
                        className="text-sm font-semibold text-[color:var(--admin-title)]"
                      >
                        Talle
                      </label>
                      <input
                        id="product-size"
                        name="productSize"
                        value={size}
                        onChange={(event) => setSize(event.target.value)}
                        className={adminInputClass}
                        placeholder={entry.baseProduct.defaultSize || "Ej. 42 / M / Senior"}
                      />
                    </div>
                  ) : null}

                  {hasColorField ? (
                    <div className="space-y-2">
                      <label
                        htmlFor="product-color"
                        className="text-sm font-semibold text-[color:var(--admin-title)]"
                      >
                        Color
                      </label>
                      <input
                        id="product-color"
                        name="productColor"
                        value={color}
                        onChange={(event) => setColor(event.target.value)}
                        className={adminInputClass}
                        placeholder={entry.baseProduct.defaultColor || "Ej. Azul / Blanco"}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-[16px] bg-[color:var(--admin-pane-bg)] px-4 py-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
                      Precio actual
                    </span>
                    <strong className="mt-1 block text-[color:var(--admin-title)]">
                      {price || formatPriceInput(entry.baseProduct.price)}
                    </strong>
                  </div>

                  <div className="rounded-[16px] bg-[color:var(--admin-pane-bg)] px-4 py-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
                      Marca
                    </span>
                    <strong className="mt-1 block text-[color:var(--admin-title)]">
                      {resolvedBrandLabel}
                    </strong>
                  </div>

                  <div className="rounded-[16px] bg-[color:var(--admin-pane-bg)] px-4 py-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
                      Categoria
                    </span>
                    <strong className="mt-1 block text-[color:var(--admin-title)]">
                      {resolvedCategoryLabel}
                    </strong>
                  </div>

                  {hasSizeField ? (
                    <div className="rounded-[16px] bg-[color:var(--admin-pane-bg)] px-4 py-3">
                      <span className="block text-xs uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
                        Talle
                      </span>
                      <strong className="mt-1 block text-[color:var(--admin-title)]">
                        {size || "Sin dato"}
                      </strong>
                    </div>
                  ) : null}

                  {hasColorField ? (
                    <div className="rounded-[16px] bg-[color:var(--admin-pane-bg)] px-4 py-3">
                      <span className="block text-xs uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
                        Color
                      </span>
                      <strong className="mt-1 block text-[color:var(--admin-title)]">
                        {color || "Sin dato"}
                      </strong>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-[color:var(--admin-text)]">
                    Precio base del sistema:{" "}
                    <strong className="text-[color:var(--admin-title)]">
                      {formatCurrency(entry.baseProduct.price)}
                    </strong>
                  </div>

                  <button type="submit" className={adminPrimaryButtonClass} disabled={isBusy}>
                    {submitMode === "save" ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </section>

              <section className={cn(adminCardClass, "space-y-4 p-5")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[color:var(--admin-title)]">
                      Articulos hijos
                    </h3>
                    <p className="mt-1 text-sm text-[color:var(--admin-text)]">
                      Talle, color y precio en una tabla compacta. El stock se muestra en vivo como referencia.
                    </p>
                  </div>

                  {variantSummary?.variantCount ? (
                    <div className="rounded-full bg-[color:var(--admin-pane-bg)] px-3 py-1.5 text-xs font-medium text-[color:var(--admin-title)]">
                      Stock total {variantSummary.totalStock.toFixed(0)}
                    </div>
                  ) : null}
                </div>

                {variantDrafts.length > 0 ? (
                  <>
                    <div className="overflow-hidden rounded-[18px] border border-[color:var(--admin-card-line)]">
                      <div className="max-h-[360px] overflow-auto">
                        <table className="min-w-full border-collapse text-sm">
                          <thead className="sticky top-0 bg-[color:var(--admin-pane-bg)]">
                            <tr className="border-b border-[color:var(--admin-card-line)] text-left text-xs uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
                              <th className="px-4 py-3">Articulo</th>
                              <th className="px-4 py-3">Talle</th>
                              <th className="px-4 py-3">Color</th>
                              <th className="px-4 py-3">Precio</th>
                              <th className="px-4 py-3">Stock</th>
                            </tr>
                          </thead>
                          <tbody>
                            {variantDrafts.map((variant, index) => (
                              <tr
                                key={variant.id}
                                className="border-b border-[color:var(--admin-card-line)] align-top last:border-b-0"
                              >
                                <td className="px-4 py-3">
                                  <input type="hidden" name="variantId" value={variant.id} />
                                  <div className="space-y-1">
                                    <strong className="block text-[color:var(--admin-title)]">
                                      {variant.code}
                                    </strong>
                                    <span className="block text-xs text-[color:var(--admin-text)]">
                                      {variant.description}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    name="variantSize"
                                    value={variant.size}
                                    onChange={(event) =>
                                      setVariantDrafts((current) =>
                                        current.map((item, currentIndex) =>
                                          currentIndex === index
                                            ? { ...item, size: event.target.value }
                                            : item,
                                        ),
                                      )
                                    }
                                    className={cn(adminInputClass, "h-10")}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    name="variantColor"
                                    value={variant.color}
                                    onChange={(event) =>
                                      setVariantDrafts((current) =>
                                        current.map((item, currentIndex) =>
                                          currentIndex === index
                                            ? { ...item, color: event.target.value }
                                            : item,
                                        ),
                                      )
                                    }
                                    className={cn(adminInputClass, "h-10")}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    name="variantPrice"
                                    value={variant.price}
                                    onChange={(event) =>
                                      setVariantDrafts((current) =>
                                        current.map((item, currentIndex) =>
                                          currentIndex === index
                                            ? { ...item, price: event.target.value }
                                            : item,
                                        ),
                                      )
                                    }
                                    className={cn(adminInputClass, "h-10 min-w-[124px]")}
                                    inputMode="decimal"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex rounded-full bg-[color:var(--admin-pane-bg)] px-3 py-1.5 font-medium text-[color:var(--admin-title)]">
                                    {variant.stock.toFixed(0)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded-[16px] border border-dashed border-[color:var(--admin-card-line)] px-4 py-3 text-sm text-[color:var(--admin-text)]">
                      El stock mostrado sale del movimiento actual. Esta pantalla no lo escribe porque la vista comercial no expone un campo directo de stock editable.
                    </div>
                  </>
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[color:var(--admin-card-line)] px-4 py-5 text-sm text-[color:var(--admin-text)]">
                    Este articulo no tiene hijos vinculados para editar en esta vista.
                  </div>
                )}
              </section>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
