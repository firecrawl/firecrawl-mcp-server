import { SdkError } from 'firecrawl';

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

function retryAfterSeconds(details: unknown, message: string): number | undefined {
  const body = (details ?? {}) as { retryAfterSeconds?: unknown; retry_after_seconds?: unknown };
  const value = body.retryAfterSeconds ?? body.retry_after_seconds;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const match = /retry after (\d+)\s*s(?:ec(?:ond)?s?)?\b/i.exec(message);
  return match && Number(match[1]) > 0 ? Number(match[1]) : undefined;
}

/**
 * The machine-readable shape of a failed Firecrawl API request, for a
 * CoreHttpError or an SDK error with an HTTP status: the API's own error code
 * when the SDK reports one, else a name for the status. Undefined for any other
 * error, such as a bug, a network error or an error an embedder's tool throws.
 */
export function apiErrorDetails(error: unknown): ApiErrorDetails | undefined {
  if (!(error instanceof CoreHttpError || error instanceof SdkError)) return undefined;
  const status = error.status;
  if (status === undefined || status < 400 || status >= 600) return undefined;
  const sdk = error instanceof SdkError ? error : undefined;
  const apiCode =
    sdk?.code && API_CODE.test(sdk.code) && !TRANSPORT_CODE.test(sdk.code) ? sdk.code : undefined;
  const retryAfter = retryAfterSeconds(sdk?.details, error.message);
  return {
    code: apiCode ?? STATUS_CODES[status] ?? (status >= 500 ? 'server_error' : `http_${status}`),
    status,
    message: error.message,
    ...(retryAfter !== undefined ? { retryAfterSeconds: retryAfter } : {}),
  };
}
