/**
 * Why a Caller cell is empty, in a sentence.
 *
 * "Unresolved" on its own says the column has nothing in it, and leaves the
 * reader wondering which of several quite different things went wrong — or
 * whether the log is broken. Three cases produce it, and they are not alike:
 *
 *   - the request never got a token past validation, so nothing was ever
 *     identified (auth failures, the loudest rows in the table);
 *   - Wrike could not say which person the login belongs to, so the request was
 *     refused on purpose;
 *   - the row is the token service's own surface, where a request is either
 *     creating a token (an OAuth exchange: there is no caller yet, the request
 *     is the act of becoming one) or reading one by value.
 *
 * Living here rather than in either page because both consoles show the same
 * column over the same rows, and a sentence that differs between them would
 * read as two different systems. The activity row shape it needs is shared too
 * (frontend/src/lib/activityLogApi.ts, portalActivityApi.ts).
 */
export interface CallerContext {
  code: string | null;
  category: string | null;
  /** False when the row is a refusal, which changes what an empty caller means. */
  allowed: boolean;
  surface: string | null;
}

export const callerNote = (row: CallerContext): string => {
  switch (row.code) {
    case "AUTH_FAILED":
      return "No caller was identified: the request's token was rejected before anything could be attributed, so this row is a rejected call rather than an anonymous one.";

    case "TOKEN_INVALID":
      return "No caller was identified: the token could not be read, so nobody was attributed to this request.";

    case "IDENTITY_UNAVAILABLE":
      return "No caller was identified: Wrike did not say which person this login belongs to, so the request was refused.";

    default:
      break;
  }

  if (row.category === "token") {
    return "No caller was identified: this is the token service's own surface. A request here is either creating a token — the sign-in itself, where nobody has an identity yet — or reading one by its value.";
  }

  // Allowed with nobody attached is the surprising one, and the least alarming
  // once explained: Wrike answered, it just has no email address for this
  // login. The call still went through, and the Token and IP columns identify
  // it well enough to follow up.
  if (row.allowed) {
    return `The call was allowed, but Wrike has no email address recorded for this login, so there was no name to put here. The Token and IP columns identify the request.`;
  }

  return "No caller was identified: the request was refused before anything attributed it.";
};
