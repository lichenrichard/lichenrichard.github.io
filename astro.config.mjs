import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://chenli.me',
  output: 'static',
  build: { format: 'file' },
  trailingSlash: 'never',
  devToolbar: { enabled: false },
});
