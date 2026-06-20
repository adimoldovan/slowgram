// Pure helpers for generating an RSS 2.0 feed from processed photo data.
// Kept side-effect free so they can be unit tested; build-feed.mjs supplies
// the filesystem-derived bits (enclosure byte length) and writes the result.

// photoId/photoSlug come from the frontend's shared module so feed <link>s
// resolve to the same /photo/{slug} the app's routing produces. Re-exported
// here for build-feed.mjs and the tests that already import them from rss.mjs.
import { photoId, photoSlug } from '../src/photo-id.mjs';

export { photoId, photoSlug };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MIME_BY_EXT = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
};

const pad = (n) => String(n).padStart(2, '0');

// RFC-822 date in GMT, e.g. "Sat, 20 Jun 2026 14:05:09 GMT".
export function toRfc822(ms) {
  const d = new Date(ms);
  return (
    `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ` +
    `${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:` +
    `${pad(d.getUTCSeconds())} GMT`
  );
}

// Format an EXIF DateTimeOriginal ("YYYY:MM:DD HH:MM:SS") as "Month YYYY",
// e.g. "June 2026". Returns '' for missing/unparseable input so callers can
// drop it from a joined meta line.
export function toMonthYear(exifDate) {
  const m = /^(\d{4}):(\d{2}):/.exec(String(exifDate ?? ''));
  if (!m) return '';
  const month = FULL_MONTHS[parseInt(m[2], 10) - 1];
  return month ? `${month} ${m[1]}` : '';
}

export function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

// Canonical site permalink used as an item's <link>: the /photo/{slug} deep link
// when a site URL is configured, else the supplied fallback (e.g. the raw image
// URL) so the feed still carries a usable link without a site.
export function photoPermalink(image, siteUrl, fallback) {
  if (!siteUrl) return fallback;
  return `${siteUrl.replace(/\/+$/, '')}/photo/${photoSlug(image)}`;
}

// Resolve "first seen in the feed" timestamps used as RSS pubDates.
// On the very first run (no prior map) every photo is seeded from its date
// taken so the historical feed reads naturally; from then on any newly added
// photo gets `nowMs`, so it floats to the top of a reader regardless of when
// it was shot. Returns a new map; existing entries are never overwritten.
export function resolvePublishedDates(images, existing, nowMs) {
  const firstRun = existing == null;
  const map = { ...(existing || {}) };
  for (const image of images) {
    const id = photoId(image);
    if (!(id in map)) {
      map[id] = firstRun ? image.dateTaken.timestamp : nowMs;
    }
  }
  return { map, firstRun };
}

// Wrap HTML in CDATA, defusing any literal "]]>" so the section stays valid.
function cdata(html) {
  return `<![CDATA[${String(html).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

export function mimeForExt(ext) {
  return MIME_BY_EXT[String(ext).toLowerCase()] || 'application/octet-stream';
}

// Build the HTML body shown inside an RSS reader for one photo. metaLines is an
// ordered list of caption lines (e.g. title, "location · date", camera); each
// non-empty line is rendered on its own row, separated by <br />.
export function buildItemDescription({ imgSrc, srcset, alt, metaLines = [] }) {
  const srcsetAttr = srcset ? ` srcset="${escapeXml(srcset)}"` : '';
  const sizesAttr = srcset ? ' sizes="100vw"' : '';
  const lines = (Array.isArray(metaLines) ? metaLines : [metaLines]).filter(Boolean);
  const metaBlock = lines.length
    ? `<p>${lines.map((line) => escapeXml(line)).join('<br />')}</p>`
    : '';
  return (
    `<p><img src="${escapeXml(imgSrc)}"${srcsetAttr}${sizesAttr} ` +
    `alt="${escapeXml(alt)}" style="max-width:100%;height:auto" /></p>${metaBlock}`
  );
}

// items: array of { title, link, guid, pubDateMs, descriptionHtml,
//                   enclosure: { url, length, type } }
export function buildRss({
  title,
  link,
  description,
  feedUrl,
  imageUrl,
  language = 'en',
  items = [],
  lastBuildMs,
}) {
  const channelImage = imageUrl
    ? [
        '    <image>',
        `      <url>${escapeXml(imageUrl)}</url>`,
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        '    </image>',
      ].join('\n')
    : null;

  const atomSelf = feedUrl
    ? `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`
    : null;

  const itemXml = items.map((item) => {
    const lines = [
      '    <item>',
      `      <title>${escapeXml(item.title)}</title>`,
      `      <link>${escapeXml(item.link)}</link>`,
      `      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>`,
      `      <pubDate>${toRfc822(item.pubDateMs)}</pubDate>`,
      `      <description>${cdata(item.descriptionHtml)}</description>`,
    ];
    if (item.enclosure) {
      lines.push(
        `      <enclosure url="${escapeXml(item.enclosure.url)}" ` +
          `length="${item.enclosure.length}" type="${escapeXml(item.enclosure.type)}" />`
      );
    }
    lines.push('    </item>');
    return lines.join('\n');
  });

  // Omit lastBuildDate entirely when we have no real timestamp rather than
  // emitting the Unix epoch, which some readers treat as "never updated".
  const buildMs = lastBuildMs ?? items[0]?.pubDateMs;
  const lastBuild =
    buildMs != null ? `    <lastBuildDate>${toRfc822(buildMs)}</lastBuildDate>` : null;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(link)}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <language>${escapeXml(language)}</language>`,
    ...(lastBuild ? [lastBuild] : []),
    ...(atomSelf ? [atomSelf] : []),
    ...(channelImage ? [channelImage] : []),
    ...itemXml,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
