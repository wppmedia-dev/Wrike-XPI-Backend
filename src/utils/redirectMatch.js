/**
 * Pure matching for the redirect-URI allow list. No database, no cache, so the
 * rules about WHAT counts as a match can be tested on their own and the
 * controller (which stores entries) and the gate (which checks them) cannot
 * disagree about them.
 *
 * An entry is an origin, optionally with a path prefix:
 *
 *   https://app.example.com            any path on that origin
 *   https://app.example.com/auth       /auth and anything under /auth/, not /authx
 *   http://localhost:3000              loopback only may be plain http
 *
 * Deliberately narrow, because every looser form has been an open redirect:
 *   - no wildcards (a "*.example.com" entry would cover a subdomain someone
 *     else can claim),
 *   - the origin must match exactly: scheme, host and port,
 *   - https only, except localhost / 127.0.0.1 / [::1],
 *   - no credentials in the URL (https://good.com@evil.com), no fragment,
 *   - the candidate is parsed with the WHATWG URL parser, the same one that
 *     decides where the browser actually goes, never compared as raw text.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const MAX_REDIRECT_VALUE_LENGTH = 500;

const parse = (raw) => {
  const text = String(raw ?? "").trim();
  if (!text || text.length > MAX_REDIRECT_VALUE_LENGTH) return null;
  // Backslashes and control characters are read differently by browsers and by
  // servers, which is how `https://good.com\@evil.com` slips through checks.
  if (/[\\\u0000-\u001f\u007f\s]/.test(text)) return null;

  try {
    return new URL(text);
  } catch {
    return null;
  }
};

const schemeAllowed = (url) =>
  url.protocol === "https:" ||
  (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));

/** Path prefix of an entry with the trailing slash dropped; "" means any path. */
const prefixOf = (url) => url.pathname.replace(/\/+$/, "");

/**
 * Validate an entry an admin typed and return its canonical form, or throw a
 * 400. Canonical form is what is stored and what is matched.
 */
export const normaliseRedirectRule = (raw) => {
  const url = parse(raw);
  const fail = (why) => {
    throw {
      statusCode: 400,
      message: `"${String(raw ?? "").trim()}" is not a valid redirect URL: ${why}`,
    };
  };

  if (!url) fail("it must be a full URL such as https://app.example.com");
  if (!schemeAllowed(url)) fail("only https is allowed (http only for localhost)");
  if (url.username || url.password) fail("it must not contain credentials");
  if (url.search || url.hash) fail("it must not contain a query string or fragment");

  return `${url.origin}${prefixOf(url)}`;
};

/**
 * Does `candidate` fall under `rule`? Both are re-parsed, so a stored value is
 * never trusted to already be canonical.
 */
export const redirectMatchesRule = (rule, candidate) => {
  const wanted = parse(rule);
  const got = parse(candidate);

  if (!wanted || !got) return false;
  if (!schemeAllowed(got) || got.username || got.password || got.hash) {
    return false;
  }
  if (got.origin !== wanted.origin) return false;

  const prefix = prefixOf(wanted);
  if (!prefix) return true;

  return got.pathname === prefix || got.pathname.startsWith(`${prefix}/`);
};

/** True when `candidate` matches ANY of the enabled `rules` (strings). */
export const redirectAllowed = (rules, candidate) =>
  (rules || []).some((rule) => redirectMatchesRule(rule, candidate));
