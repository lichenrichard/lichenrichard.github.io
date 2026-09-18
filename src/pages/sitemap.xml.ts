import projects from '../data/projects.json';
export function GET() {
  const paths = ['/', '/about.html', '/project.html', '/publication.html', '/teaching.html', ...projects.map(p => `/${p.id}.html`)];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>https://chenli.me${path}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
