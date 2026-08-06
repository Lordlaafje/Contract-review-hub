const KEY = 'hf_legal_token';
export const getToken = () => localStorage.getItem(KEY) || '';
export const setToken = (t) => localStorage.setItem(KEY, t);
export const logout = () => {
  const t = getToken();
  localStorage.removeItem(KEY);
  // Invalidate server-side too (fire-and-forget).
  if (t) fetch('/api/logout', { method: 'POST', headers: { authorization: `Bearer ${t}` } }).catch(() => {});
};
export const isAuthed = () => !!getToken();
export const authHeader = () => {
  const t = getToken();
  return t ? { authorization: `Bearer ${t}` } : {};
};
