'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getStoredToken, getStoredUser, setStoredToken, setStoredUser, UserProfile } from '@/lib/api';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<UserProfile>;
  logout: () => void;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = getStoredToken();
    const savedUser = getStoredUser();

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(savedUser);
      // Verify profile with server in background
      api.getProfile()
        .then((updated) => {
          setUser(updated);
        })
        .catch(() => {
          // Token invalid, logged out by api.ts
          setUser(null);
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, pass: string): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      const res = await api.login(email, pass);
      const token = res.accessToken || (res as any).access_token;
      setToken(token);
      setUser(res.user);
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    api.logout();
  };

  const hasPermission = (perm: string) => {
    if (!user) return false;
    return user.permissions?.includes(perm) || user.roleName === 'ADMIN';
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function getRoleDefaultPath(roleName?: string): string {
  switch (roleName) {
    case 'KITCHEN':
      return '/kitchen';
    case 'DISPATCH':
      return '/dispatch';
    case 'DRIVER':
      return '/driver';
    case 'ADMIN':
    default:
      return '/admin';
  }
}
