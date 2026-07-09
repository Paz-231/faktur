/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as angebots from "../angebots.js";
import type * as auftrags from "../auftrags.js";
import type * as auth from "../auth.js";
import type * as backup from "../backup.js";
import type * as backupCron from "../backupCron.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as documents from "../documents.js";
import type * as fileUpload from "../fileUpload.js";
import type * as http from "../http.js";
import type * as incoming from "../incoming.js";
import type * as invoices from "../invoices.js";
import type * as profile from "../profile.js";
import type * as sessions from "../sessions.js";
import type * as settings from "../settings.js";
import type * as skillDownload from "../skillDownload.js";
import type * as skillDownloadDB from "../skillDownloadDB.js";
import type * as skillVersions from "../skillVersions.js";
import type * as stripe from "../stripe.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  angebots: typeof angebots;
  auftrags: typeof auftrags;
  auth: typeof auth;
  backup: typeof backup;
  backupCron: typeof backupCron;
  crons: typeof crons;
  customers: typeof customers;
  documents: typeof documents;
  fileUpload: typeof fileUpload;
  http: typeof http;
  incoming: typeof incoming;
  invoices: typeof invoices;
  profile: typeof profile;
  sessions: typeof sessions;
  settings: typeof settings;
  skillDownload: typeof skillDownload;
  skillDownloadDB: typeof skillDownloadDB;
  skillVersions: typeof skillVersions;
  stripe: typeof stripe;
  waitlist: typeof waitlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
