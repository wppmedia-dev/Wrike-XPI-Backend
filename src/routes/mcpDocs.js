"use strict";

const {
  getCachedVisibleWrikeCredentials,
} = require("../utils/wrikeCredentials");

/**
 * MCP connection page: plain-language explanation of what's happening,
 * plus an interactive environment picker (dropdown) that drives a single
 * copy-able connection URL (generic, or locked to one environment).
 *
 * GET /mcp-docs
 */
module.exports = async function (fastify, opts) {
  // MCP docs moved into the unified documentation hub (/docs). This route is
  // kept for backwards compatibility and deep-links to the MCP section.
  fastify.get("/mcp-docs", async (req, reply) => {
    return reply.redirect("/docs/mcp");
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const baseMcpUrl = `${appUrl}/api/v1/wrikexpi/mcp`;

    const visibleCreds = getCachedVisibleWrikeCredentials();
    const specificEnvironments = Object.entries(visibleCreds || {}).map(
      ([envName, envData]) => ({
        key: String(envData.id),
        label: envName,
        url: `${baseMcpUrl}/${envData.id}`,
      }),
    );

    const optionsHtml = specificEnvironments
      .map((env) => `<option value="${env.key}">${env.label}</option>`)
      .join("");

    const steps = [
      {
        title: "Copy your link",
        text: "Choose your environment below and copy the link. It's a private web address just for connecting your assistant to Wrike.",
        icon: `<path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93"></path><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19.07"></path>`,
      },
      {
        title: "Paste it into your assistant",
        text: "Open your AI assistant (like Claude) and add the link as a new connection or tool.",
        icon: `<path d="M12 2v4"></path><path d="m6.8 5.4 2.8 2.8"></path><path d="M2 12h4"></path><rect x="8" y="8" width="8" height="8" rx="2"></rect><path d="m17.2 5.4-2.8 2.8"></path><path d="M22 12h-4"></path><path d="m17.2 18.6-2.8-2.8"></path><path d="M12 18v4"></path><path d="m6.8 18.6 2.8-2.8"></path>`,
      },
      {
        title: "Sign in with Wrike",
        text: "A window pops up asking you to log in — the same way you'd sign into any website. Nothing to copy or remember.",
        icon: `<rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>`,
      },
      {
        title: "You're connected",
        text: "That's it. Your assistant can now securely work with your Wrike campaigns whenever you ask it to. What it can do depends on your token's module permissions — an administrator can restrict which of them are available to it.",
        icon: `<path d="M20 6 9 17l-5-5"></path>`,
      },
    ];

    const stepsHtml = steps
      .map(
        (s, i) => `
              <li class="step" style="--i:${i}">
                <span class="step-node">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
                </span>
                <div class="step-body">
                  <h3>${s.title}</h3>
                  <p>${s.text}</p>
                </div>
              </li>`,
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MCP Connection</title>
  <link rel="icon" href="https://cdn.wrike.com/static/branding/wrike/favicons/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #fafafa;
      --surface: #ffffff;
      --surface-2: #f2f2f0;
      --border: #e2e1dc;
      --text: #1a1a18;
      --text-dim: #6b6a63;
      --text-faint: #9b9a92;
      --primary: #4CAF50;
      --primary-hover: #429a46;
      --primary-bg: #edf7ee;
      --primary-border: #bfe3c2;
      --accent: var(--primary);
      --accent-bg: var(--primary-bg);
      --mono: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
      --sans: 'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif;
      --display: 'Space Grotesk', var(--sans);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html { scrollbar-width: thin; scrollbar-color: #d6d5cf transparent; }
    ::-webkit-scrollbar { width: 9px; height: 9px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #d6d5cf; border-radius: 6px; }
    ::-webkit-scrollbar-thumb:hover { background: #c2c1b9; }

    body {
      font-family: var(--sans);
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      padding: 48px 32px 80px;
    }

    .wrap { max-width: 900px; margin: 0 auto; }

    .top-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 56px;
    }
    .brand {
      display: flex; align-items: center; gap: 9px;
      font-family: var(--display);
      font-weight: 700; font-size: 0.95rem; letter-spacing: -0.01em;
    }
    .brand-mark {
      width: 22px; height: 22px; border-radius: 6px;
      background: var(--primary);
      display: flex; align-items: center; justify-content: center;
      font-family: var(--display); font-size: 0.72rem; font-weight: 700; color: #fff;
    }
    .top-nav a {
      color: var(--text-dim);
      text-decoration: none;
      font-size: 0.82rem;
      display: inline-flex; align-items: center; gap: 5px;
    }
    .top-nav a:hover { color: var(--text); }

    header.page-head { max-width: 60ch; margin-bottom: 56px; }
    h1 {
      font-family: var(--display);
      font-size: 2rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin-bottom: 12px;
    }
    .lede {
      font-size: 1rem;
      color: var(--text-dim);
      line-height: 1.65;
    }

    section { margin-bottom: 44px; }
    .eyebrow {
      font-family: var(--display);
      font-size: 0.74rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--text-faint);
      margin-bottom: 8px;
    }
    .section-title {
      font-family: var(--display);
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin-bottom: 20px;
    }

    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 32px;
    }

    /* Animated stepper */
    .steps {
      list-style: none;
      position: relative;
    }
    .steps::before {
      content: "";
      position: absolute;
      left: 19px;
      top: 8px;
      bottom: 8px;
      width: 2px;
      background: var(--border);
      transform-origin: top;
      transform: scaleY(0);
      animation: lineGrow 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.15s forwards;
    }
    @keyframes lineGrow {
      to { transform: scaleY(1); }
    }
    .step {
      position: relative;
      display: flex;
      gap: 18px;
      padding-bottom: 28px;
      opacity: 0;
      transform: translateY(10px);
      animation: stepIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      animation-delay: calc(0.25s + var(--i) * 0.16s);
    }
    .step:last-child { padding-bottom: 0; }
    @keyframes stepIn {
      to { opacity: 1; transform: translateY(0); }
    }
    .step-node {
      flex-shrink: 0;
      z-index: 1;
      width: 40px; height: 40px;
      border-radius: 50%;
      background: var(--surface);
      border: 2px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      color: var(--text-faint);
      transform: scale(0.6);
      animation: nodePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      animation-delay: calc(0.35s + var(--i) * 0.16s);
    }
    @keyframes nodePop {
      to { transform: scale(1); }
    }
    .step-node svg { width: 17px; height: 17px; }
    .step:nth-child(4) .step-node {
      color: var(--accent);
      border-color: var(--accent);
      background: var(--accent-bg);
    }
    .step-body { padding-top: 6px; }
    .step-body h3 {
      font-family: var(--display);
      font-size: 0.98rem;
      font-weight: 600;
      margin-bottom: 5px;
    }
    .step-body p {
      font-size: 0.88rem;
      color: var(--text-dim);
      line-height: 1.6;
      max-width: 52ch;
    }

    /* Connection mode toggle */
    .mode-toggle {
      display: inline-flex;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 3px;
      margin-bottom: 24px;
      gap: 2px;
    }
    .mode-btn {
      background: transparent;
      border: none;
      color: var(--text-dim);
      font-family: var(--sans);
      font-weight: 600;
      font-size: 0.83rem;
      padding: 8px 16px;
      border-radius: 7px;
      cursor: pointer;
      transition: background 0.14s ease, color 0.14s ease;
    }
    .mode-btn:hover { color: var(--text); }
    .mode-btn.active {
      background: var(--surface);
      color: var(--primary);
      box-shadow: 0 1px 2px rgba(20, 19, 24, 0.08);
    }

    .mode-panel { display: none; }
    .mode-panel.active { display: block; animation: modeIn 0.25s ease; }
    @keyframes modeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .mode-desc {
      font-size: 0.88rem;
      color: var(--text-dim);
      line-height: 1.6;
      margin-bottom: 16px;
      max-width: 52ch;
    }

    /* Environment picker */
    .field-label {
      font-family: var(--display);
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-faint);
      margin-bottom: 10px;
    }
    .select-wrap {
      position: relative;
      margin-bottom: 18px;
      max-width: 360px;
    }
    .select-wrap svg.chevron {
      position: absolute;
      right: 14px; top: 50%;
      transform: translateY(-50%);
      width: 15px; height: 15px;
      color: var(--text-faint);
      pointer-events: none;
    }
    select#env-select {
      appearance: none;
      -webkit-appearance: none;
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      font-family: var(--sans);
      font-size: 0.9rem;
      font-weight: 500;
      padding: 12px 40px 12px 14px;
      border-radius: 9px;
      cursor: pointer;
      transition: border-color 0.12s ease;
    }
    select#env-select:hover { border-color: #c7c6bf; }
    select#env-select:focus { outline: none; border-color: var(--accent); }

    .url-box {
      display: flex;
      align-items: stretch;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }
    .url-box code {
      flex: 1;
      display: flex;
      align-items: center;
      padding: 14px 16px;
      font-family: var(--mono);
      font-size: 0.85rem;
      color: var(--text);
      word-break: break-all;
      overflow-wrap: anywhere;
    }
    .copy-btn {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--primary);
      border: none;
      color: #fff;
      font-family: var(--sans);
      font-weight: 600;
      font-size: 0.8rem;
      padding: 0 18px;
      cursor: pointer;
      transition: background 0.12s ease;
    }
    .copy-btn:hover { background: var(--primary-hover); }
    .copy-btn.copied { background: #2e7d32; }
    .icon-copy, .icon-check { width: 13px; height: 13px; }
    .copy-btn.copied .icon-copy { display: none; }
    .copy-btn.copied .icon-check { display: inline-block !important; }

    .picker-note {
      margin-top: 12px;
      font-size: 0.8rem;
      color: var(--text-faint);
      line-height: 1.5;
    }

    @media (max-width: 720px) {
      body { padding: 40px 20px 60px; }
      .panel { padding: 22px; }
      h1 { font-size: 1.6rem; }
    }
    @media (max-width: 480px) {
      .copy-btn .copy-label { display: none; }
      .copy-btn { padding: 0 14px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top-nav">
      <div class="brand">
        <span class="brand-mark">W</span>
        <span>WrikeXPI</span>
      </div>
      <a href="${appUrl}/">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        Back
      </a>
    </div>

    <header class="page-head">
      <h1>Connect your AI assistant to Wrike XPI</h1>
      <p class="lede">
        Follow the steps below to link your assistant with Wrike. It only
        takes a minute, and there's nothing technical to set up.
      </p>
    </header>

    <section>
      <div class="eyebrow">Overview</div>
      <div class="section-title">How it works</div>
      <div class="panel">
        <ol class="steps">${stepsHtml}</ol>
      </div>
    </section>

    <section>
      <div class="eyebrow">Step 1</div>
      <div class="section-title">Get your connection link</div>
      <div class="panel">
        <div class="mode-toggle">
          <button class="mode-btn active" data-mode="any" onclick="selectMode('any')">All environments</button>
          <button class="mode-btn" data-mode="specific" onclick="selectMode('specific')">Specific environment</button>
        </div>

        <div class="mode-panel active" id="mode-any">
          <p class="mode-desc">Works with every environment — you'll choose one the first time you connect.</p>
          <div class="url-box">
            <code>${baseMcpUrl}</code>
            <button class="copy-btn" id="copy-any" onclick="copyBox('copy-any', '${baseMcpUrl}')">
              <svg class="icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" hidden><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span class="copy-label">Copy</span>
            </button>
          </div>
        </div>

        <div class="mode-panel" id="mode-specific">
          <p class="mode-desc">Always connects to one environment — no picker, no extra step.</p>
          <div class="field-label">Environment</div>
          <div class="select-wrap">
            <select id="env-select" onchange="selectEnv(this.value)">
              ${optionsHtml}
            </select>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
          <div class="url-box">
            <code id="url-display"></code>
            <button class="copy-btn" id="copy-specific" onclick="copySpecific()">
              <svg class="icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" hidden><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span class="copy-label">Copy</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>

  <script>
    const specificEnvironments = ${JSON.stringify(specificEnvironments)};
    let currentSpecific = specificEnvironments[0];

    function flashCopied(btn) {
      btn.classList.add("copied");
      const label = btn.querySelector(".copy-label");
      const prev = label ? label.textContent : "";
      if (label) label.textContent = "Copied";
      setTimeout(() => {
        btn.classList.remove("copied");
        if (label) label.textContent = prev;
      }, 1600);
    }

    function copyBox(btnId, text) {
      navigator.clipboard.writeText(text).then(() => flashCopied(document.getElementById(btnId)));
    }

    function copySpecific() {
      if (!currentSpecific) return;
      copyBox("copy-specific", currentSpecific.url);
    }

    function renderSpecific() {
      if (!currentSpecific) return;
      document.getElementById("url-display").textContent = currentSpecific.url;
    }

    function selectEnv(key) {
      currentSpecific = specificEnvironments.find((e) => e.key === key) || specificEnvironments[0];
      renderSpecific();
    }

    function selectMode(mode) {
      document.querySelectorAll(".mode-btn").forEach((el) => {
        el.classList.toggle("active", el.dataset.mode === mode);
      });
      document.getElementById("mode-any").classList.toggle("active", mode === "any");
      document.getElementById("mode-specific").classList.toggle("active", mode === "specific");
    }

    renderSpecific();
  </script>
</body>
</html>`;

    reply.type("text/html").send(html);
  });
};
