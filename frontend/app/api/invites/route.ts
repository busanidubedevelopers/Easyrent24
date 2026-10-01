import { TENANT_FEE_ZAR } from '@backend/lib/applications';
import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { requireAuthenticatedRole } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { buildInviteLink, createInviteSchema, generateInviteToken } from '@backend/lib/invites';
import { validatePayloadSize, validateSchema } from '@backend/lib/security/validation';
import { checkRateLimit, getRateLimitHeaders } from '@backend/lib/security/rateLimiter';
import { inviteEmail, sendEmail } from '@backend/lib/email';
import { loadProperty } from '@backend/lib/applicationAccess';

/**
 * GET /api/invites
 *
 * Lists the tenant invites the caller has sent, newest first, so the
 * landlord/agent can see who has registered and paid the admin fee.
 *
 * Invites still waiting for the tenant to sign up include their link, built
 * with the app's current address, so the agent can copy and re-send it
 * (e.g. after the public address changed). The raw token is never returned.
 */
export async function GET() {
  try {
    const db = await getServerDb();
    const profile = await requireAuthenticatedRole(db, ['landlord', 'admin']);

    const { data: rows, error } = await db
      .from('tenant_invites')
      .select('id, token, property_id, invitee_name, invitee_email, admin_fee_amount, status, registered_at, paid_at, expires_at, created_at')
      .eq('inviter_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/invites: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    const properties = new Map<string, { title: string; address: string }>();
    await Promise.all(
      [...new Set((rows ?? []).map((r: { property_id: string | null }) => r.property_id).filter(Boolean))].map(async (pid) => {
        const property = await loadProperty(db, pid as string);
        if (property) properties.set(property.id, { title: property.title, address: property.address });
      })
    );
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const now = new Date();
    const invites = (rows ?? []).map(
      ({ token, ...r }: { token: string; property_id: string | null; status: string; expires_at: string }) => ({
        ...r,
        properties: r.property_id ? properties.get(r.property_id) ?? null : null,
        link: appUrl && r.status === 'pending' && new Date(r.expires_at) > now ? buildInviteLink(appUrl, token) : null,
      })
    );

    return NextResponse.json({ invites });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/invites
 *
 * A landlord or agent (agents are stored with role 'landlord') invites a
 * prospective tenant to register, setting the admin fee the tenant must pay.
 * The token is generated here, server-side — the link it produces is the
 * only way a tenant can sign up.
 *
 * The property must belong to the caller (admins may invite for any
 * property).
 */
export async function POST(request: NextRequest) {
  try {
    validatePayloadSize(request.headers.get('content-length'));

    const db = await getServerDb();
    const profile = await requireAuthenticatedRole(db, ['landlord', 'admin']);

    const rateLimit = await checkRateLimit(profile.id, 'MUTATIONS');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const input = validateSchema(createInviteSchema, await request.json());

    const { data: property, error: propertyError } = await db
      .from('properties')
      .select('id, landlord_id, title, address')
      .eq('id', input.property_id)
      .maybeSingle();

    if (propertyError) {
      console.error('POST /api/invites: DB fetch error', propertyError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!property) {
      return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    }
    if (property.landlord_id !== profile.id && profile.role !== 'admin') {
      return NextResponse.json({ error: 'You can only invite tenants to your own properties.' }, { status: 403 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      console.error('POST /api/invites: NEXT_PUBLIC_APP_URL not configured.');
      return NextResponse.json({ error: 'Invites are not configured yet. Please try again later.' }, { status: 503 });
    }

    const token = generateInviteToken();

    // Service-role insert: tenant_invites has no INSERT policy (migration 008)
    // so that status/tenant_id can never be written by a regular user.
    const admin = getAdminDb();
    const { data: invite, error: insertError } = await admin
      .from('tenant_invites')
      .insert([
        {
          token,
          inviter_id: profile.id,
          property_id: property.id,
          invitee_name: input.invitee_name,
          invitee_email: input.invitee_email,
          admin_fee_amount: TENANT_FEE_ZAR,
        },
      ])
      .select('id, invitee_name, invitee_email, admin_fee_amount, status, expires_at')
      .single();

    if (insertError || !invite) {
      console.error('POST /api/invites: DB insert error', insertError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    const link = buildInviteLink(appUrl, token);
    const emailed = await sendEmail(
      inviteEmail({
        to: input.invitee_email,
        inviteeName: input.invitee_name,
        inviterName: profile.full_name,
        property: { title: property.title, address: property.address },
        adminFee: TENANT_FEE_ZAR,
        link,
      })
    );

    return NextResponse.json(
      {
        invite: { ...invite, property: { title: property.title, address: property.address } },
        link,
        emailed,
      },
      { status: 201 }
    );
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
