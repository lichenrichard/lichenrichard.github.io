import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/scripts/theme.js', import.meta.url), 'utf8');
const storageKey = 'chenli-theme';
const colors = {light: '#faf9f7', dark: '#18171a'};

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, callback, options) {
      const entries = listeners.get(type) ?? [];
      entries.push({callback, once: typeof options === 'object' && options?.once});
      listeners.set(type, entries);
    },
    removeEventListener(type, callback) {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry.callback !== callback));
    },
    dispatchEvent(event) {
      for (const entry of [...(listeners.get(event.type) ?? [])]) {
        if (entry.once) this.removeEventListener(event.type, entry.callback);
        entry.callback.call(this, {...event, target: event.target ?? this});
      }
      return true;
    },
  };
}

function element(initialAttributes = {}) {
  const attributes = new Map(Object.entries(initialAttributes));
  return {
    ...eventTarget(),
    dataset: {},
    style: {},
    hidden: Object.hasOwn(initialAttributes, 'hidden'),
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) {
      attributes.set(name, String(value));
      if (name === 'hidden') this.hidden = true;
      if (name === 'data-theme') this.dataset.theme = String(value);
    },
    removeAttribute(name) {
      attributes.delete(name);
      if (name === 'hidden') this.hidden = false;
      if (name === 'data-theme') delete this.dataset.theme;
    },
    get content() { return attributes.get('content') ?? ''; },
    set content(value) { attributes.set('content', String(value)); },
  };
}

/** Run the unmodified head script in an isolated browser-shaped environment. */
function boot({
  systemDark = false,
  saved = null,
  readyState = 'loading',
  hasToggle = true,
  blockedRead = false,
  blockedWrite = false,
  blockedAccess = false,
  legacyMedia = false,
} = {}) {
  const stored = new Map(saved === null ? [] : [[storageKey, saved]]);
  const writes = [];
  const storage = {
    getItem(key) {
      if (blockedRead) throw new Error('Storage is unavailable');
      return stored.get(key) ?? null;
    },
    setItem(key, value) {
      if (blockedWrite) throw new Error('Storage is unavailable');
      writes.push([key, String(value)]);
      stored.set(key, String(value));
    },
    removeItem(key) {
      if (blockedWrite) throw new Error('Storage is unavailable');
      stored.delete(key);
    },
  };
  const root = element();
  const meta = element({name: 'theme-color', content: colors.light});
  const toggle = hasToggle ? element({
    'data-theme-toggle': '', role: 'switch', 'aria-label': 'Dark mode', 'aria-checked': 'false', hidden: '',
  }) : null;
  const document = {
    ...eventTarget(),
    readyState,
    documentElement: root,
    querySelector(selector) {
      // The inline head script runs before body controls have been parsed.
      if (selector === '[data-theme-toggle]') return this.readyState === 'loading' ? null : toggle;
      if (/^meta\[name=["']theme-color["']\]$/.test(selector)) return meta;
      return null;
    },
    querySelectorAll(selector) {
      const result = this.querySelector(selector);
      return result ? [result] : [];
    },
  };
  const mediaEvents = eventTarget();
  const media = {
    ...mediaEvents,
    matches: systemDark,
    media: '(prefers-color-scheme: dark)',
    addListener(callback) { mediaEvents.addEventListener('change', callback); },
    removeListener(callback) { mediaEvents.removeEventListener('change', callback); },
  };
  if (legacyMedia) delete media.addEventListener;
  const browser = {
    ...eventTarget(),
    document,
    localStorage: storage,
    matchMedia(query) {
      assert.equal(query, '(prefers-color-scheme: dark)');
      return media;
    },
    console,
  };
  if (blockedAccess) Object.defineProperty(browser, 'localStorage', {
    get() { throw new Error('Access to localStorage is blocked'); },
  });
  browser.window = browser;
  browser.self = browser;
  vm.runInNewContext(source, browser, {filename: 'src/scripts/theme.js', timeout: 1000});

  return {
    root, meta, toggle, writes, stored,
    ready() {
      document.readyState = 'interactive';
      document.dispatchEvent({type: 'DOMContentLoaded'});
    },
    click() {
      assert.ok(toggle, 'Test requires a toggle');
      toggle.dispatchEvent({type: 'click', preventDefault() {}});
    },
    systemChange(matches) {
      media.matches = matches;
      media.dispatchEvent({type: 'change', matches, media: media.media});
    },
    storageChange(key, newValue) {
      const oldValue = stored.get(key) ?? null;
      if (key === null) stored.clear();
      else if (newValue === null) stored.delete(key);
      else stored.set(key, newValue);
      browser.dispatchEvent({type: 'storage', key, oldValue, newValue, storageArea: storage});
    },
  };
}

function assertTheme(browser, theme, {controlReady = true} = {}) {
  assert.equal(browser.root.dataset.theme, theme, 'root theme');
  assert.equal(browser.root.style.colorScheme, theme, 'native control color scheme');
  assert.equal(browser.meta.content, colors[theme], 'browser theme color');
  if (controlReady && browser.toggle) {
    assert.equal(browser.toggle.hidden, false, 'working toggle is revealed');
    assert.equal(browser.toggle.getAttribute('role'), 'switch');
    assert.equal(browser.toggle.getAttribute('aria-label'), 'Dark mode');
    assert.equal(browser.toggle.getAttribute('aria-checked'), String(theme === 'dark'));
  }
}

test('head execution applies the system preference before DOMContentLoaded', () => {
  for (const [systemDark, theme] of [[false, 'light'], [true, 'dark']]) {
    const browser = boot({systemDark});
    assertTheme(browser, theme, {controlReady: false});
    assert.equal(browser.toggle.hidden, true, 'control remains hidden before initialization');
    browser.ready();
    assertTheme(browser, theme);
  }
});

test('valid saved light and dark choices override the system preference', () => {
  const light = boot({saved: 'light', systemDark: true, readyState: 'complete'});
  assertTheme(light, 'light');
  light.systemChange(false);
  light.systemChange(true);
  assertTheme(light, 'light');

  const dark = boot({saved: 'dark', systemDark: false, readyState: 'complete'});
  assertTheme(dark, 'dark');
  dark.systemChange(true);
  dark.systemChange(false);
  assertTheme(dark, 'dark');
});

test('unrecognized saved values follow the system instead of becoming a theme', () => {
  for (const saved of ['', 'system', 'DARK', 'unexpected']) {
    const browser = boot({saved, systemDark: true, readyState: 'complete'});
    assertTheme(browser, 'dark');
    browser.systemChange(false);
    assertTheme(browser, 'light');
  }
});

test('late script execution binds and reveals the toggle immediately', () => {
  for (const readyState of ['interactive', 'complete']) {
    const browser = boot({readyState});
    assertTheme(browser, 'light');
    browser.click();
    assertTheme(browser, 'dark');
  }
});

test('click toggles effective mode, synchronizes accessibility state, and persists the choice', () => {
  const browser = boot({systemDark: true});
  browser.ready();
  browser.click();
  assertTheme(browser, 'light');
  assert.equal(browser.stored.get(storageKey), 'light');
  browser.click();
  assertTheme(browser, 'dark');
  assert.equal(browser.stored.get(storageKey), 'dark');
  assert.deepEqual(browser.writes, [[storageKey, 'light'], [storageKey, 'dark']]);
});

test('blocked storage reads and writes do not prevent initialization or user selection', () => {
  const browser = boot({blockedRead: true, blockedWrite: true, systemDark: true, readyState: 'complete'});
  assertTheme(browser, 'dark');
  browser.click();
  assertTheme(browser, 'light');
  // Even an unsaved explicit choice remains effective during this page visit.
  browser.systemChange(false);
  browser.systemChange(true);
  assertTheme(browser, 'light');
  browser.click();
  assertTheme(browser, 'dark');
});

test('a blocked localStorage property itself also permits an in-page choice', () => {
  const browser = boot({blockedAccess: true, readyState: 'complete'});
  assertTheme(browser, 'light');
  browser.click();
  assertTheme(browser, 'dark');
});

test('live system changes apply until the user explicitly selects a mode', () => {
  const browser = boot({readyState: 'complete'});
  assertTheme(browser, 'light');
  browser.systemChange(true);
  assertTheme(browser, 'dark');
  browser.systemChange(false);
  assertTheme(browser, 'light');
  assert.deepEqual(browser.writes, [], 'following the system does not save an override');
  browser.click();
  assertTheme(browser, 'dark');
  browser.systemChange(true);
  browser.systemChange(false);
  assertTheme(browser, 'dark');
});

test('the legacy MediaQueryList listener path follows system changes', () => {
  const browser = boot({legacyMedia: true, readyState: 'complete'});
  assertTheme(browser, 'light');
  browser.systemChange(true);
  assertTheme(browser, 'dark');
  browser.systemChange(false);
  assertTheme(browser, 'light');
});

test('cross-tab theme changes update the page without writing back to storage', () => {
  const browser = boot({systemDark: true, readyState: 'complete'});
  browser.storageChange(storageKey, 'light');
  assertTheme(browser, 'light');
  browser.storageChange(storageKey, 'dark');
  assertTheme(browser, 'dark');
  browser.storageChange('unrelated-setting', 'light');
  assertTheme(browser, 'dark');
  assert.deepEqual(browser.writes, [], 'storage events should not cause a write feedback loop');
});

test('removed, invalid, and cleared storage preferences restore live system following', () => {
  for (const [key, value] of [[storageKey, null], [storageKey, 'invalid'], [null, null]]) {
    const browser = boot({saved: 'dark', systemDark: false, readyState: 'complete'});
    assertTheme(browser, 'dark');
    browser.storageChange(key, value);
    assertTheme(browser, 'light');
    browser.systemChange(true);
    assertTheme(browser, 'dark');
    browser.systemChange(false);
    assertTheme(browser, 'light');
  }
});

test('pages without a toggle still receive the selected theme and subsequent updates', () => {
  const browser = boot({hasToggle: false, systemDark: true});
  assertTheme(browser, 'dark');
  browser.ready();
  browser.systemChange(false);
  assertTheme(browser, 'light');
  browser.storageChange(storageKey, 'dark');
  assertTheme(browser, 'dark');
});
