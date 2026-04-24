"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
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
    stock: number;
  }>;
} | null;

type PendingUpload = {
  id: string;
  file: File;
  previewUrl: string;
};

const CLIPBOARD_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function parseImageUrlsText(value: string) {
  return value
    .split(/\r?\n/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function revokePendingUploads(uploads: PendingUpload[]) {
  uploads.forEach((upload) => {
    URL.revokeObjectURL(upload.previewUrl);
  });
}

function getClipboardFileExtension(type: string) {
  return CLIPBOARD_EXTENSION_BY_TYPE[type] || "png";
}

function buildClipboardFileName(index: number, type: string) {
  return `portapapeles-${Date.now()}-${index}.${getClipboardFileExtension(type)}`;
}

function formatPriceInput(value: number) {
  return new Intl.NumberFormat("es-AR", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function ImageGrid(props: {
  title: string;
  subtitle: string;
  imageUrls: string[];
  emptyLabel: string;
  removable?: boolean;
  onRemove?: (imageUrl: string) => void;
}) {
  const { title, subtitle, imageUrls, emptyLabel, removable = false, onRemove } = props;

  return (
    <section className={cn(adminCardClass, "space-y-4 p-5")}>
      <div>
        <h3 className="text-sm font-semibold text-[color:var(--admin-title)]">{title}</h3>
        <p className="mt-1 text-sm text-[color:var(--admin-text)]">{subtitle}</p>
      </div>

      {imageUrls.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {imageUrls.map((imageUrl, index) => (
            <article
              key={`${title}-${imageUrl}-${index}`}
              className="overflow-hidden rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)]"
            >
              <div className="flex h-[180px] items-center justify-center bg-[color:var(--admin-pane-bg)] p-4">
                <img
                  src={
                    buildImageProxyUrl(imageUrl, {
                      transparentBackground: true,
                    }) || imageUrl
                  }
                  alt={`${title} ${index + 1}`}
                  className="max-h-full max-w-full object-contain"
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-[color:var(--admin-card-line)] px-4 py-3">
                <span className="text-xs text-[color:var(--admin-text)]">
                  Imagen {index + 1}
                </span>
                {removable && onRemove ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-rose-600 hover:text-rose-700"
                    onClick={() => onRemove(imageUrl)}
                  >
                    Quitar
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[16px] border border-dashed border-[color:var(--admin-card-line)] px-4 py-5 text-sm text-[color:var(--admin-text)]">
          {emptyLabel}
        </div>
      )}
    </section>
  );
}

function UploadGrid(props: {
  uploads: PendingUpload[];
  onRemove: (uploadId: string) => void;
}) {
  const { uploads, onRemove } = props;

  return (
    <section className={cn(adminCardClass, "space-y-4 p-5")}>
      <div>
        <h3 className="text-sm font-semibold text-[color:var(--admin-title)]">
          Archivos listos para subir
        </h3>
        <p className="mt-1 text-sm text-[color:var(--admin-text)]">
          Se enviaran junto con el guardado del articulo.
        </p>
      </div>

      {uploads.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {uploads.map((upload) => (
            <article
              key={upload.id}
              className="overflow-hidden rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)]"
            >
              <div className="flex h-[180px] items-center justify-center bg-[color:var(--admin-pane-bg)] p-4">
                <img
                  src={upload.previewUrl}
                  alt={upload.file.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>

              <div className="space-y-2 border-t border-[color:var(--admin-card-line)] px-4 py-3">
                <p className="line-clamp-2 text-xs text-[color:var(--admin-text)]">
                  {upload.file.name}
                </p>
                <button
                  type="button"
                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                  onClick={() => onRemove(upload.id)}
                >
                  Quitar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[16px] border border-dashed border-[color:var(--admin-card-line)] px-4 py-5 text-sm text-[color:var(--admin-text)]">
          No hay archivos pendientes.
        </div>
      )}
    </section>
  );
}

export function AdminSystemArticleImageEditorFrame(props: {
  activeSection: string;
  productSearchQuery: string;
  closeHref: string;
  returnTo: string;
  entry: EditorEntry | null;
  publishedProduct: Product | null;
  variantSummary: VariantGroupSummary;
}) {
  const {
    activeSection,
    productSearchQuery,
    closeHref,
    returnTo,
    entry,
    publishedProduct,
    variantSummary,
  } = props;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const urlsTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingUploadsRef = useRef<PendingUpload[]>([]);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrlsText, setImageUrlsText] = useState("");
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    return () => {
      revokePendingUploads(pendingUploadsRef.current);
    };
  }, []);

  useEffect(() => {
    revokePendingUploads(pendingUploadsRef.current);
    pendingUploadsRef.current = [];
    setPendingUploads([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (!entry) {
      setDescription("");
      setPrice("");
      setBrand("");
      setCategory("");
      setImageUrlsText("");
      setPasteMessage(null);
      return;
    }

    setDescription(entry.product.description);
    setPrice(formatPriceInput(entry.product.price));
    setBrand(entry.product.brand || "");
    setCategory(entry.product.category || entry.product.familyId || "");
    setImageUrlsText(entry.imageOverride?.imageGalleryUrls.join("\n") || "");
    setPasteMessage(null);
  }, [entry]);

  if (!entry) {
    return null;
  }

  const formId = "product-editor-form";
  const effectivePublishedProduct = publishedProduct || entry.product;
  const publishedUrls = effectivePublishedProduct.imageGalleryUrls;
  const editableUrls = parseImageUrlsText(imageUrlsText);
  const previewUrl =
    pendingUploads[0]?.previewUrl ||
    editableUrls[0] ||
    publishedUrls[0] ||
    entry.baseProduct.imageGalleryUrls[0] ||
    null;
  const googleSearchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
    `${entry.product.code} ${description || entry.product.description}`.trim(),
  )}`;
  const hasCustomImages = Boolean(entry.imageOverride);
  const imageMode = entry.product.imageMode === "illustrative" ? "illustrative" : "exact";
  const imageNote = entry.product.imageNote || "";
  const imageSourceUrl = entry.product.imageSourceUrl || "";

  const syncFileInput = (uploads: PendingUpload[]) => {
    if (!fileInputRef.current || typeof DataTransfer === "undefined") {
      return;
    }

    const transfer = new DataTransfer();
    uploads.forEach((upload) => {
      transfer.items.add(upload.file);
    });
    fileInputRef.current.files = transfer.files;
  };

  const appendFiles = (files: File[]) => {
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

    setPendingUploads((current) => {
      const seen = new Set(
        current.map((upload) => `${upload.file.name}:${upload.file.size}:${upload.file.lastModified}`),
      );

      const additions = validFiles
        .filter((file) => {
          const key = `${file.name}:${file.size}:${file.lastModified}`;
          if (seen.has(key)) {
            return false;
          }

          seen.add(key);
          return true;
        })
        .map((file, index) => ({
          id: `${file.name}:${file.size}:${file.lastModified}:${index}`,
          file,
          previewUrl: URL.createObjectURL(file),
        }));

      if (additions.length === 0) {
        return current;
      }

      const next = [...current, ...additions];
      syncFileInput(next);
      return next;
    });
  };

  const removePendingUpload = (uploadId: string) => {
    setPendingUploads((current) => {
      const removed = current.find((upload) => upload.id === uploadId);
      const next = current.filter((upload) => upload.id !== uploadId);

      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      syncFileInput(next);
      return next;
    });
  };

  const handleLocalFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    appendFiles(Array.from(event.target.files || []));
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
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

  const handlePasteButtonClick = async () => {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      "read" in navigator.clipboard
    ) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        const pastedFiles: File[] = [];
        const pastedTexts: string[] = [];

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
              const text = await blob.text();
              if (text.trim()) {
                pastedTexts.push(text.trim());
              }
            }
          }
        }

        if (pastedFiles.length > 0) {
          appendFiles(pastedFiles);
        }

        if (pastedTexts.length > 0) {
          setImageUrlsText((current) =>
            [current.trim(), pastedTexts.join("\n").trim()].filter(Boolean).join("\n"),
          );
        }

        if (pastedFiles.length > 0 || pastedTexts.length > 0) {
          setPasteMessage("Portapapeles incorporado al editor.");
          return;
        }
      } catch {
        // fallback al pegado manual
      }
    }

    urlsTextAreaRef.current?.focus();
    setPasteMessage("Presiona Ctrl+V para pegar una imagen o una URL.");
  };

  const handleRemoveEditableUrl = (imageUrl: string) => {
    setImageUrlsText(
      parseImageUrlsText(imageUrlsText)
        .filter((currentUrl) => currentUrl !== imageUrl)
        .join("\n"),
    );
  };

  const handleClose = () => {
    router.replace(closeHref, { scroll: false });
  };

  return (
    <div className="admin-detail-frame-overlay" onClick={handleClose}>
      <section
        className="admin-detail-frame-shell"
        style={{
          width: "min(1320px, 100%)",
          height: "min(92vh, 980px)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-detail-frame-topbar">
          <div>
            <span className="admin-pane-kicker">Editor de articulos</span>
            <h3>{entry.product.description}</h3>
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
          <div className="grid h-full gap-6 overflow-y-auto p-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <form id={formId} action={saveAdminProductImagesAction} className="space-y-5">
              <input type="hidden" name="systemSection" value={activeSection} />
              <input type="hidden" name="systemQuery" value={productSearchQuery} />
              <input type="hidden" name="productId" value={entry.product.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="imageMode" value={imageMode} />
              <input type="hidden" name="imageNote" value={imageNote} />
              <input type="hidden" name="imageSourceUrl" value={imageSourceUrl} />

              <input
                ref={fileInputRef}
                name="newImages"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                multiple
                className="hidden"
                onChange={handleLocalFilesSelected}
              />

              <section className={cn(adminCardClass, "space-y-4 p-5")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[color:var(--admin-title)]">
                      Datos del articulo
                    </h3>
                    <p className="mt-1 text-sm text-[color:var(--admin-text)]">
                      Edita solo lo necesario: descripcion, precio, marca, categoria e imagenes.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-[color:var(--admin-pane-bg)] px-3 py-1.5 text-[color:var(--admin-title)]">
                      Stock {entry.product.stock.toFixed(0)}
                    </span>
                    <span className="rounded-full bg-[color:var(--admin-pane-bg)] px-3 py-1.5 text-[color:var(--admin-title)]">
                      Precio base {formatCurrency(entry.baseProduct.price)}
                    </span>
                  </div>
                </div>

                {variantSummary?.variantCount ? (
                  <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-4 py-3 text-sm text-[color:var(--admin-text)]">
                    Los cambios se guardan sobre el articulo madre
                    {" "}
                    <strong>{variantSummary.parentCode}</strong>
                    {" "}
                    y se reflejan en sus variantes.
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label
                      htmlFor="product-description"
                      className="text-sm font-semibold text-[color:var(--admin-title)]"
                    >
                      Descripcion
                    </label>
                    <textarea
                      id="product-description"
                      name="productDescription"
                      rows={3}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className={adminTextAreaClass}
                      placeholder={entry.baseProduct.description}
                    />
                  </div>

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
                    <input
                      id="product-brand"
                      name="productBrand"
                      value={brand}
                      onChange={(event) => setBrand(event.target.value)}
                      className={adminInputClass}
                      placeholder="Ej. Adidas"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="product-category"
                      className="text-sm font-semibold text-[color:var(--admin-title)]"
                    >
                      Categoria
                    </label>
                    <input
                      id="product-category"
                      name="productCategory"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      className={adminInputClass}
                      placeholder={entry.baseProduct.category || "Ej. Natacion"}
                    />
                  </div>

                  <div className="rounded-[16px] border border-dashed border-[color:var(--admin-card-line)] px-4 py-3 text-sm text-[color:var(--admin-text)]">
                    Si dejas un campo igual al original, el sistema usa el valor base del catalogo.
                  </div>
                </div>
              </section>

              <section className={cn(adminCardClass, "space-y-4 p-5")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[color:var(--admin-title)]">
                      Imagenes
                    </h3>
                    <p className="mt-1 text-sm text-[color:var(--admin-text)]">
                      Puedes pegar URLs, subir archivos o sumar mas imagenes al articulo.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={adminSecondaryButtonClass}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Subir imagenes
                    </button>
                    <button
                      type="button"
                      className={adminSecondaryButtonClass}
                      onClick={handlePasteButtonClick}
                    >
                      Pegar
                    </button>
                    <button
                      type="button"
                      className={adminSecondaryButtonClass}
                      onClick={() =>
                        window.open(googleSearchUrl, "_blank", "noopener,noreferrer")
                      }
                    >
                      Buscar en Google
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="product-image-urls"
                    className="text-sm font-semibold text-[color:var(--admin-title)]"
                  >
                    URLs de imagen
                  </label>
                  <textarea
                    id="product-image-urls"
                    ref={urlsTextAreaRef}
                    name="imageUrls"
                    rows={5}
                    value={imageUrlsText}
                    onChange={(event) => setImageUrlsText(event.target.value)}
                    onPaste={handlePaste}
                    className={adminTextAreaClass}
                    placeholder={"Una URL por linea.\nTambien puedes pegar una imagen con Ctrl+V."}
                  />
                </div>

                {pasteMessage ? (
                  <p className="rounded-[14px] bg-[color:var(--admin-accent-soft)] px-3 py-2 text-sm text-[color:var(--admin-accent-strong)]">
                    {pasteMessage}
                  </p>
                ) : null}

                <div className="rounded-[16px] border border-dashed border-[color:var(--admin-card-line)] px-4 py-3 text-sm text-[color:var(--admin-text)]">
                  Las nuevas imagenes se guardan en el almacenamiento configurado en
                  {" "}
                  <code>.env</code>.
                </div>
              </section>

              <ImageGrid
                title="Imagenes actuales"
                subtitle="Asi se ve hoy el articulo en la web."
                imageUrls={publishedUrls}
                emptyLabel="Este articulo todavia no tiene imagenes visibles."
              />

              <ImageGrid
                title="URLs listas para guardar"
                subtitle="Estas son las URLs que quedaran asociadas al articulo."
                imageUrls={editableUrls}
                emptyLabel="Todavia no agregaste URLs nuevas."
                removable
                onRemove={handleRemoveEditableUrl}
              />

              <UploadGrid uploads={pendingUploads} onRemove={removePendingUpload} />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-[color:var(--admin-text)]">
                  Portada actual:
                  {" "}
                  <strong>
                    {pendingUploads.length > 0
                      ? "primera imagen pendiente"
                      : editableUrls.length > 0
                        ? "primera URL nueva"
                        : publishedUrls.length > 0
                          ? "imagen publicada"
                          : "sin imagen"}
                  </strong>
                </div>

                <button type="submit" className={adminPrimaryButtonClass}>
                  Guardar cambios
                </button>
              </div>
            </form>

            <aside className="space-y-5">
              <section className={cn(adminCardClass, "space-y-4 p-5")}>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
                    Vista previa
                  </span>
                  <h3 className="mt-2 text-lg font-semibold text-[color:var(--admin-title)]">
                    {description || entry.product.description}
                  </h3>
                  <p className="mt-1 text-sm text-[color:var(--admin-text)]">
                    Cod. {entry.product.code}
                  </p>
                </div>

                <div className="flex min-h-[260px] items-center justify-center rounded-[20px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] p-5">
                  {previewUrl ? (
                    <img
                      src={
                        buildImageProxyUrl(previewUrl, {
                          transparentBackground: true,
                        }) || previewUrl
                      }
                      alt={description || entry.product.description}
                      className="max-h-[260px] max-w-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-sm text-[color:var(--admin-text)]">
                      Sin imagen para mostrar.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-[16px] bg-[color:var(--admin-pane-bg)] px-4 py-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
                      Precio
                    </span>
                    <strong className="mt-1 block text-[color:var(--admin-title)]">
                      {price ? price : formatPriceInput(entry.product.price)}
                    </strong>
                  </div>

                  <div className="rounded-[16px] bg-[color:var(--admin-pane-bg)] px-4 py-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
                      Stock
                    </span>
                    <strong className="mt-1 block text-[color:var(--admin-title)]">
                      {entry.product.stock.toFixed(0)}
                    </strong>
                  </div>
                </div>

                <div className="space-y-3 text-sm text-[color:var(--admin-text)]">
                  <div>
                    <span className="block text-xs uppercase tracking-[0.18em]">Marca</span>
                    <strong className="mt-1 block text-[color:var(--admin-title)]">
                      {brand || "Sin marca"}
                    </strong>
                  </div>

                  <div>
                    <span className="block text-xs uppercase tracking-[0.18em]">Categoria</span>
                    <strong className="mt-1 block text-[color:var(--admin-title)]">
                      {category || "Sin categoria"}
                    </strong>
                  </div>
                </div>

                <button
                  type="submit"
                  form={formId}
                  className={cn(adminPrimaryButtonClass, "w-full")}
                >
                  Guardar cambios
                </button>

                {hasCustomImages ? (
                  <form action={clearAdminProductImagesAction}>
                    <input type="hidden" name="systemSection" value={activeSection} />
                    <input type="hidden" name="systemQuery" value={productSearchQuery} />
                    <input type="hidden" name="productId" value={entry.product.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button
                      type="submit"
                      className={cn(adminDangerButtonClass, "w-full")}
                    >
                      Volver a imagenes del sistema
                    </button>
                  </form>
                ) : null}
              </section>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
