// Run in the document head so the saved palette is applied before first paint.
(() => {
  const storageKey = 'chenli-theme';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const validTheme = value => value === 'light' || value === 'dark';
  let preference = null;

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (validTheme(saved)) preference = saved;
  } catch {
    // The switch still works when browser storage is unavailable.
  }

  const applyTheme = () => {
    const theme = preference || (system.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#18171a' : '#faf9f7');
    const toggle = document.querySelector('[data-theme-toggle]');
    if (toggle) {
      toggle.setAttribute('aria-checked', String(theme === 'dark'));
      toggle.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  };

  applyTheme();

  const bindToggle = () => {
    const toggle = document.querySelector('[data-theme-toggle]');
    if (!toggle) return;
    applyTheme();
    toggle.addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { window.localStorage.setItem(storageKey, preference); } catch { /* Keep the in-page choice. */ }
      applyTheme();
    });
    toggle.hidden = false;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindToggle, { once: true });
  else bindToggle();

  const followSystem = () => { if (!preference) applyTheme(); };
  if (system.addEventListener) system.addEventListener('change', followSystem);
  else system.addListener(followSystem);

  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = validTheme(event.newValue) ? event.newValue : null;
    applyTheme();
  });
})();
