/**
 * In-memory session-to-auth store.
 * Maps MCP session IDs to { wrikeToken, environmentName }.
 * Auth is set by the auth.login tool and cleared on auth.logout.
 *
 * @type {{get: (id: string) => ({wrikeToken: string, environmentName: string}|null),
 *         set: (id: string, auth: {wrikeToken: string, environmentName: string}) => void,
 *         delete: (id: string) => void,
 *         has: (id: string) => boolean}}
 */
const store = new Map();

export const sessionAuthStore = {
  get(sessionId) {
    return store.get(sessionId) || null;
  },
  set(sessionId, auth) {
    store.set(sessionId, auth);
  },
  delete(sessionId) {
    store.delete(sessionId);
  },
  has(sessionId) {
    return store.has(sessionId);
  },
};
