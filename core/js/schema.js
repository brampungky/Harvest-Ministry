/**
 * schema.js — emits schema.org JSON-LD from church.config.json.
 *
 * This is the piece a volunteer webmaster cannot hand-write and Google rewards
 * heavily: correct Church + Place + OpeningHoursSpecification markup is what
 * makes a parish eligible for "mass times near me" and the local pack.
 *
 * Emitted as a single @graph so the entities can reference each other properly
 * rather than repeating the address three times.
 */

const DAYS = {
  sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
};

const dayUrl = (d) => {
  const name = DAYS[String(d).toLowerCase()];
  return name ? `https://schema.org/${name}` : undefined;
};

/** "10:30" → "10:30", "9" → "09:00". Schema wants ISO-8601 wall time. */
const iso = (t) => {
  const [h, m] = String(t).split(':');
  return `${String(h).padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
};

/** Add minutes to a wall-clock time, for service end times. */
function addMinutes(t, mins) {
  const [h, m] = iso(t).split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * A benefice: several churches, one ministry team.
 *
 * THIS IS THE COMMERCIAL ARGUMENT FOR THE WHOLE TEMPLATE. A benefice on an
 * ordinary single-church template publishes one Church node with one address,
 * so four of its five buildings are invisible to local search. Emitting each
 * church as its own Church + Place, with its OWN geo and its OWN service
 * times, turns one website into five candidates for "church near me" — and
 * that is not something a volunteer can hand-write into a page builder.
 *
 * Each church points at the benefice via parentOrganization, so the
 * relationship is stated rather than implied by them sharing a domain.
 */
function beneficeGraph(config, origin) {
  const beneficeId = `${origin}/#benefice`;

  const benefice = {
    '@type': 'ReligiousOrganization',
    '@id': beneficeId,
    name: config.name,
    url: origin + '/',
    ...(config.tagline && { description: config.tagline }),
    ...(config.phone && { telephone: config.phone }),
    ...(config.email && { email: config.email }),
    ...(config.diocese && { memberOf: { '@type': 'Organization', name: config.diocese } }),
    ...(config.socials?.length && { sameAs: config.socials }),
  };

  const graph = [benefice];

  for (const c of config.churches) {
    const cid = `${origin}/#church-${c.id}`;
    const pid = `${origin}/#place-${c.id}`;
    const address = c.address && {
      '@type': 'PostalAddress',
      streetAddress: c.address.street,
      addressLocality: c.address.city,
      addressRegion: c.address.region,
      postalCode: c.address.postal,
      addressCountry: c.address.country,
    };

    // A rotating service is still a recurring weekly one as far as search is
    // concerned. What must not happen is the benefice publishing one set of
    // hours against five addresses.
    const hours = (c.pattern || []).map((p) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: 'https://schema.org/Sunday',
      opens: iso(p.time),
      closes: addMinutes(p.time, p.durationMinutes || 60),
      ...(p.label && { name: p.label }),
    }));

    graph.push({
      '@type': 'Church',
      '@id': cid,
      name: c.village ? `${c.name}, ${c.village}` : c.name,
      ...(c.page && { url: `${origin}/${c.page}` }),
      ...(c.note && { description: c.note }),
      ...(address && { address }),
      location: { '@id': pid },
      parentOrganization: { '@id': beneficeId },
      ...(hours.length && { openingHoursSpecification: hours }),
    });

    graph.push({
      '@type': 'Place',
      '@id': pid,
      name: c.village ? `${c.name}, ${c.village}` : c.name,
      address,
      ...(c.geo && {
        geo: { '@type': 'GeoCoordinates', latitude: c.geo.lat, longitude: c.geo.lng },
      }),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

export function buildGraph(config, pageUrl = location.href) {
  const origin = new URL(pageUrl).origin;

  // A benefice is a different shape, not a single church with extra fields.
  if (Array.isArray(config.churches) && config.churches.length) {
    return beneficeGraph(config, origin);
  }

  const churchId = `${origin}/#church`;
  const placeId = `${origin}/#place`;

  const address = config.address && {
    '@type': 'PostalAddress',
    streetAddress: config.address.street,
    addressLocality: config.address.city,
    addressRegion: config.address.region,
    postalCode: config.address.postal,
    addressCountry: config.address.country,
  };

  const place = {
    '@type': 'Place',
    '@id': placeId,
    name: config.name,
    address,
    ...(config.geo && {
      geo: { '@type': 'GeoCoordinates', latitude: config.geo.lat, longitude: config.geo.lng },
    }),
  };

  // Regular services become opening hours on the church itself — this is the
  // property that surfaces service times directly in search results.
  const hours = (config.services || []).map((s) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: dayUrl(s.day),
    opens: iso(s.time),
    closes: addMinutes(s.time, s.durationMinutes || 75),
    ...(s.label && { name: s.label }),
  })).filter((h) => h.dayOfWeek);

  const church = {
    '@type': 'Church',
    '@id': churchId,
    name: config.name,
    url: origin + '/',
    ...(config.tagline && { description: config.tagline }),
    ...(config.logo && { logo: new URL(config.logo, origin).href }),
    ...(config.phone && { telephone: config.phone }),
    ...(config.email && { email: config.email }),
    ...(address && { address }),
    location: { '@id': placeId },
    ...(hours.length && { openingHoursSpecification: hours }),
    // additionalType takes a type URI, not a plain word — passing "Episcopal"
    // here is invalid. A church may supply a Wikidata URI if it wants the
    // denomination machine-readable; otherwise it stays out of the graph.
    ...(/^https?:\/\//.test(config.denominationUri || '') && {
      additionalType: config.denominationUri,
    }),
    ...(config.socials?.length && { sameAs: config.socials }),
  };

  const graph = [church, place];

  // Named one-off events (not the weekly pattern — those are opening hours).
  (config.events || []).forEach((e, i) => {
    graph.push({
      '@type': 'Event',
      '@id': `${origin}/#event-${i + 1}`,
      name: e.name,
      startDate: e.start,
      ...(e.end && { endDate: e.end }),
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: { '@id': placeId },
      organizer: { '@id': churchId },
      ...(e.description && { description: e.description }),
      ...(e.url && { url: e.url }),
      // Church events are almost always free; saying so explicitly is what
      // makes them eligible for the free-event treatment in results.
      offers: {
        '@type': 'Offer',
        price: e.price ?? '0',
        priceCurrency: e.currency || 'USD',
        availability: 'https://schema.org/InStock',
        url: e.url || origin + '/',
      },
    });
  });

  return { '@context': 'https://schema.org', '@graph': graph };
}

/** Inject (or replace) the graph in <head>. */
export function injectSchema(config, pageUrl = location.href) {
  const graph = buildGraph(config, pageUrl);
  let el = document.getElementById('church-schema');
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'church-schema';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(graph, null, 2);
  return graph;
}
