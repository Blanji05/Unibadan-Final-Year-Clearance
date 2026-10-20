import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/api';
import { realtime } from '../services/realtime';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.role === 'student' && parsed?.must_change_password) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('token')));

  // Connect realtime when authenticated
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (user && token && (!user.must_change_password || user.role !== 'student')) {
      realtime.connect(token);
    } else {
      realtime.disconnect();
    }
  }, [user]);

  // Revalidate the stored token on mount so a stale session doesn't linger.
  useEffect(() => {
    if (!localStorage.getItem('token')) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(({ user: fresh }) => {
        if (fresh?.role === 'student' && fresh?.must_change_password) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          realtime.disconnect();
          setUser(null);
          return;
        }
        setUser(fresh);
        localStorage.setItem('user', JSON.stringify(fresh));
        realtime.connect(localStorage.getItem('token'));
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        realtime.disconnect();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const persist = ({ user: nextUser, token }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
    realtime.connect(token);
    return nextUser;
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const res = await authApi.login(email, password);
        if (res?.user?.role === 'student' && res?.user?.must_change_password) {
          return { must_change_password: true, user: res.user, token: res.token };
        }
        return persist(res);
      },
      logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        realtime.disconnect();
        setUser(null);
      },
      updateUser: (updatedFields) => {
        setUser((prev) => {
          const next = { ...prev, ...updatedFields };
          localStorage.setItem('user', JSON.stringify(next));
          return next;
        });
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider.');
  return ctx;
}
