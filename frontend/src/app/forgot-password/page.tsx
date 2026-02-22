"use client";

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { ArrowLeft, Loader2, Zap, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
    const { resetPassword } = useAuth();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await resetPassword(email);
            setSent(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to send reset email.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center px-6"
            style={{ background: 'var(--bg-base)' }}
        >
            <div className="w-full max-w-md space-y-8">
                <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-200 transition-colors text-sm"
                >
                    <ArrowLeft size={14} /> Back to login
                </Link>

                <div className="space-y-1">
                    <div className="flex items-center gap-2.5 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
                            <Zap size={14} className="text-white" />
                        </div>
                        <span className="text-sm font-bold text-white tracking-tight">Beacon</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Reset password</h1>
                    <p className="text-zinc-500 text-sm">
                        Enter your email and we&apos;ll send you a reset link.
                    </p>
                </div>

                <div
                    className="p-7 rounded-2xl border border-white/8"
                    style={{ background: 'rgba(14,14,14,0.95)' }}
                >
                    {sent ? (
                        <div className="flex flex-col items-center gap-4 py-4">
                            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <CheckCircle size={20} className="text-emerald-400" />
                            </div>
                            <div className="text-center space-y-1">
                                <p className="text-white font-semibold">Check your inbox</p>
                                <p className="text-zinc-500 text-sm">
                                    We sent a reset link to <span className="text-zinc-300">{email}</span>
                                </p>
                            </div>
                            <Link
                                href="/login"
                                className="w-full py-3 rounded-xl font-semibold text-sm bg-white text-zinc-900 hover:bg-zinc-100 transition-all text-center block mt-2"
                            >
                                Back to Sign In
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
                                    {error}
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-zinc-300">Email address</label>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="glass-input w-full px-4 py-3 text-sm"
                                    placeholder="you@company.com"
                                    autoComplete="email"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 rounded-xl font-semibold text-sm bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <><Loader2 size={16} className="animate-spin" /> Sending…</>
                                ) : (
                                    'Send Reset Link'
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
