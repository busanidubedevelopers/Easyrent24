import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { verifyCsrfOrigin } from '@backend/lib/security/csrfGuard';

const BLOCKED_USER_AGENTS = [
  'sqlmap',
  'nikto',
  'havij',
  'acunetix',
  'masscan',
  'wpscan',
  'zgrab',
  'dirbuster',
];

const roleRequirements: Record<string, string[]> = {
  '/admin': ['admin'],
  '/dashboard': ['landlord', 'admin'],
  '/applications': ['landlord', 'admin'],
  '/documents': ['landlord', 'admin'],
  '/collections': ['landlord', 'admin'],
  '/credit-check': ['landlord', 'admin'],
  '/financing': ['landlord', 'admin'],
  '/list-property': ['landlord', 'admin'],
  '/handyman': ['tenant', 'landlord', 'handyman', 'admin'],
  '/checkout': ['tenant', 'landlord', 'handyman', 'admin'],
  '/reviews': ['tenant', 'landlord', 'handyman', 'admin'],
};

const JWT_SECRET_STRING =
  process.env.JWT_SECRET || 'easyrent-secret-key-32-characters-minimum-length-key!';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

export async function middleware(request: NextRequest) {
  // 1. Block known malicious exploit scanners
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase();
  if (BLOCKED_USER_AGENTS.some((bot) => userAgent.includes(bot))) {
    return new NextResponse('Access Denied', { status: 403 });
  }

  // 2. Attach unique Request ID for audit tracing
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  request.headers.set('x-request-id', requestId);

  const currentPath = request.nextUrl.pathname;

  // 3. CSRF & Origin verification on state-changing API endpoints
  if (currentPath.startsWith('/api/')) {
    const csrfCheck = verifyCsrfOrigin(request.method, request.headers, currentPath);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { error: 'Forbidden cross-origin request', code: 'CSRF_VIOLATION' },
        { status: 403 }
      );
    }
  }

  const response = NextResponse.next({ request });
  response.headers.set('x-request-id', requestId);

  // 4. Role-based Route Protection
  let requiredRoles: string[] | null = null;
  for (const [pathPrefix, roles] of Object.entries(roleRequirements)) {
    if (currentPath.startsWith(pathPrefix)) {
      requiredRoles = roles;
      break;
    }
  }

  if (requiredRoles) {
    const tokenCookie = request.cookies.get('easyrent_token')?.value;

    if (!tokenCookie) {
      const signInUrl = new URL('/signin', request.url);
      signInUrl.searchParams.set('redirect_to', currentPath);
      return NextResponse.redirect(signInUrl);
    }

    try {
      const { payload } = await jwtVerify(tokenCookie, JWT_SECRET);
      const userRole = (payload.role as string) || 'tenant';

      if (!requiredRoles.includes(userRole)) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    } catch {
      // Invalid/expired token
      const signInUrl = new URL('/signin', request.url);
      signInUrl.searchParams.set('redirect_to', currentPath);
      return NextResponse.redirect(signInUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
