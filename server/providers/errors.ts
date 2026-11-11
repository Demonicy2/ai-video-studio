export type ProviderErrorCode =
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'AUTH_ERROR'
  | 'INVALID_RESPONSE'
  | 'QUOTA_EXCEEDED'
  | 'UPSTREAM_ERROR';

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly provider: string;
  public readonly retryable: boolean;
  public readonly statusCode?: number;

  constructor(opts: {
    message: string;
    code: ProviderErrorCode;
    provider: string;
    retryable: boolean;
    statusCode?: number;
  }) {
    super(opts.message);
    this.name = 'ProviderError';
    this.code = opts.code;
    this.provider = opts.provider;
    this.retryable = opts.retryable;
    this.statusCode = opts.statusCode;
  }
}

/**
 * Normalizes any error thrown by fetch/SDK/HTTP calls into a structured ProviderError.
 */
export function normalizeProviderError(err: unknown, providerName: string): ProviderError {
  if (err instanceof ProviderError) return err;

  const rawMessage = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;

  if (status === 429 || /429|rate.?limit|too many requests/i.test(rawMessage)) {
    return new ProviderError({
      message: `[${providerName}] Rate limit exceeded (429): ${rawMessage}`,
      code: 'RATE_LIMIT',
      provider: providerName,
      retryable: true,
      statusCode: 429,
    });
  }

  if (status === 401 || status === 403 || /401|403|unauthorized|invalid api key|forbidden/i.test(rawMessage)) {
    return new ProviderError({
      message: `[${providerName}] Authentication failed: ${rawMessage}`,
      code: 'AUTH_ERROR',
      provider: providerName,
      retryable: false,
      statusCode: status || 401,
    });
  }

  if (/timeout|timed out|abort|etimedout/i.test(rawMessage)) {
    return new ProviderError({
      message: `[${providerName}] Request timed out: ${rawMessage}`,
      code: 'TIMEOUT',
      provider: providerName,
      retryable: true,
      statusCode: 408,
    });
  }

  if (status && status >= 500) {
    return new ProviderError({
      message: `[${providerName}] Upstream server error (${status}): ${rawMessage}`,
      code: 'UPSTREAM_ERROR',
      provider: providerName,
      retryable: true,
      statusCode: status,
    });
  }

  return new ProviderError({
    message: `[${providerName}] ${rawMessage}`,
    code: 'UPSTREAM_ERROR',
    provider: providerName,
    retryable: false,
    statusCode: status,
  });
}

/**
 * Executes an async operation with timeout, exponential backoff (max 3 retries), and 429 handling.
 */
export async function withRetryAndTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: {
    providerName: string;
    maxRetries?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
  }
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  const timeoutMs = opts.timeoutMs ?? 45000;

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Operation timed out')), timeoutMs);

    try {
      const result = await fn(controller.signal);
      clearTimeout(timer);
      return result;
    } catch (rawErr) {
      clearTimeout(timer);
      const normalized = normalizeProviderError(rawErr, opts.providerName);
      attempt++;
      if (!normalized.retryable || attempt > maxRetries) {
        throw normalized;
      }
      const jitter = Math.floor(Math.random() * 100);
      const multiplier = normalized.code === 'RATE_LIMIT' ? 2.5 : 2;
      const delay = Math.round(baseDelayMs * Math.pow(multiplier, attempt - 1)) + jitter;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

