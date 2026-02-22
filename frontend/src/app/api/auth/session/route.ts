/**
 * api/auth/session/route.ts
 * Manages the firebase-session cookie used by Next.js middleware for route protection.
 *
 * POST /api/auth/session  { action: 'login' }   → sets cookie
 * DELETE /api/auth/session                       → clears cookie
 */
import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'firebase-session';

// 7-day session duration
const MAX_AGE = 60 * 60 * 24 * 7;

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({}));

    if (body.action === 'login') {
        const response = NextResponse.json({ success: true });
        response.cookies.set(SESSION_COOKIE, 'authenticated', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: MAX_AGE,
            path: '/',
        });
        return response;
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function DELETE() {
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
    });
    return response;
}
