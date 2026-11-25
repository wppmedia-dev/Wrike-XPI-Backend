/**
 * Escape text for use inside HTML element content or a double- or single-quoted
 * attribute. Everything the token callback interpolates into its pages goes
 * through this, so a value that ever carries request data (an error message that
 * echoes a parameter, say) is shown as text and never parsed as markup.
 */
const ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"'`]/g, (c) => ENTITIES[c]);

export default escapeHtml;
