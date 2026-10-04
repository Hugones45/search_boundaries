import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'https://search-boundaries.onrender.com',
    'https://search-world-boundaries.vercel.app'
];

// CORS layer 1 - middleware
app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// CORS layer 2 - manual headers
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    next();
});

// Preflight
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).send();
});

// ArcGIS config
app.get('/api/arcgis-config', (req, res) => {
    try {
        if (!process.env.ESRI_API_KEY) {
            throw new Error('ESRI_API_KEY is not configured');
        }
        res.header('Access-Control-Allow-Origin', req.headers.origin || allowedOrigins[0]);
        res.json({ apiKey: process.env.ESRI_API_KEY });
    } catch (error) {
        console.error('ArcGIS config error:', error);
        res.status(500).json({ error: error.message });
    }
});

const addCorsHeaders = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || allowedOrigins[0]);
    next();
};
app.get('/api/*', addCorsHeaders);

// ---------- Geoapify proxies (unchanged) ----------

app.get('/api/geocode', async (req, res) => {
    try {
        const { text } = req.query;
        const response = await fetch(
            `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(text)}&limit=1&apiKey=${process.env.GEOAPIFY}`
        );
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/place-details', async (req, res) => {
    try {
        const { id } = req.query;
        const response = await fetch(
            `https://api.geoapify.com/v2/place-details?id=${id}&features=details&apiKey=${process.env.GEOAPIFY}`
        );
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- OpenWeather proxies ----------

// Current weather by coordinates (main endpoint used by the frontend)
app.get('/api/weather/conditions', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ error: 'lat and lon are required' });
        }
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Geocoding (fallback by city name) — returns an array of locations with lat/lon
app.get('/api/weather/city', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'q is required' });
        }
        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${process.env.OPENWEATHER_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});