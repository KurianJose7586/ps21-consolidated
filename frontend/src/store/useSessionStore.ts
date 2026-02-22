/**
 * useSessionStore.ts
 * Firestore-backed session store.
 *
 * All sessions are stored in Firestore:
 *   /boards/{boardId}               — board document (title, description, ownerUid, status …)
 *   /users/{uid}/boards/{boardId}   — lightweight membership index (boardTitle, role, joinedAt)
 *
 * On login, `initSessions(uid)` reads from /users/{uid}/boards to populate the list.
 * This means EVERY user automatically sees their own boards AND shared boards.
 *
 * The backend session ID (from FastAPI) is used directly as the boardId so the rest of
 * the app (BRD generation, ingestion) continues to work unchanged.
 */
import { create } from 'zustand';
import {
    doc,
    setDoc,
    getDocs,
    deleteDoc,
    collection,
    serverTimestamp,
    getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface BRDSession {
    id: string;
    name: string;
    description: string;
    status: 'active' | 'complete' | 'draft';
    createdAt: string;
    role?: string;        // 'owner' | 'editor' | 'viewer' — populated from membership index
    sections?: number;
    signals?: number;
    words?: number;
}

interface SessionStore {
    sessions: BRDSession[];
    activeSessionId: string | null;
    loading: boolean;
    error: string | null;

    /** Load all boards for a user from Firestore /users/{uid}/boards. Call on login. */
    initSessions: (uid: string) => Promise<void>;

    /**
     * Add a session to Firestore and the local list.
     * `ownerUid` is the Firebase user UID.
     * `sessionId` is the backend-assigned ID (from FastAPI /sessions POST).
     */
    addSession: (
        name: string,
        description: string,
        ownerUid: string,
        sessionId: string,
    ) => Promise<string>;

    setActive: (id: string) => void;
    updateSession: (id: string, patch: Partial<Omit<BRDSession, 'id'>>) => void;
    removeSession: (id: string, uid: string) => Promise<void>;
}

export const useSessionStore = create<SessionStore>()((set, get) => ({
    sessions: [],
    activeSessionId: null,
    loading: false,
    error: null,

    // ── Init: load all boards from Firestore for this user ────────────────────
    initSessions: async (uid) => {
        set({ loading: true, error: null });
        try {
            const snap = await getDocs(collection(db, 'users', uid, 'boards'));
            const sessions: BRDSession[] = snap.docs.map((d) => ({
                id: d.data().boardId as string,
                name: (d.data().boardTitle as string) || 'Untitled BRD',
                description: (d.data().description as string) || '',
                status: (d.data().status as BRDSession['status']) || 'draft',
                role: d.data().role as string,
                createdAt: d.data().joinedAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
            }));

            // Sort newest first
            sessions.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

            set({
                sessions,
                // Keep active if it still exists, else pick first
                activeSessionId:
                    sessions.find((s) => s.id === get().activeSessionId)?.id ??
                    sessions[0]?.id ??
                    null,
            });
        } catch (e) {
            set({ error: e instanceof Error ? e.message : 'Failed to load sessions' });
        } finally {
            set({ loading: false });
        }
    },

    // ── Create: write to Firestore then update local state ────────────────────
    addSession: async (name, description, ownerUid, sessionId) => {
        set({ loading: true, error: null });
        try {
            // 1. Write board document (creates it with the backend session ID)
            await setDoc(doc(db, 'boards', sessionId), {
                title: name,
                description,
                ownerUid,
                status: 'draft',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            // 2. Write owner member entry
            await setDoc(doc(db, 'boards', sessionId, 'members', ownerUid), {
                role: 'owner',
                joinedAt: serverTimestamp(),
            });

            // 3. Write user-level membership index so dashboard can list it
            await setDoc(doc(db, 'users', ownerUid, 'boards', sessionId), {
                boardId: sessionId,
                boardTitle: name,
                description,
                role: 'owner',
                status: 'draft',
                joinedAt: serverTimestamp(),
            });

            const newSession: BRDSession = {
                id: sessionId,
                name,
                description,
                status: 'draft',
                role: 'owner',
                createdAt: new Date().toISOString(),
            };

            set((state) => ({
                sessions: [newSession, ...state.sessions],
                activeSessionId: sessionId,
            }));

            return sessionId;
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to create session';
            set({ error: msg });
            throw new Error(msg);
        } finally {
            set({ loading: false });
        }
    },

    setActive: (id) => set({ activeSessionId: id }),

    updateSession: (id, patch) =>
        set((state) => ({
            sessions: state.sessions.map((s) =>
                s.id === id ? { ...s, ...patch } : s
            ),
        })),

    removeSession: async (id, uid) => {
        try {
            // Remove from Firestore membership index
            await deleteDoc(doc(db, 'users', uid, 'boards', id));
        } catch { /* ignore */ }

        const state = get();
        set({
            sessions: state.sessions.filter((s) => s.id !== id),
            activeSessionId:
                state.activeSessionId === id
                    ? (state.sessions.find((s) => s.id !== id)?.id ?? null)
                    : state.activeSessionId,
        });
    },
}));
