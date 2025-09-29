// Utility helpers shared by Webfleet API clients (tracks, stops, fleet)
// All functions are small, dependency-free (aside from fetch), and designed
// to keep the clients DRY and consistent.
import fetch from "node-fetch";

/**
 * Convert latitude/longitude to decimal degrees, accepting either decimal degrees
 * or million-degrees (aka microdegrees) as input.
 *
 * Rules:
 * - If mdeg is provided and numeric, return mdeg / 1_000_000.
 * - Else if dec is provided and numeric, use it. If |dec| > 180 assume it is mdeg and divide.
 * - Otherwise return undefined.
 *
 * This defensive helper tolerates upstream variations where coordinates might
 * appear either as decimal degrees or as *_mdeg fields.
 *
 * @param {{ dec?: number|string, mdeg?: number|string }} param0
 * @returns {number|undefined} decimal degrees or undefined if not parseable
 */
export function toDegrees({ dec, mdeg }) {
  if (mdeg != null && Number.isFinite(Number(mdeg))) return Number(mdeg) / 1_000_000;
  if (dec == null || !Number.isFinite(Number(dec))) return undefined;
  const n = Number(dec);
  return Math.abs(n) > 180 ? n / 1_000_000 : n;
}

/**
 * Format a Date (or date-like value) as an ISO-8601 UTC string without milliseconds.
 *
 * Example: 2025-09-29T10:15:00Z
 *
 * @param {Date|string|number} dt - Date instance or value accepted by new Date()
 * @returns {string} ISO string in UTC with millisecond precision removed
 */
export function toISO(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  return new Date(d.getTime() - d.getMilliseconds()).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Format a Date (UTC) as a UD string expected by WEBFLEET when using
 * range_pattern=ud and lang=en.
 *
 * Output format: dd/MM/yyyy HH:mm:ss (UTC)
 * Example: 29/09/2025 10:16:00
 *
 * Note: This is only necessary for endpoints that require UD strings. When
 * useISO8601=true is supported for parameters (e.g., showStops), prefer toISO().
 *
 * @param {Date|string|number} date - Date instance or value accepted by new Date()
 * @returns {string} UD-formatted date-time in UTC
 */
export function toUdStringUTC(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  const Y = d.getUTCFullYear();
  const M = pad(d.getUTCMonth() + 1);
  const D = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const m = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  // lang=en: dd/MM/yyyy HH:mm:ss
  return `${D}/${M}/${Y} ${h}:${m}:${s}`;
}

/**
 * Build a base URL for WEBFLEET Remote API calls, pre-populating common
 * query parameters from environment variables and sensible defaults.
 *
 * Sets:
 * - action
 * - account, apikey, username, password (from env)
 * - outputformat=json, lang (default "en"), useISO8601=true, useUTF8=true, useMerdeg=true
 *
 * @param {string} action - WEBFLEET API action name (e.g., "showTracks")
 * @returns {URL} URL instance ready to be extended with endpoint-specific params
 */
export function buildBaseUrl(action) {
  const url = new URL(process.env.API_BASE);
  url.searchParams.set("action", action);
  url.searchParams.set("account", process.env.WEBFLEET_ACCOUNT);
  url.searchParams.set("apikey", process.env.WEBFLEET_APIKEY);
  url.searchParams.set("username", process.env.WEBFLEET_USERNAME);
  url.searchParams.set("password", process.env.WEBFLEET_PASSWORD);
  url.searchParams.set("outputformat", "json");
  url.searchParams.set("lang", process.env.WEBFLEET_LANG || "en");
  url.searchParams.set("useISO8601", "true");
  url.searchParams.set("useUTF8", "true");
  url.searchParams.set("useMerdeg", "true");
  return url;
}

/**
 * Execute a GET request against the provided WEBFLEET URL and parse JSON.
 * Throws an Error for non-2xx HTTP statuses.
 *
 * @param {URL|string} url - The URL to fetch
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} when response.ok is false
 */
export async function callWebfleet(url) {
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Compute the start of the current week in local time, using Monday as the first day.
 * The returned Date is set to 00:00:00.000 local time.
 *
 * @param {Date} d - Reference date
 * @returns {Date} New Date at the local Monday 00:00 of the same week as d
 */
export function startOfWeekLocal(d) {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = base.getDay(); // 0=Sun,1=Mon,...
  const diff = (day === 0 ? -6 : 1 - day);
  const start = new Date(base);
  start.setDate(base.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Split a [start, end] time range into consecutive windows of at most maxMs each.
 * Each window is inclusive of its start and end, and the next window starts 1 second
 * after the previous window's end to avoid overlaps when calling time-range APIs.
 *
 * Default maxMs is 48 hours (the limit for some WEBFLEET endpoints like showTracks).
 *
 * @param {Date|string|number} start - Range start (any value accepted by new Date())
 * @param {Date|string|number} end - Range end (any value accepted by new Date())
 * @param {number} [maxMs=172800000] - Maximum window size in milliseconds
 * @returns {{from: Date, to: Date}[]} Array of windows covering the full range
 */
export function splitRangeIntoWindows(start, end, maxMs = 2 * 24 * 60 * 60 * 1000) {
  const windows = [];
  let cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(Math.min(cursor.getTime() + maxMs, end.getTime()));
    windows.push({ from: new Date(cursor), to: new Date(next) });
    cursor = new Date(next.getTime() + 1000); // avoid overlap
  }
  return windows;
}
