/**
 * firestore/users.ts
 * Firestore CRUD operations for the /users collection.
 */
import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface UserProfile {
    name: string;
    email: string;
    photoURL?: string;
    createdAt?: unknown;
}

/** Create a user document in Firestore after signup. */
export async function createUser(uid: string, data: Omit<UserProfile, 'createdAt'>): Promise<void> {
    await setDoc(doc(db, 'users', uid), {
        ...data,
        createdAt: serverTimestamp(),
    });
}

/** Fetch a user profile by UID. Returns null if not found. */
export async function getUser(uid: string): Promise<UserProfile | null> {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
}

/** Update specific fields on a user document. */
export async function updateUser(uid: string, patch: Partial<UserProfile>): Promise<void> {
    await updateDoc(doc(db, 'users', uid), patch);
}
