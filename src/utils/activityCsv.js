/**
 * Shared shaping for the activity log's CSV export — used by both the admin
 * console's route (src/routes/admin/activity/index.js) and the portal's
 * (src/routes/portal/activity/index.js), so the two surfaces produce the
 * same columns in the same order rather than drifting apart.
 */

/** Column order for the exported CSV — same fields the console's table and
    detail drawer show, in the order the table reads. */
export const ACTIVITY_CSV_COLUMNS = [
  { key: "created_at", label: "Time" },
  { key: "actor_email", label: "Caller" },
  { key: "environment_name", label: "Environment" },
  { key: "token_id", label: "Token ID" },
  { key: "surface", label: "Surface" },
  { key: "method", label: "Method" },
  { key: "resource", label: "Resource" },
  { key: "mcp_tool", label: "MCP Tool" },
  { key: "ip", label: "IP" },
  { key: "category", label: "Category" },
  { key: "action", label: "Action" },
  { key: "allowed", label: "Result" },
  { key: "status_code", label: "Status Code" },
  { key: "code", label: "Code" },
  { key: "reference_id", label: "Reference" },
];

/** Booleans and dates read better in a spreadsheet as plain words/ISO
    strings than as `true`/a Date object. */
export const toCsvRow = (row) => ({
  ...row,
  created_at: row.created_at ? new Date(row.created_at).toISOString() : "",
  allowed: row.allowed ? "Allowed" : "Denied",
});
