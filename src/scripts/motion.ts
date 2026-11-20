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

  // Live dot grid: desktop only (1024px+), and only when motion is welcome.
  mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () =>
    initDotReveal(gsap.utils.toArray<HTMLElement>('.dotted-grid')),
  );

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
    const stopRoll = initWordRoll(q('[data-roll]'));

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

    // 7. Card lighting: soft light blobs drift inside each [data-glow] layer (masked to the
    //    coloured background). Each card's timeline only plays while the card is on screen.
    q('[data-glow]').forEach((layer) => {
      const blobs = gsap.utils.toArray<HTMLElement>('.glow-blob', layer);
      const tl = gsap.timeline({ paused: true });
      blobs.forEach((blob, i) => {
        const w = layer.clientWidth || 800;
        const dur = gsap.utils.random(3.5, 5.5);
        tl.to(blob, { x: () => gsap.utils.random(0.3, 0.5) * w * (i % 2 ? -1 : 1), y: () => gsap.utils.random(-0.2, 0.2) * w, scale: gsap.utils.random(1.1, 1.6), duration: dur, ease: 'sine.inOut', repeat: -1, yoyo: true, repeatRefresh: true }, 0);
        tl.fromTo(blob, { opacity: 0.15 }, { opacity: 1, duration: dur * 0.8, ease: 'sine.inOut', repeat: -1, yoyo: true }, 0);
      });
      ScrollTrigger.create({
        trigger: layer,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: (self) => (self.isActive ? tl.play() : tl.pause()),
      });
    });

    // 9. Home nav avatar pops out of the name once the hero portrait has scrolled away, and tucks back in on return.
    const stopAvatar = initNavAvatar();

    // Layout settles after fonts and images load.
    window.addEventListener('load', () => ScrollTrigger.refresh());
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      stopOdometer();
      stopAvatar();
      stopRoll();
    };
  });
}

/**
 * Live dot grid for every .dotted-grid section (desktop, 1024px and up). A canvas redraws the same
 * 16px grid: dots are clear near the cursor and fade towards the background with distance, and
 * clicks (plus idle moments) send a ripple that physically pushes the dots outward as it passes.
 * Below 1024px the CSS static grid stays as is.
 */
function initDotReveal(sections: HTMLElement[]) {
  if (!sections.length) return () => {};

  const GAP = 16;
  const BASE = 0.5; // dot visibility away from the cursor
  const RADIUS = 300; // plain (dot-free) area around the cursor at rest
  const root = getComputedStyle(document.documentElement);
  const tone = root.getPropertyValue('--color-neutral-300').trim() || '#b3b0a8';

  type Ripple = { x: number; y: number; t0: number; amp: number; life: number };
  const cleanups: (() => void)[] = [];

  sections.forEach((el) => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'dot-canvas';
    el.prepend(canvas);
    el.classList.add('dot-live');
    const ctx = canvas.getContext('2d')!;

    let w = 0, h = 0, dpr = 1;
    let visible = false;
    let inside = false;
    let lastActive = 0;
    const cur = { x: 0, y: 0, a: 0, r: RADIUS };
    let holding = false;
    let lastRipple = { x: 0, y: 0, t: 0 };
    const ripples: Ripple[] = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.clientWidth;
      h = el.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const SPEED = 420; // px/s the ripple front travels
    const WAVE = 70; // px between crests
    const SPREAD = 110; // px thickness of the disturbed band

    const draw = () => {
      if (!visible) return;
      const now = performance.now() / 1000;
      for (let i = ripples.length - 1; i >= 0; i--) if (now - ripples[i].t0 > ripples[i].life) ripples.splice(i, 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = tone;
      const cols = Math.ceil(w / GAP);
      const rows = Math.ceil(h / GAP);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let x = c * GAP + GAP / 2;
          let y = r * GAP + GAP / 2;
          const ox = x, oy = y;
          for (const rp of ripples) {
            const dx = ox - rp.x, dy = oy - rp.y;
            const d = Math.hypot(dx, dy) || 1;
            const front = (now - rp.t0) * SPEED;
            const off = (d - front) / SPREAD;
            const env = Math.exp(-off * off) * (1 - (now - rp.t0) / rp.life);
            const push = rp.amp * env * Math.sin(((d - front) / WAVE) * Math.PI * 2);
            x += (dx / d) * push;
            y += (dy / d) * push;
          }
          const dist = Math.hypot(ox - cur.x, oy - cur.y);
          const near = Math.max(0, 1 - dist / cur.r);
          // Plain (no dots) under the cursor, dotted everywhere else.
          const alpha = BASE * (1 - near * near * cur.a);
          ctx.globalAlpha = alpha;
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }
    };
    gsap.ticker.add(draw);

    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const qx = gsap.quickTo(cur, 'x', { duration: 0.55, ease: 'power3.out' });
    const qy = gsap.quickTo(cur, 'y', { duration: 0.55, ease: 'power3.out' });
    // Click/idle ripples are bold (amp 9px, 2.6s); cursor-trail ripples are lighter (amp 5px, 1.8s).
    const drop = (x: number, y: number, trail = false) => {
      ripples.push({ x, y, t0: performance.now() / 1000, amp: trail ? 5 : 9, life: trail ? 1.8 : 2.6 });
      if (ripples.length > 10) ripples.shift();
    };
    // Press and hold grows the plain area to about two thirds of the screen area.
    const holdRadius = () => Math.sqrt(((2 / 3) * window.innerWidth * window.innerHeight) / Math.PI);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const p = local(e);
      lastActive = performance.now();
      if (!inside) {
        inside = true;
        cur.x = p.x;
        cur.y = p.y;
        gsap.to(cur, { a: 1, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
      }
      qx(p.x);
      qy(p.y);
      // Cursor trail: a small ripple each time the pointer has travelled ~70px.
      const now = performance.now();
      if (Math.hypot(p.x - lastRipple.x, p.y - lastRipple.y) > 70 && now - lastRipple.t > 90) {
        drop(p.x, p.y, true);
        lastRipple = { x: p.x, y: p.y, t: now };
      }
    };
    const onLeave = () => {
      inside = false;
      gsap.to(cur, { a: 0, duration: 0.8, ease: 'power2.out', overwrite: 'auto' });
    };
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label')) return;
      const p = local(e);
      lastActive = performance.now();
      drop(p.x, p.y);
      if (e.pointerType !== 'touch') {
        holding = true;
        gsap.to(cur, { r: holdRadius(), duration: 0.9, ease: 'power2.out', overwrite: 'auto' });
      }
    };
    const onUp = () => {
      if (!holding) return;
      holding = false;
      gsap.to(cur, { r: RADIUS, duration: 0.7, ease: 'power2.inOut', overwrite: 'auto' });
    };
    el.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerdown', onDown);

    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting), { rootMargin: '100px' });
    io.observe(el);

    // Idle: while nobody points at this section, a ripple starts somewhere every few seconds.
    const idle = window.setInterval(() => {
      if (!visible || document.hidden || inside || performance.now() - lastActive < 3000) return;
      drop(gsap.utils.random(0.1, 0.9) * w, gsap.utils.random(0.15, 0.85) * h);
      lastActive = performance.now() - 1000;
    }, 2000);

    cleanups.push(() => {
      gsap.ticker.remove(draw);
      window.clearInterval(idle);
      io.disconnect();
      ro.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      gsap.killTweensOf(cur);
      canvas.remove();
      el.classList.remove('dot-live');
    });
  });

  return () => cleanups.forEach((fn) => fn());
}

/** Nav avatar for the home page: grows out of the left edge of the name (name slides right), reverses on return. */
function initNavAvatar() {
  const wrap = document.querySelector<HTMLElement>('[data-nav-avatar-wrap][data-avatar-hidden]');
  const portrait = document.querySelector<HTMLElement>('[data-hero-portrait]');
  const avatar = wrap?.querySelector<HTMLElement>('img');
  if (!wrap || !portrait || !avatar) return () => {};

  const full = () => avatar.offsetWidth + 12; // avatar + the gap before the name
  let shown = false;
  const set = (on: boolean) => {
    if (on === shown) return;
    shown = on;
    gsap.killTweensOf([wrap, avatar]);
    if (on) {
      gsap.to(wrap, { width: full(), paddingRight: 12, duration: 0.55, ease: 'power3.out', onComplete: () => (wrap.style.width = 'auto') });
      gsap.fromTo(avatar, { opacity: 0, scale: 0.2, x: -14, transformOrigin: 'left center' }, { opacity: 1, scale: 1, x: 0, duration: 0.7, ease: 'back.out(1.8)' });
      // (no clearProps: clearing the inline transform would let the CSS collapsed-state scale(0.2) apply again)
    } else {
      gsap.set(wrap, { width: wrap.offsetWidth });
      gsap.to(wrap, { width: 0, paddingRight: 0, duration: 0.4, ease: 'power3.inOut' });
      gsap.to(avatar, { opacity: 0, scale: 0.2, x: -14, transformOrigin: 'left center', duration: 0.3, ease: 'power2.in' });
    }
  };

  const st = ScrollTrigger.create({
    trigger: portrait,
    start: 'bottom top+=88', // portrait fully above the nav
    end: 'max',
    onToggle: (self) => set(self.isActive),
  });
  return () => {
    st.kill();
    gsap.killTweensOf([wrap, avatar]);
    gsap.set([wrap, avatar], { clearProps: 'all' });
  };
}

/**
 * Letter odometer for [data-roll] words (hero "Clarity"), the same idea as the stat numbers:
 * every letter is a clipped column holding three alphabet cycles. It rests on the real letter in
 * the middle cycle, rolls one full cycle forward and lands again, last letter first. Plays once
 * after the hero enters, then replays every 12s while the hero is on screen. Only transforms animate.
 * The real letter stays in the flow (hidden) so line height, width and baseline match the plain text.
 */
function initWordRoll(els: HTMLElement[]) {
  if (!els.length) return () => {};

  const ALPHA = 26;
  const LEN = ALPHA * 3;
  const DURATION = 1.4;
  const REPLAY_MS = 12000;
  const pct = (i: number) => -(i / LEN) * 100;
  const GRADIENT = 'radial-gradient(ellipse at center, #1f45e0 0%, #2f5bff 100%)';

  type Word = { el: HTMLElement; strips: HTMLElement[]; idx: number[] };
  let words: Word[] = [];
  let played = false;
  let timer: number | undefined;
  let resizeTimer: number | undefined;
  let visible = true;

  const restore = () =>
    els.forEach((el) => {
      if (el.dataset.rollText) el.textContent = el.dataset.rollText;
      delete el.dataset.odo;
    });

  const build = () => {
    words = [];
    els.forEach((el) => {
      const text = el.dataset.rollText ?? (el.textContent ?? '').trim();
      el.dataset.rollText = text;
      if (!/^[A-Za-z]+$/.test(text)) return;

      el.textContent = '';
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = text;
      const vis = document.createElement('span');
      vis.setAttribute('aria-hidden', 'true');
      const cols: HTMLElement[] = [];
      const strips: HTMLElement[] = [];
      const idx: number[] = [];
      [...text].forEach((ch) => {
        const base = ch === ch.toUpperCase() ? 65 : 97;
        idx.push(ch.charCodeAt(0) - base);
        const col = document.createElement('span');
        col.style.cssText = 'position:relative;display:inline-block;clip-path:inset(0 -0.06em)';
        const real = document.createElement('span');
        real.style.visibility = 'hidden';
        real.textContent = ch;
        const strip = document.createElement('span');
        strip.style.cssText = 'position:absolute;left:0;top:0;display:block;white-space:nowrap;will-change:transform';
        for (let k = 0; k < LEN; k++) {
          const item = document.createElement('span');
          item.style.display = 'block';
          item.textContent = String.fromCharCode(base + (k % ALPHA));
          strip.appendChild(item);
        }
        col.append(real, strip);
        vis.appendChild(col);
        cols.push(col);
        strips.push(strip);
      });
      el.append(sr, vis);
      el.dataset.odo = '';

      // Each letter paints its own slice of one gradient, so the word still reads as one fill.
      const box = el.getBoundingClientRect();
      const lh = cols[0].getBoundingClientRect().height;
      cols.forEach((col, i) => {
        const x = -(col.getBoundingClientRect().left - box.left);
        strips[i].querySelectorAll<HTMLElement>('span').forEach((item) => {
          item.style.backgroundImage = GRADIENT;
          item.style.backgroundRepeat = 'no-repeat';
          item.style.backgroundSize = `${box.width}px ${lh}px`;
          item.style.backgroundPosition = `${x}px 0`;
          item.style.setProperty('-webkit-background-clip', 'text');
          item.style.backgroundClip = 'text';
          item.style.color = 'transparent';
        });
        gsap.set(strips[i], { yPercent: pct(ALPHA + idx[i]) });
      });
      words.push({ el, strips, idx });
    });
  };

  const roll = () => {
    words.forEach(({ strips, idx }) =>
      strips.forEach((strip, i) =>
        gsap.fromTo(
          strip,
          { yPercent: pct(idx[i]) },
          {
            yPercent: pct(ALPHA + idx[i]),
            duration: DURATION,
            ease: 'power2.inOut',
            delay: (strips.length - 1 - i) * 0.08,
            force3D: true,
            overwrite: true,
          },
        ),
      ),
    );
    played = true;
  };

  const startTimer = () => {
    if (timer) return;
    timer = window.setInterval(() => {
      if (visible && !document.hidden) roll();
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

  let cancelled = false;
  let io: IntersectionObserver | undefined;
  let kick: number | undefined;
  (document.fonts?.ready ?? Promise.resolve()).then(() => {
    if (cancelled) return;
    build();
    window.addEventListener('resize', onResize);
    io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
    io.observe(els[0]);
    startTimer();
    kick = window.setTimeout(() => !played && roll(), 900); // after the hero rises in
  });

  return () => {
    cancelled = true;
    stopTimer();
    window.clearTimeout(resizeTimer);
    window.clearTimeout(kick);
    window.removeEventListener('resize', onResize);
    io?.disconnect();
    gsap.killTweensOf(words.flatMap((w) => w.strips));
    restore();
  };
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
