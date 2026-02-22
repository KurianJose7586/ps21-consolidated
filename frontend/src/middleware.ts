/**
 * middleware.ts
 * Next.js Edge Middleware — runs before every request.
 * Protects private routes by checking the Firebase session cookie.
 *
 * Protected routes  → redirect unauthenticated users to /login
 * Auth routes       → redirect already-authenticated users to /dashboard
 */
import { NextRequest, NextResponse } from 'next/server';

// Routes that require authentication
const PROTECTED_PREFIXES = [
    '/dashboard',
    '/brd',
    '/settings',
    '/profile',
    '/analytics',
    '/agents',
    '/editor',
    '/export',
    '/ingestion',
    '/project',
    '/signals',
    '/templates',
    '/invite',
];

// Routes only for unauthenticated users
const AUTH_ROUTES = ['/login', '/register', '/forgot-password'];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Read the Firebase session cookie (set after login — see session API route)
    const session = request.cookies.get('firebase-session')?.value;

    const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

    if (isProtected && !session) {
        // Redirect to login, preserving the intended destination
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
    }

    if (isAuthRoute && session) {
        // Already logged in — send to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
}

export const config = {
    // Skip Next.js internals, static files, and API routes from middleware
    matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
