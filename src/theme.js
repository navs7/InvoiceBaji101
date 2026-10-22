// Theme preference: 'auto' follows the OS; 'light' and 'dark' force it. Stored per browser.
const KEY = 'invoice-baji:theme';

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: applies for this session only */ }
  applyTheme(theme);
}
