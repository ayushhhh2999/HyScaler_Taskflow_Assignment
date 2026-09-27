import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getAccessToken } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(getAccessToken()));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      setIsLoading(false);
      return;
    }
    api.auth
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      error,
      clearError: () => setError(null),
      signIn: async (email, password) => {
        setError(null);
        try {
          await api.auth.login(email, password);
          setUser(await api.auth.me());
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Unable to sign in";
          setError(message);
          throw cause;
        }
      },
      signUp: async (name, email, password) => {
        setError(null);
        try {
          await api.auth.register(name, email, password);
          setUser(await api.auth.me());
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Unable to create account";
          setError(message);
          throw cause;
        }
      },
      signOut: async () => {
        await api.auth.logout();
        setUser(null);
      },
    }),
    [error, isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
