import fetch from "node-fetch";

/**
 * Helper: convert million-degrees (mdeg) to decimal degrees.
 * WEBFLEET can return latitude_mdeg/longitude_mdeg when useMerdeg=true.
 * Example: 43260362 -> 43.260362
 */
function mdegToDeg(mdeg) {
    if (mdeg == null) return undefined;
    const n = Number(mdeg);
    if (!Number.isFinite(n)) return undefined;
    return n / 1_000_000;
}

/**
 * Calls WEBFLEET CSV API action=showObjectReportExtern and normalizes the data
 * so the frontend always receives decimal latitude/longitude. This avoids
 * parsing issues with DMS strings and keeps the browser free of secrets.
 *
 * Returns: { report: Array<NormalizedVehicle> } or an error object if the
 *          upstream API reports an errorCode.
 */
export async function getFleetSnapshot() {
    // Build URL with credentials and machine-friendly flags
    const url = new URL(process.env.API_BASE);
    url.searchParams.set("action", "showObjectReportExtern");
    url.searchParams.set("account", process.env.WEBFLEET_ACCOUNT);
    url.searchParams.set("apikey", process.env.WEBFLEET_APIKEY);
    url.searchParams.set("username", process.env.WEBFLEET_USERNAME);
    url.searchParams.set("password", process.env.WEBFLEET_PASSWORD);
    // Ask for JSON and normalized encodings from the source
    url.searchParams.set("outputformat", "json");   // JSON instead of CSV
    url.searchParams.set("lang", process.env.WEBFLEET_LANG || "en");
    url.searchParams.set("useISO8601", "true");     // ISO 8601 dates
    url.searchParams.set("useUTF8", "true");        // UTF-8 strings
    url.searchParams.set("useMerdeg", "true");      // include *_mdeg fields

    const res = await fetch(url.href);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const raw = await res.json();

    // If WEBFLEET returned an error structure, pass it up to the route handler
    if (raw && (raw.errorCode || raw.error)) {
        return raw;
    }

    // The API sometimes wraps data in { report: [...] } and sometimes returns an array.
    const list = Array.isArray(raw?.report) ? raw.report : (Array.isArray(raw) ? raw : []);

    // Normalize coordinates to decimal degrees and pick the commonly used fields.
    const normalized = list.map(r => {
        const lat = mdegToDeg(r.latitude_mdeg) ?? (r.latitude != null ? Number(r.latitude) : undefined);
        const lon = mdegToDeg(r.longitude_mdeg) ?? (r.longitude != null ? Number(r.longitude) : undefined);
        return {
            // Identification
            objectno: r.objectno,
            objectname: r.objectname,
            objectgroupname: r.objectgroupname,
            objectclassname: r.objectclassname,
            objecttype: r.objecttype,

            // Driver info
            drivername: r.drivername,
            driver_currentworkstate: r.driver_currentworkstate,
            drivertelmobile: r.drivertelmobile,

            // Timing
            pos_time: r.pos_time,
            msgtime: r.msgtime,

            // Movement/state
            speed: r.speed,
            course: r.course,
            ignition: r.ignition,
            standstill: r.standstill,
            status: r.status,

            // Human-friendly location
            postext: r.postext,
            postext_short: r.postext_short,

            // Destination (if any)
            dest_text: r.dest_text,
            dest_eta: r.dest_eta,
            dest_distance: r.dest_distance,
            dest_isorder: r.dest_isorder,
            orderno: r.orderno,

            // Vehicle metrics
            odometer: r.odometer_long ?? r.odometer,
            engine_operating_time: r.engine_operating_time,
            fuellevel: r.fuellevel ?? r.fuellevel_milliliters,

            // GPS quality
            quality: r.quality,
            satellite: r.satellite,

            // Coordinates (decimal degrees)
            latitude: lat,
            longitude: lon,
        };
    }).filter(v => Number.isFinite(v.latitude) && Number.isFinite(v.longitude));

    // Return under a stable key the frontend already understands.
    return { report: normalized };
}
