"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getInvite, acceptInvite, type Invite } from '@/lib/firestore/sharing';
import { Loader2, Zap, CheckCircle, XCircle, Users } from 'lucide-react';
import Link from 'next/link';

interface InvitePageProps {
    params: { token: string };
}

export default function InvitePage({ params }: InvitePageProps) {
    const { token } = params;
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [invite, setInvite] = useState<Invite | null>(null);
    const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'accepting' | 'accepted' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');

    // Load invite details
    useEffect(() => {
        async function loadInvite() {
            try {
                const inv = await getInvite(token);
                if (!inv) {
                    setStatus('invalid');
                    return;
                }
                setInvite(inv);
                setStatus('valid');
            } catch {
                setStatus('invalid');
            }
        }
        loadInvite();
    }, [token]);

    // Redirect unauthenticated users to login, then back here
    useEffect(() => {
        if (!authLoading && !user && status !== 'loading') {
            router.push(`/login?redirect=/invite/${token}`);
        }
    }, [user, authLoading, status, router, token]);

    const handleAccept = async () => {
        if (!user || !invite) return;
        setStatus('accepting');
        try {
            const boardId = await acceptInvite(token, user.uid);
            setStatus('accepted');
            setTimeout(() => router.push('/dashboard'), 2000);
        } catch (err: unknown) {
            setErrorMsg(err instanceof Error ? err.message : 'Failed to accept invitation.');
            setStatus('error');
        }
    };

    const roleLabel = {
        owner: 'Owner',
        editor: 'Editor',
        viewer: 'Viewer',
    }[invite?.role ?? 'viewer'];

    const roleDescription = {
        owner: 'Full access to manage and edit this board',
        editor: 'Can edit and contribute to this board',
        viewer: 'Can view this board (read-only)',
    }[invite?.role ?? 'viewer'];

    return (
        <div
            className="min-h-screen flex items-center justify-center px-6"
            style={{ background: 'var(--bg-base)' }}
        >
            <div className="w-full max-w-md space-y-6">
                {/* Logo */}
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
                        <Zap size={14} className="text-white" />
                    </div>
                    <span className="text-sm font-bold text-white tracking-tight">Beacon</span>
                </div>

                <div
                    className="p-8 rounded-2xl border border-white/8 space-y-6"
                    style={{ background: 'rgba(14,14,14,0.95)' }}
                >
                    {/* Loading */}
                    {(status === 'loading' || authLoading) && (
                        <div className="flex flex-col items-center gap-4 py-6">
                            <Loader2 size={28} className="animate-spin text-zinc-400" />
                            <p className="text-zinc-500 text-sm">Loading invitation…</p>
                        </div>
                    )}

                    {/* Invalid / expired */}
                    {status === 'invalid' && (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                <XCircle size={20} className="text-red-400" />
                            </div>
                            <div>
                                <p className="text-white font-semibold">Invitation not found</p>
                                <p className="text-zinc-500 text-sm mt-1">
                                    This invite link is invalid, expired, or has already been used.
                                </p>
                            </div>
                            <Link
                                href="/dashboard"
                                className="w-full py-3 rounded-xl font-semibold text-sm bg-white text-zinc-900 hover:bg-zinc-100 transition-all text-center block"
                            >
                                Go to Dashboard
                            </Link>
                        </div>
                    )}

                    {/* Valid — show invite details */}
                    {status === 'valid' && invite && user && (
                        <>
                            <div className="flex flex-col items-center gap-2 text-center">
                                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                    <Users size={20} className="text-zinc-300" />
                                </div>
                                <p className="text-zinc-400 text-sm">
                                    <span className="text-white font-medium">{invite.invitedByName}</span> invited you to collaborate
                                </p>
                            </div>

                            <div className="rounded-xl border border-white/8 p-5 space-y-3 text-center">
                                <p className="text-xs text-zinc-500 uppercase tracking-wider">Board</p>
                                <p className="text-xl font-bold text-white">{invite.boardTitle}</p>
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                                    <span className="text-xs font-medium text-zinc-300">{roleLabel}</span>
                                </div>
                                <p className="text-xs text-zinc-500">{roleDescription}</p>
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={handleAccept}
                                    className="w-full py-3 rounded-xl font-semibold text-sm bg-white text-zinc-900 hover:bg-zinc-100 transition-all flex items-center justify-center gap-2"
                                >
                                    Accept Invitation
                                </button>
                                <Link
                                    href="/dashboard"
                                    className="block text-center text-sm text-zinc-600 hover:text-zinc-400 transition-colors"
                                >
                                    Decline
                                </Link>
                            </div>
                        </>
                    )}

                    {/* Accepting */}
                    {status === 'accepting' && (
                        <div className="flex flex-col items-center gap-4 py-6">
                            <Loader2 size={28} className="animate-spin text-zinc-400" />
                            <p className="text-zinc-500 text-sm">Joining board…</p>
                        </div>
                    )}

                    {/* Accepted */}
                    {status === 'accepted' && (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <CheckCircle size={20} className="text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-white font-semibold">You&apos;re in!</p>
                                <p className="text-zinc-500 text-sm mt-1">Redirecting to your dashboard…</p>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {status === 'error' && (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                <XCircle size={20} className="text-red-400" />
                            </div>
                            <div>
                                <p className="text-white font-semibold">Something went wrong</p>
                                <p className="text-zinc-500 text-sm mt-1">{errorMsg}</p>
                            </div>
                            <button
                                onClick={() => setStatus('valid')}
                                className="w-full py-3 rounded-xl font-semibold text-sm bg-white text-zinc-900 hover:bg-zinc-100 transition-all"
                            >
                                Try Again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
