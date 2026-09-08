import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@backend/lib/supabaseAdmin';

/**
 * GET /api/health
 *
 * Basic health check used to confirm:
 *   1. The Next.js app can import shared logic from the sibling backend/
 *      folder (proves the @backend/* alias + externalDir wiring works).
 *   2. The service-role Supabase client can be constructed and can reach
 *      the database.
 *
 * This is also useful later as the health check endpoint AWS App Runner
 * polls to confirm the container is alive.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('profiles').select('id').limit(1);

    if (error) {
      return NextResponse.json(
        { status: 'error', stage: 'database', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      backendImportWorking: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        stage: 'config',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
