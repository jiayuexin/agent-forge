import type { H3Event } from 'h3';

export interface HttpError {
  code: string;
  message: string;
  details?: unknown;
  statusCode?: number;
}

export function createHttpError(code: string, message: string, statusCode = 500, details?: unknown): HttpError {
  return { code, message, statusCode, details };
}

export function isHttpError(error: unknown): error is HttpError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as HttpError).code === 'string'
  );
}

export function handleError(error: unknown, event: H3Event): { error: HttpError } {
  let httpError: HttpError;

  if (isHttpError(error)) {
    httpError = error;
  } else if (isHttpError((error as Error & { cause?: unknown })?.cause)) {
    httpError = (error as Error & { cause: HttpError }).cause;
  } else if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number') {
    const wrapped = error as Error & { statusCode: number; data?: { error?: HttpError } };
    httpError = wrapped.data?.error ?? {
      code: 'REQUEST_ERROR',
      message: wrapped.message,
      statusCode: wrapped.statusCode,
    };
  } else if (error instanceof Error) {
    httpError = { code: 'INTERNAL_ERROR', message: error.message, statusCode: 500 };
  } else {
    httpError = { code: 'INTERNAL_ERROR', message: String(error), statusCode: 500 };
  }

  event.node.res.statusCode = httpError.statusCode ?? 500;
  event.node.res.setHeader('Content-Type', 'application/json');
  event.node.res.end(JSON.stringify({ error: httpError }));
  (event as H3Event & { _handled?: boolean })._handled = true;
  return { error: httpError };
}
