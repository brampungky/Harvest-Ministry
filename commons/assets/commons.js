/**
 * commons.js — the behaviour a community-services church actually needs.
 *
 * Everything here came out of looking at what churches of this kind put on
 * their real websites (Church Community Services in Elkhart, Watermark's Care
 * and Recovery, Ethos's Centro de Cuidado) rather than out of what a church
 * template usually ships:
 *
 *   · OPEN NOW — a live status strip computed from each programme's hours, in
 *     the church's own timezone. This is the single most useful thing this kind
 *     of church can put on a page and no church template has it.
 *   · TWO LANGUAGES, in place — a real switch, not a link to a stale mirror.
 *     Every string carries data-en/data-es; config content carries {en, es}.
 *   · A SERVICES DIRECTORY that can be filtered by what you need and by what
 *     language it is run in.
 *   · A WEEK TIMETABLE, because "when is the pantry open" is the question.
 *   · VOLUNTEER SHIFTS with the number of places actually left.
 *
 * No dependencies. Every function returns early if its markup isn't present.
 */

/* fmtTime is duplicated from core/js/config.js rather than imported.
   This file sits one directory deeper than the pages that load it, so the
   relative path to core/ differs between the working tree and the flattened
   zip — and build/zip.mjs only rewrites paths inside HTML, not inside asset
   JavaScript. A 404 on config.js took the whole module down. Eight lines is a
   cheaper fix than a second rewrite rule that would have to stay correct. */
function fmtTime(hhmm, use24 = false) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  if (use24) return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
  const period = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')} ${period}` : `${hour} ${period}`;
}

const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let lang = 'en';

/** Pick the active language out of a {en, es} object; pass strings through. */
const t = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? (v[lang] ?? v.en ?? '') : (v ?? ''));

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/* ═══════════════════════════════════════════════════════════════════════════
   LANGUAGE
   A parallel Spanish site goes stale the first week somebody edits the English
   one. Both strings live on the same element instead, so they can only drift
   if you delete one on purpose.
   ═══════════════════════════════════════════════════════════════════════════ */
export function initLanguage(config) {
  const stored = localStorage.getItem('lang');
  const supported = config?.languages || ['en'];
  lang = supported.includes(stored) ? stored : (config?.locale || 'en');

  const apply = () => {
    document.documentElement.lang = lang;
    for (const node of document.querySelectorAll('[data-en]')) {
      const next = node.dataset[lang] ?? node.dataset.en;
      if (next != null) node.textContent = next;
    }
    for (const node of document.querySelectorAll('[data-en-label]')) {
      const next = node.dataset[`${lang}Label`] ?? node.dataset.enLabel;
      if (next != null) node.setAttribute('aria-label', next);
    }
    document.querySelectorAll('.lang-toggle button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    // Everything rendered from config has to be rebuilt in the new language.
    document.dispatchEvent(new CustomEvent('commons:lang', { detail: { lang } }));
  };

  document.querySelectorAll('.lang-toggle button').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => {
      lang = b.dataset.lang;
      localStorage.setItem('lang', lang);
      apply();
    });
  });

  apply();
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE CLOCK
   Everything below asks "is it open?", and the answer is a fact about where
   the BUILDING is, not where the reader is. A volunteer checking from a phone
   on holiday should still see the pantry's real hours.
   ═══════════════════════════════════════════════════════════════════════════ */
function nowInZone(timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || undefined,
    weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const at = (type) => parts.find((p) => p.type === type)?.value;
  return {
    day: at('weekday'),
    minutes: Number(at('hour')) * 60 + Number(at('minute')),
  };
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * Resolve a programme against the clock.
 * → { state: 'open' | 'soon' | 'closed', at }
 * "soon" means within the hour, which is the window where it is worth telling
 * somebody to wait rather than come back another day.
 */
export function statusOf(programme, now) {
  const today = programme.hours?.filter((h) => h.day === now.day) || [];
  for (const h of today) {
    const start = toMinutes(h.start);
    const end = toMinutes(h.end);
    if (now.minutes >= start && now.minutes < end) {
      return { state: 'open', at: h.end };
    }
    if (now.minutes < start && start - now.minutes <= 60) {
      return { state: 'soon', at: h.start };
    }
  }
  // Next opening, searching forward through the week.
  const todayIndex = WEEK.indexOf(now.day);
  for (let ahead = 0; ahead < 8; ahead += 1) {
    const day = WEEK[(todayIndex + ahead) % 7];
    const slots = (programme.hours || [])
      .filter((h) => h.day === day)
      .filter((h) => !(ahead === 0 && toMinutes(h.start) <= now.minutes))
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    if (slots.length) {
      return { state: 'closed', at: slots[0].start, day, ahead };
    }
  }
  return { state: 'closed' };
}

const WORDS = {
  open:   { en: 'Open now',  es: 'Abierto ahora' },
  soon:   { en: 'Opens',     es: 'Abre' },
  closed: { en: 'Closed',    es: 'Cerrado' },
  until:  { en: 'until',     es: 'hasta' },
  next:   { en: 'next',      es: 'próximo' },
  today:  { en: 'today',     es: 'hoy' },
  free:   { en: 'Free',      es: 'Gratis' },
  opensAt:{ en: 'opens',     es: 'abre' },
};
const DAY_ES = {
  Sunday: 'domingo', Monday: 'lunes', Tuesday: 'martes', Wednesday: 'miércoles',
  Thursday: 'jueves', Friday: 'viernes', Saturday: 'sábado',
};
const dayName = (d) => (lang === 'es' ? DAY_ES[d] || d : d);
const word = (k) => WORDS[k][lang] ?? WORDS[k].en;

/* ═══════════════════════════════════════════════════════════════════════════
   THE STATUS STRIP
   ═══════════════════════════════════════════════════════════════════════════ */
export function initStatus(config) {
  const host = document.querySelector('[data-status]');
  if (!host || !Array.isArray(config?.programmes)) return;

  const render = () => {
    const now = nowInZone(config.timezone);
    const rows = config.programmes
      .map((p) => ({ p, s: statusOf(p, now) }))
      .sort((a, b) => {
        const rank = { open: 0, soon: 1, closed: 2 };
        if (rank[a.s.state] !== rank[b.s.state]) return rank[a.s.state] - rank[b.s.state];
        return (a.s.ahead ?? 9) - (b.s.ahead ?? 9);
      })
      .slice(0, 3);

    const frag = document.createDocumentFragment();
    for (const { p, s } of rows) {
      const item = el('div', 'status__item');
      item.dataset.state = s.state;
      item.append(el('span', 'status__dot'));
      item.append(el('span', 'status__what', t(p.name)));

      let when;
      if (s.state === 'open') {
        when = `${word('open')} · ${word('until')} ${fmtTime(s.at, config.use24HourClock)}`;
      } else if (s.state === 'soon') {
        when = `${word('soon')} ${fmtTime(s.at, config.use24HourClock)}`;
      } else if (s.at) {
        const when_ = s.ahead === 0 ? word('today') : dayName(s.day);
        when = `${word('closed')} — ${word('opensAt')} ${fmtTime(s.at, config.use24HourClock)} ${when_}`;
      } else {
        when = word('closed');
      }
      item.append(el('span', 'status__when', when));
      frag.append(item);
    }
    host.replaceChildren(frag);
  };

  render();
  document.addEventListener('commons:lang', render);
  // A pantry closing at 1pm should stop saying "Open now" at 1pm.
  setInterval(render, 60_000);
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE DIRECTORY
   ═══════════════════════════════════════════════════════════════════════════ */
const KIND_LABEL = {
  food:     { en: 'Food',        es: 'Comida' },
  learning: { en: 'Learning',    es: 'Aprender' },
  care:     { en: 'Care',        es: 'Cuidado' },
  money:    { en: 'Money',       es: 'Dinero' },
  goods:    { en: 'Clothes & goods', es: 'Ropa y artículos' },
  advice:   { en: 'Advice',      es: 'Asesoría' },
};

export function initDirectory(config) {
  const host = document.querySelector('[data-directory]');
  if (!host || !Array.isArray(config?.programmes)) return;
  const filterHost = document.querySelector('[data-directory-filters]');
  let active = null;

  const hoursLine = (p) => (p.hours || []).map((h) => {
    const range = `${fmtTime(h.start, config.use24HourClock)}–${fmtTime(h.end, config.use24HourClock)}`;
    return `${dayName(h.day)} ${range}${h.note ? ` (${t(h.note)})` : ''}`;
  }).join(' · ');

  const render = () => {
    const now = nowInZone(config.timezone);
    const list = el('ol', 'directory');
    for (const p of config.programmes) {
      if (active && p.kind !== active) continue;
      const s = statusOf(p, now);

      const li = el('li', 'service');
      li.id = p.id;

      const head = el('div', 'service__head');
      head.append(el('h3', 'service__name', t(p.name)));
      const badge = el('span', 'service__state');
      badge.dataset.state = s.state;
      badge.textContent = s.state === 'open' ? word('open')
        : s.state === 'soon' ? `${word('soon')} ${fmtTime(s.at, config.use24HourClock)}`
        : word('closed');
      head.append(badge);
      li.append(head);

      li.append(el('p', 'service__summary', t(p.summary)));
      li.append(el('p', 'service__when', hoursLine(p)));

      const facts = el('dl', 'service__facts');
      const fact = (k, v) => {
        if (!v) return;
        facts.append(el('dt', null, k));
        facts.append(el('dd', null, v));
      };
      fact(lang === 'es' ? 'Dónde' : 'Where', t(p.where));
      fact(lang === 'es' ? 'Quién puede venir' : 'Who can come', t(p.eligibility));
      fact(lang === 'es' ? 'Qué traer' : 'What to bring', t(p.bring));
      li.append(facts);

      const tags = el('ul', 'tags');
      const tag = (txt, cls) => { const x = el('li', cls ? `tag ${cls}` : 'tag', txt); tags.append(x); };
      tag(t(p.cost) || word('free'), 'tag--free');
      for (const l of p.languages || []) tag(l);
      tag(t(KIND_LABEL[p.kind]) || p.kind, 'tag--kind');
      li.append(tags);

      list.append(li);
    }
    host.replaceChildren(list);
  };

  if (filterHost) {
    const kinds = [...new Set(config.programmes.map((p) => p.kind))];
    const bar = el('div', 'filterbar');
    const mk = (label, value) => {
      const b = el('button', 'filter', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(active === value));
      b.addEventListener('click', () => {
        active = active === value ? null : value;
        bar.querySelectorAll('.filter').forEach((x) =>
          x.setAttribute('aria-pressed', String(x.dataset.value === (active ?? '__all'))));
        render();
      });
      b.dataset.value = value ?? '__all';
      return b;
    };
    const rebuild = () => {
      bar.replaceChildren();
      bar.append(mk(lang === 'es' ? 'Todo' : 'Everything', null));
      for (const k of kinds) bar.append(mk(t(KIND_LABEL[k]) || k, k));
      bar.querySelectorAll('.filter').forEach((x) =>
        x.setAttribute('aria-pressed', String(x.dataset.value === (active ?? '__all'))));
    };
    rebuild();
    filterHost.replaceChildren(bar);
    document.addEventListener('commons:lang', rebuild);
  }

  render();
  document.addEventListener('commons:lang', render);
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE TIMETABLE — the whole week on one board.
   ═══════════════════════════════════════════════════════════════════════════ */
export function initTimetable(config) {
  const host = document.querySelector('[data-timetable]');
  if (!host || !Array.isArray(config?.programmes)) return;

  const render = () => {
    const now = nowInZone(config.timezone);
    const order = [...WEEK.slice(1), WEEK[0]];      // Monday-first, as a week reads
    const grid = el('div', 'timetable');

    for (const day of order) {
      const col = el('section', 'timetable__day');
      if (day === now.day) col.dataset.today = '';
      col.append(el('h3', null, dayName(day)));

      const sessions = [];
      for (const p of config.programmes) {
        for (const h of p.hours || []) {
          if (h.day === day) sessions.push({ p, h });
        }
      }
      for (const s of config.services || []) {
        if (s.day === day) sessions.push({ p: { name: s.label, kind: 'worship' }, h: { start: s.time, end: null } });
      }
      sessions.sort((a, b) => toMinutes(a.h.start) - toMinutes(b.h.start));

      if (!sessions.length) {
        col.append(el('p', 'timetable__empty', lang === 'es' ? 'Cerrado' : 'Closed'));
      } else {
        const ul = el('ul', 'sessions');
        for (const { p, h } of sessions) {
          const li = el('li', 'session');
          li.dataset.kind = p.kind || '';
          const time = h.end
            ? `${fmtTime(h.start, config.use24HourClock)}–${fmtTime(h.end, config.use24HourClock)}`
            : fmtTime(h.start, config.use24HourClock);
          li.append(el('span', 'session__time', time));
          li.append(el('span', 'session__what', t(p.name)));
          ul.append(li);
        }
        col.append(ul);
      }
      grid.append(col);
    }
    host.replaceChildren(grid);
  };

  render();
  document.addEventListener('commons:lang', render);
}

/* ═══════════════════════════════════════════════════════════════════════════
   VOLUNTEER SHIFTS — with the number of places actually left, including the
   ones that are full. A rota that only ever shows gaps reads like a guilt trip.
   ═══════════════════════════════════════════════════════════════════════════ */
export function initShifts(config) {
  const host = document.querySelector('[data-shifts]');
  if (!host || !Array.isArray(config?.shifts)) return;

  const render = () => {
    const list = el('ol', 'shifts');
    for (const s of config.shifts) {
      const left = Math.max(0, (s.needed || 0) - (s.filled || 0));
      const li = el('li', 'shift');
      if (!left) li.dataset.full = '';

      const when = el('div', 'shift__when');
      when.append(el('span', 'shift__day', dayName(s.day)));
      when.append(el('span', 'shift__time',
        `${fmtTime(s.start, config.use24HourClock)}–${fmtTime(s.end, config.use24HourClock)}`));
      li.append(when);

      const body = el('div');
      body.append(el('h3', 'shift__name', t(s.name)));
      if (s.note) body.append(el('p', 'shift__note', t(s.note)));
      li.append(body);

      const places = el('div', 'shift__places');
      const pips = el('span', 'pips');
      pips.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < (s.needed || 0); i += 1) {
        const pip = el('i', 'pip');
        if (i < (s.filled || 0)) pip.dataset.filled = '';
        pips.append(pip);
      }
      places.append(pips);
      places.append(el('span', 'shift__left', left
        ? (lang === 'es' ? `${left} lugares libres` : `${left} place${left === 1 ? '' : 's'} left`)
        : (lang === 'es' ? 'Completo' : 'Full')));
      li.append(places);

      list.append(li);
    }
    host.replaceChildren(list);
  };

  render();
  document.addEventListener('commons:lang', render);
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE REST — figures, partners, staff, current needs.
   ═══════════════════════════════════════════════════════════════════════════ */
function simpleList(selector, items, build) {
  const host = document.querySelector(selector);
  if (!host || !Array.isArray(items)) return null;
  const render = () => host.replaceChildren(build(items));
  render();
  document.addEventListener('commons:lang', render);
  return host;
}

export function initImpact(config) {
  simpleList('[data-impact]', config?.impact?.figures, (items) => {
    const ol = el('ol', 'records');
    for (const f of items) {
      const li = el('li', 'record');
      li.append(el('span', 'record__n', f.value));
      li.append(el('span', 'record__label', t(f.label)));
      if (f.note) li.append(el('span', 'record__note', t(f.note)));
      ol.append(li);
    }
    return ol;
  });
}

export function initPartners(config) {
  simpleList('[data-partners]', config?.partners, (items) => {
    const ol = el('ol', 'partners');
    for (const p of items) {
      const li = el('li', 'partner');
      li.append(el('h3', null, p.name));
      li.append(el('p', 'partner__what', t(p.what)));
      li.append(el('p', 'partner__contact', p.contact));
      ol.append(li);
    }
    return ol;
  });
}

export function initStaff(config) {
  simpleList('[data-staff]', config?.staff, (items) => {
    const ol = el('ol', 'people');
    for (const p of items) {
      const li = el('li', 'person');
      li.append(el('h3', 'person__name', p.name));
      li.append(el('span', 'person__role', t(p.role)));
      if (p.note) li.append(el('p', 'person__note', t(p.note)));
      ol.append(li);
    }
    return ol;
  });
}

/* The Sunday times. Rendered here rather than through core's <template>
   binding, because that binding cannot localise a weekday or reach into a
   {en, es} note — both stayed English while the rest of the page switched. */
export function initServices(config) {
  simpleList('[data-services]', config?.services, (items) => {
    const ol = el('ol', 'shifts');
    for (const s of items) {
      const li = el('li', 'shift');
      li.style.gridTemplateColumns = '9rem 1fr';
      const when = el('div', 'shift__when');
      when.append(el('span', 'shift__day', dayName(s.day)));
      when.append(el('span', 'shift__time', fmtTime(s.time, config.use24HourClock)));
      li.append(when);
      const body = el('div');
      body.append(el('h3', 'shift__name', s.label));
      if (s.note) body.append(el('p', 'shift__note', t(s.note)));
      li.append(body);
      ol.append(li);
    }
    return ol;
  });
}

/* The board at the gate. Same source array as the Sundays band, set as sign
   rows instead of a list — the times a stranger is looking for are the whole
   reason a church puts a board outside, and this template previously made
   them the last thing on the page. */
export function initBoard(config) {
  simpleList('[data-board]', config?.services, (items) => {
    const ul = el('ul', 'noticeboard__hours');
    for (const s of items) {
      const li = document.createElement('li');
      li.append(el('span', 'noticeboard__time', fmtTime(s.time, config.use24HourClock)));
      li.append(el('span', 'noticeboard__what', `${dayName(s.day)} · ${t(s.label)}`));
      if (s.note) li.append(el('span', 'noticeboard__note', t(s.note)));
      ul.append(li);
    }
    return ul;
  });
}

export function initNeeds(config) {
  simpleList('[data-needs]', config?.needs, (items) => {
    const ul = el('ul', 'needs');
    for (const n of items) ul.append(el('li', 'need', t(n)));
    return ul;
  });
}

/* ── The wayfinder's small-screen behaviour ─────────────────────────────── */
export function initWayfinder() {
  const toggle = document.querySelector('.wayfinder-toggle');
  const nav = document.querySelector('.wayfinder');
  if (!toggle || !nav || toggle.dataset.bound) return;
  toggle.dataset.bound = '1';

  const set = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.toggleAttribute('data-open', open);
  };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { set(false); toggle.focus(); }
  });
  matchMedia('(min-width: 60rem)').addEventListener('change', (e) => { if (e.matches) set(false); });
}

/** Everything, in one call. */
export function initCommons(config) {
  initLanguage(config);
  initWayfinder();
  initStatus(config);
  initDirectory(config);
  initTimetable(config);
  initShifts(config);
  initImpact(config);
  initPartners(config);
  initStaff(config);
  initServices(config);
  initBoard(config);
  initNeeds(config);
}
