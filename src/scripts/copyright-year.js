const yearElement = document.querySelector('[data-copyright-year]');

if (yearElement) {
  // Keep the year current even when the public service is unavailable.
  yearElement.textContent = new Intl.DateTimeFormat('en', {
    year: 'numeric', timeZone: 'Asia/Hong_Kong',
  }).format(new Date());

  const refreshYear = async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=Asia%2FHong_Kong', {
        signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
      });
      if (!response.ok) return;
      const { year } = await response.json();
      if (Number.isInteger(year) && year >= 2000 && year <= 9999) {
        yearElement.textContent = String(year);
      }
    } catch {
      // Network errors, invalid JSON, and timeouts keep the local-clock fallback.
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const scheduleRefresh = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(refreshYear, { timeout: 1500 });
    else window.setTimeout(refreshYear, 0);
  };
  if (document.readyState === 'complete') scheduleRefresh();
  else window.addEventListener('load', scheduleRefresh, { once: true });
}
