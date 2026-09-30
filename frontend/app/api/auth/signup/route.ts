import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@backend/lib/db';
import { needsApproval, signToken, UserRole } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body.email?.trim()?.toLowerCase();
    const password = body.password;
    const fullName = body.fullName || body.name || body.full_name || '';
    const requestedRole = String(body.role || 'tenant').toLowerCase();
    // Agents work like landlords in the app; the account type keeps them apart.
    const accountType = requestedRole === 'agent' ? 'agent' : requestedRole;
    const role = (requestedRole === 'agent' ? 'landlord' : requestedRole) as UserRole;
    // Self-signup may never create an admin (or any unknown role) — admins
    // are created directly in the database.
    if (!['tenant', 'landlord', 'handyman'].includes(role)) {
      return NextResponse.json({ error: 'Invalid account type.' }, { status: 400 });
    }
    const phone = body.phone || null;
    const servicesOffered = Array.isArray(body.servicesOffered)
      ? body.servicesOffered.map((entry: any) => String(entry).trim()).filter(Boolean)
      : typeof body.servicesOffered === 'string'
        ? body.servicesOffered.split(',').map((entry: string) => entry.trim()).filter(Boolean)
        : [];
    const experienceYears = Number.isFinite(Number(body.experienceYears)) ? Number(body.experienceYears) : 0;
    const certifications = Array.isArray(body.certifications)
      ? body.certifications.map((entry: any) => String(entry).trim()).filter(Boolean)
      : typeof body.certifications === 'string'
        ? body.certifications.split(',').map((entry: string) => entry.trim()).filter(Boolean)
        : [];

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await query('SELECT id FROM public.users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Landlords and agents wait for a super admin; tenants are approved at once.
    const approvalStatus = needsApproval(role) ? 'pending' : 'approved';

    // Insert user
    const insertRes = await query(
      `INSERT INTO public.users (email, password_hash, full_name, role, phone, services_offered, experience_years, certifications, is_verified, account_type, approval_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10)
       RETURNING id, email, full_name, role, phone, services_offered, experience_years, certifications, is_verified, account_type, approval_status, created_at`,
      [email, passwordHash, fullName, role, phone, servicesOffered, experienceYears, certifications, accountType, approvalStatus]
    );

    const user = insertRes.rows[0];

    // No session until approved: the account exists, but can't be used yet.
    if (approvalStatus === 'pending') {
      return NextResponse.json(
        {
          pending: true,
          account_type: user.account_type,
          message: 'Your account has been created and is awaiting approval by an EasyRent administrator. You can sign in once it has been approved.',
        },
        { status: 201 }
      );
    }

    // Create session token
    const token = await signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
    });

    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          user_metadata: {
            full_name: user.full_name,
            role: user.role,
          },
          role: user.role,
        },
        profile: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          phone: user.phone,
          services_offered: user.services_offered || [],
          experience_years: user.experience_years || 0,
          certifications: user.certifications || [],
          is_verified: user.is_verified,
        },
        token,
      },
      { status: 201 }
    );

    // Set cookie
    response.cookies.set('easyrent_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err) {
    console.error('Signup failed:', err);
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
