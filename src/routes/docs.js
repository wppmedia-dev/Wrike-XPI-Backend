"use strict";

const {
  getCachedVisibleWrikeCredentials,
} = require("../utils/wrikeCredentials");
const { findRedirectionURL } = require("../utils/wrikeRedirect");

/**
 * WrikeXPI documentation pages.
 *
 * Three documentation sets each live on their own page — /docs/mcp,
 * /docs/api and /docs/calendar — sharing a compact header + left side menu +
 * content body layout. The top-right nav links jump between them, and the nav
 * is built from DOC_SETS below, so a set cannot exist without being reachable
 * from the other two.
 *
 * Client-side hash routing within each page, full-text search, and
 * copy-to-clipboard on code blocks. No page reloads.
 *
 * GET /docs/mcp
 * GET /docs/api
 * GET /docs/calendar
 * GET /docs  → redirects to /docs/mcp
 */

/**
 * One entry per documentation set: the copy that differs between them, and the
 * route each is served from. `route` doubles as the groupId renderDocs takes,
 * and as the prefix every page id in that set carries (mcp/overview),
 * which is what the hash router and the sidebar are keyed on.
 */
const DOC_SETS = {
  mcp: {
    route: "/docs/mcp",
    nav: "MCP Docs",
    search: "MCP",
    eyebrow: "MCP",
    hero: "Connect your AI assistant",
    cta: { href: "#/mcp/setup", label: "Get connected" },
    defaultPage: "mcp/overview",
  },
  api: {
    route: "/docs/api",
    nav: "API Docs",
    search: "API",
    eyebrow: "XPI API",
    hero: "REST API reference",
    cta: { href: "#/api/errors", label: "Error reference" },
    defaultPage: "api/overview",
  },
  // Named in the nav after what it is for rather than after how long its token
  // lasts, which is the same rule the login page's switch follows
  // (src/utils/tokenPurpose.js).
  calendar: {
    route: "/docs/calendar",
    nav: "Calendar Sync",
    search: "Calendar Sync",
    eyebrow: "Calendar Sync",
    hero: "Your Wrike tasks, in your calendar",
    cta: { href: "#/calendar/setup", label: "Connect your calendar" },
    defaultPage: "calendar/overview",
  },
};

/**
 * The top nav, in order: Home first, then the doc sets.
 *
 * Home is not a doc set — it is the login page, which has no pages to render
 * and no groupId — so it is listed here rather than faked into DOC_SETS, whose
 * entries renderDocs() would then have to refuse. Built from DOC_SETS so a set
 * can never be missing from the nav that jumps between sets.
 */
const DOC_NAV = [
  { id: "home", href: "/", label: "Home" },
  ...Object.entries(DOC_SETS).map(([id, set]) => ({
    id,
    href: set.route,
    label: set.nav,
  })),
];

module.exports = async function (fastify, opts) {
  // Render a single documentation set as its own page.
  const renderDocs = (groupId) => {
    const meta = DOC_SETS[groupId] || DOC_SETS.mcp;
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const apiUrl = process.env.API_URL || `${appUrl}/api/v1`;
    const baseMcpUrl = `${appUrl}/api/v1/wrikexpi/mcp`;

    /* The address a calendar app subscribes to. It belongs to the calendar
       service rather than to this one, which is why it is configured per
       deployment (CALENDAR_SYNC_ENDPOINT) instead of being built from APP_URL.
       The connection goes in as `xpiToken`, so the customer page can show one
       complete address to paste rather than a description of one.

       The fallback is the development address on purpose: a deployment that
       forgets to set the variable shows an address that exists rather than a
       broken promise. Set it in every environment. */
    const calendarSyncUrl =
      process.env.CALENDAR_SYNC_ENDPOINT ||
      "https://dev-api.gowrike.space/api/v1/calendarsync";
    const calendarSyncFeed = `${calendarSyncUrl}?xpiToken={XPIToken}`;

    /* The sign-in the setup page's button starts, with the chosen environment
       appended by the page itself. The route it names answers with a redirect
       to Wrike's own sign-in, so that button never passes through a page of
       ours: this page has already established which environment is meant, and
       asking again would be a step that decides nothing.

       Nothing secret is in this string — the connection does not exist until
       the sign-in finishes — and the route refuses any environment the picker
       could not have offered. */
    const calendarSignInBase = "/docs/calendar/connect?environmentId=";

    const visibleCreds = getCachedVisibleWrikeCredentials();
    const environments = Object.entries(visibleCreds || {}).map(
      ([envName, envData]) => ({
        key: String(envData.id),
        label: envName,
        url: `${baseMcpUrl}/${envData.id}`,
      }),
    );

    // ─────────────────────────── helpers ───────────────────────────
    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const IC = {
      copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      check:
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      tip: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
      bolt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    };

    const codeBlock = (lang, body, label) => `
      <figure class="code">
        <figcaption>
          <span class="code-meta">${esc(label || lang)}</span>
          <button class="copy-btn" type="button" data-copy="${esc(body)}" aria-label="Copy code">${IC.copy}<span class="copy-txt">Copy</span></button>
        </figcaption>
        <pre><code>${esc(body)}</code></pre>
      </figure>`;

    // Code block whose body is re-rendered live — the __MCP_URL__ placeholder
    // is replaced with the currently selected MCP connection URL.
    const connBlock = (lang, label, tpl) => `
      <figure class="code">
        <figcaption>
          <span class="code-meta">${esc(label)}</span>
          <button class="copy-btn" type="button" data-copy="${esc(tpl)}" aria-label="Copy code">${IC.copy}<span class="copy-txt">Copy</span></button>
        </figcaption>
        <pre><code data-cmd="${esc(tpl)}">${esc(tpl)}</code></pre>
      </figure>`;

    const callout = (type, title, text) => `
      <div class="callout ${type}" role="note">
        <span class="callout-ic">${IC[type] || IC.info}</span>
        <div>
          <strong>${title}</strong>
          <p>${text}</p>
        </div>
      </div>`;

    const table = (head, rows) => `
      <div class="table-wrap">
        <table>
          <thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
          <tbody>${rows
            .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
            .join("")}</tbody>
        </table>
      </div>`;

    const endpoint = (m, path, desc) => `
      <div class="endpoint">
        <span class="method ${m.toLowerCase()}">${m}</span>
        <code class="ep-path">${esc(path)}</code>
        <span class="ep-desc">${desc}</span>
      </div>`;

    // Two views of the same topic: v1 = code-level (file paths, line numbers,
    // literal snippets), v2 = plain-language (no code, analogies). Each call
    // gets its own scoped toggle so multiple switches can live on one page.
    const viewSwitch = (v1Html, v2Html) => `
      <div class="view-switch">
        <div class="view-toggle" role="tablist">
          <button type="button" class="view-btn active" data-view="v1"><span class="view-tag">V1</span> Code-level</button>
          <button type="button" class="view-btn" data-view="v2"><span class="view-tag">V2</span> Plain language</button>
        </div>
        <div class="view-body">
          <div class="view-panel active" data-view="v1">${v1Html}</div>
          <div class="view-panel" data-view="v2">${v2Html}</div>
        </div>
      </div>`;

    const api = (rel) => `${esc(apiUrl)}${rel}`;
    const bearerExample = `curl -X GET "${apiUrl}/wrikexpi/campaign?pageSize=10" \\
  -H "Authorization: Bearer <access_token>"`;

    // ─────────────────────────── MCP pages ───────────────────────────
    const mcpPages = [
      {
        id: "mcp/overview",
        group: "MCP Docs",
        groupId: "mcp",
        label: "Overview",
        keywords:
          "mcp model context protocol what is intro overview ai assistant claude",
        html: `
          <div class="pg-eyebrow">MCP Docs</div>
          <h1 class="pg-title">Model Context Protocol</h1>
          <p class="pg-lede">Let your AI assistant read and manage Wrike campaigns, channels and tasks through the Model Context Protocol — securely, with no manual API plumbing.</p>

          <div class="card-strip">
            <div class="stat-card"><span class="stat-ic">${IC.bolt}</span><strong>Zero code</strong><p>Connect in under a minute from any MCP client.</p></div>
            <div class="stat-card"><span class="stat-ic">${IC.info}</span><strong>Secure by default</strong><p>OAuth bearer tokens — never shared with the model.</p></div>
            <div class="stat-card"><span class="stat-ic">${IC.check}</span><strong>Environment aware</strong><p>Pin to one environment or pick on connect.</p></div>
          </div>

          <h2 class="pg-h2">What is MCP?</h2>
          <p class="pg-p">The <b>Model Context Protocol</b> is an open standard that lets AI assistants (like Claude, ChatGPT or Copilot) call tools on your behalf. WrikeXPI exposes an MCP endpoint that translates those tool calls into the same campaign, channel and task APIs used by the REST API — authenticated with your own token.</p>
          ${callout(
            "info",
            "One endpoint, many clients",
            "The endpoint is a standard streamable-HTTP MCP server, so any MCP-capable assistant can connect to it.",
          )}

          <h2 class="pg-h2">How it works</h2>
          <div class="flow">
            ${[
              [
                "Copy your link",
                "Grab the private MCP address for your environment.",
              ],
              [
                "Paste into your assistant",
                "Register it as a new connection or tool server.",
              ],
              [
                "Sign in with Wrike",
                "Authorize once through the OAuth screen.",
              ],
              [
                "You're connected",
                "Ask for campaigns, channels or tasks in plain language.",
              ],
            ]
              .map(
                ([t, d], i) => `
              <div class="flow-step">
                <span class="flow-n">${i + 1}</span>
                <div><strong>${t}</strong><p>${d}</p></div>
              </div>`,
              )
              .join("")}
          </div>

          <div class="cta-row">
            <a class="btn primary" href="#/mcp/setup">Get your connection link ${IC.copy}</a>
            <a class="btn ghost" href="#/mcp/tools">Available tools</a>
          </div>`,
      },
      {
        id: "mcp/setup",
        group: "MCP Docs",
        groupId: "mcp",
        label: "Connection setup",
        keywords:
          "setup connect connection url copy environment paste claude install configure link",
        html: `
          <div class="pg-eyebrow">MCP Docs</div>
          <h1 class="pg-title">Connection setup</h1>
          <p class="pg-lede">Grab a connection link, paste it into your assistant, and sign in with Wrike. Nothing technical to configure.</p>

          <h2 class="pg-h2">1 · Choose how to connect</h2>
          <div class="mode-toggle" role="tablist">
            <button type="button" class="mode-btn active" data-mode="any">All environments</button>
            <button type="button" class="mode-btn" data-mode="specific">Specific environment</button>
          </div>

          <div class="mode-panel active" data-panel="any">
            <p class="pg-p">Works with every environment — you pick which one the first time you connect.</p>
            <div class="url-box">
              <code class="url-code" data-url="${esc(baseMcpUrl)}">${esc(baseMcpUrl)}</code>
              <button type="button" class="copy-btn solid" data-copy="${esc(baseMcpUrl)}">${IC.copy}<span class="copy-txt">Copy</span></button>
            </div>
          </div>

          <div class="mode-panel" data-panel="specific">
            <p class="pg-p">Always connects to one environment — no picker, no extra step.</p>
            <label class="field-label" for="docs-env">Environment</label>
            <div class="select-wrap">
              <select id="docs-env">
                ${environments
                  .map(
                    (e) =>
                      `<option value="${e.key}" data-url="${esc(e.url)}">${e.label}</option>`,
                  )
                  .join("")}
              </select>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="url-box">
              <code class="url-code" data-url="">${esc(environments[0]?.url || "")}</code>
              <button type="button" class="copy-btn solid" data-copy="${esc(environments[0]?.url || "")}">${IC.copy}<span class="copy-txt">Copy</span></button>
            </div>
          </div>

          <h2 class="pg-h2">2 · Register the server in your assistant</h2>
          <p class="pg-p">Pick your assistant — the command below uses the link you chose above and updates live as you change it.</p>
          <div class="client-tabs" role="tablist" aria-label="AI assistants">
            <button type="button" class="client-tab active" data-client="claude">Claude</button>
            <button type="button" class="client-tab" data-client="cursor">Cursor</button>
            <button type="button" class="client-tab" data-client="vscode">VS Code</button>
            <button type="button" class="client-tab" data-client="chatgpt">ChatGPT</button>
          </div>

          <div class="client-panel active" data-client="claude">
            ${connBlock("bash", "Claude · terminal", `claude mcp add --transport http wrikexpi __MCP_URL__`)}
          </div>
          <div class="client-panel" data-client="cursor">
            ${connBlock("bash", "Cursor · terminal", `cursor mcp add wrikexpi --transport http __MCP_URL__`)}
          </div>
          <div class="client-panel" data-client="vscode">
            ${connBlock(
              "json",
              "VS Code · settings.json",
              `{
  "mcp.servers": {
    "wrikexpi": {
      "type": "http",
      "url": "__MCP_URL__"
    }
  }
}`,
            )}
          </div>
          <div class="client-panel" data-client="chatgpt">
            ${connBlock("text", "ChatGPT · connector URL", `__MCP_URL__`)}
            <p class="pg-p">Open <b>ChatGPT → Settings → Connectors</b>, add a connector, and paste the link.</p>
          </div>
          ${callout(
            "info",
            "More assistants",
            "Any MCP-capable assistant (GitHub Copilot, Gemini, Windsurf…) accepts a streamable HTTP server URL the same way.",
          )}

          <h2 class="pg-h2">3 · Sign in with Wrike</h2>
          <p class="pg-p">The first tool call opens Wrike's sign-in screen. Approve it once and your assistant can act on your workspace.</p>

          <h2 class="pg-h2">4 · Test the connection</h2>
          <p class="pg-p">Ask something like <em>“List my recent campaigns”</em>. You should see real data returned.</p>
          ${callout(
            "warn",
            "Tools use your permissions",
            "The assistant can only do what your Wrike account allows — it never gets more access than you have.",
          )}`,
      },
      {
        id: "mcp/tools",
        group: "MCP Docs",
        groupId: "mcp",
        label: "Available tools",
        keywords:
          "tools tools-list campaign channel task datahub list fields capabilities",
        html: `
          <div class="pg-eyebrow">MCP Docs</div>
          <h1 class="pg-title">Available tools</h1>
          <p class="pg-lede">The MCP server exposes the full campaign / channel / task toolbox, plus a DataHub field explorer.</p>

          ${table(
            ["Tool", "What it does"],
            [
              [
                "<code>campaign_list</code>",
                "List campaigns with OData filters.",
              ],
              [
                "<code>campaign_create</code>",
                "Create a campaign from a request form.",
              ],
              ["<code>campaign_get</code>", "Read a single campaign."],
              ["<code>campaign_update</code>", "Update campaign fields."],
              ["<code>campaign_delete</code>", "Delete a campaign."],
              ["<code>channel_list</code>", "List channels under a campaign."],
              ["<code>channel_get</code>", "Read a single channel."],
              ["<code>channel_update</code>", "Update channel fields."],
              ["<code>channel_delete</code>", "Delete a channel."],
              [
                "<code>task_list</code>",
                "List tasks for a campaign or channel.",
              ],
              ["<code>task_get</code>", "Read a single task."],
              ["<code>task_update</code>", "Update task fields."],
              ["<code>task_delete</code>", "Delete a task."],
              [
                "<code>datahub_list_fields</code>",
                "Discover DataHub field mappings.",
              ],
            ],
          )}
          ${callout(
            "info",
            "Field names",
            "Filter field names are the DataHub <b>short codes</b> (e.g. <code>campaignname</code>, <code>agency</code>, <code>campaignbudget</code>).",
          )}`,
      },
      {
        id: "mcp/security",
        group: "MCP Docs",
        groupId: "mcp",
        label: "Security & auth",
        keywords:
          "security auth oauth bearer token scopes secure permissions authorize",
        html: `
          <div class="pg-eyebrow">MCP Docs</div>
          <h1 class="pg-title">Security &amp; authentication</h1>
          <p class="pg-lede">The MCP endpoint follows the MCP OAuth 2.0 authorization flow. Your token never appears in tool-call parameters.</p>

          <h2 class="pg-h2">Bearer authentication</h2>
          <p class="pg-p">Every MCP request is authenticated with an OAuth <b>bearer token</b> on the <code>Authorization</code> header. The token is resolved once per request and threaded into every tool call server-side.</p>
          ${callout(
            "tip",
            "Never in context",
            "Credentials are resolved by the server and never injected into the LLM context window.",
          )}

          <h2 class="pg-h2">Flow at a glance</h2>
          <ol class="ordered">
            <li>Your assistant requests authorization from the MCP OAuth server.</li>
            <li>You approve the login with Wrike.</li>
            <li>The server exchanges the code (with PKCE) for a short-lived token.</li>
            <li>Tool calls authenticate with that token until it expires.</li>
          </ol>

          <h2 class="pg-h2">Scopes</h2>
          <p class="pg-p">The endpoint operates within the scopes granted to the WrikeXPI application. Contact your administrator to review scopes for your workspace.</p>

          <h2 class="pg-h2">When a call is refused</h2>
          <p class="pg-p">A tool call this token is not permitted to make comes back as a failed result rather than as a transport error, so the assistant reads the reason instead of retrying: it names the module and the action that were missing, and says plainly not to route the same change through another tool.</p>
          <p class="pg-p">That result, and any <code>401</code> or <code>403</code> from the endpoint itself, also carries a <b>reference</b>: <code>XPI-MCP-4K7P2QWD</code>. The <code>MCP</code> in the middle says an agent's call was refused, so it reads correctly before anyone opens the console. The same string is on the request's row in the activity log, which is where an administrator sees the decision that was made and what was sent back.</p>
          ${callout(
            "tip",
            "Reporting a refusal",
            "Keep the reference from the message. It turns “the assistant said FORBIDDEN” into one lookup in the console instead of a search by timestamp.",
          )}`,
      },
      {
        id: "mcp/architecture",
        group: "MCP Docs",
        groupId: "mcp",
        label: "Architecture",
        keywords:
          "architecture wrikexpi-mcp wrike mcp proxy hosted server client streamable http how it connects front desk",
        html: `
          <div class="pg-eyebrow">MCP Docs</div>
          <h1 class="pg-title">How our MCP connects to Wrike's MCP</h1>
          <p class="pg-lede">WrikeXPI runs two MCP roles at once: it is an MCP server any assistant can connect to, and internally, it is also an MCP client that connects out to Wrike's own hosted MCP server.</p>

          ${viewSwitch(
            `
            <p class="pg-p">The server is created once in <code>src/mcp/index.js</code>, named <code>wrikexpi-mcp</code>, and registers five native tool groups plus — conditionally — a set of proxied Wrike tools:</p>
            ${codeBlock(
              "js",
              `// src/mcp/index.js:62-99
export const createMcpServer = async (fastify, serverUrl, auth) => {
  const server = new McpServer({ name: "wrikexpi-mcp", ... });

  registerCampaignTools(server, fastify, serverUrl, auth);
  registerChannelTools(server, serverUrl, auth);
  registerTaskTools(server, serverUrl, auth);
  registerDatahubTools(server, serverUrl, auth);
  registerIdsTools(server, serverUrl, auth);

  // merges in Wrike's own hosted tools — no-op if unreachable
  if (auth?.wrikeToken) {
    await registerWrikeProxyTools(server, fastify, auth.wrikeToken);
  }
  return server;
};`,
              "src/mcp/index.js",
            )}
            <p class="pg-p">Reachable over real MCP Streamable HTTP, wired in <code>src/plugins/mcp.js</code>: <code>POST /mcp</code>, <code>POST /mcp/:environmentId</code>, and a <code>GET</code> health check. Auth is a bearer token resolved once per request via <code>resolveAuth</code> (<code>src/mcp/tools/auth.js</code>) — never a tool-call parameter.</p>

            <h3 class="pg-h3">The Wrike proxy</h3>
            <p class="pg-p"><code>src/mcp/wrikeMcpProxy.js</code> opens a second, outbound MCP connection — this server acting as a <em>client</em> — to Wrike's own hosted endpoint.</p>
            ${table(
              ["Step", "What happens", "Source"],
              [
                [
                  "Connect",
                  "Opens <code>StreamableHTTPClientTransport</code> to <code>process.env.WRIKE_MCP_URL</code>, authenticated with the same Wrike OAuth token already decrypted for REST calls.",
                  "<code>wrikeMcpProxy.js:38-60</code>",
                ],
                [
                  "Discover",
                  "<code>client.listTools()</code> fetches Wrike's tool catalog. Cached in Redis for 300s.",
                  "<code>wrikeMcpProxy.js:131-157</code>",
                ],
                [
                  "Register",
                  "Every returned tool is re-registered on our server, renamed <code>wrike_&lt;name&gt;</code>.",
                  "<code>wrikeMcpProxy.js:204-262</code>",
                ],
                [
                  "Gate",
                  "A tool that writes (per Wrike's annotations, or its <code>create_*</code>/<code>update_*</code>/<code>delete_*</code> name) refuses the first call and returns a preview until <code>confirm: true</code> arrives. The flag is stripped before forwarding, so Wrike never sees it.",
                  "<code>wrikeMcpProxy.js:236-251</code>, <code>src/mcp/tools/confirmation.js</code>",
                ],
                [
                  "Forward",
                  "A call to any <code>wrike_*</code> tool opens a fresh connection and runs <code>client.callTool(...)</code>, relaying the result back.",
                  "<code>wrikeMcpProxy.js:164-185</code>",
                ],
                [
                  "Fail safe",
                  "Any error is caught and returns <code>[]</code> — native tools are unaffected.",
                  "<code>wrikeMcpProxy.js:149-153</code>",
                ],
              ],
            )}
            ${callout("info", "The address is Wrike's, not ours", "<code>WRIKE_MCP_URL=https://mcp.wrike.com/v2</code> (<code>.env</code>) is Wrike's own published MCP service.")}

            <h3 class="pg-h3">Where the token actually lives</h3>
            <p class="pg-p">There is no direct path from an external MCP client straight to Wrike — every request crosses through our server first. The Wrike OAuth token itself is encrypted at rest in Postgres (<code>user_tokens</code>), decrypted per request by <code>authentication.js</code>, and reused as the bearer credential when calling out to Wrike's MCP. It is never handed to the connecting assistant.</p>
            ${callout("warn", "No shortcut exists", "An external client cannot skip our server and call mcp.wrike.com directly — it has no route to the token that authenticates that call.")}
            `,
            `
            <p class="pg-p">Think of our app as a <b>front desk</b>. An AI assistant asks the front desk for something, and the front desk decides how to get it done — two different ways:</p>
            <ul class="ordered" style="list-style:disc; padding-left:22px;">
              <li><b>Handle it itself</b>, using tools our team built for how we use Wrike — campaigns, channels, tasks.</li>
              <li><b>Pass it straight through to Wrike</b>, using a direct connection to Wrike's own toolkit — the one Wrike builds and maintains.</li>
            </ul>
            ${callout("tip", "Why not build everything ourselves?", "Wrike already maintains its own toolkit and keeps it current whenever Wrike changes. Borrowing it live means we never rebuild or maintain that part.")}
            ${callout("info", "No extra login", "Borrowing Wrike's toolkit reuses the same Wrike login you already gave us — nobody logs in twice, and your credentials are never shown to the assistant.")}
            <p class="pg-p">The assistant only ever sees <b>one</b> combined list of things it can do — it never has to know which side actually answered.</p>
            ${callout("warn", "No shortcut exists", "The assistant has no way to reach Wrike directly, skipping our app — it never holds the key that would let it.")}
            `,
          )}`,
      },
      {
        id: "mcp/instructions",
        group: "MCP Docs",
        groupId: "mcp",
        label: "Instructions & tool roster",
        keywords:
          "instructions guidance mcp_instructions per-tool description conflict resolution wrike_ prefix tool roster overlap native proxied",
        html: `
          <div class="pg-eyebrow">MCP Docs</div>
          <h1 class="pg-title">How the assistant is guided</h1>
          <p class="pg-lede">There's no single master prompt. Guidance lives at two levels, and every native tool has an explicit relationship to its Wrike counterpart, if one exists.</p>

          ${viewSwitch(
            `
            <h3 class="pg-h3">Layer 1 — server-level instructions</h3>
            <p class="pg-p">One constant, <code>MCP_INSTRUCTIONS</code>, defined in <code>src/mcp/index.js:18-49</code>, passed as the SDK's <code>instructions</code> field at handshake time.</p>
            ${codeBlock(
              "text",
              `HOW TO CHOOSE — avoid conflict
- Let the resource decide the family, not the tool list: XPI-managed
  resource -> XPI tool; a generic Wrike item/space/user/approval/
  comment/etc. -> wrike_* tool.
- Never call an XPI tool and a wrike_* tool for the same job.
- If an expected wrike_* tool is missing, fall back to the XPI
  toolset or tell the user it is unavailable.`,
              "src/mcp/index.js:28-31",
            )}
            <h3 class="pg-h3">Layer 2 — per-tool instructions</h3>
            <p class="pg-p">Each tool's own <code>description</code> string names its counterpart directly and explains why to prefer one over the other:</p>
            ${codeBlock(
              "js",
              `// src/mcp/tools/task.js:220-226
description:
  "Update an XPI task by its Wrike task ID... " +
  "Prefer this over wrike_update_items for XPI task data — " +
  "wrike_update_items writes raw custom field IDs directly and " +
  "bypasses XPI field mapping/validation."`,
              "src/mcp/tools/task.js",
            )}

            <h3 class="pg-h3">Three safeguards against name collisions</h3>
            ${table(
              ["Safeguard", "How it works"],
              [
                [
                  "Rename on arrival",
                  "<code>server.registerTool(&quot;wrike_&quot; + tool.name, ...)</code> — every borrowed tool is registered under a distinct prefixed name before the assistant ever sees a tool list.",
                ],
                [
                  "Explicit cross-reference",
                  "Native descriptions name the exact <code>wrike_*</code> tool to compare against, not a vague pointer — the assistant can look it up.",
                ],
                [
                  "Conditional registration",
                  "<code>wrike_*</code> tools only exist when <code>auth?.wrikeToken</code> is set and Wrike's MCP actually returned a tool list — when it's unreachable, there is nothing to conflict with.",
                ],
              ],
            )}

            <h3 class="pg-h3">Full tool roster</h3>
            ${table(
              ["XPI tool", "Wrike counterpart", "Reasoning"],
              [
                [
                  "<code>datahub_list_fields</code>",
                  "<i>none</i>",
                  "The short-code field dictionary every other XPI tool depends on.",
                ],
                [
                  "<code>campaign_create</code>",
                  "<code>wrike_create_project_folder_item</code>",
                  "Goes through the request-form workflow XPI campaigns require.",
                ],
                [
                  "<code>*_update</code> (campaign/channel/task)",
                  "<code>wrike_update_items</code>",
                  "Applies field validation; the raw tool writes unvalidated custom-field IDs.",
                ],
                [
                  "<code>*_delete</code> (campaign/channel/task)",
                  "<i>none</i>",
                  '"This is the ONLY delete operation exposed — Wrike\'s MCP tools do not provide a delete."',
                ],
                [
                  "<code>task_get</code> / <code>task_list_*</code>",
                  "<code>wrike_get_item_details</code>, <code>wrike_get_items_children</code>",
                  "Validates XPI task type and translates fields to short codes.",
                ],
                [
                  "<code>ids_convert</code>",
                  "<i>none</i>",
                  "Converts legacy API v2 IDs — pure XPI plumbing.",
                ],
                [
                  "<i>none</i>",
                  "<code>wrike_get_approvals</code>, <code>wrike_*_comment</code>, <code>wrike_get_my_inbox</code>, <code>wrike_search_users</code>, <code>wrike_search_spaces</code>, attachments",
                  "Ground XPI never modeled — comments, approvals, users, spaces.",
                ],
              ],
            )}
            ${callout("tip", "The pattern", "XPI wins wherever it layers meaning onto a resource (short codes, validation, request-forms). Wrike wins wherever the resource is something XPI never modeled — comments, approvals, users, spaces.")}

            <h3 class="pg-h3">Worked example</h3>
            <p class="pg-p"><b>Request:</b> "Set task <code>MQAAAAELy_uV</code> to In Progress." (1) Server rule: resource is a task. (2) <code>task_update</code>'s own text names <code>wrike_update_items</code> and the risk. (3) <code>taskstatus</code> is a short code Wrike's tool can't interpret. <b>Result:</b> <code>task_update</code> is called; <code>wrike_update_items</code> is never touched.</p>
            `,
            `
            <h3 class="pg-h3">The general rulebook</h3>
            ${callout("info", "In plain words", `"Let the type of thing you're working with decide which toolkit to use — if it's an XPI campaign, channel, or task, use our tools; if it's a general Wrike item, comment, approval, or person, use Wrike's tools. Never use both for the same job."`)}
            <h3 class="pg-h3">The note on each tool</h3>
            <p class="pg-p">On top of the rulebook, most of our tools carry their own short note — this is where the real decision detail lives.</p>
            ${callout("info", "Example — the note on “update a task”", `"Prefer this over Wrike's generic update tool, because that one writes raw technical field codes and skips our validation."`)}

            <h3 class="pg-h3">Why the names never clash</h3>
            <p class="pg-p">Every tool borrowed from Wrike is given a distinct name before the assistant ever sees it — so it's physically impossible for one of our tools and a Wrike tool to be confused for each other. And if Wrike's toolkit isn't reachable at that moment, its tools simply don't appear at all — there's nothing to clash with.</p>

            <h3 class="pg-h3">What each tool does</h3>
            ${table(
              ["What it's for", "Type", "In plain words"],
              [
                [
                  "Look up field names",
                  "Our tool",
                  "Gives the assistant the dictionary of field names our campaigns/tasks use.",
                ],
                [
                  "Create / update / delete a campaign, channel, or task",
                  "Our tool",
                  "Applies our validation and friendly names. Deleting has no Wrike equivalent at all.",
                ],
                [
                  "View a task, or list tasks",
                  "Our tool",
                  "Confirms the item is really one of ours and shows friendly field names.",
                ],
                [
                  "Convert an old ID",
                  "Our tool",
                  "Translates outdated links — nothing on Wrike's side does this.",
                ],
                [
                  "Search any Wrike item, approvals, comments, inbox, people, spaces, attachments",
                  "Wrike's tool",
                  "General Wrike actions we never built our own version of.",
                ],
              ],
            )}

            <h3 class="pg-h3">Watching an overlap resolve</h3>
            <p class="pg-p"><b>Request:</b> "Set this task to In Progress." Either toolkit could technically do it. The general rulebook says "let the type decide" — but that's not enough alone. Our tool's own note breaks the tie by naming the risk in Wrike's version. And "In Progress" is written using our friendly status name, which Wrike's tool can't interpret. <b>Result:</b> our tool handles it; Wrike's version is never touched.</p>
            `,
          )}`,
      },
      {
        id: "mcp/extending",
        group: "MCP Docs",
        groupId: "mcp",
        label: "Making a change",
        keywords:
          "extend extending future enhancement confirmation before delete elicitation elicitInput destructiveHint annotations customize add tool",
        html: `
          <div class="pg-eyebrow">MCP Docs</div>
          <h1 class="pg-title">Where to make a future change</h1>
          <p class="pg-lede">Five places, ranked lightest-touch to most involved. "Ask for confirmation before deleting something" is used below as the running example.</p>

          ${viewSwitch(
            `
            ${table(
              ["#", "Extension point", "Where"],
              [
                [
                  "1",
                  "Per-tool description text",
                  "<code>src/mcp/tools/*.js</code> — edit the <code>description</code> string inside a <code>server.registerTool(...)</code> call.",
                ],
                [
                  "2",
                  "Server-level instructions",
                  "<code>src/mcp/index.js:18-49</code> — edit <code>MCP_INSTRUCTIONS</code>. Applies to every tool at once.",
                ],
                [
                  "3",
                  "Tool annotations",
                  "<code>annotations: { destructiveHint: true, ... }</code> — advisory metadata some MCP clients render their own warning UI from. A request to the client, not something this server can enforce.",
                ],
                [
                  "4",
                  "Two-step confirm gate <em>(in place today)</em>",
                  "<code>src/mcp/tools/confirmation.js</code> — a <code>confirm</code> field plus an <code>isConfirmed()</code> guard at the top of the handler. A call without <code>confirm: true</code> writes nothing and returns a preview of the change instead. Enforced by this server, so it needs no client support.",
                ],
                [
                  "5",
                  "Elicitation",
                  "<code>server.elicitInput({ mode: 'form', ... })</code> — a real confirmation prompt the <em>client</em> renders. Not used anywhere in this codebase today; requires the connecting client to support it.",
                ],
              ],
            )}
            <h3 class="pg-h3">Where the gate lives</h3>
            <p class="pg-p">Option 4 is already wired into all five native tool files and the Wrike proxy, so a new write tool only needs three lines to join it:</p>
            ${codeBlock(
              "js",
              `// src/mcp/tools/*.js — the shape every update/delete tool already follows
inputSchema: {
  taskId: z.string().describe("..."),
  confirm: confirmField("update to this task"),   // NEW — user approval
},
annotations: { destructiveHint: true, ... },

async ({ taskId, confirm }, extra) => {
  if (!auth) return getAuthError(serverUrl);

  // NEW — no write until the user has seen this and approved it
  if (!isConfirmed(confirm)) {
    return confirmationRequest({
      toolName: "task_update",
      action: "update this task",
      target: \`task \${taskId}\`,
      arguments: { taskId, formFields },
    });
  }

  // unchanged from here down
  const result = await UpdateTask(auth.wrikeToken, { taskId }, auth.environmentName);
  ...`,
              "src/mcp/tools/confirmation.js",
            )}
            ${callout("warn", "Why a flag and not a prompt", "The gate cannot be skipped by the model: without <code>confirm: true</code> the write path is never reached, and <code>isConfirmed</code> accepts only a strict boolean <code>true</code>. Repeating the call without the flag just returns the same preview, so there is no way to hammer through it.")}

            <h3 class="pg-h3">Worked example — an elicitation prompt for <code>task_delete</code></h3>
            <p class="pg-p"><code>task_delete</code> is already gated by option 4, so an unconfirmed delete cannot happen today. This example is for layering the client's own rendered prompt on top of that guarantee.</p>
            ${codeBlock(
              "js",
              `// src/mcp/tools/task.js — inside task_delete's handler
async ({ taskId }, extra) => {
  if (!auth) return getAuthError(serverUrl);

  // NEW — ask for confirmation before deleting anything
  const confirmation = await server.server.elicitInput({
    mode: 'form',
    message: \`Delete task \${taskId}? This cannot be undone.\`,
    requestedSchema: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', title: 'Yes, delete it' },
      },
      required: ['confirm'],
    },
  });

  if (confirmation.action !== 'accept' || !confirmation.content?.confirm) {
    return { content: [{ type: 'text', text: 'Delete cancelled.' }] };
  }

  // unchanged from here down
  const result = await DeleteTask(auth.wrikeToken, { taskId }, auth.environmentName);
  ...`,
              "src/mcp/tools/task.js",
            )}
            ${callout("warn", "Caveat", "Elicitation is a capability the connecting client must declare support for — this server cannot force it. Pair it with the gate in option 4, which holds regardless of what the client supports.")}

            <h3 class="pg-h3">Other asks, mapped to an extension point</h3>
            ${table(
              ["Ask", "Extension point", "Where"],
              [
                [
                  "Cap deletes per session",
                  "Handler code",
                  "Add a counter check inside the handler, like <code>ids_convert</code>'s existing <code>MAX_IDS_PER_CALL</code> cap (<code>ids.js:16</code>).",
                ],
                [
                  "Hide specific <code>wrike_*</code> tools",
                  "<code>wrikeMcpProxy.js:204-262</code>",
                  "Add a name-based filter on <code>tools</code> before the <code>.forEach</code> loop in <code>registerWrikeProxyTools</code>.",
                ],
                [
                  "Log every individual tool call as its own row",
                  "<code>src/plugins/mcp.js</code> + <code>SetMcpTools</code>",
                  'Already solved for "which tool": the gate (src/mcp/index.js <code>installPermissionGate</code>) reports every call, and its name is written onto the request\'s activity row. Rows are still one per HTTP request, so an agent batching several tool calls in one POST appears as one row listing them. Making it a row per call means writing from the gate itself and deciding whether to keep the request row as well.',
                ],
                [
                  "Extra approval on high-value fields (e.g. budget)",
                  "① + ⑤ combined",
                  "Describe the rule in <code>campaign_update</code>'s description, then gate an <code>elicitInput</code> call on whether <code>formFields.campaignbudget</code> is present.",
                ],
              ],
            )}
            `,
            `
            <div class="flow">
              <div class="flow-step"><span class="flow-n">1</span><strong>Smallest change</strong><p>Add a sentence to one tool's note — e.g. "double-check the name before deleting." Affects only that action.</p></div>
              <div class="flow-step"><span class="flow-n">2</span><strong>Small change</strong><p>Add a rule to the general rulebook — e.g. "always confirm before deleting anything." Applies everywhere.</p></div>
              <div class="flow-step"><span class="flow-n">3</span><strong>Small change</strong><p>Every delete already carries a "this is risky" flag. Some assistants show their own warning automatically from it.</p></div>
              <div class="flow-step"><span class="flow-n">4</span><strong>Built in and already running</strong><p>Nothing changes on the first attempt. Instead the assistant gets back a summary of what it was about to do, and has to put that to the person and wait for a yes before anything happens. This is how updates and deletes behave today.</p></div>
              <div class="flow-step"><span class="flow-n">5</span><strong>A prompt drawn by the assistant</strong><p>Pauses the action and asks the assistant to show a real "are you sure?" box — not just a note. Detailed below.</p></div>
            </div>

            <h3 class="pg-h3">Already in place — the two-step step</h3>
            <p class="pg-p">Every update and delete, including the Wrike tools borrowed from Wrike itself, refuses to run on the first ask. It replies with a plain summary of the intended change and the exact details instead, and the assistant has to show that to the person and get a yes. Only then does the same instruction, sent a second time, actually go through.</p>
            <p class="pg-p"><b>Why this one holds:</b> the write simply isn't reachable without the second, approved step — so this doesn't depend on the assistant choosing to behave well, and it doesn't depend on the assistant being able to draw a prompt box. Asking again without the approval just produces the same summary again.</p>

            <h3 class="pg-h3">How option 5 works</h3>
            <p class="pg-p">This app's underlying system supports pausing a delete action and asking the connected assistant to show the person a real confirmation prompt before continuing.</p>
            <p class="pg-p"><b>Lightest version (already true today):</b> delete actions already carry a sensitive-action flag. Any assistant that respects it already shows its own confirmation — no work needed, though it's a request, not a guarantee.</p>
            <p class="pg-p"><b>Client-drawn version (option 5):</b> before anything is deleted, the assistant is made to show the person a real yes/no prompt naming exactly what will be deleted. Only "yes" continues; anything else cancels and nothing happens.</p>
            ${callout("warn", "One honest limit", "The option 5 version only works if the connecting assistant knows how to display that kind of prompt. Most modern assistants do, but it isn't guaranteed for every one — which is why option 4, which is already running, is what actually guarantees the pause.")}

            <h3 class="pg-h3">Other future requests, and roughly where they'd land</h3>
            ${table(
              ["Request", "Roughly where it would be made"],
              [
                [
                  "Limit how many things can be deleted at once",
                  "Inside the specific delete action itself — a counter check, similar to how one existing tool already caps a bulk operation.",
                ],
                [
                  "Add a brand-new capability",
                  "A new tool is written, wired into the same toolkit our existing tools already belong to, then given its own plain-language note the same way the others have.",
                ],
                [
                  "Hide certain Wrike tools from the assistant",
                  "The place where Wrike's toolkit is borrowed and merged in — a short filter can leave specific ones out.",
                ],
                [
                  "Keep a record of every individual action taken",
                  "Currently, one record is kept per connection, not per individual action — a more detailed log would need a small addition inside each action.",
                ],
                [
                  "Require extra approval for sensitive changes (e.g. budget)",
                  "Combine options 1 and 5 — a note explaining the rule, plus a real pause-and-confirm step triggered only when a budget field is involved.",
                ],
              ],
            )}
            `,
          )}`,
      },
    ];

    // ─────────────────────────── XPI API pages ───────────────────────────
    const apiPages = [
      {
        id: "api/overview",
        group: "XPI API Docs",
        groupId: "api",
        label: "Overview",
        keywords:
          "api rest overview intro base url quickstart quick start get started endpoints",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">XPI REST API</h1>
          <p class="pg-lede">A JSON REST API for managing Wrike campaigns, channels and tasks, plus an OData-compatible master-data service.</p>

          <div class="card-strip">
            <div class="stat-card"><span class="stat-ic">${IC.check}</span><strong>REST + JSON</strong><p>Simple, predictable resources.</p></div>
            <div class="stat-card"><span class="stat-ic">${IC.bolt}</span><strong>OData filters</strong><p>Powerful server-side filtering.</p></div>
            <div class="stat-card"><span class="stat-ic">${IC.info}</span><strong>Token auth</strong><p>Bearer tokens issued via OAuth.</p></div>
          </div>

          <h2 class="pg-h2">Base URL</h2>
          ${codeBlock("text", apiUrl)}
          ${callout(
            "info",
            "Versioned prefix",
            "All REST endpoints live under <code>/api/v1</code>. Master-data endpoints use <code>/wrikexpi/v1.0</code> with an OData-style envelope.",
          )}

          <h2 class="pg-h2">Authentication</h2>
          <p class="pg-p">Send an <code>Authorization: Bearer &lt;access_token&gt;</code> header on every request. See <a class="lnk" href="#/api/auth">Authentication</a>.</p>
          ${codeBlock("bash", bearerExample)}

          <h2 class="pg-h2">Quick start</h2>
          <p class="pg-p">List the first page of campaigns:</p>
          ${codeBlock(
            "bash",
            `curl -X GET "${apiUrl}/wrikexpi/campaign?pageSize=10" \\
  -H "Authorization: Bearer <access_token>"`,
          )}
          <p class="pg-p">Create a campaign:</p>
          ${codeBlock(
            "bash",
            `curl -X POST "${apiUrl}/wrikexpi/campaign" \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{ "formFields": { "campaignname": "Q3 Launch" } }'`,
          )}
          ${callout(
            "tip",
            "Explore the docs",
            "Jump to <a class='lnk' href='#/api/campaigns'>Campaigns</a>, <a class='lnk' href='#/api/filtering'>Filtering</a>, or <a class='lnk' href='#/api/pagination'>Pagination</a>.",
          )}`,
      },
      {
        id: "api/auth",
        group: "XPI API Docs",
        groupId: "api",
        label: "Authentication",
        keywords:
          "auth authentication oauth bearer token access token sign in login authorize query params parameters environmentId environment purpose redirectUri accountId returnTo autoRedirect calendarSync code state exchange",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">Authentication</h1>
          <p class="pg-lede">All endpoints require an OAuth 2.0 access token sent as a bearer token. This page covers how one is issued, every parameter a sign-in accepts, and the exchange call that turns a code into a token.</p>

          <h2 class="pg-h2">Authorization header</h2>
          ${codeBlock(
            "bash",
            `curl -X GET "${apiUrl}/wrikexpi/campaign" \\
  -H "Authorization: Bearer <access_token>"`,
          )}
          ${callout(
            "warn",
            "Missing or invalid token",
            "Returns <code>401 Unauthorized</code> with an <code>WWW-Authenticate: Bearer</code> challenge.",
          )}

          <h2 class="pg-h2">How a token is issued</h2>
          <p class="pg-p">Every token is minted by completing a Wrike sign-in. Two things can start one, and both end in the same place: a single-use authorization code that this service exchanges for a token.</p>
          <ul class="bullets">
            <li><b>The login page</b> at <code>/</code>, for a person. Choose an environment, press <b>Login with Wrike</b>, and the token is shown on the screen that follows.</li>
            <li><b>The OAuth flow</b> at <code>/oauth</code>, for an MCP client, which receives the token without anyone reading it off a page.</li>
          </ul>
          <p class="pg-p">A caller that wants the first route without a person in front of it builds the same address the page builds, asks for it with <code>GET /get-redirect-url</code>, and reads the token from the JSON that the exchange returns rather than off a screen.</p>

          <h2 class="pg-h2">Starting a sign-in</h2>
          <p class="pg-p">With no parameters at all, the login page shows an environment picker and a sign-in button. Everything below pre-chooses part of that.</p>
          ${codeBlock("text", `${appUrl}/?environmentId=<environment_id>&purpose=login`)}
          <p class="pg-p">Rather than assemble that by hand, ask for it. <code>GET /get-redirect-url</code> takes the same parameters and answers with the address to send the browser to:</p>
          ${codeBlock(
            "bash",
            `curl -X GET "${appUrl}/get-redirect-url?environmentId=<environment_id>&purpose=login"`,
          )}
          ${codeBlock(
            "json",
            `{
  "success": true,
  "redirectUrl": "https://login.wrike.com/oauth2/authorize/v4?client_id=...&state=..."
}`,
          )}

          <h2 class="pg-h2">Query parameters</h2>
          <p class="pg-p">What the login page at <code>/</code> accepts. Every one of them is optional: with none, the page shows an environment picker and a sign-in button.</p>
          ${table(
            ["Parameter", "What it does"],
            [
              [
                "<code>environmentId</code>",
                "The environment to sign in for, by its <b>id</b>. Wins over <code>environment</code> when both are given, and with neither, the most recently added environment is used.",
              ],
              [
                "<code>environment</code>",
                "The environment by <b>name</b>, for a link written by hand. Prefer the id: a name can be edited in the console and an id cannot.",
              ],
              [
                "<code>environment_id</code>",
                "Accepted alias for <code>environmentId</code>. The OAuth discovery metadata publishes this spelling, so both are read.",
              ],
              [
                "<code>redirectUri</code>",
                "Where to send the browser once the sign-in finishes, instead of showing the token screen. The callback appends <code>?code=...&amp;environmentId=...</code> to it.",
              ],
              [
                "<code>accountId</code>",
                "The Wrike account to authorize against. Defaults to the account already recorded for the environment, which is right unless one environment spans several accounts.",
              ],
              [
                "<code>purpose</code>",
                "Which sign-in this is. <code>login</code>, the default, mints an ordinary token. <code>calendar_sync</code> mints one for a calendar integration: no expiry, and only the Calendar Sync module granted to begin with. Anything else, including a value nobody recognises, is treated as <code>login</code> rather than guessed at.",
              ],
              [
                "<code>returnTo</code>",
                "Where to hand the person back to when it finishes, named rather than given as a URL. Only <code>calendar-docs</code> exists today, and it is honoured only on a <code>calendar_sync</code> sign-in.",
              ],
              [
                "<code>autoRedirect</code>",
                "<code>true</code> or <code>1</code> sends the browser straight on to Wrike, so the login page never renders at all.",
              ],
              [
                "<code>calendarSync</code>",
                "<code>true</code> or <code>1</code> starts the Calendar Sync sign-in outright: <code>autoRedirect</code> and <code>purpose=calendar_sync</code> in one parameter, for a link handed to somebody who should not have to choose between two buttons.",
              ],
            ],
          )}

          <h2 class="pg-h2">What the server signs, and why</h2>
          <p class="pg-p">Three of those parameters decide what actually gets minted, and the browser is not allowed to have the last word on them. The server signs them into the <code>state</code> value it hands to Wrike, and the callback reads them back out of that signed value rather than trusting the query string:</p>
          ${table(
            ["Decided by the signed state", "What it settles"],
            [
              [
                "<code>environmentId</code>",
                "Which environment the token belongs to, and therefore which Wrike workspace it can reach.",
              ],
              [
                "<code>purpose</code>",
                "Whether the token expires, and which modules it starts with.",
              ],
              [
                "<code>returnTo</code>",
                "Where the person is handed back to afterwards.",
              ],
            ],
          )}
          ${callout(
            "tip",
            "Editing the address bar changes nothing",
            "Change any of these on the way back from Wrike and the state no longer verifies, so the sign-in fails instead of minting something else. That is what stops a link asking for an ordinary token from being turned into a calendar connection, or the reverse.",
          )}
          <p class="pg-p">This value travels back to us as the <code>state</code> parameter on <code>GET /wrikexpi/token/callback</code>, which is the only endpoint that reads it. It is not a parameter you send.</p>
          <p class="pg-p">There is one exception, and it is deliberate. <code>purpose</code> on <code>/exchange</code> is read straight from the query, because that call is already holding a code this service issued for a sign-in that finished. Anyone able to reach that point can ask for a Calendar Sync token through the login page anyway, so signing it here would add no protection. <code>calendarSync</code> is the stricter one of the two, and it is stricter on purpose: it is the parameter a link gets handed around with.</p>

          <h2 class="pg-h2">Exchanging the code</h2>
          <p class="pg-p">Wrike sends the browser back to <code>GET /wrikexpi/token/callback?code=...&amp;state=...</code>, which mints the token and shows it. A caller that wants the token as data calls the exchange route with that same code instead.</p>

          <h3 class="pg-h3">Query parameters</h3>
          ${table(
            ["Parameter", "What it does"],
            [
              [
                "<code>code</code>",
                "The authorization code Wrike returned. Required, and spendable once.",
              ],
              [
                "<code>environmentId</code>",
                "The environment to mint the token for. Required here: the callback reads this out of the signed state instead, but a direct call has to say it.",
              ],
              [
                "<code>purpose</code>",
                "<code>login</code> or <code>calendar_sync</code>, the same choice the login page offers. See the page's parameters above; a call that leaves it out gets an ordinary token.",
              ],
            ],
          )}
          ${codeBlock(
            "bash",
            `curl -X GET "${apiUrl}/wrikexpi/token/exchange?code=<authorization_code>&environmentId=<environment_id>" \\
  -H "Accept: application/json"`,
          )}
          <p class="pg-p">It answers with the token, and with the credentials that go with it:</p>
          ${codeBlock(
            "json",
            `{
  "success": true,
  "data": {
    "token": "<access_token>",
    "credentials": {
      "username": "<wrike_username>",
      "password": "<generated_password>",
      "message": "IMPORTANT: Save these credentials. They will only be shown once."
    }
  }
}`,
          )}
          ${callout(
            "info",
            "The token is the access token",
            "Send the <code>token</code> value as <code>Authorization: Bearer &lt;token&gt;</code> on every call afterwards. Nothing else from the sign-in is needed again.",
          )}
          ${callout(
            "warn",
            "The code is single use",
            "Wrike's code can be spent once, so exchanging it twice fails. And a token cannot be looked up afterwards: what is stored is the Wrike credential this service renews, never the token it handed out. A token that is lost is replaced by signing in again, not recovered.",
          )}
          <p class="pg-p">A failed exchange answers <code>400</code> with <code>success: false</code>, a <code>message</code> written to be read, and a <code>reference</code> to quote when reporting it. See <a class="lnk" href="#/api/errors">Errors</a>.</p>

          <h2 class="pg-h2">Token endpoints</h2>
          ${endpoint("GET", "/wrikexpi/token/exchange", "Exchange an authorization code for a token. Query: <code>code</code>, <code>environmentId</code>, <code>purpose</code>.")}
          ${endpoint("GET", "/wrikexpi/token/callback", "Where Wrike sends the browser back to. Query: <code>code</code>, <code>state</code>. Shows the token, or redirects to the <code>redirectUri</code> the sign-in carried.")}
          ${endpoint("POST", "/wrikexpi/token/profile", "Who a token belongs to. Body: <code>token</code>.")}
          ${endpoint("POST", "/wrikexpi/token/view-tokens", "Every token issued to the account a token belongs to. Body: <code>token</code>.")}
          ${endpoint("GET", "/get-redirect-url", "The Wrike address to send the browser to, for a chosen environment. Query: the same parameters the login page takes.")}
          ${endpoint("GET", "/environments", "The environments a person may choose between, and which one that is. Query: <code>environmentId</code>.")}
          <p class="pg-p">The last two take the token in the body rather than the query, because a credential in a URL is written into every log between here and there.</p>

          <h2 class="pg-h2">OAuth metadata</h2>
          <p class="pg-p">Discovery metadata is published at the host root per <b>RFC 8414 / 9728</b>:</p>
          <ul class="bullets">
            <li><code>/.well-known/oauth-authorization-server</code></li>
            <li><code>/.well-known/oauth-protected-resource</code></li>
          </ul>`,
      },
      {
        id: "api/permissions",
        group: "XPI API Docs",
        groupId: "api",
        label: "Token permissions",
        keywords:
          "permission permissions scope scopes module modules access restricted restrict grant forbidden 403 read create update delete",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">Token permissions</h1>
          <p class="pg-lede">A token can be restricted to specific modules and actions. Unrestricted is the default.</p>

          <h2 class="pg-h2">How it works</h2>
          <p class="pg-p">Every token carries a permission matrix: one row per module, one column per action. A request is allowed when the cell matching its module and action is granted. The module comes from the path; the action comes from the HTTP method.</p>
          ${table(
            ["Method", "Action"],
            [
              ["<code>GET</code> / <code>HEAD</code>", "<code>read</code>"],
              ["<code>POST</code>", "<code>create</code>"],
              ["<code>PUT</code> / <code>PATCH</code>", "<code>update</code>"],
              ["<code>DELETE</code>", "<code>delete</code>"],
            ],
          )}
          ${table(
            ["Module", "Where it applies", "Actions"],
            [
              [
                "<code>campaign</code>",
                "<code>/wrikexpi/campaign</code>",
                "read, create, update, delete",
              ],
              [
                "<code>channel</code>",
                "<code>/wrikexpi/channel</code>",
                "read, update, delete",
              ],
              [
                "<code>task</code>",
                "<code>/wrikexpi/task</code>",
                "read, update, delete",
              ],
              [
                "<code>master</code>",
                "<code>/wrikexpi/v1.0</code>",
                "read, create, update, delete",
              ],
              [
                "<code>amoeba</code>",
                "<code>/wrikexpi/amoeba</code>",
                "read, create, update, delete",
              ],
              [
                "<code>mcp_proxy</code>",
                "MCP only: the <code>wrike_*</code> tools, and any MCP tool no module owns",
                "read, create, update, delete",
              ],
            ],
          )}
          ${callout(
            "tip",
            "A write always includes read",
            "Granting create, update or delete implies read, and the console sets it for you: a caller that cannot see a module has no business changing it.",
          )}
          ${callout(
            "tip",
            "Nested listings follow what they return",
            "<code>GET /wrikexpi/campaign/{id}/channel</code> returns channels, so it needs <code>channel</code> read, not <code>campaign</code> read. Switching a module off therefore closes every route that serves it.",
          )}

          <h2 class="pg-h2">Denied requests</h2>
          <p class="pg-p">A call outside the matrix stops before it reaches Wrike and returns <code>403</code>:</p>
          ${codeBlock(
            "json",
            `{
  "success": false,
  "message": "You are not authorized to access this resource.",
  "error": {
    "code": "MODULE_FORBIDDEN",
    "module": "campaign",
    "action": "update"
  }
}`,
          )}
          <p class="pg-p">The same matrix governs MCP tool calls made with that token, so restricting a module cannot be sidestepped by calling over MCP instead.</p>

          <h2 class="pg-h2">The default, and what changes</h2>
          <ul class="bullets">
            <li>A token nobody has configured is <b>unrestricted</b>, so it can call every module. Restrictions are set per token in the admin portal.</li>
            <li>Once a token is configured, its matrix is the whole story: a module with nothing ticked is denied, <code>read</code> included.</li>
            <li>A change takes effect on the next request. A short-lived cache can delay enforcement by up to 30 seconds on other instances.</li>
            <li>Switching a token off (<code>is_active: false</code>) rejects every request with <code>401</code>, whatever its matrix says.</li>
          </ul>`,
      },
      {
        id: "api/filtering",
        group: "XPI API Docs",
        groupId: "api",
        label: "Filtering",
        keywords:
          "filter filtering odata eq ne lt le gt ge has startswith endswith and or operators query",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">Filtering</h1>
          <p class="pg-lede">List endpoints accept an OData <code>filter</code> query parameter. Combine conditions with <code>and</code>.</p>

          <h2 class="pg-h2">Operators</h2>
          ${table(
            ["OData", "Meaning", "Example"],
            [
              [
                "<code>eq</code>",
                "Equal to",
                "<code>campaignname eq 'Q3'</code>",
              ],
              [
                "<code>ne</code>",
                "Not equal to",
                "<code>campaignname ne 'Test'</code>",
              ],
              [
                "<code>lt</code> / <code>le</code>",
                "Less than / or equal",
                "<code>campaignbudget lt 1000</code>",
              ],
              [
                "<code>gt</code> / <code>ge</code>",
                "Greater than / or equal",
                "<code>campaignbudget ge 500</code>",
              ],
              [
                "<code>has</code>",
                "Contains",
                "<code>campaignname has 'Fidelity'</code>",
              ],
              [
                "<code>startswith(...)</code>",
                "Starts with",
                "<code>startswith(campaignname, 'In')</code>",
              ],
              [
                "<code>endswith(...)</code>",
                "Ends with",
                "<code>endswith(campaignname, 'ry')</code>",
              ],
            ],
          )}
          ${callout(
            "info",
            "Field names are short codes",
            "Use the DataHub short codes, e.g. <code>campaignname</code>, <code>agency</code>, <code>campaignbudget</code>.",
          )}

          <h2 class="pg-h2">Combining conditions</h2>
          ${codeBlock(
            "text",
            `(agency eq 'EssenceMediacom' and campaignname eq 'Lacer - Pilexil - AO Diciembre')`,
          )}
          ${callout(
            "warn",
            "OR is not supported",
            "Combining conditions with <code>or</code> returns <code>400</code>.",
          )}

          <h2 class="pg-h2">Example request</h2>
          ${codeBlock(
            "bash",
            `curl -X GET "${apiUrl}/wrikexpi/campaign" \\
  -H "Authorization: Bearer <access_token>" \\
  --data-urlencode "filter=(agency eq 'EssenceMediacom' and startswith(campaignname, 'Industry'))" \\
  --get`,
          )}`,
      },
      {
        id: "api/pagination",
        group: "XPI API Docs",
        groupId: "api",
        label: "Pagination",
        keywords:
          "pagination page pageSize nextPageToken pages iterate cursor limit",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">Pagination</h1>
          <p class="pg-lede">List endpoints return a <code>nextPageToken</code> you can pass back to fetch the next page.</p>

          <h2 class="pg-h2">Parameters</h2>
          ${table(
            ["Parameter", "Type", "Description"],
            [
              [
                "<code>pageSize</code>",
                "number",
                "Number of records per page.",
              ],
              [
                "<code>nextPageToken</code>",
                "string",
                "Opaque cursor for the next page, returned in the previous response.",
              ],
            ],
          )}

          <h2 class="pg-h2">Iterating pages</h2>
          ${codeBlock(
            "bash",
            `curl -X GET "${apiUrl}/wrikexpi/campaign?pageSize=10" \\
  -H "Authorization: Bearer <access_token>"`,
          )}
          <p class="pg-p">Then follow the cursor:</p>
          ${codeBlock(
            "bash",
            `curl -X GET "${apiUrl}/wrikexpi/campaign?pageSize=10&nextPageToken=<token>" \\
  -H "Authorization: Bearer <access_token>"`,
          )}
          ${callout(
            "tip",
            "Stop when the token is empty",
            "An absent or empty <code>nextPageToken</code> means you've reached the last page.",
          )}`,
      },
      {
        id: "api/campaigns",
        group: "XPI API Docs",
        groupId: "api",
        label: "Campaigns",
        keywords:
          "campaign campaigns list get create update delete upload crud endpoint",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">Campaigns</h1>
          <p class="pg-lede">Full CRUD for Wrike campaigns, plus request-form creation and file uploads.</p>

          <h2 class="pg-h2">Endpoints</h2>
          ${endpoint("GET", "/wrikexpi/campaign", "List campaigns. Supports <code>filter</code>, <code>pageSize</code>, <code>nextPageToken</code>.")}
          ${endpoint("GET", "/wrikexpi/campaign/:campaignId", "Get a single campaign.")}
          ${endpoint("POST", "/wrikexpi/campaign", "Create a campaign from a request form.")}
          ${endpoint("POST", "/wrikexpi/campaign/url", "Create a campaign and return a pre-filled request-form URL.")}
          ${endpoint("PUT", "/wrikexpi/campaign/:campaignId", "Update campaign fields. Body: <code>formFields</code>.")}
          ${endpoint("DELETE", "/wrikexpi/campaign/:campaignId", "Delete a campaign.")}
          ${endpoint("POST", "/wrikexpi/campaign/upload", "Upload a file attachment (multipart).")}

          <h2 class="pg-h2">List campaigns</h2>
          ${codeBlock(
            "bash",
            `curl -X GET "${apiUrl}/wrikexpi/campaign?pageSize=5" \\
  -H "Authorization: Bearer <access_token>"`,
          )}
          ${codeBlock(
            "json",
            `{
  "success": true,
  "type": "Campaign",
  "nextPageToken": "eyJwYWdlIjoyfQ",
  "data": [
    {
      "campaignname": "Lacer - Pilexil - AO Diciembre",
      "agency": "EssenceMediacom",
      "campaignbudget": "1200000"
    }
  ]
}`,
          )}

          <h2 class="pg-h2">Create a campaign</h2>
          ${codeBlock(
            "bash",
            `curl -X POST "${apiUrl}/wrikexpi/campaign" \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "formFields": {
      "campaignname": "Q3 Launch",
      "agency": "EssenceMediacom"
    }
  }'`,
          )}

          <h2 class="pg-h2">Update a campaign</h2>
          ${codeBlock(
            "bash",
            `curl -X PUT "${apiUrl}/wrikexpi/campaign/<campaignId>" \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{ "formFields": { "campaignbudget": "1500000" } }'`,
          )}

          <h2 class="pg-h2">Delete a campaign</h2>
          ${codeBlock(
            "bash",
            `curl -X DELETE "${apiUrl}/wrikexpi/campaign/<campaignId>" \\
  -H "Authorization: Bearer <access_token>"`,
          )}`,
      },
      {
        id: "api/channels",
        group: "XPI API Docs",
        groupId: "api",
        label: "Channels",
        keywords: "channel channels list get update delete crud endpoint media",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">Channels</h1>
          <p class="pg-lede">Channels are media-buying entities under a campaign.</p>

          <h2 class="pg-h2">Endpoints</h2>
          ${endpoint("GET", "/wrikexpi/channel/:channelId", "Get a single channel.")}
          ${endpoint("PUT", "/wrikexpi/channel/:channelId", "Update channel fields. Body: <code>formFields</code>.")}
          ${endpoint("DELETE", "/wrikexpi/channel/:channelId", "Delete a channel.")}
          ${endpoint("GET", "/wrikexpi/campaign/:campaignId/channel", "List channels under a campaign.")}

          <h2 class="pg-h2">List channels in a campaign</h2>
          ${codeBlock(
            "bash",
            `curl -X GET "${apiUrl}/wrikexpi/campaign/<campaignId>/channel?pageSize=10" \\
  -H "Authorization: Bearer <access_token>"`,
          )}

          <h2 class="pg-h2">Update a channel</h2>
          ${codeBlock(
            "bash",
            `curl -X PUT "${apiUrl}/wrikexpi/channel/<channelId>" \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{ "formFields": { "channelname": "TV Spot" } }'`,
          )}`,
      },
      {
        id: "api/tasks",
        group: "XPI API Docs",
        groupId: "api",
        label: "Tasks",
        keywords:
          "task tasks list get update delete crud endpoint channel campaign",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">Tasks</h1>
          <p class="pg-lede">Tasks are work items nested under campaigns or channels.</p>

          <h2 class="pg-h2">Endpoints</h2>
          ${endpoint("GET", "/wrikexpi/task/:taskId", "Get a single task.")}
          ${endpoint("PUT", "/wrikexpi/task/:taskId", "Update task fields. Body: <code>formFields</code>.")}
          ${endpoint("DELETE", "/wrikexpi/task/:taskId", "Delete a task.")}
          ${endpoint("GET", "/wrikexpi/campaign/:campaignId/task", "List tasks under a campaign.")}
          ${endpoint("GET", "/wrikexpi/channel/:channelId/task", "List tasks under a channel.")}

          <h2 class="pg-h2">List campaign tasks</h2>
          ${codeBlock(
            "bash",
            `curl -X GET "${apiUrl}/wrikexpi/campaign/<campaignId>/task?pageSize=10" \\
  -H "Authorization: Bearer <access_token>"`,
          )}

          <h2 class="pg-h2">Update a task</h2>
          ${codeBlock(
            "bash",
            `curl -X PUT "${apiUrl}/wrikexpi/task/<taskId>" \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{ "formFields": { "taskstatus": "In Progress" } }'`,
          )}`,
      },
      {
        id: "api/master",
        group: "XPI API Docs",
        groupId: "api",
        label: "Master data",
        keywords:
          "master master data record records odata v1.0 dominus slug create update delete list",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">Master data</h1>
          <p class="pg-lede">An OData-style service for master-data records, grouped by a <code>masterSlug</code>.</p>

          <h2 class="pg-h2">Endpoints</h2>
          ${endpoint("GET", "/wrikexpi/v1.0/record/:masterSlug", "List records. Supports <code>filter</code>, <code>pageSize</code>, <code>nextPageToken</code>.")}
          ${endpoint("GET", "/wrikexpi/v1.0/record/:masterSlug/:recordId", "Get a single record.")}
          ${endpoint("POST", "/wrikexpi/v1.0/record/:masterSlug", "Create a record.")}
          ${endpoint("PUT", "/wrikexpi/v1.0/record/:masterSlug/:recordId", "Update a record.")}
          ${endpoint("DELETE", "/wrikexpi/v1.0/record/:masterSlug/:recordId", "Delete a record.")}

          <h2 class="pg-h2">OData envelope</h2>
          <p class="pg-p">List responses use an OData envelope with <code>@odata.context</code>, a <code>value</code> array and <code>nextPageToken</code>.</p>
          ${codeBlock(
            "json",
            `{
  "@odata.context": "${apiUrl}/wrikexpi/v1.0/record/agencies",
  "nextPageToken": "eyJwYWdlIjoyfQ",
  "value": [
    { "id": "IEXB001", "agencyname": "EssenceMediacom" }
  ]
}`,
          )}

          <h2 class="pg-h2">Create a record</h2>
          ${codeBlock(
            "bash",
            `curl -X POST "${apiUrl}/wrikexpi/v1.0/record/agencies" \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{ "agencyname": "New Agency" }'`,
          )}`,
      },
      {
        id: "api/errors",
        group: "XPI API Docs",
        groupId: "api",
        label: "Errors",
        keywords:
          "errors error error-codes 400 401 403 500 response envelope status code reference reference-id support",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">Errors</h1>
          <p class="pg-lede">The REST API returns a consistent JSON envelope for errors.</p>

          <h2 class="pg-h2">Error response shape</h2>
          ${codeBlock(
            "json",
            `{
  "success": false,
  "message": "The selected filters are invalid. Please review your filter values and try again.",
  "details": null,
  "reference": "XPI-API-8ZTJ2QWF"
}`,
          )}
          <p class="pg-p">Every response with a status of <code>400</code> or above carries a <code>reference</code>: a short id for that one call. It starts with <code>XPI-API-</code>, so a reference read out over the phone says which surface it came from, and it ends in eight characters drawn from an alphabet with no letters or digits that look like each other. That way it survives being read aloud or copied from a screenshot.</p>
          <p class="pg-p">The same id is on the call's row in the activity log, so quoting it is the fastest way for somebody to find what happened. Quote it (or log it) when you report a problem rather than describing the request.</p>

          <h2 class="pg-h2">Common status codes</h2>
          ${table(
            ["Code", "Meaning"],
            [
              ["<code>200</code>", "Success."],
              [
                "<code>400</code>",
                "Invalid request — bad filter, missing field, or unsupported operator.",
              ],
              [
                "<code>401</code>",
                "Missing or invalid bearer token, or a token that has been switched off.",
              ],
              [
                "<code>403</code>",
                "Not authorized to access the service, or this token is not permitted to perform that action on that module (<code>MODULE_FORBIDDEN</code> — see <b>Token permissions</b>).",
              ],
              ["<code>500</code>", "Unexpected server error."],
            ],
          )}
          ${callout(
            "tip",
            "Read the message",
            "Always surface the <code>message</code> field to users — it's written to be actionable.",
          )}`,
      },
      {
        id: "api/limits",
        group: "XPI API Docs",
        groupId: "api",
        label: "Limits & rate limits",
        keywords:
          "limit limits rate rate-limit quota 429 throttle concurrency best practice",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">Limits &amp; rate limits</h1>
          <p class="pg-lede">Keep requests within these bounds to avoid throttling.</p>

          <h2 class="pg-h2">Guidelines</h2>
          <ul class="bullets">
            <li><code>pageSize</code> caps page length — large reads should paginate with <code>nextPageToken</code>.</li>
            <li>List endpoints return at most one page of records per call.</li>
            <li>Rate limiting is applied per client. Back off exponentially on <code>429</code> responses.</li>
            <li>Reuse your access token until it expires; don't re-authenticate per request.</li>
          </ul>
          ${callout(
            "warn",
            "429 Too Many Requests",
            "If you hit the rate limit, slow down and retry with exponential backoff. Check the <code>Retry-After</code> header if present.",
          )}`,
      },
    ];

    // ──────────────────────── Calendar Sync pages ────────────────────────
    const calendarPages = [
      {
        id: "calendar/overview",
        group: "Calendar Sync Docs",
        groupId: "calendar",
        label: "Overview",
        keywords:
          "calendar sync overview why benefits what is it for subscribe feed connect google outlook apple ics keep in step not updating",
        html: `
          <div class="pg-eyebrow">Calendar Sync</div>
          <h1 class="pg-title">Your Wrike tasks, in your calendar</h1>
          <p class="pg-lede">Calendar Sync puts the tasks you work on in Wrike into the calendar you already open every morning: Google Calendar, Outlook, Apple Calendar, or any other one. Connect it once and it keeps itself up to date.</p>

          <div class="card-strip">
            <div class="stat-card"><span class="stat-ic">${IC.bolt}</span><strong>Connected in minutes</strong><p>One choice on the login page, one sign-in with Wrike, and you are done.</p></div>
            <div class="stat-card"><span class="stat-ic">${IC.check}</span><strong>Always up to date</strong><p>When a task moves in Wrike, it moves in your calendar too. Nobody has to remember anything.</p></div>
            <div class="stat-card"><span class="stat-ic">${IC.warn}</span><strong>Yours to switch off</strong><p>One switch in the console ends the connection, and the calendar stops at once.</p></div>
          </div>

          <h2 class="pg-h2">What this gives you</h2>
          <ul class="bullets">
            <li><b>Your tasks beside your meetings.</b> The work you are responsible for stops living in a second place you have to remember to check.</li>
            <li><b>Due dates that stay honest.</b> Move a task in Wrike and the calendar follows. The two can never disagree.</li>
            <li><b>One week, in one view.</b> Plan your day around real commitments instead of guessing what is coming.</li>
            <li><b>Nothing to copy, ever.</b> No exports, no pasting, no reminders to update the calendar by hand.</li>
          </ul>

          <h2 class="pg-h2">Works with the calendar you already use</h2>
          <p class="pg-p">Google Calendar, Outlook, Apple Calendar, and any other app that can add a subscription or connect an account. There is nothing to install, and nobody needs to change the way they work.</p>

          <h2 class="pg-h2">What you need</h2>
          <ul class="bullets">
            <li>A Wrike account that can see the tasks you want in your calendar.</li>
            <li>Your calendar app, and about five minutes, once.</li>
          </ul>

          <h2 class="pg-h2">How it works</h2>
          <div class="flow">
            ${[
              [
                "Choose an environment",
                "Pick the environment this connection is made for. It is the only place your calendar will read from.",
              ],
              [
                "Sign in with Wrike once",
                "Authorise it as the person whose tasks it should bring across.",
              ],
              [
                "Copy your connection",
                "It appears on the setup page as soon as the sign-in finishes, ready to copy.",
              ],
              [
                "Add it to your calendar",
                "Paste the connection into your calendar app. That is the last step, and the last time you think about it.",
              ],
            ]
              .map(
                ([t, d], i) => `
              <div class="flow-step">
                <span class="flow-n">${i + 1}</span>
                <div><strong>${t}</strong><p>${d}</p></div>
              </div>`,
              )
              .join("")}
          </div>

          ${callout(
            "info",
            "Your calendar never sees your Wrike password",
            "It gets a connection of its own, created by your sign-in with Wrike. An administrator can end it at any moment, and ending it stops the calendar immediately.",
          )}

          <div class="cta-row">
            <a class="btn primary" href="#/calendar/setup">Set it up ${IC.bolt}</a>
            <a class="btn ghost" href="#/calendar/permissions">See what it can do</a>
          </div>`,
      },
      {
        id: "calendar/setup",
        group: "Calendar Sync Docs",
        groupId: "calendar",
        label: "Set it up",
        keywords:
          "setup set up connect generate credential once copy paste environment sign in five minutes get started install subscribe",
        html: `
          <div class="pg-eyebrow">Calendar Sync</div>
          <h1 class="pg-title">Set it up</h1>
          <p class="pg-lede">About five minutes, once. After that, your Wrike tasks keep themselves current in your calendar.</p>

          <h2 class="pg-h2">1 · Choose an environment</h2>
          <p class="pg-p">This step is only about making the connection. The environment you choose here is the one the connection is created for, and the only place your calendar will be able to read from.</p>
          <label class="field-label" for="docs-cal-env">Environment</label>
          <div class="select-wrap">
            <select id="docs-cal-env">
              ${environments
                .map((e) => `<option value="${esc(e.key)}">${e.label}</option>`)
                .join("")}
            </select>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <p class="pg-p">Nothing has been created yet. Your choice is used once, on the next step, to make a connection that can reach this environment and nothing else.</p>

          <h2 class="pg-h2">2 · Generate your connection</h2>
          <p class="pg-p">Press the button and sign in with Wrike as the person whose tasks should appear in the calendar. You will come straight back here, with your own connection filled in for you.</p>
          <div class="cta-row">
            <a class="btn primary" id="cal-generate" href="${calendarSignInBase}${esc(environments[0]?.key || "")}">Generate my connection ${IC.bolt}</a>
            <a class="btn ghost" href="#/calendar/permissions">See what it can do</a>
          </div>
          <p class="pg-p">Your calendar can never show more than you can see, and an administrator decides who is allowed to connect in the first place. Nothing you already have in Wrike changes.</p>

          <h2 class="pg-h2">3 · Copy your connection</h2>
          <p class="pg-p">The address below is the whole of it. There is nothing to install and no account to create. While it still says <code>{XPIToken}</code>, it is the empty template, because no connection has been made yet.</p>
          <div id="cal-connected" hidden>
            ${callout(
              "tip",
              "Your connection is in the address below",
              "Copy the whole line before you leave this page. It is shown once and cannot be looked up again.",
            )}
          </div>
          <div class="url-box">
            <code class="url-code" id="cal-feed">${esc(calendarSyncFeed)}</code>
            <button type="button" class="copy-btn solid" id="cal-feed-copy" data-copy="${esc(calendarSyncFeed)}"><span class="copy-ic">${IC.copy}</span><span class="tick-ic">${IC.check}</span><span class="copy-txt">Copy</span></button>
          </div>

          <h2 class="pg-h2">4 · Add it to your calendar</h2>
          <p class="pg-p">In your calendar app, look for <b>Subscribe</b>, <b>Add calendar from URL</b> or <b>Add account</b>, and paste that address. Google Calendar, Outlook and Apple Calendar all accept it. That is the last step, and the last time you think about it.</p>
          ${callout(
            "tip",
            "The address and the connection are one thing",
            "Everything before the question mark is the address, and everything after it is your connection. Keep the whole line to yourself: anybody holding it can see what your connection can see.",
          )}
          ${callout(
            "warn",
            "If you lose it",
            "A connection is shown once. If yours is gone, generate another one here and switch the old one off in the console. Nothing is broken by having two for a moment.",
          )}

          <div class="cta-row">
            <a class="btn primary" href="#/calendar/permissions">See what it can do</a>
            <a class="btn ghost" href="#/calendar/troubleshooting">If it stops working</a>
          </div>`,
      },
      {
        id: "calendar/check",
        group: "Calendar Sync Docs",
        groupId: "calendar",
        label: "Check the connection",
        keywords:
          "check connection still connected validator validate is it working not updating 401 403 not authorized forbidden status what to do",
        html: `
          <div class="pg-eyebrow">Calendar Sync</div>
          <h1 class="pg-title">Check the connection</h1>
          <p class="pg-lede">Not sure the calendar is still connected? You can find out in a moment, instead of waiting for it to miss something.</p>

          <h2 class="pg-h2">The quickest way: the console</h2>
          <p class="pg-p">Open the <b>Tokens</b> list and find the row named <b>Calendar Sync</b>. The <b>Status</b> switch on that row shows whether the connection is on, and the <b>Activity log</b> shows the calls your calendar has made, including the ones that were turned away.</p>
          ${callout(
            "tip",
            "Looking changes nothing",
            "The console only shows what already happened. It cannot disturb your Wrike workspace, and nothing needs switching off to check it.",
          )}

          <h2 class="pg-h2">If the calendar app is the one complaining</h2>
          <p class="pg-p">A calendar that cannot read its subscription usually goes quiet, or shows an error on the calendar itself. When the console says the connection is fine, the next thing worth checking is the address you were given: it should be the subscription address from <a href="#/calendar/setup">Set it up</a>, complete with your connection on the end.</p>

          <h2 class="pg-h2">What the message means</h2>
          ${table(
            ["What you see", "What it means", "What to do"],
            [
              [
                "Everything is up to date",
                "The connection is on, and it is allowed to do what it is doing.",
                "Nothing.",
              ],
              [
                "Not authorized, or <code>401</code>",
                "The connection is no longer accepted. It was switched off, deleted, or replaced by a newer sign-in.",
                'Set it up again from the <a href="/">login page</a>, then switch the old connection off so there is only one.',
              ],
              [
                "Forbidden, or <code>403</code>",
                "The connection is fine, but something it needs has been turned off: either the person behind it lost access, or one of its permissions was switched off.",
                "Ask an administrator to look at <b>Environment Access</b> for that environment, and at <b>Token Permissions</b> on the connection's row.",
              ],
            ],
          )}

          <div class="cta-row">
            <a class="btn primary" href="#/calendar/troubleshooting">Something still wrong?</a>
            <a class="btn ghost" href="#/calendar/permissions">What it can do</a>
          </div>`,
      },
      {
        id: "calendar/permissions",
        group: "Calendar Sync Docs",
        groupId: "calendar",
        label: "What it can do",
        keywords:
          "what it can do permissions read write add create update delete change dates remove allow restrict narrowing admin console access switch off revoke",
        html: `
          <div class="pg-eyebrow">Calendar Sync</div>
          <h1 class="pg-title">What it can do</h1>
          <p class="pg-lede">The syncing happens by itself, in the background. What the connection is allowed to do while it works is what you set here.</p>
          <p class="pg-p">There is nothing to create, update or remove by hand, and no button to press once the connection is in place. Your calendar tool asks, this service answers, and your tasks stay up to date. What follows is the four things a connection can be allowed to do while that happens.</p>

          <h2 class="pg-h2">The four things a connection can be allowed to do</h2>
          ${table(
            ["What the connection does", "It needs"],
            [
              [
                "Brings your Wrike tasks across, and keeps their dates and details current",
                "<b>Read</b>",
              ],
              ["Sends a new task back to Wrike", "<b>Create</b>"],
              ["Changes the date or the details of a task", "<b>Update</b>"],
              ["Removes a task", "<b>Delete</b>"],
            ],
          )}

          <h2 class="pg-h2">What a new connection starts with</h2>
          <p class="pg-p">Read, and nothing else. Bringing your tasks across is what the connection is for, so that is all it starts with. A tool that also sends changes back needs the verb it uses, granted on purpose, for that one connection, by an administrator in the console.</p>
          <p class="pg-p">A calendar connection can never reach anywhere else in Wrike. Campaigns, projects, master data and everything else are closed to it unless somebody deliberately opens a door.</p>
          ${callout(
            "tip",
            "Letting a calendar send changes back",
            "Open the connection's row in the console, choose <b>Token Permissions</b>, and grant the one extra thing it needs. Grant the verb the tool actually uses, and nothing more.",
          )}

          <h2 class="pg-h2">It can never see more than you do</h2>
          <p class="pg-p">Whatever a connection is allowed to do, it still only sees the tasks you can see. If you lose access to part of Wrike, the calendar loses it at the same moment.</p>
          ${callout(
            "info",
            "Two questions, both answered",
            "Who may connect from this environment at all is decided by an administrator. What each connection may then do is decided here. A connection has to pass both.",
          )}

          <h2 class="pg-h2">Ending a connection</h2>
          <p class="pg-p">The connection appears in the console's <b>Tokens</b> list with the name <b>Calendar Sync</b>. That row is where it ends:</p>
          ${table(
            ["What you do", "What happens to the calendar"],
            [
              [
                "Switch it off",
                "The calendar stops updating straight away. Nothing is deleted, and you can switch it back on.",
              ],
              [
                "Delete it",
                "The connection and its settings are removed for good. Setting it up again needs a fresh sign-in.",
              ],
              [
                "Ask for one permission to be removed",
                "That part stops working and everything else carries on.",
              ],
            ],
          )}

          <div class="cta-row">
            <a class="btn primary" href="#/calendar/troubleshooting">If it stops working</a>
            <a class="btn ghost" href="#/calendar/setup">Set up another</a>
          </div>`,
      },
      {
        id: "calendar/troubleshooting",
        group: "Calendar Sync Docs",
        groupId: "calendar",
        label: "If it stops updating",
        keywords:
          "troubleshooting stopped working not updating empty calendar missing tasks 401 403 forbidden denied switched off revoked deleted access rules activity log",
        html: `
          <div class="pg-eyebrow">Calendar Sync</div>
          <h1 class="pg-title">If it stops updating</h1>
          <p class="pg-lede">A calendar that quietly stops keeping up is usually one of four things, and every one of them can be checked in a minute.</p>

          ${table(
            ["What you notice", "What has usually happened", "What to do"],
            [
              [
                "Nothing new appears at all",
                "The connection was switched off, deleted, or replaced by a newer sign-in.",
                'Open <b>Tokens</b>, find the row named <b>Calendar Sync</b>, and check the <b>Status</b> switch. If the row is gone, set the connection up again from the <a href="/">login page</a>.',
              ],
              [
                "Some things keep up, others do not",
                "One of the connection's permissions was switched off.",
                "Ask an administrator to open <b>Token Permissions</b> on that row and switch it back on.",
              ],
              [
                "It stopped after somebody changed role or left",
                "The person the connection belongs to no longer has access to that environment.",
                "Ask an administrator to check <b>Environment Access</b> for that environment.",
              ],
              [
                "Your calendar app shows an error it never showed before",
                "Something about the connection has changed, and the app is telling you.",
                'Set the connection up again from the <a href="/">login page</a>, then switch the old one off in <b>Tokens</b>.',
              ],
            ],
          )}

          ${callout(
            "tip",
            "Check the console before anything else",
            "The <b>Tokens</b> list shows whether the connection is on, and the <b>Activity log</b> shows every call your calendar has made, including the ones that were turned away. If nothing at all is in the log, nothing reached us, and the next place to look is your calendar app.",
          )}

          ${callout(
            "info",
            "Asking for help?",
            "Every message we send back includes a short reference, like <code>XPI-API-8ZTJ2QWF</code>. Copy it when you report the problem, and whoever picks it up can open that exact call instead of searching for it.",
          )}

          <div class="cta-row">
            <a class="btn primary" href="#/calendar/check">Check the connection</a>
            <a class="btn ghost" href="#/calendar/overview">Overview</a>
          </div>`,
      },
    ];

    const DOC_PAGES = { mcp: mcpPages, api: apiPages, calendar: calendarPages };
    const pages = DOC_PAGES[groupId] || mcpPages;
    const defaultPage = meta.defaultPage;

    // ─────────────────────────── build sidebar ───────────────────────────
    const groups = [
      {
        id: groupId,
        label: pages[0].group,
        items: pages,
      },
    ];

    const sidebarHtml = groups
      .map(
        (g) => `
        <div class="nav-group">
          <div class="nav-group-label">${g.label}</div>
          <nav class="nav-list">
            ${g.items
              .map(
                (p) => `
              <a class="nav-item" href="#/${p.id}" data-page="${p.id}">
                <span class="nav-item-dot"></span>
                <span>${p.label}</span>
              </a>`,
              )
              .join("")}
          </nav>
        </div>`,
      )
      .join("");

    const pagesHtml = pages
      .map(
        (p) =>
          `<div class="doc-page" id="page-${p.id}" data-keywords="${esc(p.keywords)}" hidden>${p.html}</div>`,
      )
      .join("");

    const envOptions = environments
      .map(
        (e) =>
          `<option value="${e.key}" data-url="${esc(e.url)}">${e.label}</option>`,
      )
      .join("");

    // ─────────────────────────── page shell ───────────────────────────
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WrikeXPI · Developer Docs</title>
  <link rel="icon" href="https://cdn.wrike.com/static/branding/wrike/favicons/favicon.ico" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #f8fafc;
      --bg-elev: #ffffff;
      --card: #ffffff;
      --muted: #f1f5f9;
      --border: #e2e8f0;
      --border-strong: #cbd5e1;
      --fg: #0f172a;
      --fg-dim: #475569;
      --fg-faint: #64748b;
      --accent: #15803d;
      --accent-strong: #166534;
      --on-accent: #ffffff;
      --sky: #0284c7;
      --amber: #b45309;
      --rose: #dc2626;
      --violet: #7c3aed;
      --mono: 'JetBrains Mono', ui-monospace, 'Cascadia Code', Menlo, monospace;
      --sans: 'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif;
      --display: 'Space Grotesk', var(--sans);
      --topbar-h: 64px;
      --sidebar-w: 280px;
      --radius: 14px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }
    body {
      font-family: var(--sans);
      background: var(--bg);
      color: var(--fg);
      font-size: 15px;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
      background-image:
        radial-gradient(900px 420px at 78% -80px, rgba(22,163,74,0.07), transparent 60%),
        radial-gradient(700px 380px at -60px 20%, rgba(2,132,199,0.05), transparent 60%);
      background-repeat: no-repeat;
    }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::selection { background: rgba(22,163,74,0.2); color: #0f172a; }
    a { color: inherit; }
    code {
      font-family: var(--mono);
      font-size: 0.86em;
      background: rgba(15,23,42,0.06);
      border: 1px solid rgba(15,23,42,0.1);
      padding: 1px 6px;
      border-radius: 6px;
      color: #0f172a;
      white-space: nowrap;
    }
    .lnk { color: var(--accent); text-decoration: none; border-bottom: 1px solid rgba(21,128,61,0.35); }
    .lnk:hover { color: #166534; }

    /* ── Top bar ─────────────────────────────────────────────── */
    .topbar {
      position: sticky; top: 0; z-index: 50;
      background: #ffffff;
      border-bottom: 1px solid var(--border);
    }
    .topbar-inner {
      min-height: var(--topbar-h);
      max-width: 1240px; margin: 0 auto;
      display: grid;
      grid-template-columns: auto minmax(200px, 1fr) auto;
      align-items: center;
      gap: 16px;
      padding: 0 28px;
    }
    .topbar-search.searchbox { justify-self: center; width: 100%; max-width: 320px; margin: 0; }
    .topbar-search.searchbox .search-results { top: calc(100% + 8px); }
    .topbar-search.searchbox input { padding: 8px 12px 8px 32px; font-size: 0.85rem; border-radius: 9px; }
    .topbar-search.searchbox svg { left: 11px; width: 14px; height: 14px; }
    .topbar-search.searchbox .search-kbd { right: 10px; font-size: 0.62rem; padding: 1px 6px; }
    .brand { display: flex; align-items: center; gap: 11px; text-decoration: none; }
    .brand-mark {
      width: 30px; height: 30px; border-radius: 9px;
      background: linear-gradient(135deg, var(--accent), #16a34a);
      display: flex; align-items: center; justify-content: center;
      color: var(--on-accent); font-family: var(--display); font-weight: 700; font-size: 15px;
      box-shadow: 0 0 0 1px rgba(34,197,94,0.35), 0 6px 18px rgba(34,197,94,0.25);
    }
    .brand-name { font-family: var(--display); font-weight: 700; font-size: 1.02rem; letter-spacing: -0.01em; }
    .brand-tag {
      font-family: var(--mono); font-size: 0.68rem; color: var(--fg-faint);
      border: 1px solid var(--border-strong); padding: 3px 8px; border-radius: 999px;
    }
    .topnav { display: flex; align-items: center; gap: 6px; }
    .topnav a {
      font-size: 0.86rem; font-weight: 500; color: var(--fg-dim);
      text-decoration: none; padding: 8px 14px; border-radius: 9px;
      transition: color .16s ease, background .16s ease;
    }
    .topnav a:hover { color: var(--fg); background: rgba(148,163,184,0.1); }
    .topnav a.active { color: var(--accent); background: rgba(34,197,94,0.12); }
    .menu-btn { display: none; background: none; border: 1px solid var(--border); color: var(--fg); border-radius: 9px; padding: 8px 10px; cursor: pointer; }

    /* ── Docs header (compact — keeps sidebar + content in focus) ── */
    .docs-head {
      display: flex; align-items: center; justify-content: space-between; gap: 24px;
      flex-wrap: wrap;
      max-width: 1240px; margin: 0 auto;
      padding: 28px 28px 22px;
    }
    .docs-head .hero-eyebrow { margin-bottom: 6px; }
    .docs-head h1 { font-family: var(--display); font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; }
    .searchbox { position: relative; }
    .searchbox svg { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--fg-faint); }
    .searchbox input {
      width: 100%; padding: 14px 16px 14px 44px;
      background: var(--bg-elev); color: var(--fg);
      border: 1px solid var(--border-strong); border-radius: 12px;
      font-family: var(--sans); font-size: 0.95rem;
      transition: border-color .16s ease, box-shadow .16s ease;
    }
    .searchbox input::placeholder { color: var(--fg-faint); }
    .searchbox input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(34,197,94,0.16); }
    .search-kbd {
      position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
      font-family: var(--mono); font-size: 0.7rem; color: var(--fg-faint);
      border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px;
      pointer-events: none;
    }
    .search-results {
      position: absolute; z-index: 40; left: 0; right: 0; top: 54px;
      background: var(--card); border: 1px solid var(--border-strong);
      border-radius: 12px; box-shadow: 0 18px 40px rgba(15,23,42,0.16);
      overflow: hidden; display: none;
    }
    .search-results.open { display: block; }
    .search-results a {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px; text-decoration: none; border-bottom: 1px solid var(--border);
      transition: background .12s ease;
    }
    .search-results a:last-child { border-bottom: 0; }
    .search-results a:hover, .search-results a.sel { background: rgba(34,197,94,0.1); }
    .search-results .s-group { font-family: var(--mono); font-size: 0.68rem; color: var(--fg-faint); text-transform: uppercase; letter-spacing: 0.08em; }
    .search-results .s-title { font-weight: 600; font-size: 0.9rem; }
    .search-results .empty { padding: 14px 16px; color: var(--fg-faint); font-size: 0.88rem; }

    /* ── Layout ──────────────────────────────────────────────── */
    .shell {
      display: grid;
      grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
      gap: 0;
      max-width: 1240px; margin: 0 auto; padding: 0 28px 80px;
    }

    /* Sidebar */
    .sidebar {
      padding: 28px 8px 40px 0; position: sticky; top: var(--topbar-h);
      align-self: start; max-height: calc(100vh - var(--topbar-h)); overflow-y: auto;
    }
    .nav-group { margin-bottom: 26px; }
    .nav-group-label {
      font-family: var(--mono); font-size: 0.68rem; color: var(--fg-faint);
      text-transform: uppercase; letter-spacing: 0.12em;
      padding: 0 12px; margin-bottom: 8px;
    }
    .nav-list { display: flex; flex-direction: column; gap: 2px; }
    .nav-item {
      display: flex; align-items: center; gap: 11px;
      padding: 9px 12px; border-radius: 9px;
      text-decoration: none; color: var(--fg-dim); font-size: 0.9rem; font-weight: 500;
      border-left: 2px solid transparent;
      transition: background .14s ease, color .14s ease;
    }
    .nav-item:hover { background: rgba(148,163,184,0.08); color: var(--fg); }
    .nav-item.active { background: rgba(34,197,94,0.1); color: var(--fg); border-left-color: var(--accent); }
    .nav-item-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--border-strong); transition: background .14s ease; }
    .nav-item.active .nav-item-dot { background: var(--accent); }

    /* Content */
    .content { min-width: 0; padding: 20px 0 60px 40px; }
    .doc-page { animation: pageIn .28s ease; max-width: 820px; }
    @keyframes pageIn { from { opacity: 0; transform: translateY(8px);} to { opacity: 1; transform: none;} }
    .pg-eyebrow { font-family: var(--mono); font-size: 0.72rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 12px; }
    .pg-title { font-family: var(--display); font-size: 2.1rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.12; margin-bottom: 14px; }
    .pg-lede { color: var(--fg-dim); font-size: 1.06rem; max-width: 60ch; margin-bottom: 30px; }
    .pg-h2 { font-family: var(--display); font-size: 1.28rem; font-weight: 600; letter-spacing: -0.01em; margin: 38px 0 14px; padding-top: 6px; }
    .pg-h3 { font-family: var(--display); font-size: 1.05rem; font-weight: 600; letter-spacing: -0.005em; margin: 26px 0 10px; }
    .pg-p { color: #334155; margin: 12px 0; }
    .pg-p em { color: var(--fg); font-style: normal; border-bottom: 1px dashed var(--border-strong); }

    /* Cards strip */
    .card-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin: 26px 0 6px; }
    .stat-card {
      background: linear-gradient(160deg, var(--card), var(--bg-elev));
      border: 1px solid var(--border); border-radius: var(--radius);
      padding: 20px 18px; transition: transform .18s ease, border-color .18s ease;
    }
    .stat-card:hover { transform: translateY(-3px); border-color: var(--border-strong); }
    .stat-ic { display: inline-flex; width: 34px; height: 34px; border-radius: 9px; align-items: center; justify-content: center; background: rgba(34,197,94,0.12); color: var(--accent); margin-bottom: 12px; }
    .stat-card strong { font-family: var(--display); font-size: 0.98rem; display: block; }
    .stat-card p { color: var(--fg-dim); font-size: 0.82rem; margin-top: 5px; }

    /* Flow / ordered */
    .flow { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 18px 0; }
    .flow-step {
      background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 18px; position: relative;
    }
    .flow-n {
      font-family: var(--display); font-weight: 700; color: var(--accent);
      width: 28px; height: 28px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;
      background: rgba(34,197,94,0.12); font-size: 0.85rem; margin-bottom: 10px;
    }
    .flow-step strong { font-size: 0.92rem; }
    .flow-step p { color: var(--fg-dim); font-size: 0.82rem; margin-top: 4px; }

    .ordered { margin: 14px 0 14px 20px; color: #334155; }
    .ordered li { margin: 8px 0; }
    .bullets { margin: 14px 0 14px 20px; color: #334155; }
    .bullets li { margin: 8px 0; }

    /* Endpoints */
    .endpoint {
      display: grid; grid-template-columns: 76px 1fr; gap: 2px 16px;
      align-items: center;
      background: var(--card); border: 1px solid var(--border); border-radius: 11px;
      padding: 12px 16px; margin: 10px 0;
    }
    .method {
      grid-row: span 2; justify-self: start;
      font-family: var(--mono); font-size: 0.7rem; font-weight: 600;
      padding: 4px 10px; border-radius: 7px; letter-spacing: 0.03em;
    }
    .method.get { background: rgba(22,163,74,0.14); color: #15803d; }
    .method.post { background: rgba(2,132,199,0.12); color: #0369a1; }
    .method.put { background: rgba(217,119,6,0.14); color: #b45309; }
    .method.delete { background: rgba(220,38,38,0.12); color: #dc2626; }
    .ep-path { font-family: var(--mono); font-size: 0.84rem; color: #0f172a; background: none; border: none; padding: 0; white-space: normal; }
    .ep-desc { color: var(--fg-dim); font-size: 0.84rem; }

    /* Code blocks */
    .code { margin: 16px 0; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: #f8fafc; }
    .code figcaption {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 14px; background: #f1f5f9; border-bottom: 1px solid var(--border);
    }
    .code-meta { font-family: var(--mono); font-size: 0.7rem; color: var(--fg-faint); text-transform: uppercase; letter-spacing: 0.08em; }
    .code pre { padding: 16px 18px; overflow-x: auto; }
    .code code {
      font-family: var(--mono); font-size: 0.82rem; line-height: 1.7;
      color: #334155; background: none; border: none; padding: 0; white-space: pre;
    }
    .copy-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(148,163,184,0.12); color: var(--fg-dim);
      border: 1px solid var(--border); border-radius: 8px;
      font-family: var(--sans); font-size: 0.76rem; font-weight: 600;
      padding: 6px 11px; cursor: pointer; transition: all .14s ease;
    }
    .copy-btn:hover { color: var(--fg); border-color: var(--border-strong); }
    .copy-btn.copied { color: var(--accent); border-color: var(--accent); background: rgba(34,197,94,0.12); }
    .copy-btn.solid { background: var(--accent); color: var(--on-accent); border-color: transparent; border-radius: 0 11px 11px 0; padding: 0 18px; }
    .copy-btn.solid:hover { background: #16a34a; }

    /* A copy button that confirms with a tick as well as a colour. Turning green
       is easy to miss on a button someone pressed while looking somewhere else,
       and this one copies a long line that people often paste without reading. */
    .copy-ic, .tick-ic { display: inline-flex; align-items: center; }
    .copy-btn .tick-ic { display: none; }
    .copy-btn.copied .copy-ic { display: none; }
    .copy-btn.copied .tick-ic { display: inline-flex; }

    /* Callouts */
    .callout {
      display: flex; gap: 13px; align-items: flex-start;
      border: 1px solid var(--border); border-radius: 12px;
      padding: 14px 16px; margin: 18px 0; background: var(--card);
    }
    .callout-ic { flex-shrink: 0; margin-top: 2px; }
    .callout strong { font-size: 0.9rem; display: block; margin-bottom: 3px; }
    .callout p { color: var(--fg-dim); font-size: 0.86rem; margin: 0; }
    .callout.info .callout-ic { color: var(--sky); }
    .callout.warn .callout-ic { color: var(--amber); }
    .callout.tip .callout-ic { color: var(--accent); }
    .callout.info { border-left: 3px solid var(--sky); }
    .callout.warn { border-left: 3px solid var(--amber); }
    .callout.tip { border-left: 3px solid var(--accent); }

    /* Tables */
    .table-wrap { overflow-x: auto; margin: 16px 0; border: 1px solid var(--border); border-radius: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.87rem; }
    th {
      text-align: left; font-family: var(--mono); font-size: 0.7rem; color: var(--fg-faint);
      text-transform: uppercase; letter-spacing: 0.08em;
      padding: 11px 16px; background: #f1f5f9; border-bottom: 1px solid var(--border);
    }
    td { padding: 11px 16px; color: #334155; border-bottom: 1px solid var(--border); vertical-align: top; }
    tbody tr:last-child td { border-bottom: 0; }
    tbody tr { transition: background .12s ease; }
    tbody tr:hover { background: rgba(148,163,184,0.05); }

    /* URL box / select (MCP setup) */
    .mode-toggle { display: inline-flex; background: var(--card); border: 1px solid var(--border); border-radius: 11px; padding: 4px; gap: 4px; margin: 8px 0 18px; }
    .mode-btn { background: none; border: none; color: var(--fg-dim); font-family: var(--sans); font-weight: 600; font-size: 0.85rem; padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: all .14s ease; }
    .mode-btn:hover { color: var(--fg); }
    .mode-btn.active { background: var(--accent); color: var(--on-accent); }
    .mode-panel { display: none; }
    .mode-panel.active { display: block; animation: pageIn .22s ease; }
    .client-tabs { display: inline-flex; flex-wrap: wrap; gap: 4px; background: var(--muted); border: 1px solid var(--border); border-radius: 11px; padding: 4px; margin: 8px 0 14px; }
    .client-tab { background: none; border: none; color: var(--fg-dim); font-family: var(--sans); font-weight: 600; font-size: 0.84rem; padding: 8px 14px; border-radius: 8px; cursor: pointer; transition: all .14s ease; }
    .client-tab:hover { color: var(--fg); }
    .client-tab.active { background: var(--card); color: var(--accent); box-shadow: 0 1px 3px rgba(15,23,42,0.12); }
    .client-panel { display: none; }
    .client-panel.active { display: block; animation: pageIn .22s ease; }

    /* V1 (code-level) / V2 (plain-language) view switch — scoped per instance */
    .view-switch { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); margin: 18px 0; overflow: hidden; }
    .view-toggle { display: flex; gap: 4px; background: var(--muted); border-bottom: 1px solid var(--border); padding: 4px; }
    .view-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; background: none; border: none; color: var(--fg-dim); font-family: var(--sans); font-weight: 600; font-size: 0.83rem; padding: 9px 14px; border-radius: 8px; cursor: pointer; transition: all .14s ease; }
    .view-btn:hover { color: var(--fg); }
    .view-btn.active { background: var(--card); color: var(--accent); box-shadow: 0 1px 3px rgba(15,23,42,0.12); }
    .view-btn .view-tag { font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.06em; padding: 1px 6px; border-radius: 5px; background: rgba(21,128,61,0.12); color: var(--accent-strong); }
    .view-btn.active .view-tag { background: rgba(21,128,61,0.16); }
    .view-body { padding: 20px 22px; }
    .view-panel { display: none; }
    .view-panel.active { display: block; animation: pageIn .22s ease; }
    .view-panel .pg-p:first-child, .view-panel h3:first-child { margin-top: 0; }
    .field-label { font-family: var(--mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-faint); display: block; margin: 14px 0 8px; }
    .select-wrap { position: relative; max-width: 380px; margin-bottom: 14px; }
    .select-wrap select { appearance: none; -webkit-appearance: none; width: 100%; background: var(--bg-elev); color: var(--fg); border: 1px solid var(--border-strong); font-family: var(--sans); font-size: 0.9rem; padding: 12px 40px 12px 14px; border-radius: 10px; cursor: pointer; }
    .select-wrap select:focus { outline: none; border-color: var(--accent); }
    .select-wrap .chevron { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); width: 15px; height: 15px; color: var(--fg-faint); pointer-events: none; }
    .url-box { display: flex; align-items: stretch; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: 11px; overflow: hidden; margin-bottom: 10px; }
    .url-code { flex: 1; display: flex; align-items: center; padding: 14px 16px; font-family: var(--mono); font-size: 0.82rem; color: #334155; word-break: break-all; overflow-wrap: anywhere; }

    /* The Calendar Sync connection is long enough to wrap over several lines,
       which made that one box taller than the paragraph under it. It scrolls
       instead, so the address keeps the same shape whether it is the empty
       template or a connection, and the copy button stays where the eye last
       saw it. Top-aligned because centred text in a box it overflows is the
       one layout that can hide its own first line. */
    #cal-feed { align-items: flex-start; max-height: 120px; overflow-y: auto; overscroll-behavior: contain; }
    #cal-feed::-webkit-scrollbar { width: 8px; }
    #cal-feed::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 8px; }

    /* CTA */
    .cta-row { display: flex; flex-wrap: wrap; gap: 12px; margin: 30px 0 6px; }
    .btn { display: inline-flex; align-items: center; gap: 9px; padding: 12px 20px; border-radius: 11px; font-weight: 600; font-size: 0.9rem; text-decoration: none; transition: all .16s ease; }
    .btn.primary { background: var(--accent); color: var(--on-accent); box-shadow: 0 6px 18px rgba(34,197,94,0.25); }
    .btn.primary:hover { background: #16a34a; transform: translateY(-2px); }
    .btn.ghost { border: 1px solid var(--border-strong); color: var(--fg-dim); }
    .btn.ghost:hover { color: var(--fg); border-color: var(--border-strong); transform: translateY(-2px); }

    /* The Calendar Sync setup button is the one action on that page, so it does
       not need a shadow to be found. On a page that is almost entirely copy the
       shadow reads as a smudge rather than as a lift. */
    #cal-generate { box-shadow: none; }

    /* Pressing it hands the person over to Wrike's sign-in, and that handover
       is not instant: the button has to say it is working, and it has to refuse
       a second press, because a second press starts the whole sign-in again.
       The aria-disabled case is the one time it stands down before anybody has
       pressed anything: no environment to connect, so nothing to start. */
    #cal-generate[aria-busy='true'],
    #cal-generate[aria-disabled='true'] { pointer-events: none; opacity: 0.8; }
    #cal-generate .cal-spin {
      flex-shrink: 0;
      width: 14px; height: 14px; border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.45);
      border-top-color: var(--on-accent);
      animation: cal-spin 0.7s linear infinite;
    }
    @keyframes cal-spin { to { transform: rotate(360deg); } }

    .doc-foot {
      margin-top: 56px; padding-top: 22px; border-top: 1px solid var(--border);
      display: flex; justify-content: space-between; gap: 16px;
    }
    .doc-foot a { text-decoration: none; }
    .doc-foot .f-label { font-family: var(--mono); font-size: 0.68rem; color: var(--fg-faint); text-transform: uppercase; letter-spacing: 0.1em; display: block; margin-bottom: 4px; }
    .doc-foot .f-title { color: var(--fg); font-weight: 600; font-size: 0.92rem; }
    .doc-foot .f-next { text-align: right; }
    .doc-foot a:hover .f-title { color: var(--accent); }

    /* Footer CTA */
    .support {
      margin-top: 40px; border: 1px solid var(--border); border-radius: var(--radius);
      background: linear-gradient(140deg, rgba(34,197,94,0.08), transparent 60%), var(--card);
      padding: 28px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
    }
    .support h3 { font-family: var(--display); font-size: 1.1rem; }
    .support p { color: var(--fg-dim); font-size: 0.88rem; margin-top: 4px; }
    .support .btn { flex-shrink: 0; }

    .page-foot {
      max-width: 1240px; margin: 0 auto; padding: 26px 28px 40px;
      border-top: 1px solid var(--border); color: var(--fg-faint); font-size: 0.8rem;
      display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    }

    /* Mobile */
    .scrim { position: fixed; inset: 0; background: rgba(15,23,42,0.4); z-index: 60; opacity: 0; pointer-events: none; transition: opacity .2s ease; }
    .scrim.open { opacity: 1; pointer-events: auto; }
    @media (max-width: 900px) {
      .menu-btn { display: inline-flex; }
      /* Four destinations plus the brand get tight on a tablet, so the nav
         shrinks rather than wrapping: it is the only way to move between doc
         sets, and a wrapped header costs more height than it saves. */
      .topnav { gap: 2px; }
      .topnav a { padding: 7px 9px; font-size: 0.8rem; }
      .topbar-inner { grid-template-columns: 1fr auto; min-height: auto; padding: 10px 16px; row-gap: 8px; }
      .topbar-search.searchbox { grid-column: 1 / -1; grid-row: 2; justify-self: stretch; max-width: none; }
      .topbar-search .search-kbd { display: none; }
      .sidebar {
        position: fixed; top: calc(var(--topbar-h) + 40px); left: 0; bottom: 0; z-index: 70;
        width: min(300px, 84vw); background: var(--bg); border-right: 1px solid var(--border);
        padding: 20px 16px; transform: translateX(-102%); transition: transform .24s cubic-bezier(.22,1,.36,1);
        max-height: none;
      }
      .sidebar.open { transform: translateX(0); box-shadow: 24px 0 60px rgba(15,23,42,0.18); }
      .shell { grid-template-columns: 1fr; padding: 0 18px 60px; }
      .content { padding: 14px 0 40px; }
      .docs-head { padding: 20px 18px; }
    }
    /* Phone widths: the nav drops plain "Home" because the brand mark beside it
       already opens the login page, and keeps the three doc sets, which have no
       other way in. */
    @media (max-width: 620px) {
      .topnav a[data-top="home"] { display: none; }
    }
  </style>
</head>
<body>
  <div class="scrim" id="scrim"></div>

  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/" aria-label="WrikeXPI home">
        <span class="brand-mark">W</span>
        <span class="brand-name">WrikeXPI</span>
        <span class="brand-tag">Docs</span>
      </a>
      <div class="searchbox topbar-search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="docsearch" type="search" placeholder="Search ${meta.search} docs…" autocomplete="off" aria-label="Search documentation" />
        <span class="search-kbd">/</span>
        <div class="search-results" id="search-results" role="listbox"></div>
      </div>
      <nav class="topnav" aria-label="Documentation">
        ${DOC_NAV.map(
          (item) =>
            `<a href="${item.href}" data-top="${item.id}" class="${item.id === groupId ? "active" : ""}">${item.label}</a>`,
        ).join("\n        ")}
        <button class="menu-btn" id="menu-btn" aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </nav>
    </div>
  </header>

  <section class="docs-head">
    <div>
      <div class="hero-eyebrow">WrikeXPI · ${meta.eyebrow} Docs</div>
      <h1>${meta.hero}</h1>
    </div>
  </section>

  <div class="shell">
    <aside class="sidebar" id="sidebar">
      ${sidebarHtml}
    </aside>
    <main class="content" id="content">
      ${pagesHtml}
      <div class="support">
        <div>
          <h3>Still have questions?</h3>
          <p>Reach out to the WrikeXPI team and we'll point you in the right direction.</p>
        </div>
        <a class="btn primary" href="${meta.cta.href}">${meta.cta.label}</a>
      </div>
    </main>
  </div>

  <footer class="page-foot">
    <span>WrikeXPI Developer Documentation</span>
    <span>REST API · MCP · Calendar Sync · OAuth</span>
  </footer>

  <script>
    (function () {
      var PAGES = ${JSON.stringify(
        pages.map((p) => ({
          id: p.id,
          group: p.group,
          label: p.label,
          keywords: p.keywords,
        })),
      )};
      var defaultPage = ${JSON.stringify(defaultPage)};
      var MCP_ANY_URL = ${JSON.stringify(baseMcpUrl)};
      var CAL_SIGNIN = ${JSON.stringify(calendarSignInBase)};
      var CAL_FEED = ${JSON.stringify(calendarSyncUrl)};
      var content = document.getElementById('content');
      var sidebar = document.getElementById('sidebar');
      var scrim = document.getElementById('scrim');
      var searchInput = document.getElementById('docsearch');
      var searchResults = document.getElementById('search-results');
      var menuBtn = document.getElementById('menu-btn');

      // The page id, and anything that came after a '?' on the same hash. One
      // page needs the query: the Calendar Sync setup page is where the
      // sign-in hands the connection back (see takeCalendarToken below), and
      // 'calendar/setup?xpiToken=…' has to be read as the page 'calendar/setup'
      // rather than as a page that does not exist.
      function hashParts() {
        var h = (location.hash || '').replace(/^#\\/?/, '');
        var q = h.indexOf('?');
        return q === -1
          ? { id: h, query: '' }
          : { id: h.slice(0, q), query: h.slice(q + 1) };
      }

      function currentId() {
        var h = hashParts().id;
        return PAGES.some(function (p) { return p.id === h; }) ? h : defaultPage;
      }

      function render() {
        var id = currentId();
        document.querySelectorAll('.doc-page').forEach(function (el) {
          el.hidden = el.id !== 'page-' + id;
        });
        document.querySelectorAll('.nav-item').forEach(function (el) {
          el.classList.toggle('active', el.dataset.page === id);
        });
        var page = PAGES.filter(function (p) { return p.id === id; })[0];
        if (page) document.title = page.label + ' · ' + page.group + ' · WrikeXPI';
        window.scrollTo({ top: 0, behavior: 'auto' });
        closeSidebar();
        closeSearch();
      }

      // prev/next
      function setFoot() {
        var id = currentId();
        var idx = PAGES.map(function (p) { return p.id; }).indexOf(id);
        var prev = idx > 0 ? PAGES[idx - 1] : null;
        var next = idx < PAGES.length - 1 ? PAGES[idx + 1] : null;
        // injected via content pages
        var foot = document.createElement('div');
        foot.className = 'doc-foot';
        foot.innerHTML =
          (prev ? '<a class="f-prev" href="#/' + prev.id + '"><span class="f-label">Previous</span><span class="f-title">' + prev.label + '</span></a>' : '<span></span>') +
          (next ? '<a class="f-next" href="#/' + next.id + '"><span class="f-label">Next</span><span class="f-title">' + next.label + '</span></a>' : '');
        var existing = content.querySelector('.doc-foot');
        if (existing) existing.remove();
        var pageEl = document.getElementById('page-' + id);
        if (pageEl) pageEl.appendChild(foot);
      }

      // copy buttons (event delegation)
      document.addEventListener('click', function (e) {
        var btn = e.target.closest('.copy-btn');
        if (!btn) return;
        var text = btn.getAttribute('data-copy') || '';
        if (navigator.clipboard && text) {
          navigator.clipboard.writeText(text).then(function () { flash(btn); });
        } else {
          flash(btn);
        }
      });

      function flash(btn) {
        btn.classList.add('copied');
        var t = btn.querySelector('.copy-txt');
        var prev = t ? t.textContent : '';
        if (t) t.textContent = 'Copied';
        setTimeout(function () {
          btn.classList.remove('copied');
          if (t) t.textContent = prev;
        }, 1500);
      }

      // mode toggle (MCP setup)
      document.addEventListener('click', function (e) {
        var mb = e.target.closest('.mode-btn');
        if (!mb) return;
        document.querySelectorAll('.mode-btn').forEach(function (b) { b.classList.toggle('active', b === mb); });
        var mode = mb.getAttribute('data-mode');
        document.querySelectorAll('.mode-panel').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-panel') === mode); });
        renderConnCommands();
      });

      // env select
      document.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'docs-env') {
          var opt = e.target.options[e.target.selectedIndex];
          var code = document.querySelector('[data-panel="specific"] .url-code');
          var copy = document.querySelector('[data-panel="specific"] .copy-btn.solid');
          var url = opt.getAttribute('data-url') || '';
          if (code) code.textContent = url;
          if (copy) copy.setAttribute('data-copy', url);
          renderConnCommands();
        }
      });

      // AI client tabs (MCP setup)
      document.addEventListener('click', function (e) {
        var tab = e.target.closest('.client-tab');
        if (!tab) return;
        document.querySelectorAll('.client-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
        var c = tab.getAttribute('data-client');
        document.querySelectorAll('.client-panel').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-client') === c); });
      });

      // V1 (code-level) / V2 (plain-language) view switch — scoped to its own
      // .view-switch so multiple switches on one page toggle independently.
      document.addEventListener('click', function (e) {
        var vb = e.target.closest('.view-btn');
        if (!vb) return;
        var scope = vb.closest('.view-switch');
        if (!scope) return;
        scope.querySelectorAll('.view-btn').forEach(function (b) { b.classList.toggle('active', b === vb); });
        var view = vb.getAttribute('data-view');
        scope.querySelectorAll('.view-panel').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-view') === view); });
      });

      // live connection URL → commands
      function currentMcpUrl() {
        var anyPanel = document.querySelector('.mode-panel[data-panel="any"]');
        var anyActive = anyPanel && anyPanel.classList.contains('active');
        if (anyActive) return MCP_ANY_URL;
        var sel = document.getElementById('docs-env');
        if (sel) {
          var opt = sel.options[sel.selectedIndex];
          if (opt && opt.getAttribute('data-url')) return opt.getAttribute('data-url');
        }
        return MCP_ANY_URL;
      }
      function renderConnCommands() {
        var url = currentMcpUrl();
        document.querySelectorAll('[data-cmd]').forEach(function (el) {
          var tpl = el.getAttribute('data-cmd') || '';
          var text = tpl.split('__MCP_URL__').join(url);
          el.textContent = text;
          var fig = el.closest('.code');
          if (fig) {
            var btn = fig.querySelector('.copy-btn');
            if (btn) btn.setAttribute('data-copy', text);
          }
        });
      }

      // Calendar Sync: the sign-in link follows the environment picker, and
      // the connection the sign-in produced is put into the address block.
      // Both live on the setup page, so both are no-ops everywhere else.
      function renderCalendarSignIn() {
        var sel = document.getElementById('docs-cal-env');
        var btn = document.getElementById('cal-generate');
        if (!sel || !btn) return;
        var opt = sel.options[sel.selectedIndex];
        var id = opt ? opt.value : '';
        if (!id) {
          btn.removeAttribute('href');
          btn.setAttribute('aria-disabled', 'true');
          return;
        }
        btn.removeAttribute('aria-disabled');
        btn.setAttribute('href', CAL_SIGNIN + encodeURIComponent(id));
      }

      // The connection is kept in memory for as long as this page is open, and
      // nowhere else: not in the address, not in storage. That way it is still
      // there if the person reads another page and comes back, and gone the
      // moment they close the tab.
      var calToken = null;

      function showCalendarFeed(token) {
        var box = document.getElementById('cal-feed');
        var copy = document.getElementById('cal-feed-copy');
        var done = document.getElementById('cal-connected');
        if (!box || !token) return;
        var full = CAL_FEED + '?xpiToken=' + token;
        box.textContent = full;
        if (copy) copy.setAttribute('data-copy', full);
        if (done) done.hidden = false;
      }

      // The sign-in sends the connection back in the fragment, which the
      // server never sees. Read it, put it in the address block, then rewrite
      // this page's own address so the connection is not left sitting in the
      // address bar, in history, or in a copy of the link.
      function takeCalendarToken() {
        var parts = hashParts();
        if (!parts.query) return;
        var token = new URLSearchParams(parts.query).get('xpiToken');
        if (!token) return;
        calToken = token;
        showCalendarFeed(token);
        try {
          history.replaceState(null, '', '#/' + parts.id);
        } catch (e) {
          /* Older browsers: the connection is still shown, the address simply
             keeps it. */
        }
      }

      document.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'docs-cal-env') renderCalendarSignIn();
      });

      // What the button says when it is not busy. Kept from the page's own
      // markup, so the label is written in one place.
      var calLabel = '';

      function setCalendarBusy(busy) {
        var btn = document.getElementById('cal-generate');
        if (!btn) return;
        if (busy) {
          if (!calLabel) calLabel = btn.innerHTML;
          btn.setAttribute('aria-busy', 'true');
          btn.innerHTML =
            '<span class="cal-spin" aria-hidden="true"></span>Taking you to Wrike…';
        } else {
          btn.removeAttribute('aria-busy');
          if (calLabel) btn.innerHTML = calLabel;
        }
      }

      // The click is the last thing that happens on this page: the next thing
      // the person sees is Wrike's sign-in. Until that arrives the button has to
      // look like it is working and turn away a second press.
      document.addEventListener('click', function (e) {
        var btn = e.target.closest('#cal-generate');
        if (!btn) return;
        if (!(btn.getAttribute('href') || '')) {
          e.preventDefault();
          return;
        }
        setCalendarBusy(true);
      });

      // Coming back with the browser's Back button restores this page from its
      // cache, DOM and all, so the button would still be mid-spin. Reset it
      // whenever the page is shown again.
      window.addEventListener('pageshow', function () { setCalendarBusy(false); });

      // search
      function normalize(s) { return (s || '').toLowerCase(); }
      function indexText(p) { return normalize(p.group + ' ' + p.label + ' ' + p.keywords); }
      var selected = 0, resultIds = [];

      function runSearch(q) {
        q = normalize(q).trim();
        if (!q) { closeSearch(); return; }
        var matches = [];
        PAGES.forEach(function (p) {
          var hay = indexText(p);
          var score = 0;
          var terms = q.split(/\\s+/);
          terms.forEach(function (t) {
            if (hay.indexOf(t) !== -1) score += t.length;
          });
          if (terms.every(function (t) { return hay.indexOf(t) !== -1; })) matches.push({ p: p, score: score });
        });
        matches.sort(function (a, b) { return b.score - a.score; });
        resultIds = matches.slice(0, 8).map(function (m) { return m.p; });
        selected = 0;
        if (!resultIds.length) {
          searchResults.innerHTML = '<div class="empty">No results for “' + q + '”</div>';
          searchResults.classList.add('open');
          return;
        }
        searchResults.innerHTML = resultIds.map(function (p, i) {
          return '<a href="#/' + p.id + '" data-idx="' + i + '" ' + (i === 0 ? 'class="sel"' : '') + '>' +
            '<span class="s-group">' + p.group + '</span>' +
            '<span class="s-title">' + p.label + '</span></a>';
        }).join('');
        searchResults.classList.add('open');
      }

      function closeSearch() { searchResults.classList.remove('open'); }
      function openSidebar() { sidebar.classList.add('open'); scrim.classList.add('open'); }
      function closeSidebar() { sidebar.classList.remove('open'); scrim.classList.remove('open'); }

      searchInput.addEventListener('input', function () { runSearch(searchInput.value); });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeSearch(); searchInput.blur(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
        if (e.key === 'Enter' && resultIds[selected]) { location.hash = '#/' + resultIds[selected].id; closeSearch(); }
      });
      function moveSel(d) {
        if (!resultIds.length) return;
        selected = (selected + d + resultIds.length) % resultIds.length;
        searchResults.querySelectorAll('a').forEach(function (a, i) { a.classList.toggle('sel', i === selected); });
      }
      searchResults.addEventListener('click', function () { closeSearch(); });

      document.addEventListener('keydown', function (e) {
        if (e.key === '/' && document.activeElement !== searchInput) {
          e.preventDefault(); searchInput.focus();
        }
      });
      menuBtn.addEventListener('click', openSidebar);
      scrim.addEventListener('click', closeSidebar);

      window.addEventListener('hashchange', function () {
        render();
        setFoot();
        takeCalendarToken();
        if (calToken) showCalendarFeed(calToken);
      });
      render();
      setFoot();
      renderConnCommands();
      renderCalendarSignIn();
      takeCalendarToken();
    })();
  </script>
</body>
</html>`;

    return html;
  };

  fastify.get("/docs/mcp", async (req, reply) => {
    reply.type("text/html").send(renderDocs("mcp"));
  });
  fastify.get("/docs/api", async (req, reply) => {
    reply.type("text/html").send(renderDocs("api"));
  });
  fastify.get("/docs/calendar", async (req, reply) => {
    reply.type("text/html").send(renderDocs("calendar"));
  });

  /**
   * Start a Calendar Sync sign-in for one environment.
   *
   * This is what the button on the setup page points at, and its whole job is
   * to answer with a redirect to Wrike. Doing it here rather than sending the
   * person through the login page means the environment they already chose on
   * the page is the one carried into the sign-in, with no second place to
   * choose it and no page of ours in between.
   *
   * Two things are deliberately fixed rather than taken from the caller:
   * the purpose (so this route can only ever start a Calendar Sync sign-in,
   * never an ordinary one) and where the sign-in returns to. The environment
   * is checked against the list the page is allowed to show, so the route
   * cannot start a sign-in for an environment no visitor was offered.
   */
  fastify.get("/docs/calendar/connect", async (req, reply) => {
    const environmentId = String(req.query.environmentId ?? "");

    const visible = getCachedVisibleWrikeCredentials() || {};
    const offered = Object.values(visible).some(
      (env) => String(env?.id ?? "") === environmentId,
    );

    if (!offered || !environmentId) {
      return reply.redirect("/docs/calendar#/calendar/setup");
    }

    try {
      const { redirectUrl } = findRedirectionURL(
        {
          environmentId,
          purpose: "calendar_sync",
          returnTo: "calendar-docs",
        },
        fastify,
      );
      return reply.redirect(redirectUrl);
    } catch (err) {
      // A deployment missing its Wrike settings cannot start this sign-in.
      // The person is sent back to the page they came from rather than left
      // on an error, and the reason is in the log and in the activity log for
      // whoever can fix it.
      req.log.error(
        { err, environmentId },
        "Calendar Sync sign-in could not be started",
      );
      return reply.redirect("/docs/calendar#/calendar/setup");
    }
  });
  fastify.get("/docs", async (req, reply) => {
    reply.redirect("/docs/mcp");
  });
};
