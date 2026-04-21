type ClientErrorLogInput = {
  code: string;
  scope: "public" | "admin" | "payment" | "order" | "global";
  route: string;
  error?: unknown;
  message?: string | null;
  orderId?: number | string | null;
  externalReference?: string | null;
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

export function logClientError(input: ClientErrorLogInput) {
  const normalized = normalizeError(input.error);

  console.error("[app-error-client]", {
    code: input.code,
    scope: input.scope,
    route: input.route,
    at: new Date().toISOString(),
    message: input.message || normalized.message,
    technicalMessage: normalized.message,
    stack: normalized.stack,
    orderId: input.orderId || null,
    externalReference: input.externalReference || null,
  });
}
