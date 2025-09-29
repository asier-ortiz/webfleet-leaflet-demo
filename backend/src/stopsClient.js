import { buildBaseUrl, callWebfleet, toDegrees, toISO, startOfWeekLocal, splitRangeIntoWindows } from "./lib/webfleetUtils.js";

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
