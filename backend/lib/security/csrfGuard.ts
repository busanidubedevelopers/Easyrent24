// ============================================================================
// CSRF & Origin Verification Guard
//
// Prevents Cross-Site Request Forgery on state-changing API endpoints
// by verifying that incoming requests originate from a trusted domain.
// ============================================================================

export class CsrfError extends Error {
  constructor(message = 'Cross-site request forgery detected. Request origin not allowed.') {
    super(message);
    this.name = 'CsrfError';
  }
}

export interface CsrfOptions {
  allowedOrigins?: string[];
  exemptPaths?: string[];
}

const DEFAULT_EXEMPT_PATHS = [
  '/api/payments/payfast/notify', // PayFast ITN server-to-server webhook
];

/**
 * Validates the Origin and Referer headers for state-changing HTTP requests.
 *
 * @param method - The HTTP method (GET, POST, etc.)
 * @param headers - An object or Headers instance representing incoming headers
 * @param pathname - The request pathname (e.g. "/api/applications")
 * @param options - Additional allowed origins or exempt paths
 */
export function verifyCsrfOrigin(
  method: string,
  headers: Headers | Record<string, string | undefined | null>,
  pathname: string,
  options: CsrfOptions = {}
): { valid: boolean; reason?: string } {
  const upperMethod = method.toUpperCase();

  // Safe HTTP methods do not mutate state; no CSRF check needed
  if (['GET', 'HEAD', 'OPTIONS'].includes(upperMethod)) {
    return { valid: true };
  }

  // Exempt paths (webhooks from trusted third parties like PayFast)
  const exempt = [...DEFAULT_EXEMPT_PATHS, ...(options.exemptPaths || [])];
  if (exempt.some((path) => pathname.startsWith(path))) {
    return { valid: true };
  }

  const getHeader = (name: string): string | null => {
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name);
    }
    const record = headers as Record<string, string | undefined | null>;
    return record[name.toLowerCase()] ?? record[name] ?? null;
  };

  const origin = getHeader('origin');
  const referer = getHeader('referer');
  const host = getHeader('host') || getHeader('x-forwarded-host');

  // If neither Origin nor Referer is present on a state-changing browser request, reject
  if (!origin && !referer) {
    // Allow localhost development/test traffic for end-to-end validation without a browser Origin header.
    if (process.env.NODE_ENV === 'test' || host?.startsWith('localhost:') || host?.startsWith('127.0.0.1:')) {
      return { valid: true };
    }
    return { valid: false, reason: 'Missing Origin and Referer headers on state-changing request' };
  }

  const allowedOrigins = new Set<string>();

  // Add configured app URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      allowedOrigins.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin.toLowerCase());
    } catch {
      // Invalid URL in env, ignore
    }
  }

  // Add Host-derived origin
  if (host) {
    allowedOrigins.add(`https://${host.toLowerCase()}`);
    allowedOrigins.add(`http://${host.toLowerCase()}`);
  }

  // Add custom allowed origins
  if (options.allowedOrigins) {
    for (const o of options.allowedOrigins) {
      try {
        allowedOrigins.add(new URL(o).origin.toLowerCase());
      } catch {
        allowedOrigins.add(o.toLowerCase());
      }
    }
  }

  // Verify Origin header if present
  if (origin) {
    const originLower = origin.trim().toLowerCase();
    if (!allowedOrigins.has(originLower)) {
      return {
        valid: false,
        reason: `Forbidden cross-origin request: origin '${origin}' is not authorized`,
      };
    }
    return { valid: true };
  }

  // Fall back to verifying Referer header
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin.toLowerCase();
      if (!allowedOrigins.has(refererOrigin)) {
        return {
          valid: false,
          reason: `Forbidden cross-origin request: referer '${referer}' is not authorized`,
        };
      }
      return { valid: true };
    } catch {
      return { valid: false, reason: 'Invalid Referer URL format' };
    }
  }

  return { valid: true };
}
