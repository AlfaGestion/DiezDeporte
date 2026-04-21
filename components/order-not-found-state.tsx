import { NotFoundState } from "@/components/not-found-state";

export function OrderNotFoundState({
  supportHref,
}: {
  supportHref?: string | null;
}) {
  return (
    <NotFoundState
      title="No encontramos ese pedido"
      message="Puede que el enlace no sea valido o que el pedido ya no este disponible."
      supportHref={supportHref}
    />
  );
}
