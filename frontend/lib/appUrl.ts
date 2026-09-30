import type { NextRequest } from 'next/server';

/** Absolute app URL for links sent outside the app (emails). */
export function appOrigin(request: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '');
}

/**
 * Base URL PayFast sends the *shopper's browser* back to after paying or
 * cancelling. Usually the same as NEXT_PUBLIC_APP_URL, but when the app is
 * exposed through a tunnel for PayFast's server-to-server ITN while people
 * browse it at http://localhost:3000, set APP_BROWSER_URL to that local
 * address so the return trip lands where the user actually is.
 */
export function browserReturnBase(appUrl: string): string {
  return (process.env.APP_BROWSER_URL || appUrl).replace(/\/$/, '');
}
