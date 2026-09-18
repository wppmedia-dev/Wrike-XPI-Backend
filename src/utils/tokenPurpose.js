/**
 * What a minted XPI token is *for*, and the one thing that differs between the
 * two sign-ins the root login page offers.
 *
 * A normal sign-in mints a token for a person wiring up the REST API or an MCP
 * client, and it lives for TOKEN_TTL_DAYS (src/utils/tokenTtl.js). The login
 * page also offers "Calendar Sync", for calendar integrations that stay
 * subscribed on their own: that token is minted with no expiry, because a
 * subscription that stops on a date the subscriber was never shown is a
 * support ticket waiting to happen.
 *
 * The lifetime difference lives here rather than in the mint, so that both
 * halves of it — the expire column written on the row and the claim signed
 * into the token — are decided by the same value. What this file deliberately
 * does NOT have is any wording promising permanence: the option is named after
 * what it is for, and nothing in the login page tells the person a promise
 * about how long it lasts.
 *
 * A Calendar Sync token is also minted with an explicit permission matrix
 * rather than left unrestricted: the Calendar Sync module granted, every other
 * module off. Rows are still written for all of them, because nothing at all
 * means "unrestricted" and is indistinguishable from a token an admin has
 * never opened, and because the switch-off is then a change the gate can see
 * and the console's Access column can show.
 */

import { normaliseMatrix } from "./tokenPermissionCatalog";

export const TOKEN_PURPOSE = {
  LOGIN: "login",
  CALENDAR_SYNC: "calendar_sync",
};

/** The catalogue module a Calendar Sync token is minted for. */
export const CALENDAR_SYNC_MODULE = "calendar_sync";

/** How a Calendar Sync token reads in the console's Client column. */
export const CALENDAR_SYNC_CLIENT_NAME = "Calendar Sync";

/**
 * Anything that is not the Calendar Sync purpose — absent, blank, an unknown
 * value, a typo — is a normal sign-in. Reading "calendar sync" out of junk
 * would hand somebody a token with no expiry on the strength of a query
 * parameter nobody validated.
 */
export const normalisePurpose = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase() === TOKEN_PURPOSE.CALENDAR_SYNC
    ? TOKEN_PURPOSE.CALENDAR_SYNC
    : TOKEN_PURPOSE.LOGIN;

export const isCalendarSyncPurpose = (value) =>
  normalisePurpose(value) === TOKEN_PURPOSE.CALENDAR_SYNC;

/**
 * The matrix a Calendar Sync token is minted with: the Calendar Sync module
 * granted, everything else off.
 *
 * Granted only what it is for. A calendar displays Wrike work; it has no
 * business reading campaigns, writing tasks or reaching the master data, and a
 * token minted with all of that available is a credential far wider than the
 * job that asked for it. Widening it is an administrator's decision taken on
 * purpose in the console, not a default nobody looked at.
 *
 * Read only, and that is a floor rather than a limit on what the module can do.
 * The calendar surface forwards to amoeba, so the module expresses Create,
 * Update and Delete too (src/utils/tokenPermissionCatalog.js) and an
 * administrator can grant them per token. What a token is MINTED with stays
 * the narrowest thing that works, because a credential with no expiry should
 * not arrive holding write access nobody asked for.
 *
 * Built through normaliseMatrix so the shape is the catalogue's: every module
 * present, and any action a module does not declare forced off.
 */
export const calendarSyncMatrix = () =>
  normaliseMatrix({ [CALENDAR_SYNC_MODULE]: { read: true } });
