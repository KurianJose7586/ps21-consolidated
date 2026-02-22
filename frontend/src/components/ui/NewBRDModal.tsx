// @ts-nocheck
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Loader2 } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useAuth } from '@/contexts/AuthContext';
import { createSession } from '@/lib/apiClient';

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function NewBRDModal({ open, onClose }: Props) {
    const router = useRouter();
    const addSession = useSessionStore((s) => s.addSession);
    const { user } = useAuth();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleCreate = async () => {
        if (!name.trim() || !user) return;
        setLoading(true);
        setError('');

        try {
            // 1. Get a session ID from the backend (or generate one if offline)
            let sessionId: string;
            try {
                const res = await createSession();
                sessionId = res.session_id;
            } catch {
                // Backend offline — generate a local ID; Firestore will still work
                sessionId = `sess_${crypto.randomUUID().slice(0, 8)}`;
            }

            // 2. Write to Firestore (board doc + member doc + user membership index)
            await addSession(name.trim(), description.trim(), user.uid, sessionId);

            const savedName = name.trim();
            setName('');
            setDescription('');
            onClose();
            router.push(`/brd/new?name=${encodeURIComponent(savedName)}&id=${sessionId}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-50"
                        style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        key="modal"
                        initial={{ opacity: 0, scale: 0.92, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 16 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                    >
                        <div
                            className="relative w-full max-w-md rounded-2xl p-7 pointer-events-auto"
                            style={{
                                background: 'rgba(10,10,10,0.98)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
                            }}
                            onKeyDown={handleKey}
                        >
                            {/* Close */}
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-white/6 transition-all"
                            >
                                <X size={14} />
                            </button>

                            {/* Icon + title */}
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
                                    <FileText size={16} className="text-zinc-200" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-white leading-tight">New BRD Session</h2>
                                    <p className="text-xs text-zinc-600 mt-0.5">Give your session a name to get started</p>
                                </div>
                            </div>

                            {/* Fields */}
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-zinc-400">
                                        Session name <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        autoFocus
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreate()}
                                        className="glass-input w-full px-3.5 py-2.5 text-sm"
                                        placeholder="e.g. Q2 Product BRD, Checkout Redesign…"
                                        maxLength={80}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-zinc-400">
                                        Description <span className="text-zinc-700">(optional)</span>
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        rows={3}
                                        className="glass-input w-full px-3.5 py-2.5 text-sm resize-none"
                                        placeholder="What is this BRD for? Which team, product area, or initiative?"
                                        maxLength={300}
                                    />
                                    <p className="text-right text-[10px] text-zinc-700">{description.length}/300</p>
                                </div>

                                {error && (
                                    <p className="text-xs text-red-400 bg-red-500/8 border border-red-500/20 px-3 py-2 rounded-lg">
                                        {error}
                                    </p>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-3 mt-6">
                                <button
                                    onClick={handleCreate}
                                    disabled={!name.trim() || loading || !user}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_2px_16px_rgba(255,255,255,0.10)]"
                                >
                                    {loading
                                        ? <><Loader2 size={14} className="animate-spin" /> Creating…</>
                                        : 'Create & Configure →'
                                    }
                                </button>
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2.5 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all"
                                >
                                    Cancel
                                </button>
                            </div>

                            <p className="text-center text-[10px] text-zinc-700 mt-4">
                                Saved to your Firestore workspace — visible to all collaborators
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
