/**
 * A non-2xx answer from Core on a path that does not go through the SDK. The
 * status travels with the error so a credential rejection stays recognisable
 * wherever it was raised, rather than being inferred from a message string.
 */
export class CoreHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CoreHttpError';
    this.status = status;
  }
}

const API_CODE = /^[A-Za-z][A-Za-z0-9_]{2,63}$/;
// Node and axios transport codes (ECONNRESET, ERR_BAD_REQUEST) name the
// transport, not the failure, so they never stand in for an API code.
const TRANSPORT_CODE =
  /^(?:ERR_[A-Z0-9_]+|ECONN[A-Z]+|ETIMEDOUT|ENOTFOUND|EPIPE|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH)$/;

const STATUS_CODES: Readonly<Record<number, string>> = {
  400: 'invalid_request',
  401: 'unauthorized',
  402: 'insufficient_credits',
  403: 'forbidden',
  404: 'not_found',
  408: 'timeout',
  409: 'conflict',
  413: 'payload_too_large',
  422: 'invalid_request',
  429: 'rate_limited',
};

export type ApiErrorDetails = {
  code: string;
  status: number;
  message: string;
  retryAfterSeconds?: number;
};

type HttpErrorShape = {
  status?: unknown;
  code?: unknown;
  details?: unknown;
  response?: { status?: unknown; data?: unknown };
};

function retryAfterSeconds(details: unknown, message: string): number | undefined {
  const body = (details ?? {}) as { retryAfterSeconds?: unknown; retry_after_seconds?: unknown };
  const value = body.retryAfterSeconds ?? body.retry_after_seconds;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const match = /retry after (\d+)\s*s(?:ec(?:ond)?s?)?\b/i.exec(message);
  return match && Number(match[1]) > 0 ? Number(match[1]) : undefined;
}

/**
 * The machine-readable shape of a failed Firecrawl API request: the API's own
 * error code when it sent one, else a name for the HTTP status. Undefined for
 * anything that is not an HTTP failure, such as a bug or a network error.
 */
export function apiErrorDetails(error: unknown): ApiErrorDetails | undefined {
  if (!(error instanceof Error)) return undefined;
  const source = error as HttpErrorShape;
  const status = [source.status, source.response?.status].find(
    (value): value is number => typeof value === 'number' && value >= 400 && value < 600
  );
  if (status === undefined) return undefined;
  const apiCode =
    typeof source.code === 'string' && API_CODE.test(source.code) && !TRANSPORT_CODE.test(source.code)
      ? source.code
      : undefined;
  const retryAfter = retryAfterSeconds(source.details ?? source.response?.data, error.message);
  return {
    code: apiCode ?? STATUS_CODES[status] ?? (status >= 500 ? 'server_error' : `http_${status}`),
    status,
    message: error.message,
    ...(retryAfter !== undefined ? { retryAfterSeconds: retryAfter } : {}),
  };
}
