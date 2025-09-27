# Webfleet Leaflet Demo

Demo project that shows how to visualize a fleet on a map using
**Leaflet** and the **WEBFLEET.connect API**.

- **Backend** (Node/Express): loads credentials from `.env`, calls
  `showObjectReportExtern`, exposes `/api/fleet`.
- **Frontend** (HTML/CSS/JS): Leaflet map that displays vehicles.
  Falls back to sample data if backend fails.

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

## Endpoints

- **Fleet snapshot**:

      action=showObjectReportExtern&account=...&apikey=...&username=...&password=...&outputformat=json

- **Vehicle history**:

      action=showPosition&objectno=VEHICLE_ID&fromdatetime=...&todatetime=...&outputformat=json

## Notes

- Request limits apply (contract-specific).
- Adjust auto-refresh (15–60 s) to stay within limits.
- Webfleet Remote API base URL: https://csv.webfleet.com/extern

## Backend proxy: /api/fleet (showObjectReportExtern)

This project shows your WEBFLEET vehicles on a Leaflet map using the snapshot endpoint `action=showObjectReportExtern`.

What the backend does
- Calls WEBFLEET CSV API with outputformat=json and helper flags:
  - outputformat=json → JSON responses instead of CSV
  - useISO8601=true → ISO date-times
  - useUTF8=true → proper accents/ñ
  - useMerdeg=true → adds latitude_mdeg/longitude_mdeg
- Normalizes coordinates server-side from million-degrees to decimal degrees, so the frontend doesn’t need to parse formats like 43°… N.
- Returns a stable structure: `{ report: Array<Vehicle> }` with `latitude`/`longitude` already in decimal degrees.

Environment variables required (backend/.env)
- API_BASE: e.g. https://csv.webfleet.com/extern
- WEBFLEET_ACCOUNT
- WEBFLEET_APIKEY
- WEBFLEET_USERNAME
- WEBFLEET_PASSWORD
- WEBFLEET_LANG (optional, defaults to "en")

Run locally
- cd backend && npm install && npm run dev
- Open http://localhost:3000

Test the API directly
```
curl http://localhost:3000/api/fleet | jq
```

Notes on data shape
- The upstream API sometimes returns an array or wraps data under `{ report: [...] }`. The backend absorbs both and always returns `{ report: [...] }` with normalized coordinates.
- The frontend keeps a small defensive fallback for `*_mdeg`, but normally it consumes the already-normalized `latitude` and `longitude`.
