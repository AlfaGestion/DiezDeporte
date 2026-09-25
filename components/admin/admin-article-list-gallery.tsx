"use client";

import { useEffect, useMemo, useState } from "react";
import { buildImageProxyUrl } from "@/lib/commerce";

type AdminArticleListGalleryProps = {
  description: string;
  code: string;
  images: string[];
};

function getUniqueImages(images: string[]) {
  return Array.from(new Set(images.filter(Boolean)));
}

async function getImageFingerprint(imageUrl: string) {
  return new Promise<string | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve(null);
          return;
        }

        context.drawImage(image, 0, 0, 16, 16);
        const pixels = context.getImageData(0, 0, 16, 16).data;
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 4) {
          hash ^= pixels[index] || 0;
          hash = Math.imul(hash, 16777619);
          hash ^= pixels[index + 1] || 0;
          hash = Math.imul(hash, 16777619);
          hash ^= pixels[index + 2] || 0;
          hash = Math.imul(hash, 16777619);
          hash ^= pixels[index + 3] || 0;
          hash = Math.imul(hash, 16777619);
        }
        resolve(String(hash >>> 0));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = imageUrl;
  });
}

export function AdminArticleListGallery(props: AdminArticleListGalleryProps) {
  const { description, code, images } = props;
  const sourceGallery = useMemo(() => getUniqueImages(images), [images]);
  const [gallery, setGallery] = useState(sourceGallery);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImageUrl = gallery[activeIndex] || null;

  useEffect(() => {
    let cancelled = false;

    async function removeVisualDuplicates() {
      const fingerprints = await Promise.all(
        sourceGallery.map((imageUrl) =>
          getImageFingerprint(
            buildImageProxyUrl(imageUrl, { transparentBackground: true }) || imageUrl,
          ),
        ),
      );
      const seen = new Set<string>();
      const nextGallery = sourceGallery.filter((imageUrl, index) => {
        const fingerprint = fingerprints[index];
        if (!fingerprint) {
          return true;
        }
        if (seen.has(fingerprint)) {
          return false;
        }
        seen.add(fingerprint);
        return true;
      });

      if (!cancelled) {
        setGallery(nextGallery);
      }
    }

    setGallery(sourceGallery);
    void removeVisualDuplicates();
    return () => {
      cancelled = true;
    };
  }, [sourceGallery]);

  useEffect(() => {
    setActiveIndex((current) => {
      if (gallery.length === 0) {
        return 0;
      }

      return Math.min(current, gallery.length - 1);
    });
  }, [gallery.length]);

  function moveImage(direction: -1 | 1) {
    if (gallery.length <= 1) {
      return;
    }

    setActiveIndex((current) => (current + direction + gallery.length) % gallery.length);
  }

  return (
    <div className="product-detail-media-stack">
      <div className="product-detail-stage">
        {activeImageUrl ? (
          <img
            src={
              buildImageProxyUrl(activeImageUrl, {
                transparentBackground: true,
              }) || activeImageUrl
            }
            alt={description}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-[color:var(--admin-text)]">
            Sin imagen
          </div>
        )}

        {gallery.length > 1 ? (
          <>
            <div className="product-detail-stage-controls">
              <button
                type="button"
                className="product-detail-stage-button"
                aria-label={`Ver foto anterior de ${description}`}
                onClick={() => moveImage(-1)}
              >
                {"<"}
              </button>
              <button
                type="button"
                className="product-detail-stage-button"
                aria-label={`Ver foto siguiente de ${description}`}
                onClick={() => moveImage(1)}
              >
                {">"}
              </button>
            </div>
            <div
              className="product-detail-stage-count"
              aria-label={`${gallery.length} fotos disponibles`}
            >
              {activeIndex + 1}/{gallery.length}
            </div>
          </>
        ) : null}
      </div>

      {gallery.length > 1 ? (
        <div className="product-detail-gallery-wrap">
          <span className="product-detail-gallery-label">Galeria</span>
          <div className="product-detail-gallery" aria-label="Mas fotos del articulo">
            {gallery.map((imageUrl, index) => {
              const isActive = index === activeIndex;

              return (
                <button
                  key={`${code}-${imageUrl}`}
                  type="button"
                  className={["product-detail-thumb", isActive ? "active" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Ver foto ${index + 1} de ${description}`}
                  aria-pressed={isActive}
                >
                  <img
                    src={
                      buildImageProxyUrl(imageUrl, {
                        transparentBackground: true,
                      }) || imageUrl
                    }
                    alt={`${description} - foto ${index + 1}`}
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
