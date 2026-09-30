import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@backend/lib/db';
import { approvalBlockMessage, signToken } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body.email?.trim()?.toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const res = await query(
      `SELECT id, email, password_hash, full_name, role, phone, is_verified, approval_status, rejection_reason
       FROM public.users WHERE email = $1`,
      [email]
    );

    if (res.rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const user = res.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Landlord and agent accounts can't sign in until a super admin approves them.
    const blocked = approvalBlockMessage(user.approval_status, user.rejection_reason);
    if (blocked) {
      return NextResponse.json(
        { error: blocked, code: user.approval_status === 'rejected' ? 'ACCOUNT_REJECTED' : 'ACCOUNT_PENDING' },
        { status: 403 }
      );
    }

    const token = await signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
    });

    const response = NextResponse.json({
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
        is_verified: user.is_verified,
      },
      token,
    });

    response.cookies.set('easyrent_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
