import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, useEmulators } from './firebase';

interface AuthValue {
  user: User | null;
  /** True until Firebase has said whether anyone is signed in. */
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  /** Local emulator only: signs in a made-up account so the app can be tried without Google. */
  signInAsTester: ((name: string) => Promise<void>) | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function testerSignIn(name: string): Promise<void> {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.') || 'tester';
  const email = `${slug}@example.com`;
  const password = 'test-password';
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    const created = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(created.user, { displayName: name.trim() || 'Tester' });
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (next) => {
        setUser(next);
        setLoading(false);
      }),
    [],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signInWithGoogle: async () => {
        await signInWithPopup(auth, new GoogleAuthProvider());
      },
      signInAsTester: useEmulators ? testerSignIn : null,
      signOut: () => firebaseSignOut(auth),
    }),
    [user, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** The signed-in user. Only for screens that are rendered behind the sign-in gate. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('No signed-in user');
  return user;
}
