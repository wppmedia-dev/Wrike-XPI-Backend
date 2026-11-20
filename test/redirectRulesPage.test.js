/* Exercises the redirect list's server-side search and paging
   (RedirectRules.ListRulesPage in src/controllers/redirectRules.js) against a
   stand-in for the model, so what is checked is the query it builds: the
   filters it applies, the clamps, and the LIKE escaping.
   Run from the repo root:  node test/redirectRulesPage.test.js
   No database, Redis or Wrike account required. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
const assert = require("assert");
const path = require("path");
const { Op } = require("sequelize");

let passed = 0;
const ok = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`  ok    ${name}`);
};

/* A table of 25 entries, and a model that evaluates just enough of the query
   (env, enabled flag, substring on value/label, limit/offset) to be asked real
   questions. It records the last findAll so the query itself can be inspected. */
const ROWS = Array.from({ length: 25 }, (_, i) => ({
  id: `id-${String(i).padStart(2, "0")}`,
  env_id: "env-1",
  value: `https://app${String(i).padStart(2, "0")}.example.com`,
  label: i % 5 === 0 ? "Intranet 100%" : null,
  is_enabled: i % 2 === 0,
}));

let lastFind = null;

const matches = (where, row) => {
  if (where.env_id && row.env_id !== where.env_id) return false;
  if (where.is_enabled !== undefined && row.is_enabled !== where.is_enabled) {
    return false;
  }
  if (where[Op.or]) {
    const pattern = where[Op.or][0].value[Op.iLike];
    // Undo the %…% wrapper and the LIKE escapes: a real LIKE would.
    const needle = pattern
      .slice(1, -1)
      .replace(/\\([\\%_])/g, "$1")
      .toLowerCase();
    return [row.value, row.label].some((f) =>
      String(f ?? "").toLowerCase().includes(needle),
    );
  }
  return true;
};

const modelPath = require.resolve(path.join(__dirname, "../models"));
require.cache[modelPath] = {
  id: modelPath,
  filename: modelPath,
  loaded: true,
  exports: {
    EnvironmentRedirectRules: {
      count: async ({ where }) => ROWS.filter((r) => matches(where, r)).length,
      findAll: async (query) => {
        lastFind = query;
        return ROWS.filter((r) => matches(query.where, r))
          .sort((a, b) => a.value.localeCompare(b.value))
          .slice(query.offset, query.offset + query.limit)
          .map((r) => ({ get: () => r }));
      },
    },
  },
};
const cachePath = require.resolve("../src/utils/environmentAccessCache");
require.cache[cachePath] = {
  id: cachePath,
  filename: cachePath,
  loaded: true,
  exports: { invalidateRedirectRules: async () => {} },
};

const { ListRulesPage } = require("../src/controllers/redirectRules");

(async () => {
  console.log("redirect list paging");

  await ok("defaults to the first page of 10", async () => {
    const page = await ListRulesPage("env-1");
    assert.strictEqual(page.rows.length, 10);
    assert.strictEqual(page.total, 25);
    assert.strictEqual(page.total_pages, 3);
    assert.strictEqual(page.page, 1);
    assert.strictEqual(lastFind.limit, 10);
    assert.strictEqual(lastFind.offset, 0);
  });

  await ok("the last page holds the remainder", async () => {
    const page = await ListRulesPage("env-1", { page: 3 });
    assert.strictEqual(page.rows.length, 5);
    assert.strictEqual(page.page, 3);
  });

  await ok("a page past the end is moved back to the last page", async () => {
    const page = await ListRulesPage("env-1", { page: 99 });
    assert.strictEqual(page.page, 3);
    assert.strictEqual(page.rows.length, 5);
  });

  await ok("page and page size are clamped, not trusted", async () => {
    const page = await ListRulesPage("env-1", { page: -4, pageSize: 100000 });
    assert.strictEqual(page.page, 1);
    assert.strictEqual(page.page_size, 100);
    assert.strictEqual(lastFind.limit, 100);
    const junk = await ListRulesPage("env-1", { page: "x", pageSize: "y" });
    assert.strictEqual(junk.page_size, 10);
  });

  await ok("search narrows the TOTAL, not just the visible page", async () => {
    const page = await ListRulesPage("env-1", { search: "app07" });
    assert.strictEqual(page.total, 1);
    assert.strictEqual(page.rows[0].value, "https://app07.example.com");
    assert.strictEqual(page.counts.total, 25, "counts stay whole-list");
  });

  await ok("search also reads the label, case-insensitively", async () => {
    const page = await ListRulesPage("env-1", { search: "INTRANET" });
    assert.strictEqual(page.total, 5);
  });

  await ok("% and _ in a search are characters, not wildcards", async () => {
    const percent = await ListRulesPage("env-1", { search: "100%" });
    assert.strictEqual(percent.total, 5);
    const lone = await ListRulesPage("env-1", { search: "%" });
    assert.strictEqual(lone.total, 5, "'%' alone matches only labels that contain it");
    const underscore = await ListRulesPage("env-1", { search: "_" });
    assert.strictEqual(underscore.total, 0);
  });

  await ok("the status filter is applied in the query", async () => {
    const on = await ListRulesPage("env-1", { status: "enabled" });
    assert.strictEqual(on.total, 13);
    const off = await ListRulesPage("env-1", { status: "disabled" });
    assert.strictEqual(off.total, 12);
    assert.strictEqual(on.counts.enabled, 13);
  });

  await ok("an unknown status is treated as all", async () => {
    assert.strictEqual((await ListRulesPage("env-1", { status: "x" })).total, 25);
  });

  await ok("search and filter combine", async () => {
    const page = await ListRulesPage("env-1", { search: "app0", status: "enabled" });
    assert.strictEqual(page.total, 5);
  });

  await ok("no match is an empty first page, not an error", async () => {
    const page = await ListRulesPage("env-1", { search: "zzz" });
    assert.strictEqual(page.total, 0);
    assert.strictEqual(page.page, 1);
    assert.strictEqual(page.total_pages, 1);
    assert.deepStrictEqual(page.rows, []);
  });

  await ok("an environment is required", async () => {
    await assert.rejects(ListRulesPage(""), (e) => e.statusCode === 400);
  });

  await ok("another environment's rows never appear", async () => {
    assert.strictEqual((await ListRulesPage("env-2")).total, 0);
  });

  console.log(`\n${passed} passed, 0 failed`);
})().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
