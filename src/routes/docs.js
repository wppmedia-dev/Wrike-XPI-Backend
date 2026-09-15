"use strict";

const {
  getCachedVisibleWrikeCredentials,
} = require("../utils/wrikeCredentials");

/**
 * WrikeXPI documentation pages.
 *
 * MCP docs and the XPI REST API docs each live on their own page
 * (/docs/mcp and /docs/api), sharing a compact header + left side menu +
 * content body layout. The top-right nav links jump between the two.
 *
 * Client-side hash routing within each page, full-text search, and
 * copy-to-clipboard on code blocks. No page reloads.
 *
 * GET /docs/mcp
 * GET /docs/api
 * GET /docs  → redirects to /docs/mcp
 */
module.exports = async function (fastify, opts) {
  // Render a single documentation set (mcp | api) as its own page.
  const renderDocs = (groupId) => {
    const isApi = groupId === "api";
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const apiUrl = process.env.API_URL || `${appUrl}/api/v1`;
    const baseMcpUrl = `${appUrl}/api/v1/wrikexpi/mcp`;

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
          <p class="pg-p">The endpoint operates within the scopes granted to the WrikeXPI application. Contact your administrator to review scopes for your workspace.</p>`,
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
              `// src/mcp/index.js:53-90
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
                ["Connect", "Opens <code>StreamableHTTPClientTransport</code> to <code>process.env.WRIKE_MCP_URL</code>, authenticated with the same Wrike OAuth token already decrypted for REST calls.", "<code>wrikeMcpProxy.js:29-51</code>"],
                ["Discover", "<code>client.listTools()</code> fetches Wrike's tool catalog. Cached in Redis for 300s.", "<code>wrikeMcpProxy.js:122-148</code>"],
                ["Register", "Every returned tool is re-registered on our server, renamed <code>wrike_&lt;name&gt;</code>.", "<code>wrikeMcpProxy.js:189-209</code>"],
                ["Forward", "A call to any <code>wrike_*</code> tool opens a fresh connection and runs <code>client.callTool(...)</code>, relaying the result back.", "<code>wrikeMcpProxy.js:155-176</code>"],
                ["Fail safe", "Any error is caught and returns <code>[]</code> — native tools are unaffected.", "<code>wrikeMcpProxy.js:140-147</code>"],
              ],
            )}
            ${callout("info", "The address is Wrike's, not ours", "<code>WRIKE_MCP_URL=https://mcp.wrike.com/v2</code> (<code>.env</code>) is Wrike's own published MCP service.")}
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
            <p class="pg-p">One constant, <code>MCP_INSTRUCTIONS</code>, defined in <code>src/mcp/index.js:18-40</code>, passed as the SDK's <code>instructions</code> field at handshake time.</p>
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

            <h3 class="pg-h3">Full tool roster</h3>
            ${table(
              ["XPI tool", "Wrike counterpart", "Reasoning"],
              [
                ["<code>datahub_list_fields</code>", "<i>none</i>", "The short-code field dictionary every other XPI tool depends on."],
                ["<code>campaign_create</code>", "<code>wrike_create_project_folder_item</code>", "Goes through the request-form workflow XPI campaigns require."],
                ["<code>*_update</code> (campaign/channel/task)", "<code>wrike_update_items</code>", "Applies field validation; the raw tool writes unvalidated custom-field IDs."],
                ["<code>*_delete</code> (campaign/channel/task)", "<i>none</i>", "\"This is the ONLY delete operation exposed — Wrike's MCP tools do not provide a delete.\""],
                ["<code>task_get</code> / <code>task_list_*</code>", "<code>wrike_get_item_details</code>, <code>wrike_get_items_children</code>", "Validates XPI task type and translates fields to short codes."],
                ["<code>ids_convert</code>", "<i>none</i>", "Converts legacy API v2 IDs — pure XPI plumbing."],
                ["<i>none</i>", "<code>wrike_get_approvals</code>, <code>wrike_*_comment</code>, <code>wrike_get_my_inbox</code>, <code>wrike_search_users</code>, <code>wrike_search_spaces</code>, attachments", "Ground XPI never modeled — comments, approvals, users, spaces."],
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

            <h3 class="pg-h3">What each tool does</h3>
            ${table(
              ["What it's for", "Type", "In plain words"],
              [
                ["Look up field names", "Our tool", "Gives the assistant the dictionary of field names our campaigns/tasks use."],
                ["Create / update / delete a campaign, channel, or task", "Our tool", "Applies our validation and friendly names. Deleting has no Wrike equivalent at all."],
                ["View a task, or list tasks", "Our tool", "Confirms the item is really one of ours and shows friendly field names."],
                ["Convert an old ID", "Our tool", "Translates outdated links — nothing on Wrike's side does this."],
                ["Search any Wrike item, approvals, comments, inbox, people, spaces, attachments", "Wrike's tool", "General Wrike actions we never built our own version of."],
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
          <p class="pg-lede">Four places, ranked lightest-touch to most involved. "Ask for confirmation before deleting something" is used below as the running example.</p>

          ${viewSwitch(
            `
            ${table(
              ["#", "Extension point", "Where"],
              [
                ["1", "Per-tool description text", "<code>src/mcp/tools/*.js</code> — edit the <code>description</code> string inside a <code>server.registerTool(...)</code> call."],
                ["2", "Server-level instructions", "<code>src/mcp/index.js:18-40</code> — edit <code>MCP_INSTRUCTIONS</code>. Applies to every tool at once."],
                ["3", "Tool annotations", "<code>annotations: { destructiveHint: true, ... }</code> — advisory metadata some MCP clients render their own warning UI from. Not enforced server-side."],
                ["4", "Elicitation", "<code>server.elicitInput({ mode: 'form', ... })</code> — a real, enforced confirmation prompt. Not used anywhere in this codebase today; requires the connecting client to support it."],
              ],
            )}
            <h3 class="pg-h3">Worked example — confirm before <code>task_delete</code></h3>
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
            ${callout("warn", "Caveat", "Elicitation is a capability the connecting client must declare support for — this server cannot force it. Pair it with the destructiveHint annotation (already set) as a fallback.")}
            `,
            `
            <div class="flow">
              <div class="flow-step"><span class="flow-n">1</span><strong>Smallest change</strong><p>Add a sentence to one tool's note — e.g. "double-check the name before deleting." Affects only that action.</p></div>
              <div class="flow-step"><span class="flow-n">2</span><strong>Small change</strong><p>Add a rule to the general rulebook — e.g. "always confirm before deleting anything." Applies everywhere.</p></div>
              <div class="flow-step"><span class="flow-n">3</span><strong>Small change</strong><p>Every delete already carries a "this is risky" flag. Some assistants show their own warning automatically from it.</p></div>
              <div class="flow-step"><span class="flow-n">4</span><strong>A real, built-in step</strong><p>Genuinely pauses the action and asks the assistant to show a real "are you sure?" prompt — not just a note. Detailed below.</p></div>
            </div>

            <h3 class="pg-h3">How option 4 actually works</h3>
            <p class="pg-p">This app's underlying system supports pausing a delete action and asking the connected assistant to show the person a real confirmation prompt before continuing.</p>
            <p class="pg-p"><b>Lightest version (already true today):</b> delete actions already carry a sensitive-action flag. Any assistant that respects it already shows its own confirmation — no work needed, though it's a request, not a guarantee.</p>
            <p class="pg-p"><b>Fully enforced version:</b> before anything is deleted, the assistant is made to show the person a real yes/no prompt naming exactly what will be deleted. Only "yes" continues; anything else cancels and nothing happens.</p>
            ${callout("warn", "One honest limit", "The fully-enforced version only works if the connecting assistant knows how to display that kind of prompt. Most modern assistants do, but it isn't guaranteed for every one — which is why pairing it with the lighter “flag” approach is worth doing too.")}
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
          "auth authentication oauth bearer token access token sign in login authorize",
        html: `
          <div class="pg-eyebrow">XPI API Docs</div>
          <h1 class="pg-title">Authentication</h1>
          <p class="pg-lede">All endpoints require an OAuth 2.0 access token sent as a bearer token.</p>

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

          <h2 class="pg-h2">Getting a token</h2>
          <ol class="ordered">
            <li>Open the login page and choose an environment.</li>
            <li>Sign in with Wrike — you'll be redirected back with an authorization code.</li>
            <li>Exchange the code at <code>GET /wrikexpi/token/exchange</code> (or use the MCP OAuth flow at <code>/oauth</code>).</li>
          </ol>

          <h2 class="pg-h2">Token endpoints</h2>
          ${endpoint("GET", "/wrikexpi/token/exchange", "Exchange an authorization code for an access token.")}
          ${endpoint("GET", "/wrikexpi/token/callback", "OAuth callback that finalizes the token handshake.")}
          ${endpoint("POST", "/wrikexpi/token/profile", "Return profile data for a supplied token.")}

          <h2 class="pg-h2">OAuth metadata</h2>
          <p class="pg-p">Discovery metadata is published at the host root per <b>RFC 8414 / 9728</b>:</p>
          <ul class="bullets">
            <li><code>/.well-known/oauth-authorization-server</code></li>
            <li><code>/.well-known/oauth-protected-resource</code></li>
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
          "errors error error-codes 400 401 403 500 response envelope status code",
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
  "details": null
}`,
          )}

          <h2 class="pg-h2">Common status codes</h2>
          ${table(
            ["Code", "Meaning"],
            [
              ["<code>200</code>", "Success."],
              [
                "<code>400</code>",
                "Invalid request — bad filter, missing field, or unsupported operator.",
              ],
              ["<code>401</code>", "Missing or invalid bearer token."],
              ["<code>403</code>", "Not authorized to access the service."],
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

    const pages = isApi ? apiPages : mcpPages;
    const defaultPage = isApi ? "api/overview" : "mcp/overview";

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

    /* CTA */
    .cta-row { display: flex; flex-wrap: wrap; gap: 12px; margin: 30px 0 6px; }
    .btn { display: inline-flex; align-items: center; gap: 9px; padding: 12px 20px; border-radius: 11px; font-weight: 600; font-size: 0.9rem; text-decoration: none; transition: all .16s ease; }
    .btn.primary { background: var(--accent); color: var(--on-accent); box-shadow: 0 6px 18px rgba(34,197,94,0.25); }
    .btn.primary:hover { background: #16a34a; transform: translateY(-2px); }
    .btn.ghost { border: 1px solid var(--border-strong); color: var(--fg-dim); }
    .btn.ghost:hover { color: var(--fg); border-color: var(--border-strong); transform: translateY(-2px); }

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
  </style>
</head>
<body>
  <div class="scrim" id="scrim"></div>

  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="${isApi ? "/docs/api" : "/docs/mcp"}" aria-label="WrikeXPI home">
        <span class="brand-mark">W</span>
        <span class="brand-name">WrikeXPI</span>
        <span class="brand-tag">Docs</span>
      </a>
      <div class="searchbox topbar-search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="docsearch" type="search" placeholder="Search ${isApi ? "API" : "MCP"} docs…" autocomplete="off" aria-label="Search documentation" />
        <span class="search-kbd">/</span>
        <div class="search-results" id="search-results" role="listbox"></div>
      </div>
      <nav class="topnav" aria-label="Documentation">
        <a href="/docs/mcp" data-top="mcp" class="${isApi ? "" : "active"}">MCP Docs</a>
        <a href="/docs/api" data-top="api" class="${isApi ? "active" : ""}">API Docs</a>
        <button class="menu-btn" id="menu-btn" aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </nav>
    </div>
  </header>

  <section class="docs-head">
    <div>
      <div class="hero-eyebrow">WrikeXPI · ${isApi ? "XPI API" : "MCP"} Docs</div>
      <h1>${isApi ? "REST API reference" : "Connect your AI assistant"}</h1>
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
        <a class="btn primary" href="${isApi ? "#/api/errors" : "#/mcp/setup"}">${isApi ? "Error reference" : "Get connected"}</a>
      </div>
    </main>
  </div>

  <footer class="page-foot">
    <span>WrikeXPI Developer Documentation</span>
    <span>REST API · MCP · OAuth</span>
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
      var content = document.getElementById('content');
      var sidebar = document.getElementById('sidebar');
      var scrim = document.getElementById('scrim');
      var searchInput = document.getElementById('docsearch');
      var searchResults = document.getElementById('search-results');
      var menuBtn = document.getElementById('menu-btn');

      function currentId() {
        var h = (location.hash || '').replace(/^#\\/?/, '');
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

      window.addEventListener('hashchange', function () { render(); setFoot(); });
      render();
      setFoot();
      renderConnCommands();
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
  fastify.get("/docs", async (req, reply) => {
    reply.redirect("/docs/mcp");
  });
};
