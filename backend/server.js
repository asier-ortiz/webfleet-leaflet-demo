import express from "express";
import dotenv from "dotenv";
import { getFleetSnapshot } from "./src/webfleetClient.js";

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

app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
