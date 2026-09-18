import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const json = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const read = path => readFileSync(path, 'utf8');
const projects = json('src/data/projects.json');
const origin = 'https://chenli.me';
let files = [];
let pages = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function decode(value = '') {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…' };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1]?.toLowerCase() === 'x' ? 2 : 1), entity[1]?.toLowerCase() === 'x' ? 16 : 10));
    return named[entity.toLowerCase()] ?? whole;
  });
}

const normalizedText = value => decode(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// A small scanner for build-generated markup: quoted attribute values can
// contain >; script/style bodies and comments are not interpreted as markup.
function tags(html) {
  const markup = html.replace(/<!--[\s\S]*?-->/g, '').replace(/(<(?:script|style)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>)[\s\S]*?<\/(?:script|style)>/gi, '$1');
  return [...markup.matchAll(/<([a-z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi)].map(match => {
    const attrs = {};
    for (const attribute of match[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[attribute[1].toLowerCase()] = decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
    }
    return { name: match[1].toLowerCase(), attrs };
  });
}

function pageUrl(path) {
  const local = relative(dist, path).split(sep).join('/');
  return new URL(local === 'index.html' ? '/' : `/${local}`, origin);
}

function localTarget(value, page) {
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return null;
  const url = new URL(value, pageUrl(page));
  const pathname = decodeURIComponent(url.pathname);
  let path = resolve(dist, `.${pathname}`);
  assert.ok(path === dist || path.startsWith(`${dist}${sep}`), `Local path escaped dist: ${value}`);
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  // Static hosts commonly serve /name from /name.html.
  else if (!existsSync(path) && !extname(path) && existsSync(`${path}.html`)) path += '.html';
  return { path, hash: decodeURIComponent(url.hash.slice(1)).split(':~:text=')[0] };
}

function meta(html) {
  const elements = tags(html);
  return {
    title: normalizedText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    description: elements.find(tag => tag.name === 'meta' && tag.attrs.name === 'description')?.attrs.content ?? '',
    canonical: elements.find(tag => tag.name === 'link' && tag.attrs.rel === 'canonical')?.attrs.href ?? '',
    noindex: elements.some(tag => tag.name === 'meta' && tag.attrs.name === 'robots' && /noindex/i.test(tag.attrs.content)),
  };
}

before(() => {
  assert.ok(existsSync(join(dist, 'index.html')), 'Build the website first with npm run build.');
  files = walk(dist);
  pages = files.filter(path => path.endsWith('.html'));
});

test('public pages and research project routes are generated', () => {
  const routes = ['index.html', 'about.html', 'project.html', 'publication.html', 'teaching.html', '404.html'];
  assert.ok(projects.length > 0, 'No research projects are configured');
  assert.equal(new Set(projects.map(project => project.id)).size, projects.length, 'Project route IDs must be unique');
  routes.push(...projects.map(project => `${project.id}.html`));
  for (const path of routes) {
    assert.ok(existsSync(join(dist, path)), `Missing generated page: /${path}`);
  }
});

test('all configured publications, titles, and stable IDs are in the initial HTML', () => {
  const publications = json('src/data/publications.json');
  assert.ok(publications.length > 0, 'No publications are configured');
  assert.equal(new Set(publications.map(item => item.id)).size, publications.length, 'Publication IDs must be unique');
  const html = read(join(dist, 'publication.html'));
  const visibleText = normalizedText(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
  const rendered = tags(html).filter(tag => Object.hasOwn(tag.attrs, 'data-publication'));
  assert.equal(rendered.length, publications.length, 'Bibliography is incomplete before JavaScript runs');
  assert.deepEqual(rendered.map(tag => tag.attrs.id).sort(), publications.map(item => item.id).sort());
  for (const publication of publications) {
    assert.ok(visibleText.includes(normalizedText(publication.title)), `Missing publication title: ${publication.title}`);
  }
});

test('every built HTML page has valid internal href, src, poster, srcset, and fragment targets', () => {
  const htmlFiles = files.filter(path => path.endsWith('.html'));
  const ids = new Map(htmlFiles.map(path => [path, new Set(tags(read(path)).flatMap(tag => [tag.attrs.id, tag.name === 'a' ? tag.attrs.name : undefined].filter(Boolean)))]));
  const errors = [];
  for (const page of htmlFiles) {
    for (const { attrs } of tags(read(page))) {
      const references = ['href', 'src', 'poster'].filter(attr => attrs[attr]).map(attr => ({ attr, value: attrs[attr] }));
      if (attrs.srcset && !attrs.srcset.startsWith('data:')) {
        references.push(...attrs.srcset.split(',').map(candidate => ({ attr: 'srcset', value: candidate.trim().split(/\s+/)[0] })));
      }
      for (const { attr, value } of references) {
        const target = localTarget(value, page);
        if (!target) continue;
        const location = `${relative(dist, page)} ${attr}="${value}"`;
        if (!existsSync(target.path)) errors.push(`Missing resource: ${location}`);
        else if (attr === 'href' && target.hash && ids.has(target.path) && !ids.get(target.path).has(target.hash)) errors.push(`Missing fragment: ${location}`);
      }
    }
  }
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('pages have distinct titles, descriptions, and canonical URLs', () => {
  const seen = { title: new Set(), description: new Set(), canonical: new Set() };
  for (const page of pages) {
    const metadata = meta(read(page));
    for (const property of Object.keys(seen)) {
      assert.ok(metadata[property].trim(), `Missing ${property} on ${relative(dist, page)}`);
      assert.ok(!seen[property].has(metadata[property]), `Duplicate ${property} on ${relative(dist, page)}: ${metadata[property]}`);
      seen[property].add(metadata[property]);
    }
    const canonical = new URL(metadata.canonical);
    assert.equal(canonical.origin, origin, `Unexpected canonical origin on ${relative(dist, page)}`);
    assert.equal(canonical.search + canonical.hash, '', 'Canonicals must not include filter states or fragments');
    const target = localTarget(canonical.pathname, page);
    assert.ok(target && existsSync(target.path), `Canonical does not resolve locally: ${metadata.canonical}`);
    assert.equal(resolve(target.path), resolve(page), `Canonical points to a different page: ${relative(dist, page)}`);
  }
});

test('the sitemap contains indexable pages, resolves locally, and excludes non-indexable pages', () => {
  const sitemaps = files.filter(path => /sitemap[^/\\]*\.xml$/.test(path));
  assert.ok(sitemaps.length > 0, 'No sitemap was generated');
  const sitemapHtml = sitemaps.map(read).join('\n');
  const urls = [...sitemapHtml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map(match => new URL(decode(match[1].trim())));
  const sitemapPages = new Set();
  for (const url of urls) {
    assert.equal(url.origin, origin, `Unexpected sitemap origin: ${url.href}`);
    const target = localTarget(url.pathname, join(dist, 'index.html'));
    assert.ok(target && existsSync(target.path), `Broken sitemap URL: ${url.href}`);
    if (target.path.endsWith('.html')) sitemapPages.add(url.href);
  }
  for (const page of pages) {
    const metadata = meta(read(page));
    if (metadata.noindex || relative(dist, page).endsWith('404.html')) {
      assert.ok(!sitemapPages.has(metadata.canonical), `Non-indexable page appears in sitemap: ${metadata.canonical}`);
    } else {
      assert.ok(sitemapPages.has(metadata.canonical), `Indexable page missing from sitemap: ${metadata.canonical}`);
    }
  }
});

test('YouTube players are deferred until interaction', () => {
  for (const page of pages) {
    for (const element of tags(read(page))) {
      assert.ok(!(element.name === 'iframe' && /(?:youtube(?:-nocookie)?\.com|youtu\.be)/i.test(element.attrs.src ?? '')), `YouTube iframe loads eagerly on ${relative(dist, page)}`);
    }
  }
  const media = json('src/data/media.json').filter(item => item.videoId);
  const projectIds = projects.map(project => project.id);
  const projectMarkup = new Map(projectIds.map(id => [id, tags(read(join(dist, `${id}.html`)))]));
  const previews = [...projectMarkup.values()].flat().filter(tag => tag.attrs['data-video-id']);
  assert.ok(media.length > 0, 'No project videos are configured');
  assert.deepEqual(previews.map(tag => tag.attrs['data-video-id']).sort(), media.map(item => item.videoId).sort(), 'Every project video needs a click-to-load preview');
  for (const item of media) {
    const elements = projectMarkup.get(item.projectId) ?? [];
    assert.ok(elements.some(tag => tag.attrs['data-video-id'] === item.videoId && tag.attrs.class?.split(/\s+/).includes('video-facade')), `Missing video preview on ${item.projectId}.html: ${item.title}`);
    assert.ok(elements.some(tag => tag.name === 'a' && tag.attrs.href === item.url && tag.attrs.class?.split(/\s+/).includes('play-control')), `Missing play control on ${item.projectId}.html: ${item.title}`);
  }
});

test('compressed first-party JavaScript stays below the 20 KB site-wide budget', t => {
  const scripts = files.filter(path => /\.(?:m?js)$/.test(path));
  const inline = new Set();
  for (const page of pages) {
    for (const match of read(page).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (match[2].trim() && !/\btype\s*=\s*["']application\/(?:ld\+)?json["']/i.test(match[1])) inline.add(match[2]);
    }
  }
  const bytes = scripts.reduce((total, path) => total + gzipSync(readFileSync(path)).length, 0) + [...inline].reduce((total, script) => total + gzipSync(script).length, 0);
  t.diagnostic(`All first-party JavaScript, individually gzipped, including unique inline scripts: ${bytes.toLocaleString()} bytes.`);
  assert.ok(bytes < 20_000, `JavaScript exceeds the 20 KB budget: ${bytes} bytes`);
});

test('estimated homepage initial local payload stays below 500 KB', t => {
  const home = join(dist, 'index.html');
  const html = read(home);
  const elements = tags(html);
  const assets = new Set();
  for (const { name, attrs } of elements) {
    if ((name === 'link' && /(?:stylesheet|modulepreload|preload)/.test(attrs.rel ?? '')) || name === 'script') {
      const target = localTarget(attrs.href || attrs.src, home);
      if (target) assets.add(target.path);
    }
    if (name === 'img' && attrs.loading !== 'lazy') {
      // Count the largest responsive candidate so this is conservative across
      // screen densities, not a claim about any particular browser waterfall.
      const candidates = [attrs.src, ...(attrs.srcset ?? '').split(',').map(value => value.trim().split(/\s+/)[0])].filter(Boolean).map(value => localTarget(value, home)).filter(Boolean);
      const largest = candidates.sort((a, b) => statSync(b.path).size - statSync(a.path).size)[0];
      if (largest) assets.add(largest.path);
    }
  }
  // Include all current site JS to conservatively cover imported module chunks.
  for (const path of files.filter(path => /\.(?:m?js)$/.test(path))) assets.add(path);
  let bytes = gzipSync(html).length;
  for (const path of assets) bytes += /\.(?:html|css|m?js|svg)$/.test(path) ? gzipSync(readFileSync(path)).length : statSync(path).size;
  t.diagnostic(`Estimated homepage local initial payload: ${bytes.toLocaleString()} bytes (gzip HTML/CSS/JS, eager images at largest candidate, and all site JS; excludes HTTP headers and third-party requests).`);
  assert.ok(bytes < 500_000, `Estimated initial local payload exceeds 500 KB: ${bytes} bytes`);
});
