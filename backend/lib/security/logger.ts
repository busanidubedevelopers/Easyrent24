// ============================================================================
// Secure Audit Logger & PII Redactor
//
// Ensures logs never leak personally identifiable information (PII),
// banking credentials, or API secrets into stdout or centralized loggers.
// ============================================================================

export type LogLevel = 'info' | 'warn' | 'error' | 'audit';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  context?: Record<string, unknown>;
}

// ── PII Redaction Rules ──────────────────────────────────────────────────────
const PII_PATTERNS = [
  // South African 13-digit National ID
  { pattern: /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{7}\b/g, replacement: '[REDACTED_SA_ID]' },
  // Credit / Debit Card Numbers (13-19 digits with optional spaces or dashes)
  { pattern: /\b(?:\d[ -]?){13,19}\b/g, replacement: '[REDACTED_CARD]' },
  // Bank Account Numbers (8-12 consecutive digits)
  { pattern: /\b\d{8,12}\b/g, replacement: '[REDACTED_ACCOUNT_NO]' },
  // Email addresses (preserve domain for debugging)
  { pattern: /\b([a-zA-Z0-9_.+-]{1,3})[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/g, replacement: '$1***@$2' },
  // Bearer Tokens / JWTs
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
];

const SENSITIVE_KEY_NAMES = new Set([
  'password',
  'passphrase',
  'token',
  'secret',
  'service_role_key',
  'merchant_key',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'credit_card',
  'cvv',
]);

/**
 * Recursively deep-redacts sensitive keys and values from objects or strings.
 */
export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    let sanitized = data;
    for (const { pattern, replacement } of PII_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement);
    }
    return sanitized;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  if (typeof data === 'object') {
    const cleanObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = k.toLowerCase();
      if (SENSITIVE_KEY_NAMES.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('pass')) {
        cleanObj[k] = '[REDACTED_SECRET]';
      } else {
        cleanObj[k] = redactSensitiveData(v);
      }
    }
    return cleanObj;
  }

  return String(data);
}

/**
 * Structured logger with automatic PII redaction.
 */
class SecureLogger {
  private formatLog(level: LogLevel, message: string, context?: Record<string, unknown>, requestId?: string): LogEntry {
    const cleanContext = context ? (redactSensitiveData(context) as Record<string, unknown>) : undefined;
    const cleanMessage = typeof message === 'string' ? (redactSensitiveData(message) as string) : String(message);

    return {
      timestamp: new Date().toISOString(),
      level,
      message: cleanMessage,
      ...(requestId ? { requestId } : {}),
      ...(cleanContext ? { context: cleanContext } : {}),
    };
  }

  info(message: string, context?: Record<string, unknown>, requestId?: string): void {
    const entry = this.formatLog('info', message, context, requestId);
    console.log(JSON.stringify(entry));
  }

  warn(message: string, context?: Record<string, unknown>, requestId?: string): void {
    const entry = this.formatLog('warn', message, context, requestId);
    console.warn(JSON.stringify(entry));
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>, requestId?: string): void {
    const errorDetails = error instanceof Error
      ? { name: error.name, message: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined }
      : { raw: String(error) };

    const entry = this.formatLog('error', message, { ...context, error: errorDetails }, requestId);
    console.error(JSON.stringify(entry));
  }

  audit(action: string, context: Record<string, unknown>, requestId?: string): void {
    const entry = this.formatLog('audit', `[AUDIT] ${action}`, context, requestId);
    console.info(JSON.stringify(entry));
  }
}

export const logger = new SecureLogger();
