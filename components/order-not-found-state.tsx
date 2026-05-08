import { NotFoundState } from "@/components/not-found-state";

export function OrderNotFoundState({
  supportHref,
}: {
  supportHref?: string | null;
}) {
  return (
    <NotFoundState
      title="No encontramos ese pedido"
      message="Puede que el enlace no sea válido o que el pedido ya no esté disponible."
      supportHref={supportHref}
    />
  );
}
