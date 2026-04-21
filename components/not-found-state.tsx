import Link from "next/link";
import { SupportHint } from "@/components/support-hint";

export function NotFoundState({
  title = "No encontramos lo que buscabas",
  message = "La pagina puede haber cambiado o ya no estar disponible.",
  supportHref,
}: {
  title?: string;
  message?: string;
  supportHref?: string | null;
}) {
  return (
    <main className="payment-return-page">
      <section className="payment-return-card">
        <span className="payment-return-eyebrow">404</span>
        <h1>{title}</h1>
        <p>{message}</p>

        <div className="payment-return-actions">
          <Link href="/" className="submit-order-button">
            Volver al inicio
          </Link>
        </div>

        <SupportHint
          href={supportHref}
          actionLabel="Hablar con soporte"
          text="Si necesitas ayuda, podemos orientarte desde el canal de contacto de la tienda."
        />
      </section>
    </main>
  );
}
