import express from "express";
import dotenv from "dotenv";
import { getFleetSnapshot } from "./src/webfleetClient.js";
import { getVehicleTrack } from "./src/trackClient.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve frontend as static files
app.use(express.static("../frontend"));

// API endpoint: fleet snapshot
app.get("/api/fleet", async (req, res) => {
    try {
        const data = await getFleetSnapshot();
        if (data.errorCode) {
            return res.status(400).json({ error: data });
        }
        res.json(data);
    } catch (err) {
        console.error("Backend error:", err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// Helper to compute date range presets
function rangePreset(preset) {
    const now = new Date();
    const end = new Date(now);
    let start;
    switch (preset) {
        case 'today':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'yesterday': {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            end.setTime(d.getTime());
            start = new Date(d.getTime() - 24*60*60*1000);
            break;
        }
        case 'last7':
            start = new Date(end.getTime() - 7*24*60*60*1000);
            break;
        case 'last30':
            start = new Date(end.getTime() - 30*24*60*60*1000);
            break;
        default:
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    return { start, end };
}

// API endpoint: vehicle track (history)
app.get("/api/tracks", async (req, res) => {
    try {
        const { objectno, preset, from, to } = req.query;
        if (!objectno) return res.status(400).json({ error: "Missing objectno" });

        let data;
        if (from && to) {
            data = await getVehicleTrack({ objectno, from: new Date(from), to: new Date(to) });
        } else {
            data = await getVehicleTrack({ objectno, preset: preset || 'today' });
        }
        if (data.errorCode) return res.status(400).json({ error: data });
        res.json(data);
    } catch (err) {
        console.error("Backend error (tracks):", err.message);
        res.status(500).json({ error: "Server error" });
    }
});


app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
