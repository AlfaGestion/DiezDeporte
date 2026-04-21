"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminInputClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminTextAreaClass,
  cn,
} from "@/components/admin/admin-ui";

function buildDefaultInvoiceMessage(input: {
  customerName: string;
  orderNumber: string;
}) {
  return [
    `Hola ${input.customerName},`,
    "",
    `Te enviamos la factura correspondiente a tu pedido NP ${input.orderNumber}.`,
    "Adjuntamos el comprobante en este email.",
    "",
    "Gracias por comprar en Diez Deportes.",
  ].join("\n");
}

export function InvoiceEmailDialog({
  orderId,
  customerName,
  customerEmail,
  orderNumber,
  triggerLabel = "Facturar",
  triggerClassName,
}: {
  orderId: number;
  customerName: string;
  customerEmail: string;
  orderNumber: string;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const defaultSubject = useMemo(
    () => `Factura de tu pedido NP ${orderNumber}`,
    [orderNumber],
  );
  const defaultMessage = useMemo(
    () => buildDefaultInvoiceMessage({ customerName, orderNumber }),
    [customerName, orderNumber],
  );
  const [to, setTo] = useState(customerEmail);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [markAsFacturado, setMarkAsFacturado] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [files, setFiles] = useState<FileList | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) {
      setTo(customerEmail);
      setCc("");
      setSubject(defaultSubject);
      setMessage(defaultMessage);
      setMarkAsFacturado(true);
      setSendEmail(true);
      setFiles(null);
      setFeedback(null);
    }
  }, [customerEmail, defaultMessage, defaultSubject, isOpen]);

  const handleSubmit = () => {
    setFeedback(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("to", to);
        formData.set("cc", cc);
        formData.set("subject", subject);
        formData.set("message", message);

        if (markAsFacturado) {
          formData.set("markAsFacturado", "on");
        }

        if (sendEmail) {
          formData.set("sendEmail", "on");
        }

        Array.from(files || []).forEach((file) => {
          formData.append("attachments", file);
        });

        const response = await fetch(`/api/orders/${orderId}/facturar-email`, {
          method: "POST",
          credentials: "same-origin",
          body: formData,
        });
        const result = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          setFeedback(result?.error || "No se pudo facturar o enviar la factura.");
          return;
        }

        setIsOpen(false);
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "No se pudo facturar o enviar la factura.");
      }
    });
  };

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setIsOpen(true)}>
        {triggerLabel}
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 px-4 py-8 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <section
            className="w-full max-w-3xl rounded-[24px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] shadow-[0_32px_72px_rgba(15,23,42,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--admin-pane-line)] px-6 py-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
                  Facturacion
                </div>
                <h3 className="mt-1 text-lg font-semibold text-[color:var(--admin-title)]">
                  Facturar pedido {orderNumber}
                </h3>
                <p className="mt-2 text-sm text-[color:var(--admin-text)]">
                  Se va a marcar el pedido como facturado y opcionalmente enviar el comprobante al cliente.
                </p>
              </div>

              <button
                type="button"
                className={cn(adminSecondaryButtonClass, "shrink-0")}
                onClick={() => setIsOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="grid gap-4 px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-[color:var(--admin-title)]">Destinatario</span>
                  <input
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    className={adminInputClass}
                    placeholder="cliente@email.com"
                    disabled={isPending}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-[color:var(--admin-title)]">CC</span>
                  <input
                    value={cc}
                    onChange={(event) => setCc(event.target.value)}
                    className={adminInputClass}
                    placeholder="cc opcional"
                    disabled={isPending}
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-[color:var(--admin-title)]">Asunto</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className={adminInputClass}
                  disabled={isPending}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-[color:var(--admin-title)]">Mensaje</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className={cn(adminTextAreaClass, "min-h-[180px] resize-y")}
                  disabled={isPending}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-[color:var(--admin-title)]">Adjuntos</span>
                <input
                  type="file"
                  multiple
                  onChange={(event) => setFiles(event.target.files)}
                  className="block w-full text-sm text-[color:var(--admin-text)] file:mr-3 file:rounded-[12px] file:border-0 file:bg-[color:var(--admin-accent-soft)] file:px-3 file:py-2 file:font-medium file:text-[color:var(--admin-title)]"
                  disabled={isPending}
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                />
              </label>

              <div className="grid gap-2 rounded-[18px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-card-bg)] px-4 py-4">
                <label className="flex items-center gap-3 text-sm text-[color:var(--admin-title)]">
                  <input
                    type="checkbox"
                    checked={markAsFacturado}
                    onChange={(event) => setMarkAsFacturado(event.target.checked)}
                    disabled={isPending}
                  />
                  Marcar el pedido como facturado
                </label>
                <label className="flex items-center gap-3 text-sm text-[color:var(--admin-title)]">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(event) => setSendEmail(event.target.checked)}
                    disabled={isPending}
                  />
                  Enviar email al cliente
                </label>
              </div>

              {feedback ? (
                <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {feedback}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[color:var(--admin-pane-line)] px-6 py-4">
              <button
                type="button"
                className={adminSecondaryButtonClass}
                onClick={() => setIsOpen(false)}
                disabled={isPending}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={cn(adminPrimaryButtonClass, isPending && "cursor-wait opacity-70")}
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
