import fs from "fs";
import path from "path";

/**
 * The last manual sync of each source, kept in one small JSON file:
 * { "<source key>": { ...run } }. A new run overwrites the previous one for
 * that source, so there is no history to grow or purge. What a source is and
 * how it runs lives in src/utils/syncSources.js.
 */

const FILE = path.join(process.cwd(), "data", "sync-state.json");

// Writes are chained so two syncs finishing together cannot interleave a
// read-modify-write and drop one of the results.
let queue = Promise.resolve();

const readAll = async () => {
  try {
    return JSON.parse(await fs.promises.readFile(FILE, "utf8")) || {};
  } catch {
    // Missing or unreadable file: nothing has been synced yet.
    return {};
  }
};

/** Store `run` as the latest run for its source. */
export const Save = (run) => {
  const result = queue.then(async () => {
    const all = await readAll();
    all[run.source] = run;
    await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
    await fs.promises.writeFile(FILE, JSON.stringify(all, null, 2));
    return run;
  });
  queue = result.catch(() => {});
  return result;
};

/** The latest run of each source, keyed by source. */
export const LatestPerSource = readAll;
