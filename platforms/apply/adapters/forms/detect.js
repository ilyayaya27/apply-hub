/** @typedef {'google-forms' | 'html-form'} FormAdapterId */

const GOOGLE_FORM_RE = /(?:^https?:\/\/)?(?:forms\.gle\/|docs\.google\.com\/forms\/)/i;

/** Local fixture / saved HTML that mimics Google Forms markup */
const FILE_GOOGLE_MOCK_RE = /google-form-mock\.html(?:[?#]|$)/i;

/** Google Forms DOM markers (for saved pages or offline copies) */
const GOOGLE_HTML_MARKERS = [
  'data-testid="g-submit"',
  'freebirdFormviewer',
  'docs.google.com/forms',
  'role="listitem" class="question"',
];

/**
 * Sniff adapter from HTML snippet (offline copies, fixtures without real URL).
 * @param {string | null | undefined} html
 * @returns {FormAdapterId | null}
 */
export const sniffFormAdapterFromHtml = (html) => {
  if (!html || typeof html !== 'string') return null;
  const lower = html.toLowerCase();
  const markerHits = GOOGLE_HTML_MARKERS.filter((m) => lower.includes(m.toLowerCase())).length;
  if (markerHits >= 2) return 'google-forms';
  return null;
};

/**
 * @param {string | null | undefined} url
 * @param {{ html?: string }} [opts]
 * @returns {FormAdapterId | null}
 */
export const detectFormAdapterId = (url, opts = {}) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (GOOGLE_FORM_RE.test(trimmed)) return 'google-forms';
  if (FILE_GOOGLE_MOCK_RE.test(trimmed)) return 'google-forms';
  const fromHtml = sniffFormAdapterFromHtml(opts.html);
  if (fromHtml) return fromHtml;
  if (/^(?:https?|file):\/\//i.test(trimmed)) return 'html-form';
  return null;
};

export const isGoogleFormsUrl = (url) => detectFormAdapterId(url) === 'google-forms';
