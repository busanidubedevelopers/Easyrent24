import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { validatePayloadSize, validateSchema, UUID_REGEX } from '@backend/lib/security/validation';

/**
 * GET /api/notifications
 *
 * The caller's 20 most recent notifications and their unread count. Filtered
 * by user_id explicitly — the Postgres client has no row-level security.
 */
export async function GET() {
  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const [{ data, error }, { data: unreadRows, error: countError }] = await Promise.all([
      db
        .from('notifications')
        .select('id, type, title, body, link, is_read, created_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(20),
      db.from('notifications').select('id').eq('user_id', profile.id).eq('is_read', false).limit(100),
    ]);
    const count = unreadRows?.length ?? 0;

    if (error || countError) {
      console.error('GET /api/notifications: DB error', error ?? countError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ notifications: data, unread: count ?? 0 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

const markReadSchema = z.object({
  ids: z.array(z.string().regex(UUID_REGEX)).max(100).optional(),
});

/**
 * PATCH /api/notifications
 *
 * Marks notifications read: the given `ids`, or all of the caller's unread
 * notifications when `ids` is omitted.
 */
export async function PATCH(request: NextRequest) {
  try {
    validatePayloadSize(request.headers.get('content-length'));

    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);
    const { ids } = validateSchema(markReadSchema, await request.json().catch(() => ({})));

    let query = db.from('notifications').update({ is_read: true }).eq('user_id', profile.id).eq('is_read', false);
    if (ids) query = query.in('id', ids);

    const { error } = await query;
    if (error) {
      console.error('PATCH /api/notifications: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
