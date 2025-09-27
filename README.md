# Webfleet Leaflet Demo

Demo project that shows how to visualize a fleet on a map using
**Leaflet** and the **WEBFLEET.connect API**.

- Backend (Node/Express): loads credentials from `.env`, calls Webfleet CSV API, exposes `/api/fleet` and `/api/tracks`.
- Frontend (HTML/CSS/JS): Leaflet map that displays vehicles (Live) and historical tracks (Recorridos). Falls back to sample data if backend fails for the live view.

## Setup

### Backend

``` bash
cd backend
cp .env.example .env   # fill in your credentials
npm install
npm start
```

Server runs at: `http://localhost:3000`

### Frontend

Served automatically by the backend from the `frontend/` folder.\
Open `http://localhost:3000` in your browser.

## Endpoints (upstream)

- Fleet snapshot:

      action=showObjectReportExtern&account=...&apikey=...&username=...&password=...&outputformat=json

- Vehicle tracks (breadcrumbs):

      action=showTracks with Date range filter parameters:
      - Presets: range_pattern=d0 (today), d-1 (yesterday), etc.
      - User-defined: range_pattern=ud + rangefrom_string + rangeto_string (formatted per lang; we use lang=en → dd/MM/yyyy HH:mm:ss)

  Note: WEBFLEET restricts showTracks to short ranges (≤ 2 days per request).

## Backend proxy endpoints

### GET /api/fleet (showObjectReportExtern)

Snapshot of the full fleet. The backend requests JSON with machine‑friendly flags and normalizes coordinates.

Helper flags used:
- outputformat=json → JSON responses instead of CSV
- useISO8601=true → ISO date-times
- useUTF8=true → proper accents/ñ
- useMerdeg=true → adds latitude_mdeg/longitude_mdeg

The backend converts `*_mdeg` to decimal degrees and returns a stable shape:

```json
{ "report": [ { "objectno": "001", "objectname": "...", "latitude": 43.26, "longitude": -2.95 } ] }
```

### GET /api/tracks (showTracks)

Historical positions (breadcrumb points) for a single vehicle and date range. Returns normalized points ordered by time for drawing a polyline.

Query params:
- objectno (required): vehicle identifier from Webfleet
- preset (optional): one of `today`, `yesterday`, `last7`
  - Note: `last30` is intentionally not exposed due to upstream rate/length limits; use custom ranges ≤ 48 h if needed.
- from/to (optional): ISO strings; if both present, override `preset`. Must cover ≤ 48 h total.

Response:

```json
{
  "objectno": "001",
  "from": "2025-09-27T00:00:00Z",
  "to": "2025-09-27T23:59:59Z",
  "points": [ { "time": "…", "lat": 43.26, "lon": -2.95, "speed": 38, "course": 120 } ]
}
```

## Notes

- Request limits apply (contract-specific).
- Adjust auto-refresh (15–60 s) to stay within limits.
- Webfleet Remote API base URL: https://csv.webfleet.com/extern

## Environment variables (backend/.env)
- API_BASE: e.g. https://csv.webfleet.com/extern
- WEBFLEET_ACCOUNT
- WEBFLEET_APIKEY
- WEBFLEET_USERNAME
- WEBFLEET_PASSWORD
- WEBFLEET_LANG (optional, defaults to "en")

## Run locally
- cd backend && npm install && npm run dev
- Open http://localhost:3000

### Test the proxy APIs
```
# Fleet snapshot
curl http://localhost:3000/api/fleet | jq

# Vehicle track (today) using explicit from/to (recommended if presets fail)
FROM=$(date -u +"%Y-%m-%dT00:00:00Z"); TO=$(date -u +"%Y-%m-%dT23:59:59Z"); \
curl "http://localhost:3000/api/tracks?objectno=001&from=$FROM&to=$TO" | jq

# Alternatively, presets (the backend converts them to from/to internally)
# curl "http://localhost:3000/api/tracks?objectno=001&preset=today" | jq
```

## Frontend usage

- Two tabs at the top:
  - Live: shows all vehicles with enriched popups.
  - Recorridos: lets you pick a vehicle and shows its track for a fixed range (últimos 7 días). It draws a blue polyline with green (start) and red (end) markers.
- Legend appears in the Tracks tab.
- If `/api/fleet` fails, the Live tab uses the bundled sample to let you test the UI.

## Data shape notes
- Upstream may return an array or `{ report: [...] }`. The backend absorbs both and serves consistent shapes.
- Coordinates are always decimal degrees in the proxy responses; the frontend includes a small defensive fallback for `*_mdeg`.
