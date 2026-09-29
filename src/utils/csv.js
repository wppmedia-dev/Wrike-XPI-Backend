/**
 * Minimal CSV serialization — no dependency pulled in for what is a handful
 * of lines. Only handles what a downloadable report needs: a header row, one
 * row per record, and RFC 4180 quoting for values that contain a comma, a
 * quote, or a newline (an activity log's caller email, resource path, and
 * JSON payloads can all contain any of those).
 */

const escapeCell = (value) => {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * `columns` is an ordered list of `{ key, label }` — `key` reads off each row
 * (dot paths not supported; callers pre-shape the row), `label` is the header
 * cell. Returns one string with CRLF line endings, the format Excel expects.
 */
export const toCsv = (rows, columns) => {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(row[c.key])).join(","),
  );
  return [header, ...body].join("\r\n") + "\r\n";
};
