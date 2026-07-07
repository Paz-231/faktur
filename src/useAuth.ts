import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

interface AuthState {
  userId: string | null;
  email: string | null;
  name: string | null;
  plan: string | null;
  sessionToken: string | null;
}

const SESSION_KEY = "faktox_session";

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({
    userId: null,
    email: null,
    name: null,
    plan: null,
    sessionToken: null,
  });
  const [loading, setLoading] = useState(true);

  // Get stored session token
  const storedToken = localStorage.getItem(SESSION_KEY);

  // Validate session on load (server-side check)
  const sessionData = useQuery(
    api.auth.validateSession,
    storedToken ? { token: storedToken } : "skip" as any
  );

  const destroySession = useMutation(api.auth.destroySession);

  useEffect(() => {
    if (!storedToken) {
      // No stored session — nothing to validate
      setLoading(false);
      return;
    }
    if (sessionData === undefined) return; // still loading

    if (sessionData && sessionData !== null) {
      // Session is valid
      setAuth({
        userId: sessionData.userId,
        email: sessionData.email,
        name: sessionData.name,
        plan: sessionData.plan,
        sessionToken: storedToken,
      });
    } else if (storedToken) {
      // Session expired or invalid — clear it
      localStorage.removeItem(SESSION_KEY);
      setAuth({
        userId: null,
        email: null,
        name: null,
        plan: null,
        sessionToken: null,
      });
    }
    setLoading(false);
  }, [sessionData, storedToken]);

  const setSession = (data: { sessionToken: string; userId: string; email: string; name: string; plan: string }) => {
    localStorage.setItem(SESSION_KEY, data.sessionToken);
    setAuth({
      userId: data.userId,
      email: data.email,
      name: data.name,
      plan: data.plan,
      sessionToken: data.sessionToken,
    });
  };

  const logout = async () => {
    if (auth.sessionToken) {
      try {
        await destroySession({ token: auth.sessionToken });
      } catch {}
    }
    localStorage.removeItem(SESSION_KEY);
    setAuth({
      userId: null,
      email: null,
      name: null,
      plan: null,
      sessionToken: null,
    });
  };

  return { auth, setSession, logout, loading };
}
