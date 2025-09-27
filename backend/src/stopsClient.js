import fetch from "node-fetch";

function toDegrees({ dec, mdeg }) {
  if (mdeg != null && Number.isFinite(Number(mdeg))) return Number(mdeg) / 1_000_000;
  if (dec == null || !Number.isFinite(Number(dec))) return undefined;
  const n = Number(dec);
  return Math.abs(n) > 180 ? n / 1_000_000 : n;
}

function toISO(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  return new Date(d.getTime() - d.getMilliseconds()).toISOString().replace(/\.\d{3}Z$/, "Z");
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

async function callWebfleet(url) {
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function callShowStopsUd({ objectno, from, to }) {
  const url = buildBaseUrl("showStops");
  url.searchParams.set("objectno", objectno);
  url.searchParams.set("range_pattern", "ud");
  // With useISO8601=true we can send ISO UTC timestamps directly
  url.searchParams.set("rangefrom", toISO(from));
  url.searchParams.set("rangeto", toISO(to));
  const raw = await callWebfleet(url);
  return raw;
}

function mapStops(raw) {
  const list = Array.isArray(raw?.report) ? raw.report : (Array.isArray(raw) ? raw : []);
  const stops = list.map(r => {
    const start = r.starttime || r.start_time || r.begin_time || r.time_begin || r.timefrom || r.from;
    const end = r.endtime || r.end_time || r.time_end || r.timeto || r.to;
    const lat = toDegrees({ dec: r.latitude, mdeg: r.latitude_mdeg });
    const lon = toDegrees({ dec: r.longitude, mdeg: r.longitude_mdeg });
    const address = r.postext_short || r.postext || r.address || undefined;
    let minutes;
    if (r.duration != null && Number.isFinite(Number(r.duration))) {
      // Some tenants return seconds; some minutes. Heuristic: if > 10000 assume seconds.
      const val = Number(r.duration);
      minutes = val > 10000 ? Math.round(val / 60) : Math.round(val);
    } else if (start && end) {
      const ms = new Date(end) - new Date(start);
      minutes = Number.isFinite(ms) ? Math.round(ms / 60000) : undefined;
    }
    return { start, end, minutes, lat, lon, address };
  }).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon) && s.start && s.end);
  // Sort by start time
  stops.sort((a,b) => new Date(a.start) - new Date(b.start));
  return stops;
}

function startOfWeekLocal(d) {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = base.getDay(); // 0=Sun,1=Mon,...
  const diff = (day === 0 ? -6 : 1 - day);
  const start = new Date(base);
  start.setDate(base.getDate() + diff);
  start.setHours(0,0,0,0);
  return start;
}

export async function getVehicleStops({ objectno, from, to, preset }) {
  if (!objectno) throw new Error("objectno is required");
  let start, end;
  if (from && to) {
    start = new Date(from);
    end = new Date(to);
  } else {
    const now = new Date();
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const p = preset || 'today';
    if (p === 'today') {
      start = today0; end = now;
    } else if (p === 'yesterday') {
      const y0 = new Date(today0.getTime() - 24*60*60*1000);
      const yEnd = new Date(today0.getTime() - 1);
      start = y0; end = yEnd;
    } else if (p === 'last7') {
      start = new Date(now.getTime() - 7*24*60*60*1000); end = now;
    } else if (p === 'week_current') {
      start = startOfWeekLocal(now); end = now;
    } else {
      // default: today
      start = today0; end = now;
    }
  }

  // Split into <= 48h windows
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  const windows = [];
  let cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(Math.min(cursor.getTime() + TWO_DAYS_MS, end.getTime()));
    windows.push({ from: new Date(cursor), to: new Date(next) });
    cursor = new Date(next.getTime() + 1000); // step to avoid overlap
  }

  let all = [];
  for (const w of windows) {
    const raw = await callShowStopsUd({ objectno, from: w.from, to: w.to });
    if (raw?.errorCode) return raw;
    all = all.concat(mapStops(raw));
  }

  return { objectno, from: toISO(start), to: toISO(end), stops: all };
}
