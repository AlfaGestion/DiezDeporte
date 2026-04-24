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

export function AdminArticleListGallery(props: AdminArticleListGalleryProps) {
  const { description, code, images } = props;
  const gallery = useMemo(() => getUniqueImages(images), [images]);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImageUrl = gallery[activeIndex] || null;

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
