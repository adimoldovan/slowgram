import { describe, it, expect } from 'vitest';
import {
  toRfc822,
  toMonthYear,
  escapeXml,
  mimeForExt,
  buildItemDescription,
  buildRss,
  photoId,
  photoSlug,
  photoPermalink,
  resolvePublishedDates,
} from '../bin/rss.js';
import { photoSlug as frontendPhotoSlug } from '../src/lightbox';

const photo = (name, takenMs) => ({
  src: { path: `https://cdn/${name}`, src: `${name}-1920w.webp`, set: [] },
  dateTaken: { timestamp: takenMs },
});

describe('toRfc822', () => {
  it('formats a timestamp as an RFC-822 GMT date', () => {
    // 2026-06-20T14:05:09Z
    const ms = Date.UTC(2026, 5, 20, 14, 5, 9);
    expect(toRfc822(ms)).toBe('Sat, 20 Jun 2026 14:05:09 GMT');
  });

  it('zero-pads day, hours, minutes and seconds', () => {
    const ms = Date.UTC(2026, 0, 5, 3, 7, 8);
    expect(toRfc822(ms)).toBe('Mon, 05 Jan 2026 03:07:08 GMT');
  });
});

describe('toMonthYear', () => {
  it('formats an EXIF DateTimeOriginal as "Month YYYY"', () => {
    expect(toMonthYear('2026:06:20 14:05:09')).toBe('June 2026');
    expect(toMonthYear('2020:01:01 00:00:00')).toBe('January 2020');
  });

  it('returns an empty string for missing or unparseable input', () => {
    expect(toMonthYear(undefined)).toBe('');
    expect(toMonthYear('')).toBe('');
    expect(toMonthYear('not a date')).toBe('');
  });
});

describe('escapeXml', () => {
  it('escapes the five XML metacharacters', () => {
    expect(escapeXml(`<a href="x">b & 'c'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;b &amp; &apos;c&apos;&lt;/a&gt;'
    );
  });
});

describe('mimeForExt', () => {
  it('maps known image extensions', () => {
    expect(mimeForExt('.webp')).toBe('image/webp');
    expect(mimeForExt('.JPG')).toBe('image/jpeg');
    expect(mimeForExt('.png')).toBe('image/png');
  });

  it('falls back to octet-stream for unknown extensions', () => {
    expect(mimeForExt('.xyz')).toBe('application/octet-stream');
  });
});

describe('buildItemDescription', () => {
  it('includes the image, srcset and metadata lines separated by <br />', () => {
    const html = buildItemDescription({
      imgSrc: 'https://cdn/x/x-1920w.webp',
      srcset: 'https://cdn/x/x-320w.webp 320w, https://cdn/x/x-1920w.webp 1920w',
      alt: 'Sunset',
      metaLines: ['Sunset', 'Lisbon, Portugal · June 2026', 'Fujifilm X100V'],
    });
    expect(html).toContain('src="https://cdn/x/x-1920w.webp"');
    expect(html).toContain('srcset="https://cdn/x/x-320w.webp 320w');
    expect(html).toContain('alt="Sunset"');
    expect(html).toContain(
      '<p>Sunset<br />Lisbon, Portugal · June 2026<br />Fujifilm X100V</p>'
    );
  });

  it('drops empty meta lines so blank fields leave no stray <br />', () => {
    const html = buildItemDescription({
      imgSrc: 'https://cdn/x.webp',
      alt: 'x',
      metaLines: ['', 'Lisbon · June 2026', ''],
    });
    expect(html).toContain('<p>Lisbon · June 2026</p>');
    expect(html).not.toContain('<br />');
  });

  it('omits srcset and meta when not provided', () => {
    const html = buildItemDescription({ imgSrc: 'https://cdn/x.webp', alt: 'x' });
    expect(html).not.toContain('srcset');
    expect(html.match(/<p>/g)).toHaveLength(1); // only the image paragraph
  });
});

describe('photoId', () => {
  it('derives the id from the CDN folder', () => {
    expect(photoId(photo('sunset', 1))).toBe('sunset');
  });
});

describe('photoSlug', () => {
  it('strips trailing dashes so it matches the frontend deep-link slug', () => {
    expect(photoSlug(photo('20260506-141559-'))).toBe('20260506-141559');
  });

  it('leaves an id without trailing dashes unchanged', () => {
    expect(photoSlug(photo('sunset'))).toBe('sunset');
  });
});

describe('shared photo identity', () => {
  it('the feed and the frontend resolve a slug through the exact same function', () => {
    // Identity, not just equal behavior: the RSS <link> must follow the
    // frontend's deep-link rule even if that rule later changes. Same function
    // object => they can never silently drift apart.
    expect(photoSlug).toBe(frontendPhotoSlug);
  });
});

describe('photoPermalink', () => {
  it('builds a /photo/{slug} deep link from the configured site url', () => {
    expect(
      photoPermalink(photo('20260506-141559-'), 'https://slowgram.amoldovan.ro', 'fallback')
    ).toBe('https://slowgram.amoldovan.ro/photo/20260506-141559');
  });

  it('does not double a trailing slash on the site url', () => {
    expect(photoPermalink(photo('sunset'), 'https://x/', 'fb')).toBe('https://x/photo/sunset');
  });

  it('falls back to the given url when no site url is configured', () => {
    expect(photoPermalink(photo('sunset'), '', 'https://cdn/sunset/sunset-1920w.webp')).toBe(
      'https://cdn/sunset/sunset-1920w.webp'
    );
  });
});

describe('resolvePublishedDates', () => {
  const NOW = Date.UTC(2026, 5, 20, 12, 0, 0);
  const taken = Date.UTC(2020, 0, 1, 0, 0, 0);

  it('seeds every photo from its date taken on the first run', () => {
    const { map, firstRun } = resolvePublishedDates(
      [photo('a', taken), photo('b', taken + 1)],
      null,
      NOW
    );
    expect(firstRun).toBe(true);
    expect(map).toEqual({ a: taken, b: taken + 1 });
  });

  it('keeps existing dates and stamps newly added photos with now', () => {
    const existing = { a: taken };
    const { map, firstRun } = resolvePublishedDates(
      [photo('a', taken), photo('b', taken + 1)],
      existing,
      NOW
    );
    expect(firstRun).toBe(false);
    expect(map.a).toBe(taken); // unchanged
    expect(map.b).toBe(NOW); // late-added old photo floats to the top
  });

  it('does not mutate the passed-in map', () => {
    const existing = { a: taken };
    resolvePublishedDates([photo('b', taken)], existing, NOW);
    expect(existing).toEqual({ a: taken });
  });
});

describe('buildRss', () => {
  const items = [
    {
      title: 'Sunset',
      link: 'https://slowgram.amoldovan.ro',
      guid: 'https://cdn/sunset/sunset-1920w.webp',
      pubDateMs: Date.UTC(2026, 5, 20, 14, 0, 0),
      descriptionHtml: '<p><img src="https://cdn/sunset/sunset-1920w.webp" /></p>',
      enclosure: {
        url: 'https://cdn/sunset/sunset-1920w.webp',
        length: 123456,
        type: 'image/webp',
      },
    },
  ];

  const xml = buildRss({
    title: "Adi's slowgram",
    link: 'https://slowgram.amoldovan.ro',
    description: 'A photo every now and then.',
    feedUrl: 'https://slowgram.amoldovan.ro/rss',
    imageUrl: 'https://www.gravatar.com/avatar/abc?s=144',
    items,
    lastBuildMs: Date.UTC(2026, 5, 20, 15, 0, 0),
  });

  it('emits a well-formed RSS 2.0 envelope', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('</channel>');
    expect(xml).toContain('</rss>');
  });

  it('includes the atom self link and channel image', () => {
    expect(xml).toContain(
      '<atom:link href="https://slowgram.amoldovan.ro/rss" rel="self" type="application/rss+xml" />'
    );
    expect(xml).toContain('<url>https://www.gravatar.com/avatar/abc?s=144</url>');
  });

  it('renders each item with guid, pubDate, description and enclosure', () => {
    expect(xml).toContain('<guid isPermaLink="false">https://cdn/sunset/sunset-1920w.webp</guid>');
    expect(xml).toContain('<pubDate>Sat, 20 Jun 2026 14:00:00 GMT</pubDate>');
    expect(xml).toContain('<![CDATA[<p><img');
    expect(xml).toContain(
      '<enclosure url="https://cdn/sunset/sunset-1920w.webp" length="123456" type="image/webp" />'
    );
  });

  it('escapes special characters in the channel title', () => {
    const escaped = buildRss({
      title: 'Tom & Jerry',
      link: 'https://x',
      description: 'd',
      items: [],
    });
    expect(escaped).toContain('<title>Tom &amp; Jerry</title>');
  });

  it('keeps a literal "]]>" in a description from breaking the CDATA section', () => {
    const out = buildRss({
      title: 't',
      link: 'https://x',
      description: 'd',
      lastBuildMs: Date.UTC(2026, 5, 20, 15, 0, 0),
      items: [
        {
          title: 'x',
          link: 'https://x',
          guid: 'g',
          pubDateMs: Date.UTC(2026, 5, 20, 14, 0, 0),
          descriptionHtml: '<p>danger ]]> here</p>',
        },
      ],
    });
    expect(out).not.toContain('danger ]]> here'); // raw sequence must be split
    const doc = new DOMParser().parseFromString(out, 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('item > description').textContent).toContain('danger ]]> here');
  });

  it('omits lastBuildDate (no epoch fallback) when no timestamp is available', () => {
    const out = buildRss({ title: 't', link: 'https://x', description: 'd', items: [] });
    expect(out).not.toContain('<lastBuildDate>');
    expect(out).not.toContain('1970');
  });

  it('is minified: no indentation or newlines between tags', () => {
    // The feed every reader downloads should carry no structural whitespace.
    expect(xml).not.toContain('\n');
    expect(xml).toContain('</title><link>'); // tags sit flush against each other
  });

  it('preserves a newline inside a value rather than collapsing it', () => {
    // Minifying must only drop the inter-tag indentation, never whitespace that
    // is part of a value (titles/captions come from free-text EXIF/IPTC fields).
    const out = buildRss({
      title: 'Line one\nLine two',
      link: 'https://x',
      description: 'd',
      items: [
        {
          title: 't',
          link: 'https://x',
          guid: 'g',
          pubDateMs: Date.UTC(2026, 5, 20, 14, 0, 0),
          descriptionHtml: '<p>caption A\ncaption B</p>',
        },
      ],
    });
    expect(out).toContain('<title>Line one\nLine two</title>');
    expect(out).toContain('caption A\ncaption B');
    const doc = new DOMParser().parseFromString(out, 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
  });

  it('produces well-formed XML (parses without errors)', () => {
    // jsdom (test environment) provides DOMParser; XML mode reports a
    // <parsererror> element on malformed input.
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('item')).toHaveLength(1);
    expect(doc.querySelector('item > guid').textContent).toBe(
      'https://cdn/sunset/sunset-1920w.webp'
    );
  });
});
