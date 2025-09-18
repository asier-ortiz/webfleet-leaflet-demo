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
