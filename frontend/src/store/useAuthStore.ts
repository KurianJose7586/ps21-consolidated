/**
 * useAuthStore.ts
 * Thin Zustand wrapper around Firebase Auth.
 * Preserves the same API (.isAuthenticated, .user, .login, .logout, .updateUser)
 * so existing components need zero changes.
 *
 * Real auth state lives in AuthContext (onAuthStateChanged).
 * This store is a convenience bridge for components that already use it.
 */
import { create } from 'zustand';
import {
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    AuthError,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { updateUser as updateUserInFirestore } from '@/lib/firestore/users';

export interface AuthUser {
    uid: string;
    name: string;
    email: string;
    photoURL?: string;
}

interface AuthStore {
    isAuthenticated: boolean;
    user: AuthUser | null;
    loading: boolean;
    error: string | null;
    // Actions
    login: (email: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    updateUser: (name: string, email: string) => Promise<void>;
    // Internal — called by AuthProvider to sync Firebase state
    _syncFromFirebase: (user: AuthUser | null) => void;
    clearError: () => void;
}

function mapError(err: AuthError): string {
    switch (err.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            return 'Invalid email or password.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please wait.';
        case 'auth/network-request-failed':
            return 'Network error. Check your connection.';
        default:
            return 'Authentication failed. Please try again.';
    }
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
    isAuthenticated: false,
    user: null,
    loading: false,
    error: null,

    _syncFromFirebase: (user) => {
        set({ user, isAuthenticated: !!user });
    },

    login: async (email, password) => {
        set({ loading: true, error: null });
        try {
            await signInWithEmailAndPassword(auth, email, password);
            set({ loading: false });
            return true;
        } catch (err) {
            const msg = mapError(err as AuthError);
            set({ loading: false, error: msg });
            return false;
        }
    },

    logout: async () => {
        await signOut(auth);
        set({ isAuthenticated: false, user: null });
    },

    updateUser: async (name, email) => {
        const { user } = get();
        if (!user) return;
        const currentUser = auth.currentUser;
        if (currentUser) {
            await updateProfile(currentUser, { displayName: name });
            await updateUserInFirestore(user.uid, { name, email });
        }
        set((state) => ({
            user: state.user ? { ...state.user, name, email } : null,
        }));
    },

    clearError: () => set({ error: null }),
}));
