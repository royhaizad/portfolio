import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Site motion (tasteful). Only transforms and autoAlpha are animated, and every
 * element ends in its original visual state.
 *
 * Markup hooks (kept minimal):
 *   [data-hero]          children enter in sequence on load (hero moment)
 *   [data-reveal-group]  children reveal together on scroll (section headers)
 *   [data-reveal]        element reveals on scroll, batched with its neighbours
 *   [data-count]         number counts up when it enters the view
 *   [data-nav]           nav link, highlighted for the section in view
 *   #scroll-progress     thin bar that follows page scroll
 *
 * CSS (global.css) hides these only while html has class "motion", which an inline
 * script in Base.astro adds when reduced motion is NOT requested. A 3s failsafe in
 * that script removes the class if this file never runs, so content stays visible.
 */
export function initMotion() {
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    (window as any).__motionReady = true;

    const q = (sel: string) => gsap.utils.toArray<HTMLElement>(sel);
    const show = { autoAlpha: 1, y: 0, scale: 1, clearProps: 'transform' } as const;

    // 1. Hero moment: children of [data-hero] rise in one after another.
    const hero = q('[data-hero] > *');
    if (hero.length) {
      gsap.fromTo(
        hero,
        { autoAlpha: 0, y: 80 },
        { ...show, duration: 1.1, ease: 'power4.out', stagger: 0.12, delay: 0.1 },
      );
    }

    // 2. Section headers: overline, heading, description rise together.
    q('[data-reveal-group]').forEach((group) => {
      gsap.fromTo(
        group.children,
        { autoAlpha: 0, y: 40 },
        {
          ...show,
          duration: 0.9,
          ease: 'power3.out',
          stagger: 0.1,
          scrollTrigger: { trigger: group, start: 'top 85%', once: true },
        },
      );
    });

    // 3. Cards, rows, frames: batched reveal so neighbours stagger.
    const items = q('[data-reveal]');
    if (items.length) {
      gsap.set(items, { autoAlpha: 0, y: 56 });
      ScrollTrigger.batch(items, {
        start: 'top 90%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { ...show, duration: 0.9, ease: 'power3.out', stagger: 0.1, overwrite: true }),
      });
    }

    // 4. Stat numbers: odometer. Each digit is a column that rolls vertically and lands
    //    on the number (1.4s). Replays every 12s while the stats are on screen.
    const stopOdometer = initOdometer(q('[data-count]'));

    // 5. Scroll progress bar.
    const bar = document.getElementById('scroll-progress');
    if (bar) {
      gsap.to(bar, {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
      });
    }

    // 6. Active nav link follows the section in view (Home only).
    const sections: Record<string, { trigger: string; endTrigger?: string; end?: string }> = {
      work: { trigger: '#work' },
      projects: { trigger: '#projects' },
      about: { trigger: '#about', endTrigger: '#credentials', end: 'bottom 40%' },
      contact: { trigger: '#contact' },
    };
    const setActive = (key: string, on: boolean) =>
      document
        .querySelectorAll<HTMLElement>(`[data-nav="${key}"]`)
        .forEach((a) => (on ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    for (const [key, cfg] of Object.entries(sections)) {
      if (!document.querySelector(cfg.trigger)) continue;
      ScrollTrigger.create({
        trigger: cfg.trigger,
        endTrigger: cfg.endTrigger,
        start: 'top 45%',
        end: cfg.end ?? 'bottom 45%',
        onToggle: (self) => setActive(key, self.isActive),
      });
    }

    // Layout settles after fonts and images load.
    window.addEventListener('load', () => ScrollTrigger.refresh());
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => stopOdometer();
  });
}

/**
 * Odometer for [data-count] numbers. Each digit becomes a clipped column holding a strip
 * of 30 digits (three 0-9 cycles). Resting position shows the real digit in the middle
 * cycle, so a replay can jump to the same digit in the first cycle (no visible jump) and
 * roll one full cycle forward. Only transforms are animated. Returns a cleanup function.
 */
function initOdometer(els: HTMLElement[]) {
  if (!els.length) return () => {};

  const CYCLES = 3;
  const LEN = CYCLES * 10;
  const DURATION = 1.4;
  const REPLAY_MS = 12000;
  const pct = (index: number) => -(index / LEN) * 100;

  let strips: { list: HTMLElement[]; digits: number[] }[] = [];
  let played = false;
  let timer: number | undefined;
  let resizeTimer: number | undefined;

  const restore = () => {
    els.forEach((el) => {
      if (el.dataset.countText) el.textContent = el.dataset.countText;
      delete el.dataset.odo;
    });
  };

  const build = () => {
    strips = [];
    els.forEach((el) => {
      const text = el.dataset.countText ?? (el.textContent ?? '').trim();
      el.dataset.countText = text;
      if (!/^\d+$/.test(text)) return;

      // Measure each real digit in place so columns match the normal text layout.
      el.textContent = '';
      const probes = [...text].map((ch) => {
        const s = document.createElement('span');
        s.style.display = 'inline-block';
        s.textContent = ch;
        el.appendChild(s);
        return s;
      });
      const widths = probes.map((s) => s.getBoundingClientRect().width);
      const lh = parseFloat(getComputedStyle(el).lineHeight) || el.getBoundingClientRect().height;
      el.textContent = '';

      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = text;
      el.appendChild(sr);

      const wrap = document.createElement('span');
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.cssText = `display:flex;height:${lh}px`;

      const list: HTMLElement[] = [];
      [...text].forEach((_, i) => {
        const col = document.createElement('span');
        col.style.cssText = `position:relative;display:block;flex:none;width:${widths[i]}px;height:${lh}px;clip-path:inset(-2px -0.3em)`;
        const strip = document.createElement('span');
        strip.style.cssText = 'position:absolute;left:50%;top:0;display:block;white-space:nowrap;text-align:center;will-change:transform';
        for (let k = 0; k < LEN; k++) {
          const d = document.createElement('span');
          d.style.cssText = `display:block;height:${lh}px;line-height:${lh}px`;
          d.textContent = String(k % 10);
          strip.appendChild(d);
        }
        col.appendChild(strip);
        wrap.appendChild(col);
        list.push(strip);
      });
      el.appendChild(wrap);

      // Dark grey gradient (Figma "Gradient Charcoal") shared across the whole number:
      // each digit paints its own slice of one gradient so the number reads as one fill.
      el.dataset.odo = '';
      const totalW = widths.reduce((a, b) => a + b, 0);
      let offset = 0;
      list.forEach((strip, i) => {
        const x = -(offset + (widths[i] - strip.offsetWidth) / 2);
        strip.querySelectorAll<HTMLElement>('span').forEach((d) => {
          d.style.backgroundImage = 'var(--gradient-charcoal)';
          d.style.backgroundRepeat = 'no-repeat';
          d.style.backgroundSize = `${totalW}px ${lh}px`;
          d.style.backgroundPosition = `${x}px 0`;
          d.style.setProperty('-webkit-background-clip', 'text');
          d.style.backgroundClip = 'text';
          d.style.color = 'transparent';
        });
        offset += widths[i];
      });

      const digits = [...text].map(Number);
      // Before the first play every digit rests on 0; afterwards on its real value.
      list.forEach((s, i) => gsap.set(s, { xPercent: -50, yPercent: pct(played ? 10 + digits[i] : 0) }));
      strips.push({ list, digits });
    });
  };

  const roll = (first: boolean) => {
    strips.forEach(({ list, digits }) => {
      list.forEach((strip, i) => {
        const from = first ? 0 : digits[i];
        gsap.fromTo(
          strip,
          { yPercent: pct(from) },
          {
            yPercent: pct(10 + digits[i]),
            duration: DURATION,
            ease: 'power2.inOut',
            delay: (list.length - 1 - i) * 0.08, // last digit starts first, like a ticking clock
            force3D: true,
            overwrite: true,
          },
        );
      });
    });
    played = true;
  };

  const startTimer = () => {
    if (timer) return;
    timer = window.setInterval(() => {
      if (!document.hidden) roll(false);
    }, REPLAY_MS);
  };
  const stopTimer = () => {
    window.clearInterval(timer);
    timer = undefined;
  };

  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      restore();
      build();
    }, 250);
  };

  const ready = document.fonts?.ready ?? Promise.resolve();
  let cancelled = false;
  let trigger: ScrollTrigger | undefined;
  ready.then(() => {
    if (cancelled) return;
    build();
    window.addEventListener('resize', onResize);
    trigger = ScrollTrigger.create({
      trigger: els[0].closest('section') ?? els[0],
      start: 'top 85%',
      end: 'bottom 15%',
      onEnter: () => {
        if (!played) roll(true);
        startTimer();
      },
      onEnterBack: startTimer,
      onLeave: stopTimer,
      onLeaveBack: stopTimer,
    });
  });

  return () => {
    cancelled = true;
    stopTimer();
    window.clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
    trigger?.kill();
    gsap.killTweensOf(strips.flatMap((s) => s.list));
    restore();
  };
}
