/* Page headers live in the top bar, not in the page body.
 *
 * Every console page used to open with its own title, description and buttons,
 * under a top bar that already showed the title and the refresh button. They now
 * go through <PageHeader />, which puts them in the top bar
 * (frontend/src/components/ui/PageHeader.tsx). This checks that stays true:
 *
 *   - no page draws a section-header of its own any more
 *   - every shell's top bar has the slots the headers fill, and provides them
 *   - every <PageHeader page="…"> names a page that exists in a shell, so a
 *     typo cannot leave a page with no header at all
 *   - a header's buttons keep a .btn-text label, which is what lets them shrink
 *     to icons on a phone
 *
 * Reads the source files only; needs no dependencies, database or build.
 * Run from the repo root:  node test/pageHeaders.test.js */

const fs = require("fs");
const path = require("path");

let pass = 0;
let fail = 0;

const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    console.log(
      `  FAIL  ${label}\n          got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  }
};

const section = (title) => console.log(`\n${title}`);

const src = path.join(__dirname, "..", "frontend", "src");
const read = (rel) => fs.readFileSync(path.join(src, rel), "utf8").replace(/\r\n/g, "\n");

const SHELLS = ["pages/AdminDashboard.tsx", "pages/PortalHome.tsx", "pages/PortalDashboard.tsx"];
const PAGES = [
  ...SHELLS,
  "pages/ActivityLog.tsx",
  "pages/PortalActivityPage.tsx",
  "pages/PortalApiTokensPage.tsx",
  "pages/PortalCachePage.tsx",
];

section("no page draws its own header");
{
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(src, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx$/.test(entry.name) && rel !== "components/ui/PageHeader.tsx") {
        if (read(rel).includes('className="section-header"')) offenders.push(rel);
      }
    }
  };
  walk("pages");
  walk("components");
  check("nothing but PageHeader's own fallback uses section-header", offenders, []);
}

section("each shell's top bar has the slots, and provides them");
for (const shell of SHELLS) {
  const text = read(shell);
  const name = path.basename(shell, ".tsx");
  check(`${name}: title-extra slot`, /className="topbar-title-extra" ref=\{topbar\.refs\.titleExtra\}/.test(text), true);
  check(`${name}: description slot`, /className="topbar-desc" ref=\{topbar\.refs\.description\}/.test(text), true);
  check(`${name}: actions slot`, /className="topbar-actions" ref=\{topbar\.refs\.actions\}/.test(text), true);
  check(`${name}: hook called with the active page`, /const topbar = useTopbar\(activePage\);/.test(text), true);
  check(`${name}: slots provided to the page`, /<TopbarProvider value=\{topbar\.value\}>/.test(text) && /<\/TopbarProvider>/.test(text), true);
  check(`${name}: the refresh button is still there`, /title="Refresh data"/.test(text), true);
}

section("every header names a real page");
{
  const shellPages = new Set();
  for (const shell of SHELLS) {
    for (const m of read(shell).matchAll(/id="page-([a-z-]+)"/g)) shellPages.add(m[1]);
  }

  const used = [];
  for (const file of PAGES) {
    for (const m of read(file).matchAll(/<PageHeader\s+page="([a-z-]+)"/g)) used.push({ file, page: m[1] });
  }

  check("there are headers to check", used.length >= 15, true);
  check(
    "each one matches a page container in some shell",
    used.filter((u) => !shellPages.has(u.page)).map((u) => `${path.basename(u.file)}:${u.page}`),
    [],
  );
  check(
    "no shell has the same page header twice",
    SHELLS.every((shell) => {
      const ids = [...read(shell).matchAll(/<PageHeader\s+page="([a-z-]+)"/g)].map((m) => m[1]);
      return new Set(ids).size === ids.length;
    }),
    true,
  );
}

section("the pages that had a header still have one");
{
  const expect = {
    "pages/AdminDashboard.tsx": ["overview", "environments", "users", "sessions", "settings", "cache-settings", "sync", "oauth-clients"],
    "pages/PortalHome.tsx": ["overview", "environments", "sync", "oauth-clients"],
    "pages/PortalDashboard.tsx": ["overview", "environments"],
    "pages/ActivityLog.tsx": ["activity-log"],
    "pages/PortalActivityPage.tsx": ["activity"],
    "pages/PortalApiTokensPage.tsx": ["api-tokens"],
    "pages/PortalCachePage.tsx": ["cache"],
  };
  for (const [file, pages] of Object.entries(expect)) {
    const got = [...read(file).matchAll(/<PageHeader\s+page="([a-z-]+)"/g)].map((m) => m[1]);
    check(`${path.basename(file)}: ${pages.join(", ")}`, got, pages);
  }
}

section("buttons in a header keep a label that can drop away on a phone");
{
  const bad = [];
  for (const file of PAGES) {
    const text = read(file);
    // The actions={ … } of each header, up to the end of its PageHeader element.
    // Only real elements (`<PageHeader` then a `page=` line), not the same
    // text inside a comment.
    for (const m of text.matchAll(/<PageHeader\n\s+page="[a-z-]+"[\s\S]*?\n\s*\/>/g)) {
      const block = m[0];
      if (/<button/.test(block) && !/className="btn-text"/.test(block)) bad.push(path.basename(file));
    }
  }
  check("every header button has a .btn-text label", bad, []);
}

section("the stylesheet is shared, not per console");
{
  const css = read("components/ui/PageHeader.css");
  check("slots are styled once, against #topbar", ["#topbar .topbar-desc", "#topbar .topbar-actions", "#topbar .topbar-title-extra"].every((sel) => css.includes(sel)), true);
  check("the description gives way before the buttons do", /max-width: 1180px[\s\S]*?\.topbar-desc[\s\S]*?display: none/.test(css), true);
  check("labels drop on a phone", /max-width: 720px[\s\S]*?\.btn-text[\s\S]*?display: none/.test(css), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
