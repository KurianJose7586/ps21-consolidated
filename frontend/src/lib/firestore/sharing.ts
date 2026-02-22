/**
 * firestore/sharing.ts
 * Board invitation / sharing system.
 * 
 * Schema:
 *   /invites/{token}
 *     boardId, boardTitle, invitedByUid, invitedByName,
 *     role, createdAt, expiresAt (7 days), used: boolean
 */
import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { setMemberRole, type MemberRole } from '@/lib/firestore/boards';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Invite {
    token: string;
    boardId: string;
    boardTitle: string;
    invitedByUid: string;
    invitedByName: string;
    role: MemberRole;
    createdAt: Timestamp | null;
    expiresAt: Timestamp | null;
    used: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a cryptographically random token. */
function generateToken(): string {
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Seven days from now as a JS Date. */
function sevenDaysFromNow(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
}

// ── Operations ────────────────────────────────────────────────────────────────

/**
 * Create an invitation token for a board.
 * Returns the token string (used to construct the shareable URL).
 */
export async function createInvite(
    boardId: string,
    boardTitle: string,
    invitedByUid: string,
    invitedByName: string,
    role: Exclude<MemberRole, 'owner'>,
): Promise<string> {
    const token = generateToken();
    const expiresAt = Timestamp.fromDate(sevenDaysFromNow());

    await setDoc(doc(db, 'invites', token), {
        boardId,
        boardTitle,
        invitedByUid,
        invitedByName,
        role,
        createdAt: serverTimestamp(),
        expiresAt,
        used: false,
    });

    return token;
}

/**
 * Fetch an invite by token.
 * Returns null if not found, already used, or expired.
 */
export async function getInvite(token: string): Promise<Invite | null> {
    const snap = await getDoc(doc(db, 'invites', token));
    if (!snap.exists()) return null;

    const data = snap.data() as Omit<Invite, 'token'>;

    // Check if already used
    if (data.used) return null;

    // Check expiry
    const now = Timestamp.now();
    if (data.expiresAt && data.expiresAt.toMillis() < now.toMillis()) return null;

    return { ...data, token };
}

/**
 * Accept an invitation — grants the recipient access to the board.
 * Marks the invite as used, and writes a user-level membership index
 * so the dashboard can show shared boards without a collectionGroup query.
 */
export async function acceptInvite(token: string, recipientUid: string): Promise<string> {
    const invite = await getInvite(token);
    if (!invite) throw new Error('Invite is invalid, expired, or already used.');

    // Add recipient to board members with the specified role
    await setMemberRole(invite.boardId, recipientUid, invite.role);

    // Write user-level membership index for dashboard lookup
    await setDoc(doc(db, 'users', recipientUid, 'boards', invite.boardId), {
        boardId: invite.boardId,
        boardTitle: invite.boardTitle,
        role: invite.role,
        joinedAt: serverTimestamp(),
    });

    // Mark invite as used
    await updateDoc(doc(db, 'invites', token), { used: true });

    return invite.boardId;
}

/**
 * Get all board memberships for a user from their /users/{uid}/boards subcollection.
 * Returns an array of { boardId, boardTitle, role } objects.
 */
export async function getUserBoardMemberships(uid: string): Promise<{
    boardId: string;
    boardTitle: string;
    role: MemberRole;
    joinedAt: Timestamp | null;
}[]> {
    const { collection, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(collection(db, 'users', uid, 'boards'));
    return snap.docs.map((d) => ({
        boardId: d.data().boardId as string,
        boardTitle: d.data().boardTitle as string,
        role: d.data().role as MemberRole,
        joinedAt: (d.data().joinedAt as Timestamp) ?? null,
    }));
}

