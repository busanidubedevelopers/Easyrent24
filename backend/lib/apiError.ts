import { UnauthorizedError, ForbiddenError } from './auth';
import { ValidationError } from './security/validation';
import { CsrfError } from './security/csrfGuard';
import { logger } from './security/logger';

export interface ErrorResponse {
  status: number;
  body: {
    error: string;
    code?: string;
    details?: Record<string, string[]>;
  };
}

/**
 * Converts a caught error into a consistent { status, body } shape for API
 * routes to return. Deliberately returns plain data (not a NextResponse) so
 * this stays usable outside Next.js too.
 */
export function toErrorResponse(err: unknown, requestId?: string): ErrorResponse {
  if (err instanceof UnauthorizedError) {
    return { status: 401, body: { error: err.message, code: 'UNAUTHORIZED' } };
  }

  if (err instanceof ForbiddenError) {
    return { status: 403, body: { error: err.message, code: 'FORBIDDEN' } };
  }

  if (err instanceof CsrfError) {
    logger.warn('CSRF violation blocked:', { reason: err.message }, requestId);
    return { status: 403, body: { error: err.message, code: 'CSRF_VIOLATION' } };
  }

  if (err instanceof ValidationError) {
    return {
      status: 400,
      body: {
        error: err.message,
        code: 'VALIDATION_ERROR',
        details: err.details,
      },
    };
  }

  // Rate limit errors
  if (err && typeof err === 'object' && 'rateLimit' in err) {
    return {
      status: 429,
      body: { error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
    };
  }

  if (err instanceof Error) {
    // Log with redaction so sensitive PII or credentials are never leaked
    logger.error('Unhandled API error', err, undefined, requestId);
    return { status: 500, body: { error: 'Something went wrong. Please try again.', code: 'INTERNAL_SERVER_ERROR' } };
  }

  logger.error('Unhandled non-Error thrown', String(err), undefined, requestId);
  return { status: 500, body: { error: 'Something went wrong. Please try again.', code: 'INTERNAL_SERVER_ERROR' } };
}
