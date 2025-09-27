import fetch from "node-fetch";

// Convert million-degrees (micro degrees) to decimal degrees
function mdegToDeg(mdeg) {
  if (mdeg == null) return undefined;
  const n = Number(mdeg);
  return Number.isFinite(n) ? n / 1_000_000 : undefined;
}

// Heuristic: accept either decimal degrees or microdegrees in latitude/longitude
function toDegrees({ dec, mdeg }) {
  if (mdeg != null && Number.isFinite(Number(mdeg))) return Number(mdeg) / 1_000_000;
  if (dec == null || !Number.isFinite(Number(dec))) return undefined;
  const n = Number(dec);
  return Math.abs(n) > 180 ? n / 1_000_000 : n;
}

// Format Date to Webfleet UD string depending on lang. We'll force lang=en here.
function toUdStringUTC(date) {
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

function toISO(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  return new Date(d.getTime() - d.getMilliseconds()).toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function callWebfleet(url) {
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function mapPoints(raw) {
  const list = Array.isArray(raw?.report) ? raw.report : Array.isArray(raw) ? raw : [];
  const points = list
    .map((r) => ({
      time: r.pos_time || r.time || r.receivetime || r.msgtime,
      lat: toDegrees({ dec: r.latitude, mdeg: r.latitude_mdeg }),
      lon: toDegrees({ dec: r.longitude, mdeg: r.longitude_mdeg }),
      speed: r.speed != null ? Number(r.speed) : undefined,
      course: r.course != null ? Number(r.course) : undefined,
      ignition: r.ignition,
      standstill: r.standstill,
      postext: r.postext,
      postext_short: r.postext_short,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.time);
  points.sort((a, b) => new Date(a.time) - new Date(b.time));
  return points;
}

function buildBaseUrl(action) {
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

async function callShowTracksPattern({ objectno, pattern }) {
  const url = buildBaseUrl("showTracks");
  url.searchParams.set("objectno", objectno);
  url.searchParams.set("range_pattern", pattern);
  const raw = await callWebfleet(url);
  return raw;
}

async function callShowTracksUd({ objectno, from, to }) {
  // For UD we will force lang=en to use known date format
  const url = buildBaseUrl("showTracks");
  url.searchParams.set("lang", "en");
  url.searchParams.set("objectno", objectno);
  url.searchParams.set("range_pattern", "ud");
  url.searchParams.set("rangefrom_string", toUdStringUTC(from));
  url.searchParams.set("rangeto_string", toUdStringUTC(to));
  const raw = await callWebfleet(url);
  return raw;
}

/**
 * Fetch normalized historical positions for a vehicle.
 * Supports:
 * - preset: today | yesterday | last7 (iterates d-0..d-6)
 * - custom from/to: limited to max 2 days (48h) with range_pattern=ud
 */
export async function getVehicleTrack({ objectno, from, to, preset }) {
  if (!objectno) throw new Error("objectno is required");

  // 1) Presets using range_pattern
  if (!from || !to) {
    const p = preset || "today";

    if (p === "today") {
      const raw = await callShowTracksPattern({ objectno, pattern: "d0" });
      if (raw?.errorCode) return raw;
      return { objectno, from: toISO(new Date(new Date().setHours(0,0,0,0))), to: toISO(new Date()), points: mapPoints(raw) };
    }

    if (p === "yesterday") {
      const raw = await callShowTracksPattern({ objectno, pattern: "d-1" });
      if (raw?.errorCode) return raw;
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const start = new Date(d.getTime() - 24*60*60*1000);
      const end = new Date(d.getTime() - 1);
      return { objectno, from: toISO(start), to: toISO(end), points: mapPoints(raw) };
    }

    if (p === "last7") {
      // Iterate d-0..d-6 and merge
      let all = [];
      for (let i = 0; i <= 6; i++) {
        const pat = i === 0 ? "d0" : `d-${i}`;
        const raw = await callShowTracksPattern({ objectno, pattern: pat });
        if (raw?.errorCode) return raw;
        all = all.concat(mapPoints(raw));
      }
      // Compute overall from/to (last 7 days window)
      const end = new Date();
      const start = new Date(end.getTime() - 7*24*60*60*1000);
      return { objectno, from: toISO(start), to: toISO(end), points: all };
    }

    if (p === "week_current") {
      // Compute Monday (start of week) in local time
      const now = new Date();
      const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = base.getDay(); // 0=Sun,1=Mon,...
      const diff = (day === 0 ? -6 : 1 - day); // move to Monday
      const start = new Date(base);
      start.setDate(base.getDate() + diff);
      // Number of days from start of week up to today
      const days = Math.floor((base - start) / (24*60*60*1000)) + 1;
      let all = [];
      for (let i = 0; i < days; i++) {
        const pat = i === 0 ? "d0" : `d-${i}`;
        const raw = await callShowTracksPattern({ objectno, pattern: pat });
        if (raw?.errorCode) return raw;
        all = all.concat(mapPoints(raw));
      }
      return { objectno, from: toISO(start), to: toISO(new Date()), points: all };
    }


    // Default fallback to today
    const raw = await callShowTracksPattern({ objectno, pattern: "d0" });
    if (raw?.errorCode) return raw;
    return { objectno, from: toISO(new Date(new Date().setHours(0,0,0,0))), to: toISO(new Date()), points: mapPoints(raw) };
  }

  // 2) Custom range using UD, enforce max 2 days
  const start = new Date(from);
  const end = new Date(to);
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  if (end - start > TWO_DAYS_MS) {
    return { errorCode: 9002, errorMsg: "Custom range exceeds 2 days; please select 48h or less" };
  }
  const raw = await callShowTracksUd({ objectno, from: start, to: end });
  if (raw?.errorCode) return raw;
  return { objectno, from: toISO(start), to: toISO(end), points: mapPoints(raw) };
}
