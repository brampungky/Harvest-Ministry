/**
 * reveal.js — the fallback half of core/css/motion.css.
 *
 * Where the browser supports scroll-driven animations, this does NOTHING: the
 * stylesheet already drives the reveal off `animation-timeline: view()`, which
 * is better than anything an observer can do because it cannot desynchronise
 * from the scroll position.
 *
 * Where it doesn't — Firefox was still partial in mid-2026 — this adds the one
 * class that switches the stylesheet's fallback branch on, then reveals blocks
 * with an IntersectionObserver.
 *
 * ORDER MATTERS. `.reveal-js` is what makes the hiding rule apply, and it is
 * set by this module. If the module never runs, nothing is ever hidden, so a
 * script error can't leave a church with a blank page. That failure mode is
 * the single most common way scroll reveals break in the wild, and it is
 * designed out here rather than tested for.
 */

const SUPPORTS_TIMELINE =
  typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: view()');

export function initReveal() {
  // Honour the OS setting. motion.css already refuses to animate under
  // reduced motion; bailing here as well keeps the observer off entirely.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (SUPPORTS_TIMELINE) return;
  if (!('IntersectionObserver' in window)) return;

  const targets = [
    ...document.querySelectorAll('[data-reveal]'),
    ...document.querySelectorAll('[data-reveal-children] > *'),
  ];
  if (!targets.length) return;

  document.documentElement.classList.add('reveal-js');

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);          // reveal once; this is not a toggle
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

  for (const el of targets) {
    // Anything already on screen at load was never hidden as far as the
    // visitor is concerned — show it immediately rather than animating
    // content they are already looking at.
    const box = el.getBoundingClientRect();
    if (box.top < innerHeight * 0.9) el.classList.add('is-in');
    else io.observe(el);
  }
}
