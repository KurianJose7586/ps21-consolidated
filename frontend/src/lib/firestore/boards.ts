/**
 * firestore/boards.ts
 * Board CRUD with ownership and member subcollection.
 * 
 * Schema:
 *   /boards/{boardId}
 *     title, description, ownerUid, status, createdAt, updatedAt
 *   /boards/{boardId}/members/{uid}
 *     role: 'owner' | 'editor' | 'viewer', joinedAt
 */
import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    setDoc,
    query,
    where,
    collectionGroup,
    serverTimestamp,
    orderBy,
    Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ────────────────────────────────────────────────────────────────────

export type BoardStatus = 'draft' | 'active' | 'complete';
export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface Board {
    id: string;
    title: string;
    description: string;
    ownerUid: string;
    status: BoardStatus;
    createdAt: Timestamp | null;
    updatedAt: Timestamp | null;
    // Populated client-side for display
    userRole?: MemberRole;
}

export interface BoardMember {
    uid: string;
    role: MemberRole;
    joinedAt: Timestamp | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function boardFromDoc(id: string, data: Record<string, unknown>): Board {
    return {
        id,
        title: (data.title as string) ?? 'Untitled',
        description: (data.description as string) ?? '',
        ownerUid: data.ownerUid as string,
        status: (data.status as BoardStatus) ?? 'draft',
        createdAt: (data.createdAt as Timestamp) ?? null,
        updatedAt: (data.updatedAt as Timestamp) ?? null,
    };
}

// ── Board Operations ──────────────────────────────────────────────────────────

/**
 * Create a new board owned by `ownerUid`.
 * Automatically adds an 'owner' member entry in the subcollection.
 */
export async function createBoard(
    ownerUid: string,
    data: { title: string; description: string; status?: BoardStatus }
): Promise<string> {
    const boardRef = await addDoc(collection(db, 'boards'), {
        ...data,
        status: data.status ?? 'draft',
        ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    // Add owner to members subcollection
    await setDoc(doc(db, 'boards', boardRef.id, 'members', ownerUid), {
        role: 'owner',
        joinedAt: serverTimestamp(),
    });

    return boardRef.id;
}

/**
 * Ensure a board document exists in Firestore with the given ID.
 * Safe to call multiple times — uses merge so it won't overwrite existing data.
 * Also seeds the owner member entry if it doesn't exist yet.
 * Call this before any read on a board that originated from localStorage sessions.
 */
export async function ensureBoardExists(
    boardId: string,
    ownerUid: string,
    data: { title: string; description: string; status?: BoardStatus }
): Promise<void> {
    const boardRef = doc(db, 'boards', boardId);
    const memberRef = doc(db, 'boards', boardId, 'members', ownerUid);

    // setDoc with merge: won't overwrite fields that already exist
    await setDoc(boardRef, {
        title: data.title,
        description: data.description,
        status: data.status ?? 'draft',
        ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    }, { merge: true });

    // Seed the owner member doc (merge — safe if already exists)
    await setDoc(memberRef, {
        role: 'owner',
        joinedAt: serverTimestamp(),
    }, { merge: true });
}


/**
 * Get all boards the user is a member of.
 * Uses a collectionGroup query on the 'members' subcollection.
 */
export async function getUserBoards(uid: string): Promise<Board[]> {
    // Query all 'members' subcollections where the document ID equals the user UID
    const memberQuery = query(
        collectionGroup(db, 'members'),
        where('__name__', '>=', `boards/`),
    );

    // Alternative: query the members subcollection directly for this user's boards
    const snapshot = await getDocs(
        query(collectionGroup(db, 'members'), where('role', 'in', ['owner', 'editor', 'viewer']))
    );

    const boardPromises: Promise<Board | null>[] = [];

    snapshot.docs.forEach((memberDoc) => {
        const pathParts = memberDoc.ref.path.split('/');
        // Path: boards/{boardId}/members/{uid}
        if (pathParts.length === 4 && pathParts[2] === 'members' && pathParts[3] === uid) {
            const boardId = pathParts[1];
            const role = memberDoc.data().role as MemberRole;
            boardPromises.push(
                getDoc(doc(db, 'boards', boardId)).then((boardSnap) => {
                    if (!boardSnap.exists()) return null;
                    return {
                        ...boardFromDoc(boardId, boardSnap.data() as Record<string, unknown>),
                        userRole: role,
                    };
                })
            );
        }
    });

    const boards = await Promise.all(boardPromises);
    return boards.filter(Boolean) as Board[];
}

/** Simpler and more efficient: direct per-user board fetch using a subcollection query. */
export async function getUserBoardsEfficient(uid: string): Promise<Board[]> {
    // Get all member docs for this user across all boards
    const membersSnap = await getDocs(
        collection(db, `users/${uid}/boardMemberships`)
    );

    const boardPromises = membersSnap.docs.map(async (memberDoc) => {
        const { boardId, role } = memberDoc.data() as { boardId: string; role: MemberRole };
        const boardSnap = await getDoc(doc(db, 'boards', boardId));
        if (!boardSnap.exists()) return null;
        return {
            ...boardFromDoc(boardId, boardSnap.data() as Record<string, unknown>),
            userRole: role,
        };
    });

    const boards = await Promise.all(boardPromises);
    return boards.filter(Boolean) as Board[];
}

/** Get a single board by ID. */
export async function getBoard(boardId: string): Promise<Board | null> {
    const snap = await getDoc(doc(db, 'boards', boardId));
    if (!snap.exists()) return null;
    return boardFromDoc(boardId, snap.data() as Record<string, unknown>);
}

/** Update board fields. */
export async function updateBoard(boardId: string, patch: Partial<Omit<Board, 'id'>>): Promise<void> {
    await updateDoc(doc(db, 'boards', boardId), {
        ...patch,
        updatedAt: serverTimestamp(),
    });
}

/** Delete a board and all its member entries. */
export async function deleteBoard(boardId: string): Promise<void> {
    // Delete all member docs first
    const membersSnap = await getDocs(collection(db, 'boards', boardId, 'members'));
    await Promise.all(membersSnap.docs.map((d) => deleteDoc(d.ref)));
    // Delete the board itself
    await deleteDoc(doc(db, 'boards', boardId));
}

/** Get all members of a board. */
export async function getBoardMembers(boardId: string): Promise<BoardMember[]> {
    const snap = await getDocs(collection(db, 'boards', boardId, 'members'));
    return snap.docs.map((d) => ({
        uid: d.id,
        role: d.data().role as MemberRole,
        joinedAt: d.data().joinedAt ?? null,
    }));
}

/** Add or update a member's role on a board. */
export async function setMemberRole(boardId: string, uid: string, role: MemberRole): Promise<void> {
    await setDoc(doc(db, 'boards', boardId, 'members', uid), {
        role,
        joinedAt: serverTimestamp(),
    }, { merge: true });
}

/** Remove a member from a board. */
export async function removeMember(boardId: string, uid: string): Promise<void> {
    await deleteDoc(doc(db, 'boards', boardId, 'members', uid));
}
