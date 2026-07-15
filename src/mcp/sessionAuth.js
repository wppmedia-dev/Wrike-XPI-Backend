/**
 * In-memory session-to-auth store.
 * Maps MCP session IDs to { wrikeToken, environmentName }.
 * Auth is set by the auth_login tool and cleared on auth_logout.
 *
 * @type {{get: (sessionId: string) => ({wrikeToken: string, environmentName: string}|null),
 *         set: (sessionId: string, auth: {wrikeToken: string, environmentName: string}) => void,
 *         delete: (sessionId: string) => void}}
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
};
