"use client";

import { useState } from "react";

type AdminOrderDetailFrameTriggerProps = {
  orderId: number;
  returnTo: string;
  label?: string;
  className?: string;
};

export function AdminOrderDetailFrameTrigger({
  orderId,
  returnTo,
  label = "Ver detalle",
  className,
}: AdminOrderDetailFrameTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const frameSrc = `/admin/orders/${orderId}?returnTo=${encodeURIComponent(
    returnTo,
  )}&embedded=1`;

  return (
    <>
      <button
        type="button"
        className={className || "admin-ghost-button"}
        onClick={() => setIsOpen(true)}
      >
        {label}
      </button>

      {isOpen ? (
        <div className="admin-detail-frame-overlay" onClick={() => setIsOpen(false)}>
          <section
            className="admin-detail-frame-shell"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-detail-frame-topbar">
              <div>
                <span className="admin-pane-kicker">Detalle</span>
                <h3>Pedido #{orderId}</h3>
              </div>

              <button
                type="button"
                className="admin-detail-close-button"
                aria-label="Cerrar detalle"
                onClick={() => setIsOpen(false)}
              >
                X
              </button>
            </div>

            <iframe
              className="admin-detail-frame"
              title={`Detalle del pedido ${orderId}`}
              src={frameSrc}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
