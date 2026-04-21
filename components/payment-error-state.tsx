import Link from "next/link";
import { ErrorState } from "@/components/error-state";
import { SupportHint } from "@/components/support-hint";

export function PaymentErrorState({
  retryHref,
  supportHref,
}: {
  retryHref?: string | null;
  supportHref?: string | null;
}) {
  return (
    <ErrorState
      title="No pudimos iniciar el pago"
      message="Tu pedido sigue registrado. Podes volver a intentarlo."
      primaryAction={
        retryHref ? (
          <a href={retryHref} className="submit-order-button">
            Reintentar pago
          </a>
        ) : (
          <Link href="/" className="submit-order-button">
            Volver al inicio
          </Link>
        )
      }
      secondaryAction={
        retryHref ? (
          <Link href="/" className="hero-secondary">
            Volver al inicio
          </Link>
        ) : undefined
      }
      hint={
        <SupportHint
          href={supportHref}
          actionLabel="Necesito ayuda"
          text="Si el problema continua, podemos ayudarte a completar la compra."
        />
      }
    />
  );
}
