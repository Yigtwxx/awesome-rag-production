/**
 * Shared motion runtime: GSAP + ScrollTrigger + SplitText, driven by Lenis
 * smooth scrolling. Every section script calls `getMotion()`; the first call
 * wires everything up once.
 *
 * With `prefers-reduced-motion: reduce`, Lenis is not started and `reduced`
 * is true. Sections must then render their final state without scroll-driven
 * animation (no pinning, no scrubbing).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

export interface Motion {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
  SplitText: typeof SplitText;
  lenis: Lenis | undefined;
  reduced: boolean;
}

let motion: Motion | undefined;

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getMotion(): Motion {
  if (motion) return motion;

  gsap.registerPlugin(ScrollTrigger, SplitText);
  const reduced = prefersReducedMotion();
  let lenis: Lenis | undefined;

  if (!reduced) {
    lenis = new Lenis({ autoRaf: false, lerp: 0.11 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis?.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // In-page anchors scroll through Lenis so pinned sections stay in sync.
  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
      'a[href^="#"]',
    );
    const id = link?.getAttribute('href');
    if (!link || !id || id === '#') return;
    const target = document.querySelector<HTMLElement>(id);
    if (!target) return;
    event.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: -8 });
    else target.scrollIntoView();
    history.replaceState(null, '', id);
  });

  motion = { gsap, ScrollTrigger, SplitText, lenis, reduced };
  return motion;
}

/** Rows/blocks rise into place once as they enter the viewport. */
export function revealOnScroll(selector: string): void {
  const { gsap, ScrollTrigger, reduced } = getMotion();
  if (reduced || !document.querySelector(selector)) return;
  gsap.set(selector, { opacity: 0, y: 18 });
  ScrollTrigger.batch(selector, {
    start: 'top 90%',
    once: true,
    onEnter: (elements) =>
      gsap.to(elements, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.06,
      }),
  });
}

export interface LiftOptions {
  by?: 'lines' | 'words';
  duration?: number;
  stagger?: number;
  scrollTrigger?: ScrollTrigger.Vars;
}

/**
 * Lifts text out of a mask, line by line (or word by word). The masks bleed
 * past their box (`.split-*-mask` in global.css) so descenders and italic
 * overhangs are never cut, and the split is reverted when the move ends, so
 * the finished text is plain DOM again and reflows on resize.
 */
export function liftText(
  target: string | Element,
  {
    by = 'lines',
    duration = 1.1,
    stagger = 0.08,
    scrollTrigger,
  }: LiftOptions = {},
): gsap.core.Tween {
  const split = getMotion().SplitText.create(target, {
    type: by,
    mask: by,
    linesClass: 'split-line',
    wordsClass: 'split-word',
  });
  return gsap.from(split[by], {
    yPercent: 135,
    duration,
    ease: 'expo.out',
    stagger,
    ...(scrollTrigger ? { scrollTrigger } : {}),
    onComplete: () => split.revert(),
  });
}

/** Chapter headlines lift out of a mask, line by line, once. */
export function revealTitles(selector: string): void {
  if (getMotion().reduced) return;
  document.querySelectorAll<HTMLElement>(selector).forEach((title) => {
    liftText(title, {
      stagger: 0.1,
      scrollTrigger: { trigger: title, start: 'top 85%', once: true },
    });
  });
}

/**
 * As a chapter's glass sheet slides over the stuck scene above it, the
 * scene's text recedes so only the universe shows through the frost.
 */
export function fadeSceneUnder(chapterSelector: string): void {
  const { gsap, reduced } = getMotion();
  const chapter = document.querySelector<HTMLElement>(chapterSelector);
  const scene = chapter?.previousElementSibling;
  const layers = scene?.querySelectorAll<HTMLElement>(
    ':scope > .hero__layout, :scope > .scene__layout, :scope > .scene__labels',
  );
  if (reduced || !chapter || !layers?.length) return;
  gsap.to(layers, {
    opacity: 0.08,
    ease: 'none',
    scrollTrigger: {
      trigger: chapter,
      start: 'top bottom',
      end: 'top 30%',
      scrub: true,
    },
  });
}
