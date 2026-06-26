import { ParseError } from "./types";
import { wrapBrowserError } from "./browser";

export function getApiErrorPayload(error: unknown): {
  message: string;
  code: string;
} {
  if (error instanceof ParseError) {
    return { message: error.message, code: error.code ?? "UNKNOWN" };
  }

  try {
    wrapBrowserError(error);
  } catch (wrapped) {
    if (wrapped instanceof ParseError) {
      return {
        message: wrapped.message,
        code: wrapped.code ?? "UNAVAILABLE",
      };
    }
  }

  return {
    message: error instanceof Error ? error.message : "Неизвестная ошибка.",
    code: "UNKNOWN",
  };
}

export function handleApiError(error: unknown): Response {
  if (error instanceof ParseError) {
    const status = error.code === "UNAVAILABLE" ? 500 : 400;
    return Response.json({ error: error.message }, { status });
  }

  try {
    wrapBrowserError(error);
  } catch (wrapped) {
    if (wrapped instanceof ParseError) {
      return Response.json({ error: wrapped.message }, { status: 500 });
    }
  }

  const message = error instanceof Error ? error.message : "Неизвестная ошибка.";
  return Response.json({ error: message }, { status: 500 });
}
