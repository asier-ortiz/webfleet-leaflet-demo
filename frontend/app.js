// Two independent maps: Live and Tracks
const MAP_LIVE = L.map('map-live');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(MAP_LIVE);
MAP_LIVE.setView([42.846, -2.671], 12);

const MAP_TRACKS = L.map('map-tracks');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(MAP_TRACKS);
MAP_TRACKS.setView([42.846, -2.671], 12);

// Layers: markers live on MAP_LIVE, tracks on MAP_TRACKS
let markersLayer = L.layerGroup().addTo(MAP_LIVE);
let trackLayer = L.layerGroup().addTo(MAP_TRACKS);

let autoTimer = null;

// Live controls
const elStatus = document.getElementById('status');
const btnRefresh = document.getElementById('refreshBtn');
const selInterval = document.getElementById('intervalSelect');

if (btnRefresh) btnRefresh.addEventListener('click', () => refreshFleet());
if (selInterval) selInterval.addEventListener('change', () => {
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

function clearMarkers() { markersLayer.clearLayers(); }
function clearTrack() { trackLayer.clearLayers(); }

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
    if (bounds.length) MAP_LIVE.fitBounds(bounds, {padding: [30, 30]});
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
    if (!elStatus) return;
    elStatus.textContent = "Updating…";
    const items = await fetchFleet();
    if (!items.length) {
        elStatus.textContent = "No data";
        return;
    }
    plotVehicles(items);
    elStatus.textContent = `Updated · ${new Date().toLocaleTimeString()}`;
}

// ---- Tracks UI logic ----
const tabs = document.querySelectorAll('.tab');
const liveControls = document.getElementById('controls-live');
const tracksControls = document.getElementById('controls-tracks');
const legend = document.getElementById('legend');

function setTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    if (liveControls) liveControls.classList.toggle('hidden', name !== 'live');
    if (tracksControls) tracksControls.classList.toggle('hidden', name !== 'tracks');
    if (legend) legend.textContent = name === 'tracks' ? 'Leyenda: azul = recorrido, verde = inicio, rojo = fin' : '';
    const mapLiveEl = document.getElementById('map-live');
    const mapTracksEl = document.getElementById('map-tracks');
    if (mapLiveEl && mapTracksEl) {
        const showLive = name === 'live';
        mapLiveEl.classList.toggle('hidden', !showLive);
        mapTracksEl.classList.toggle('hidden', showLive);
        setTimeout(() => {
            if (showLive) MAP_LIVE.invalidateSize(); else MAP_TRACKS.invalidateSize();
        }, 0);
    }
}

tabs.forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));

// Tracks controls elements
const vehicleSelect = document.getElementById('vehicleSelect');
const showTrackBtn = document.getElementById('showTrackBtn');
const clearTrackBtn = document.getElementById('clearTrackBtn');
const trackStatus = document.getElementById('trackStatus');

async function populateVehicleSelect() {
    if (!vehicleSelect) return;
    try {
        const items = await fetchFleet();
        const options = items
            .sort((a,b) => (a.drivername||'').localeCompare(b.drivername||''))
            .map(v => ({ value: v.objectno, label: `${v.drivername || '—'} — ${v.objectname || v.objectno}` }));
        vehicleSelect.innerHTML = '<option value="">Selecciona…</option>' +
            options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    } catch (e) {
        vehicleSelect.innerHTML = '<option value="">Error cargando</option>';
        console.error(e);
    }
}


function drawTrack(points) {
    if (!points?.length) return;
    const latlngs = points.map(p => [p.lat, p.lon]);
    const line = L.polyline(latlngs, { color: '#0b82ff', weight: 4, opacity: 0.85 }).addTo(trackLayer);
    L.circleMarker(latlngs[0], { radius: 5, color: 'green', fillColor: 'green', fillOpacity: 1 })
      .addTo(trackLayer).bindPopup('Inicio');
    L.circleMarker(latlngs[latlngs.length-1], { radius: 5, color: 'red', fillColor: 'red', fillOpacity: 1 })
      .addTo(trackLayer).bindPopup('Fin');
    MAP.fitBounds(line.getBounds(), { padding: [30, 30] });
}


async function showTrackFromUI() {
    if (!vehicleSelect) return;
    const objectno = vehicleSelect.value;
    if (!objectno) { if (trackStatus) trackStatus.textContent = 'Elige un vehículo'; return; }
    const url = new URL('/api/tracks', window.location.origin);
    url.searchParams.set('objectno', objectno);
    // Fixed range: últimos 7 días (last7)
    url.searchParams.set('preset', 'last7');

    if (trackStatus) trackStatus.textContent = 'Cargando recorrido (últimos 7 días)…';
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        clearTrack();
        if (!data.points || !data.points.length) {
            if (trackStatus) trackStatus.textContent = 'Sin puntos en el rango';
            return;
        }
        drawTrack(data.points);
        if (trackStatus) trackStatus.textContent = `Puntos: ${data.points.length}`;
    } catch (e) {
        if (trackStatus) trackStatus.textContent = 'Error cargando recorrido';
        console.error(e);
    }
}

if (showTrackBtn) showTrackBtn.addEventListener('click', showTrackFromUI);
if (clearTrackBtn) clearTrackBtn.addEventListener('click', () => { clearTrack(); if (trackStatus) trackStatus.textContent = ''; });

// Initial setup
setTab('live');
populateVehicleSelect().catch(console.error);

// Kick off live view
refreshFleet();
