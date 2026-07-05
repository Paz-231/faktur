import { useState } from "react";

interface AuthState {
  userId: string | null;
  email: string | null;
  name: string | null;
  plan: string | null;
}

const AUTH_KEY = "faktox_auth";

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return { userId: null, email: null, name: null, plan: null };
      }
    }
    return { userId: null, email: null, name: null, plan: null };
  });

  const login = (data: AuthState) => {
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
    setAuth(data);
  };

  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    setAuth({ userId: null, email: null, name: null, plan: null });
  };

  return { auth, login, logout, isAuthed: !!auth.userId };
}
