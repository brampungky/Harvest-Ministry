/**
 * ui.js — the small amount of behaviour every template needs.
 * Vanilla, no dependencies. Each function guards its own elements and returns
 * early if the template doesn't use that component.
 */

/** Mobile navigation. Uses aria-expanded as the single source of truth. */
export function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;

  const set = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.toggleAttribute('data-open', open);
    toggle.querySelector('[data-nav-label]').textContent = open ? 'Close' : 'Menu';
  };

  toggle.addEventListener('click', () =>
    set(toggle.getAttribute('aria-expanded') !== 'true'));

  // Escape closes and returns focus, per WCAG keyboard expectations.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      set(false);
      toggle.focus();
    }
  });

  // Reset when the layout leaves the mobile breakpoint.
  matchMedia('(min-width: 60rem)').addEventListener('change', (e) => {
    if (e.matches) set(false);
  });
}

/**
 * The porch's mobile disclosure — the editorial chrome's navigation.
 *
 * Lives here rather than in a template's assets/ folder because the CHROME is
 * shared (families/_chrome-editorial.css), so its behaviour must be too. It
 * was duplicated per template for exactly one template, which is the moment to
 * move it before it becomes duplicated per template for six.
 */
export function initPorch() {
  const toggle = document.querySelector('.porch-toggle');
  const ways = document.querySelector('.porch__ways');
  if (!toggle || !ways) return;

  const label = toggle.querySelector('[data-porch-label]');

  const set = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    ways.toggleAttribute('data-open', open);
    // Only the word changes. Rewriting the button's textContent would delete
    // the two <svg> glyphs the markup shipped and leave a bare word behind.
    if (label) label.textContent = open ? 'Close' : 'Menu';
  };

  toggle.addEventListener('click', () =>
    set(toggle.getAttribute('aria-expanded') !== 'true'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      set(false);
      toggle.focus();
    }
  });

  matchMedia('(min-width: 55rem)').addEventListener('change', (e) => {
    if (e.matches) set(false);
  });
}

/**
 * Light/dark toggle. Respects the OS by default and only writes storage once
 * the visitor makes an explicit choice.
 */
export function initTheme() {
  const btn = document.querySelector('.theme-toggle');
  const stored = localStorage.getItem('theme');
  if (stored) document.documentElement.dataset.theme = stored;
  if (!btn) return;

  // The glyph is CSS's job \u2014 one contrast disc that rotates under the dark
  // theme (see core/css/components.css). Rewriting textContent here would
  // delete the <svg> the markup shipped and leave an empty button.
  const label = () => {
    const dark = (document.documentElement.dataset.theme ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  };

  btn.addEventListener('click', () => {
    const dark = (document.documentElement.dataset.theme ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    label();
  });

  label();
}

/** Mark the current page in the nav without server-side help. */
export function initCurrentPage(selector = '.site-nav a') {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll(selector).forEach((a) => {
    const target = a.getAttribute('href');
    if (target === here || (here === 'index.html' && target === './')) {
      a.setAttribute('aria-current', 'page');
    }
  });
}

/**
 * Live stream embed that degrades to the archive.
 * Churches stream for two hours a week; the other 166 the embed should not be
 * an empty black rectangle.
 */
export function initLiveStream(config) {
  const host = document.querySelector('[data-livestream]');
  if (!host || !config?.livestream) return;
  const { channelUrl, liveEmbed, archiveUrl } = config.livestream;
  const isServiceTime = (config.services || []).some((s) => {
    const now = new Date();
    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    if (days[now.getDay()] !== String(s.day).toLowerCase()) return false;
    const [h, m] = String(s.time).split(':').map(Number);
    const start = h * 60 + (m || 0);
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= start - 10 && mins <= start + (s.durationMinutes || 75);
  });
  host.innerHTML = isServiceTime && liveEmbed
    ? liveEmbed
    : `<a class="btn btn--ghost" href="${archiveUrl || channelUrl}">Watch past services</a>`;
}

/** Everything a standard template needs, in one call. */
export function initAll(config) {
  initTheme();
  initNav();
  initCurrentPage();
  initLiveStream(config);
}
