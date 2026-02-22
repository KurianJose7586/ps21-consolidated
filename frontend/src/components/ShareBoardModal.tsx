"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createInvite } from '@/lib/firestore/sharing';
import { getBoardMembers, removeMember, setMemberRole, ensureBoardExists, type Board, type BoardMember, type MemberRole } from '@/lib/firestore/boards';
import { getUser } from '@/lib/firestore/users';
import { X, Copy, Check, Link2, Loader2, Crown, Pencil, Eye, Trash2, AlertTriangle } from 'lucide-react';


interface ShareBoardModalProps {
    board: Board;
    isOpen: boolean;
    onClose: () => void;
}

interface MemberDisplay extends BoardMember {
    name: string;
    email: string;
}

const ROLE_OPTIONS: { value: Exclude<MemberRole, 'owner'>; label: string; description: string }[] = [
    { value: 'editor', label: 'Editor', description: 'Can view and edit' },
    { value: 'viewer', label: 'Viewer', description: 'Can view only' },
];

const ROLE_ICONS: Record<MemberRole, React.ReactNode> = {
    owner: <Crown size={14} className="text-amber-400" />,
    editor: <Pencil size={14} className="text-blue-400" />,
    viewer: <Eye size={14} className="text-zinc-400" />,
};

export function ShareBoardModal({ board, isOpen, onClose }: ShareBoardModalProps) {
    const { user } = useAuth();
    const [role, setRole] = useState<Exclude<MemberRole, 'owner'>>('editor');
    const [link, setLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [members, setMembers] = useState<MemberDisplay[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isOwner = board.ownerUid === user?.uid;

    // Load members — seed board in Firestore first if it doesn't exist yet
    useEffect(() => {
        if (!isOpen || !user) return;
        setLoadingMembers(true);

        const init = async () => {
            try {
                // Only the owner should ensure the board exists in Firestore (to avoid permission errors for others)
                if (isOwner) {
                    await ensureBoardExists(board.id, user.uid, {
                        title: board.title,
                        description: board.description,
                        status: board.status,
                    });
                }

                const rawMembers = await getBoardMembers(board.id);
                const withNames = await Promise.all(
                    rawMembers.map(async (m) => {
                        const profile = await getUser(m.uid).catch(() => null);
                        return {
                            ...m,
                            name: profile?.name ?? (m.uid === user.uid ? (user.displayName ?? 'You') : 'Unknown User'),
                            email: profile?.email ?? '',
                        };
                    })
                );
                setMembers(withNames);
            } catch (err) {
                console.error('ShareBoardModal init error:', err);
            } finally {
                setLoadingMembers(false);
            }
        };

        init();
    }, [isOpen, board.id, board.title, board.description, board.status, user]);


    const generateLink = async () => {
        if (!user) return;
        setGenerating(true);
        try {
            const token = await createInvite(
                board.id,
                board.title,
                user.uid,
                user.displayName ?? user.email ?? 'A teammate',
                role,
            );
            const url = `${window.location.origin}/invite/${token}`;
            setLink(url);
        } finally {
            setGenerating(false);
        }
    };

    const copyLink = async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRoleChange = async (uid: string, newRole: MemberRole) => {
        await setMemberRole(board.id, uid, newRole);
        setMembers((prev) => prev.map((m) => m.uid === uid ? { ...m, role: newRole } : m));
    };

    const handleRemove = async (uid: string) => {
        setError(null);
        try {
            await removeMember(board.id, uid);
            setMembers((prev) => prev.filter((m) => m.uid !== uid));
        } catch (err) {
            setError('Failed to remove member. You may not have permission.');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className="relative w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                style={{ background: 'rgba(12,12,12,0.98)' }}
            >
                {/* Error Banner */}
                {error && (
                    <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-2.5 flex items-center gap-2">
                        <AlertTriangle size={14} className="text-red-400" />
                        <span className="text-xs text-red-300">{error}</span>
                        <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/8">
                    <div>
                        <h2 className="text-white font-semibold">Share board</h2>
                        <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-[260px]">{board.title}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Invite link generator */}
                    {isOwner && (
                        <div className="space-y-3">
                            <p className="text-sm font-medium text-zinc-300">Invite via link</p>

                            <div className="flex gap-2">
                                {ROLE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => { setRole(opt.value); setLink(''); }}
                                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium border transition-all ${role === opt.value
                                            ? 'bg-white/10 border-white/20 text-white'
                                            : 'border-white/8 text-zinc-500 hover:text-zinc-300 hover:border-white/15'
                                            }`}
                                    >
                                        <div>{opt.label}</div>
                                        <div className="font-normal opacity-70 mt-0.5">{opt.description}</div>
                                    </button>
                                ))}
                            </div>

                            {link ? (
                                <div className="flex gap-2">
                                    <div className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/8 text-xs text-zinc-400 truncate flex items-center gap-2">
                                        <Link2 size={12} className="flex-shrink-0 text-zinc-600" />
                                        <span className="truncate">{link}</span>
                                    </div>
                                    <button
                                        onClick={copyLink}
                                        className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white text-zinc-900 hover:bg-zinc-100 transition-all flex items-center gap-1.5 flex-shrink-0"
                                    >
                                        {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={generateLink}
                                    disabled={generating}
                                    className="w-full py-2.5 rounded-xl text-sm font-semibold border border-white/12 text-zinc-200 hover:bg-white/5 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {generating ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : 'Generate invite link'}
                                </button>
                            )}
                            <p className="text-xs text-zinc-600">Link expires in 7 days. Can only be used once.</p>
                        </div>
                    )}

                    {/* Members list */}
                    <div className="space-y-3">
                        <p className="text-sm font-medium text-zinc-300">
                            People with access
                        </p>

                        {loadingMembers ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 size={18} className="animate-spin text-zinc-600" />
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {members.map((member) => (
                                    <div
                                        key={member.uid}
                                        className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/3 transition-colors"
                                    >
                                        {/* Avatar */}
                                        <div className="w-8 h-8 rounded-full bg-white/8 border border-white/12 flex items-center justify-center text-xs font-semibold text-zinc-300 flex-shrink-0">
                                            {member.name.charAt(0).toUpperCase()}
                                        </div>

                                        {/* Name & email */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm text-white truncate">{member.name}</span>
                                                {member.uid === user?.uid && (
                                                    <span className="text-xs text-zinc-600">(you)</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-zinc-600 truncate">{member.email}</p>
                                        </div>

                                        {/* Role */}
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {member.role === 'owner' || !isOwner || member.uid === user?.uid ? (
                                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 text-xs text-zinc-400">
                                                    {ROLE_ICONS[member.role]}
                                                    <span className="capitalize">{member.role}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <select
                                                        value={member.role}
                                                        onChange={(e) => handleRoleChange(member.uid, e.target.value as MemberRole)}
                                                        className="bg-white/5 border border-white/8 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none cursor-pointer"
                                                    >
                                                        <option value="editor">Editor</option>
                                                        <option value="viewer">Viewer</option>
                                                    </select>
                                                    <button
                                                        onClick={() => handleRemove(member.uid)}
                                                        className="p-1 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/8 transition-all"
                                                        title="Remove member"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
