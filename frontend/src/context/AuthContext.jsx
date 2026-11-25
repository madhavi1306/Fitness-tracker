import { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../services/api.js';

const AuthContext = createContext(null);
const TOKEN_KEY = 'formline.session';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let active = true;
    apiRequest('/auth/me', { token })
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        if (active) {
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  async function acceptSession(credentials, endpoint) {
    const result = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    localStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }

  function login(credentials) {
    return acceptSession(credentials, '/auth/login');
  }

  function register(details) {
    return acceptSession(details, '/auth/register');
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    const { user: currentUser } = await apiRequest('/profile', { token });
    setUser(currentUser);
    return currentUser;
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
