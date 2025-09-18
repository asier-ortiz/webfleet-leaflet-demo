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
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.report) ? data.report : []);
    return arr.map(v => ({
        lat: parseFloat(v.latitude),
        lon: parseFloat(v.longitude),
        objectno: v.objectno,
        objectname: v.objectname,
        objectgroupname: v.objectgroupname,
        drivername: v.drivername,
        pos_time: v.pos_time,
        speed: v.speed,
        course: v.course,
        ignition: v.ignition
    })).filter(v => Number.isFinite(v.lat) && Number.isFinite(v.lon));
}

function clearMarkers() {
    markersLayer.clearLayers();
}

function plotVehicles(items) {
    clearMarkers();
    const bounds = [];
    for (const v of items) {
        const popup = `
      <strong>${v.objectname || v.objectno}</strong><br/>
      ${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}<br/>
      Driver: ${v.drivername || '—'}<br/>
      Speed: ${v.speed ?? '—'} km/h · Heading: ${v.course ?? '—'}<br/>
      Ignition: ${v.ignition === 1 ? 'On' : (v.ignition === 0 ? 'Off' : '—')}<br/>
      <small>${v.pos_time || ''}</small>
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
