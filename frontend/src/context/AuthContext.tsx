import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { getStoredToken, getStoredUser, setStoredAuth, clearStoredAuth, apiClient } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [token, setToken] = useState<string>(() => getStoredToken());

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setToken('');
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiClient<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (res.data?.token && res.data?.user) {
      setStoredAuth(res.data.token, res.data.user);
      setToken(res.data.token);
      setUser(res.data.user);
    } else {
      throw new Error('Invalid server response structure during authentication.');
    }
  };

  const logout = () => {
    clearStoredAuth();
    setUser(null);
    setToken('');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(token && user),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
