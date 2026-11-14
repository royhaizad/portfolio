import data from '../data/projects.json';
import type { ImageMetadata } from 'astro';

export type TagType =
  | 'Lead' | 'Launched' | 'AI' | 'Problem Solving' | 'Responsive'
  | 'Design System' | 'Government' | 'Industry' | 'Tool';

export interface TagData { type: TagType; label: string }

export const projects = data.projects;
export const filterOptions = data.filterOptions;

const images = import.meta.glob<{ default: ImageMetadata }>('../../assets/**/*.{png,webp}', { eager: true });

/** Resolve a path like "mockups/mockup-01.png" to optimisable image metadata. */
export function img(path: string): ImageMetadata {
  const hit = images[`../../assets/${path}`];
  if (!hit) throw new Error(`Missing asset: ${path}`);
  return hit.default;
}

export const featured = projects.filter((p) => p.featured);

/** Home "All Projects" rows are ordered by row.number (differs from case number). */
export const rows = [...projects].sort((a, b) => Number(a.row.number) - Number(b.row.number));

export const countBy = (key: 'type' | 'sector') => {
  const counts: Record<string, number> = {};
  for (const p of projects) counts[p.filters[key]] = (counts[p.filters[key]] ?? 0) + 1;
  return counts;
};

/** Split text on the manual line-break marker used in the content files. */
export const lines = (text: string) => text.split('⏎');

/** Prefix an internal path with the site base (needed when hosted at /<repo-name>/). */
export const url = (path: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + path;
