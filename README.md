# Chen 'Richard' Li: personal website

A static Astro site for chenli.me. Complete page content is rendered at build time; small JavaScript enhancements provide publication filters, mobile navigation, citation copying, and video playback.

The header's sun/moon switch changes between light and dark mode. It follows the system preference until a visitor chooses a mode, then remembers that choice in local storage across pages and visits. The initial theme is applied in the document head to avoid a flash of the wrong palette. When JavaScript is unavailable, the colours follow the system preference; print output uses the light palette. Theme logic lives in `src/scripts/theme.js`, with colour tokens in `src/styles/global.css`.

## Run locally

Use Node.js 24 and pnpm 11.19.0 (the version in `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Astro. To build, test, and preview the production output:

```sh
pnpm check
pnpm preview
```

`dist/` contains the deployable site. The development server also supports the existing `.html` links.

## Content editing

| Content | File |
| --- | --- |
| Name, contact address, links, analytics ID | `src/data/site.ts` |
| Homepage introduction and featured projects | `src/pages/index.astro` |
| Full biography and service | `src/pages/about.astro` |
| Publications and featured-paper selection | `src/data/publications.json` |
| Topic labels | `src/data/publication-tags.json` |
| Publication awards | `src/data/publication-awards.json` |
| Projects, descriptions, galleries, and links | `src/data/projects.json` |
| Videos and press coverage | `src/data/media.json` |
| Current and past courses | `src/data/teaching.json` |
| Shared layout and styling | `src/layouts/Layout.astro`, `src/styles/global.css` |

Add publications as structured records with stable IDs, full citations, DOI URLs where available, topic slugs, and project IDs. New entries appear automatically in the list and year filter. `featured: true` includes a work on the homepage. Use each paper's published author names and update its publication status when needed.

An optional `pdf` URL adds a PDF link beside the DOI on publication rows, including homepage selections. Link to a verified publisher or author/institutional repository copy. Where a public ResearchGate PDF is available but a stable direct download cannot be verified, use `pdfPage` for its full-text page; the link is labelled “PDF (ResearchGate)”. Set `pdfVersion` to `published`, `accepted`, `preprint`, or `author` (an author manuscript whose review status is unspecified); manuscript versions are labelled in the link. Keep the publisher's final APA reference in `citation`, even when the linked PDF is an earlier version. Verification sources and publication-year notes are recorded in [publication-sources.md](docs/publication-sources.md).

Topic selection matches **any** selected topic; year, type, and search apply additional restrictions. Search matches all entered words, without case sensitivity. Filter state is shareable via URL parameters. The complete publication list remains in HTML when JavaScript is unavailable. Citation disclosure and all source links also work without JavaScript.

Media cards are embedded in their related project pages and use existing local project imagery. Set `projectId` in `src/data/media.json` and `projectIds` in `src/data/publications.json` to associate content with projects; project pages collect these records automatically. YouTube players are created only when a visitor activates a preview. Source links remain available if an embedded player cannot play. Provider availability, captions, and embed permissions are controlled by YouTube and the content owners.

Verify video playback in a normal browser on the deployed HTTPS domain. Embedded preview browsers may report YouTube error 153 when referrer or client identification is restricted. Direct YouTube links remain available throughout.

The contact address is `richard.chen-li@polyu.edu.hk` and can be updated in `src/data/site.ts`. Google Analytics loads after the page is ready and runs only on `chenli.me`, never on local previews.

The copyright year uses Hong Kong time. A small script in `src/scripts/copyright-year.js` checks [TimeAPI.io](https://timeapi.io/) after page load, with a three-second timeout and no cookies or referrer. It falls back to the visitor's clock if the service is unavailable. With JavaScript disabled, the year recorded at build time remains visible.

## Pages and assets

Page addresses use `.html`, including `about.html`, `publication.html`, `project.html`, `teaching.html`, and each project's detail page. Public images, PDFs, the favicon, and the custom-domain CNAME are under `public/`. Image dimensions and responsive variants are recorded in `src/data/images.json`; add new image records there when using the shared `Photo` component.

`public/favicon.svg` is the master artwork. Pages use a matching 32px PNG with a 16/32/48px ICO fallback for browser tabs, plus a 180px `apple-touch-icon.png` for Apple bookmark/Home Screen icons. When changing the artwork, regenerate these copies and update the icon URL version in `src/layouts/Layout.astro`.

## Validation

`pnpm check` builds the site and runs Node's built-in test runner. The checks cover:

- Generated page addresses and project detail pages.
- Complete publication titles and IDs in static HTML.
- Local links, image sources, responsive image variants, and anchor targets.
- Unique page titles/descriptions/canonicals and sitemap coverage.
- Deferred video players and first-party asset budgets.
- Topic/year/type/search combinations, URL round trips, invalid filters, deterministic sorting, and empty results.
- Theme initialization, saved preferences, system changes, and storage fallbacks.

Browser checks should include 320/390px phones, tablets, and large desktops; menu keyboard operation; filter reset and shared URLs; citation disclosure; and video activation. The automated byte estimate is not a Lighthouse or field Core Web Vitals result. Third-party analytics and activated players are outside the first-party JavaScript budget. Verify field performance after deployment, and check current Safari, Chrome, Firefox, and Edge before a public release.

## GitHub Pages deployment

The included workflow follows Astro's [GitHub Pages deployment workflow](https://docs.astro.build/en/guides/deploy/github/). It builds and tests pull requests, and deploys pushes to `main` or manual runs on `main`.

1. In `lichenrichard/lichenrichard.github.io`, set **Settings → Pages → Source** to **GitHub Actions**.
2. Keep the custom domain `chenli.me` in Pages settings and its existing DNS configuration.
3. Run `pnpm check`, commit the source changes and lockfile, then push to `main`.
4. Check the **Build, check, and deploy website** run in the repository's Actions tab, then verify the live site.

The workflow publishes only the generated `dist/` directory, including the custom-domain CNAME, metadata, `robots.txt`, and `sitemap.xml`. Build output and installed dependencies are ignored by Git. A local build does not publish the site.

After deployment, verify the custom domain and HTTPS, video playback, publication filters, and theme switching. Submit `https://chenli.me/sitemap.xml` in Google Search Console when needed.
