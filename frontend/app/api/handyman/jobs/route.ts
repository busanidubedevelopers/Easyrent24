import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';

/**
 * GET /api/handyman/jobs
 *
 * Any authenticated user can browse open jobs.
 * Optional query param: status (defaults to all statuses)
 */
export async function GET(request: NextRequest) {
  try {
    const db = await getServerDb();
    await getAuthenticatedProfile(db);

    const status = request.nextUrl.searchParams.get('status');

    let builder = db
      .from('handyman_jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      builder = builder.eq('status', status);
    }

    const { data, error } = await builder;

    if (error) {
      console.error('GET /api/handyman/jobs: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ jobs: data });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/handyman/jobs
 *
 * Creates a new job posting. Any authenticated user (landlord or tenant) can
 * post a job — poster_id is always taken from the session, never from the body.
 */
export async function POST(request: NextRequest) {
  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const body = await request.json();
    const { title, description, category, location, budget_range } = body;

    if (!title || !location) {
      return NextResponse.json({ error: 'title and location are required.' }, { status: 400 });
    }

    const { data, error } = await db
      .from('handyman_jobs')
      .insert([
        {
          poster_id: profile.id,
          title,
          description: description ?? null,
          category: category ?? null,
          location,
          budget_range: budget_range ?? null,
          status: 'open',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('POST /api/handyman/jobs: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ job: data }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
