import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@backend/lib/adminDb';

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * GET /api/storage/property-images/[...path]
 *
 * Public file serving for the property-images bucket — unlike application
 * documents, listing photos are meant to be publicly visible to anyone
 * browsing the marketplace, same as a real CDN-backed image URL would be.
 * No auth check here on purpose; nothing sensitive lives in this bucket.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { path } = await params;
  const filePath = path.join('/');

  const admin = getAdminDb();
  const { data, error } = await admin.storage.from('property-images').download(filePath);

  if (error || !data) {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
  }

  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
