// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Hosting: GitHub Pages (owner decision, Nov 2026).
// Repo name is "portfolio" (project site), so the site lives at /portfolio/.
export default defineConfig({
  site: 'https://royhaizad.github.io',
  base: '/portfolio',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
