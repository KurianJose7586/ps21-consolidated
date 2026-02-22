/**
 * firebaseAdmin.ts
 * Firebase Admin SDK for server-side operations (API Routes, Server Actions).
 * NEVER import this in client components — it contains secret credentials.
 */
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminApp: App;
let adminAuth: Auth;
let adminDb: Firestore;

function getAdminApp(): App {
    if (!adminApp) {
        const existingApps = getApps();
        if (existingApps.length > 0) {
            adminApp = existingApps[0];
        } else {
            adminApp = initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
                    // Replace escaped newlines from environment variable string
                    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                }),
            });
        }
    }
    return adminApp;
}

export function getAdminAuth(): Auth {
    if (!adminAuth) adminAuth = getAuth(getAdminApp());
    return adminAuth;
}

export function getAdminDb(): Firestore {
    if (!adminDb) adminDb = getFirestore(getAdminApp());
    return adminDb;
}
