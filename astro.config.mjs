// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Hosting: GitHub Pages (owner decision, Nov 2026).
// Repo name is "portfolio" (project site), so the site lives at /portfolio/.
// BASE_PATH lets CI build a second copy (the remote preview) under /portfolio/remote.
const base = process.env.BASE_PATH || '/portfolio';
const isPreview = base !== '/portfolio';

export default defineConfig({
  site: 'https://royhaizad.github.io',
  base,
  integrations: isPreview ? [] : [sitemap({ filter: (page) => !page.includes('/404') })],
  vite: {
    plugins: [tailwindcss()],
  },
});
