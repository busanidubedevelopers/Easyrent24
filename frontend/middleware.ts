import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
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
  '/dashboard': ['landlord', 'admin'],
  '/applications': ['landlord', 'admin'],
  '/documents': ['landlord', 'admin'],
  '/collections': ['landlord', 'admin'],
  '/credit-check': ['landlord', 'admin'],
  '/financing': ['landlord', 'admin'],
  '/list-property': ['landlord', 'admin'],
  '/handyman': ['handyman', 'admin'],
  '/checkout': ['tenant', 'landlord', 'handyman', 'admin'],
  '/reviews': ['tenant', 'landlord', 'handyman', 'admin'],
};

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

  let supabaseResponse = NextResponse.next({ request });
  supabaseResponse.headers.set('x-request-id', requestId);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  let requiredRoles: string[] | null = null;

  for (const [pathPrefix, roles] of Object.entries(roleRequirements)) {
    if (currentPath.startsWith(pathPrefix)) {
      requiredRoles = roles;
      break;
    }
  }

  if (requiredRoles) {
    if (userError || !user) {
      const signInUrl = new URL('/signin', request.url);
      signInUrl.searchParams.set('redirect_to', currentPath);
      return NextResponse.redirect(signInUrl);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !requiredRoles.includes(profile.role)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
