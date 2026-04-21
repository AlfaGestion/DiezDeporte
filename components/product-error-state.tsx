import Link from "next/link";
import { ErrorState } from "@/components/error-state";

export function ProductErrorState() {
  return (
    <ErrorState
      title="No pudimos preparar este producto"
      message="Puede que haya cambiado el stock o que el producto ya no este disponible."
      primaryAction={
        <Link href="/#catalogo" className="submit-order-button">
          Volver al catalogo
        </Link>
      }
    />
  );
}
