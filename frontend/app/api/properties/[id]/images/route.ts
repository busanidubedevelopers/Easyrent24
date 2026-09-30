import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * POST /api/properties/[id]/images
 *
 * Uploads one image for a property. Owner or admin only. Expects
 * multipart/form-data with a single "file" field.
 *
 * Validation happens here (size, type) BEFORE anything touches storage —
 * the storage bucket's RLS policy (migration 003) only checks *who* is
 * uploading and *where*, not file size or content type, so this route is
 * the only place those checks exist. Uploads go through the admin client
 * (bypassing RLS) because the ownership check has already been done
 * explicitly above, in code we can unit test — relying on RLS alone here
 * would mean re-deriving the same check twice with no added safety.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: property, error: fetchError } = await db
      .from('properties')
      .select('landlord_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!property) {
      return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    }
    if (property.landlord_id !== profile.id && profile.role !== 'admin') {
      throw new ForbiddenError('You can only upload images to your own properties.');
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type must be one of: ${ALLOWED_TYPES.join(', ')}.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File must be ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB or smaller.` },
        { status: 400 }
      );
    }

    const admin = getAdminDb();
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${property.landlord_id}/${id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from('property-images')
      .upload(path, await file.arrayBuffer(), { contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Not admin.storage.getPublicUrl() — that's a stub left over from before
    // this ran on plain Postgres/local disk instead of real Supabase Storage
    // and still returns a fixed stock photo. This bucket's files are now
    // real, served back through our own public route.
    //
    // Not new URL(request.url).origin either — the server binds HOSTNAME
    // 0.0.0.0 (see Dockerfile), so that would produce an unreachable
    // "http://0.0.0.0:3000/..." URL. NEXT_PUBLIC_APP_URL is the same
    // browser-facing origin already used for PayFast's return/notify URLs.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const publicUrl = `${appUrl}/api/storage/property-images/${path}`;

    // Append the new image URL to the property's images array.
    const { data: current } = await db
      .from('properties')
      .select('images')
      .eq('id', id)
      .single();

    const updatedImages = [...(current?.images ?? []), publicUrl];

    const { data: updated, error: updateError } = await db
      .from('properties')
      .update({ images: updatedImages })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ property: updated, uploadedUrl: publicUrl }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
