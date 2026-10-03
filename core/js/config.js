/**
 * config.js — hydrates a template from church.config.json.
 *
 * The church edits one file. This walks the DOM and fills anything carrying a
 * data-church binding, so the header, footer, service times, address, phone,
 * giving links and map all update together and can never drift apart.
 *
 * Bindings:
 *   data-church="name"              → textContent from a dotted config path
 *   data-church-href="giving.url"   → href
 *   data-church-src="…"             → src
 *   data-church-list="services"     → repeat a <template> child per array item
 *
 * Missing values are left as the markup's own placeholder text rather than
 * blanked, so a half-configured site still reads as a website.
 */

/** Resolve "address.city" against an object. */
export const get = (obj, path) =>
  path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** 24h "10:30" → "10:30 AM", respecting a 24h locale preference. */
export function formatTime(hhmm, use24 = false) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  if (use24) return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
  const period = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')} ${period}` : `${hour} ${period}`;
}

export const formatAddress = (a = {}) =>
  [a.street, a.city && a.region ? `${a.city}, ${a.region}` : a.city, a.postal]
    .filter(Boolean).join(', ');

/** Google Maps directions link — no API key, no embed, no third-party script. */
export const mapsLink = (a = {}) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    [a.street, a.city, a.region, a.postal, a.country].filter(Boolean).join(' ')
  )}`;

function fillTemplate(node, item, config) {
  node.querySelectorAll('[data-item]').forEach((el) => {
    const key = el.dataset.item;
    let value = get(item, key);
    if (key === 'time') value = formatTime(item.time, config.use24HourClock);
    if (value == null || value === '') {
      // Drop empty optional nodes rather than leaving stray punctuation.
      if (el.hasAttribute('data-item-optional')) el.remove();
      return;
    }
    el.textContent = value;
  });
  // Event start times are ISO strings; render them as a human date.
  //
  // In the CHURCH's timezone, not the reader's. Without this, an evening
  // service in Vermont shows up as the following day to anyone reading from
  // Europe — a carol service on the 20th listed as the 21st at 1:30am. A
  // church's calendar is a fact about where the church is.
  node.querySelectorAll('[data-item-date]').forEach((el) => {
    const iso = item[el.dataset.itemDate || 'start'] || item.start;
    if (!iso) { el.remove(); return; }
    el.textContent = new Date(iso).toLocaleDateString(config.locale || 'en', {
      weekday: 'short', day: 'numeric', month: 'short',
      ...(config.timezone && { timeZone: config.timezone }),
    });
  });
  node.querySelectorAll('[data-item-href]').forEach((el) => {
    const v = get(item, el.dataset.itemHref);
    if (v) el.setAttribute('href', v);
  });
}

export function hydrate(config, root = document) {
  // Simple text bindings
  root.querySelectorAll('[data-church]').forEach((el) => {
    const path = el.dataset.church;
    let value;
    switch (path) {
      case '@address':   value = formatAddress(config.address); break;
      case '@year':      value = new Date().getFullYear();      break;
      default:           value = get(config, path);
    }
    if (value != null && value !== '') el.textContent = value;
  });

  // Attribute bindings
  root.querySelectorAll('[data-church-href]').forEach((el) => {
    const path = el.dataset.churchHref;
    const value = path === '@maps' ? mapsLink(config.address)
                : path === '@tel'  ? `tel:${(config.phone || '').replace(/[^\d+]/g, '')}`
                : path === '@email'? `mailto:${config.email || ''}`
                : get(config, path);
    if (value) el.setAttribute('href', value);
  });

  root.querySelectorAll('[data-church-src]').forEach((el) => {
    const value = get(config, el.dataset.churchSrc);
    if (value) el.setAttribute('src', value);
  });

  // Repeating lists driven by a <template> child
  root.querySelectorAll('[data-church-list]').forEach((host) => {
    const items = get(config, host.dataset.churchList);
    const tpl = host.querySelector('template');
    if (!Array.isArray(items) || !tpl) return;
    const frag = document.createDocumentFragment();
    items.forEach((item) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      fillTemplate(node, item, config);
      frag.appendChild(node);
    });
    tpl.remove();
    host.append(frag);
  });

  // Giving embed: the church pastes provider HTML into config; if they gave us
  // only a URL, the button binding above already handled it.
  if (config.giving?.embed) {
    root.querySelectorAll('.giving__embed').forEach((el) => {
      el.innerHTML = config.giving.embed;
    });
  }

  document.documentElement.lang = config.locale || 'en';
  return config;
}

/** Load church.config.json relative to the page. */
export async function loadConfig(url = 'church.config.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json();
}
