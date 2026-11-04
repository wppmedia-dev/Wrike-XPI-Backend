"use strict";

const fp = require("fastify-plugin");

/**
 * Security headers, including a Content-Security-Policy (previously disabled).
 *
 * The policy is built from what the pages actually load:
 *   - the React console (public/app, same origin) and its CDN assets:
 *     Font Awesome (cdnjs), Google Fonts, SweetAlert2/Toastify (jsdelivr),
 *     NProgress (unpkg), DataTables + jQuery (cdn.datatables.net,
 *     code.jquery.com), Wrike favicons/images (cdn.wrike.com);
 *   - the server-rendered pages (src/routes/docs.js, mcpDocs.js, tokens,
 *     the OAuth environment picker), which use inline <script>/<style> and
 *     inline on* handlers — hence 'unsafe-inline' for scripts. That still
 *     blocks script from any host not listed, plugins (object-src), <base>
 *     hijacking and framing by other sites.
 *
 * Deliberately NOT set:
 *   - form-action: the OAuth picker form leads to redirects to Wrike and to
 *     the MCP client's redirect_uri, which browsers check against form-action.
 *   - upgrade-insecure-requests: breaks plain-http local development.
 *
 * CSP_REPORT_ONLY=true sends the same policy as
 * Content-Security-Policy-Report-Only instead (observe before enforcing).
 * CSP_EXTRA_SCRIPT_SRC / CSP_EXTRA_CONNECT_SRC (space-separated) extend the
 * lists without a code change.
 */
const extra = (name) =>
  (process.env[name] || "").split(/\s+/).map((s) => s.trim()).filter(Boolean);

const SCRIPT_HOSTS = [
  "https://cdn.jsdelivr.net",
  "https://unpkg.com",
  "https://cdnjs.cloudflare.com",
  "https://code.jquery.com",
  "https://cdn.datatables.net",
];

module.exports = fp(async function (fastify, opts) {
  fastify.register(require("@fastify/helmet"), {
    contentSecurityPolicy: {
      useDefaults: false,
      reportOnly: process.env.CSP_REPORT_ONLY === "true",
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", ...SCRIPT_HOSTS, ...extra("CSP_EXTRA_SCRIPT_SRC")],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        mediaSrc: ["'self'", "blob:"],
        connectSrc: ["'self'", ...extra("CSP_EXTRA_CONNECT_SRC")],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        // Same as the X-Frame-Options: SAMEORIGIN helmet already sends.
        frameAncestors: ["'self'"],
      },
    },
  });
});
