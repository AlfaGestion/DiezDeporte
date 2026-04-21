"use client";

export function RetryAction({
  label = "Reintentar",
  onRetry,
}: {
  label?: string;
  onRetry?: () => void;
}) {
  return (
    <button
      type="button"
      className="hero-secondary"
      onClick={() => {
        if (onRetry) {
          onRetry();
          return;
        }

        window.location.reload();
      }}
    >
      {label}
    </button>
  );
}
