import "server-only";

type ErrorLogInput = {
  code: string;
  scope: "public" | "admin" | "payment" | "order" | "global";
  route: string;
  error?: unknown;
  message?: string | null;
  orderId?: number | string | null;
  externalReference?: string | null;
  user?: string | number | null;
  extra?: Record<string, unknown>;
};

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || null,
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : "Unknown error",
    stack: null,
  };
}

export function logServerError(input: ErrorLogInput) {
  const normalized = normalizeError(input.error);

  console.error("[app-error]", {
    code: input.code,
    scope: input.scope,
    route: input.route,
    at: new Date().toISOString(),
    message: input.message || normalized.message,
    technicalMessage: normalized.message,
    stack: normalized.stack,
    orderId: input.orderId || null,
    externalReference: input.externalReference || null,
    user: input.user || null,
    extra: input.extra || null,
  });
}
