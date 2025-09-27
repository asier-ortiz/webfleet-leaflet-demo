const MAP = L.map('map');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(MAP);
MAP.setView([42.846, -2.671], 12);

let markersLayer = L.layerGroup().addTo(MAP);
let autoTimer = null;

const elStatus = document.getElementById('status');
const btnRefresh = document.getElementById('refreshBtn');
const selInterval = document.getElementById('intervalSelect');

btnRefresh.addEventListener('click', () => refreshFleet());
selInterval.addEventListener('change', () => {
    if (autoTimer) clearInterval(autoTimer);
    const ms = parseInt(selInterval.value, 10);
    if (ms > 0) {
        autoTimer = setInterval(refreshFleet, ms);
    }
});

function normalizeItems(data) {
    // The backend already normalizes coordinates to decimal degrees and
    // returns { report: [...] }. Still, we keep this defensive to accept
    // either a plain array or the { report } wrapper and to fallback to
    // *_mdeg if ever needed.
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.report) ? data.report : []);

    const toDeg = (val, mdeg) => {
        // Prefer decimal degrees if present; otherwise derive from million-degrees
        if (val != null && Number.isFinite(Number(val))) return Number(val);
        if (mdeg != null && Number.isFinite(Number(mdeg))) return Number(mdeg) / 1_000_000;
        return undefined;
    };

    return arr.map(v => ({
        lat: toDeg(v.latitude, v.latitude_mdeg),
        lon: toDeg(v.longitude, v.longitude_mdeg),
        objectno: v.objectno,
        objectname: v.objectname,
        objectgroupname: v.objectgroupname,
        drivername: v.drivername,
        driver_currentworkstate: v.driver_currentworkstate,
        drivertelmobile: v.drivertelmobile,
        pos_time: v.pos_time,
        msgtime: v.msgtime,
        speed: v.speed,
        course: v.course,
        ignition: v.ignition,
        standstill: v.standstill,
        status: v.status,
        postext: v.postext,
        postext_short: v.postext_short,
        dest_text: v.dest_text,
        dest_eta: v.dest_eta,
        dest_distance: v.dest_distance,
        dest_isorder: v.dest_isorder,
        orderno: v.orderno,
        odometer: v.odometer,
        engine_operating_time: v.engine_operating_time,
        fuellevel: v.fuellevel,
        quality: v.quality,
        satellite: v.satellite
    })).filter(v => Number.isFinite(v.lat) && Number.isFinite(v.lon));
}

function clearMarkers() {
    markersLayer.clearLayers();
}

function plotVehicles(items) {
    clearMarkers();
    const bounds = [];
    for (const v of items) {
        const headingTxt = Number.isFinite(v.course) ? `${v.course}°` : '—';
        const speedTxt = Number.isFinite(v.speed) ? `${v.speed} km/h` : '—';
        const ignTxt = v.ignition === 1 ? 'On' : (v.ignition === 0 ? 'Off' : '—');
        const addr = v.postext_short || v.postext || '';
        const gpsTxt = [v.quality || '', v.satellite ? `${v.satellite} sats` : '']
            .filter(Boolean).join(' · ');

        // Age of data (pos_time)
        const age = v.pos_time ? (() => {
            const t = new Date(v.pos_time).getTime();
            const d = Date.now() - t;
            if (!Number.isFinite(d) || d < 0) return '';
            const m = Math.round(d / 60000);
            return m < 1 ? 'hace <1 min' : `hace ${m} min`;
        })() : '';

        const destLine = v.dest_text ? `Destino: ${v.dest_text}${v.dest_eta ? ` · ETA ${new Date(v.dest_eta).toLocaleTimeString()}` : ''}${v.dest_distance ? ` · ${Math.round(v.dest_distance/1000)} km` : ''}<br/>` : '';
        const odoLine = Number.isFinite(v.odometer) ? `Odómetro: ${(v.odometer/1000).toFixed(1)} km<br/>` : '';
        const driverLine = v.drivername ? `Conductor: ${v.drivername}${v.driver_currentworkstate ? ` (${v.driver_currentworkstate})` : ''}<br/>` : '';

        const popup = `
      <strong>${v.objectname || v.objectno}</strong><br/>
      ${addr ? `${addr}<br/>` : ''}
      ${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}<br/>
      Velocidad: ${speedTxt} · Rumbo: ${headingTxt} · Contacto: ${ignTxt}${v.standstill === 1 ? ' · Parado' : ''}<br/>
      ${driverLine}
      ${destLine}
      ${odoLine}
      <small>${age}${gpsTxt ? ` · GPS: ${gpsTxt}` : ''}</small>
    `;
        L.marker([v.lat, v.lon]).addTo(markersLayer).bindPopup(popup);
        bounds.push([v.lat, v.lon]);
    }
    if (bounds.length) MAP.fitBounds(bounds, {padding: [30, 30]});
}

async function fetchFleet() {
    try {
        const res = await fetch("/api/fleet");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(JSON.stringify(data.error));
        return normalizeItems(data);
    } catch (err) {
        console.warn("Backend failed, using sample. Reason:", err.message);
        const sample = await (await fetch("./samples/sample_object_report.json")).json();
        return normalizeItems(sample);
    }
}

async function refreshFleet() {
    elStatus.textContent = "Updating…";
    const items = await fetchFleet();
    if (!items.length) {
        elStatus.textContent = "No data";
        return;
    }
    plotVehicles(items);
    elStatus.textContent = `Updated · ${new Date().toLocaleTimeString()}`;
}

refreshFleet();
