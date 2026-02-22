"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { user, loading } = useAuth();

    useEffect(() => {
        // Only redirect once Firebase has resolved the auth state
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    // Show spinner while Firebase checks auth state (usually < 1 second)
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
                <div className="text-center">
                    <Loader2 size={28} className="text-zinc-400 animate-spin mx-auto mb-3" />
                    <p className="text-zinc-600 text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    // If not authenticated, return null — redirect is already triggered above
    if (!user) {
        return null;
    }

    return <>{children}</>;
}
