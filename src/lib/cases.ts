// Parses src/data/case-studies.md at build time so the copy stays single-source.
import raw from '../data/case-studies.md?raw';

export interface CaseBody {
  challenge?: { heading: string; paragraphs: string[] };
  process?: { heading?: string; description?: string; steps: { title: string; body: string }[] };
  decisions?: { heading?: string; items: string[] };
  screens?: { heading?: string; description?: string };
  outcome?: { heading?: string; items: string[] };
}
export interface Snapshot { heading: string; items: string[]; tools: string[] }

// Strips any italic "(...)" review note left in the copy file.
const clean = (s: string) => s.replace(/\s*\*\(.*?\)\*\s*/g, ' ').trim();
const quoted = (s: string) => s.match(/"(.+?)"/)?.[1];

const [mainPart, snapPart = ''] = raw.split(/^## Snapshots.*$/m);

export const bodies: Record<string, CaseBody> = {};

for (const chunk of mainPart.split(/^## /m).slice(1)) {
  const num = chunk.slice(0, 2);
  const body: CaseBody = {};
  for (const sub of chunk.split(/^### /m).slice(1)) {
    const [head, ...rest] = sub.split('\n');
    const lines = rest.map((l) => l.trim());
    const bullets = lines.filter((l) => l.startsWith('- ')).map((l) => clean(l.slice(2)));
    const description = lines.find((l) => l.startsWith('Description: '))?.slice(13);

    if (head.startsWith('Challenge')) {
      let heading = '';
      const paragraphs: string[] = [];
      for (const b of bullets) {
        const h = b.match(/Heading: \*\*(.+?)\*\*/);
        if (h) heading = h[1];
        else paragraphs.push(...b.split('⏎⏎').map((p) => p.trim()));
      }
      body.challenge = { heading, paragraphs };
    } else if (head.startsWith('Process')) {
      const steps = lines
        .map((l) => l.match(/^\d+\. \*\*(.+?)\*\*: (.+)$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => ({ title: m[1], body: m[2] }));
      body.process = { heading: quoted(head), description, steps };
    } else if (head.startsWith('Key decisions')) {
      body.decisions = { heading: quoted(head), items: bullets };
    } else if (head.startsWith('Screens')) {
      body.screens = { heading: quoted(head), description };
    } else if (head.startsWith('Outcome')) {
      body.outcome = { heading: quoted(head), items: bullets };
    }
  }
  bodies[num] = body;
}

export const snapshots: Record<string, Snapshot> = {};
for (const line of snapPart.split('\n')) {
  if (!/^\| \d\d /.test(line)) continue;
  const cells = line.slice(1, -1).split('|').map((c) => c.trim());
  snapshots[cells[0].slice(0, 2)] = {
    heading: cells[1],
    items: cells[2].split(' · ').map((s) => s.trim()),
    tools: cells[3] === '–' ? [] : cells[3].split(',').map((s) => s.trim()),
  };
}
