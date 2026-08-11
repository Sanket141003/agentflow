'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { NhostProvider, useAuthenticationStatus, useUserData, useAccessToken, useSignInEmailPassword, useSignUpEmailPassword, useSignOut } from '@nhost/react';
import { nhost } from './nhost';

// Inner context — consumed by app components
interface AuthContextValue {
  user: { id: string; email: string; displayName?: string } | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthInner({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuthenticationStatus();
  const userData = useUserData();
  const token = useAccessToken();
  const { signInEmailPassword } = useSignInEmailPassword();
  const { signUpEmailPassword } = useSignUpEmailPassword();
  const { signOut: nhostSignOut } = useSignOut();

  const user = userData
    ? { id: userData.id, email: userData.email ?? '', displayName: userData.displayName || undefined }
    : null;

  const signIn = async (email: string, password: string) => {
    const { error } = await signInEmailPassword(email, password);
    if (error) return { error: error.message };
    return {};
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await signUpEmailPassword(email, password, {
      displayName,
    });
    if (error) return { error: error.message };
    return {};
  };

  const signOut = async () => {
    await nhostSignOut();
  };

  return (
    <AuthContext.Provider value={{ user, token: token || null, loading: isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <NhostProvider nhost={nhost}>
      <AuthInner>{children}</AuthInner>
    </NhostProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
