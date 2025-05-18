import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Enhanced CORS configuration
const allowedOrigins = [
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'https://searchboundaries-production.up.railway.app'
];

// First CORS layer - middleware
app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Second CORS layer - manual headers
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

// Handle preflight requests
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).send();
});

// Your endpoints with additional CORS headers
app.get('/api/arcgis-config', (req, res) => {
    try {
        if (!process.env.ESRI_API_KEY) {
            throw new Error('ESRI_API_KEY is not configured');
        }
        res.header('Access-Control-Allow-Origin', req.headers.origin || allowedOrigins[0]);
        res.json({
            apiKey: process.env.ESRI_API_KEY
        });
    } catch (error) {
        console.error('ArcGIS config error:', error);
        res.status(500).json({ error: error.message });
    }
});

// All other endpoints with the same pattern
const addCorsHeaders = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || allowedOrigins[0]);
    next();
};

// Apply to all API routes
app.get('/api/*', addCorsHeaders);

// Proxy endpoint for Geoapify
app.get('/api/geocode', async (req, res) => {
    try {
        const { text } = req.query;
        const response = await fetch(`https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(text)}&limit=1&apiKey=${process.env.GEOAPIFY}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Proxy endpoint for place details
app.get('/api/place-details', async (req, res) => {
    try {
        const { id } = req.query;
        const response = await fetch(`https://api.geoapify.com/v2/place-details?id=${id}&features=details&apiKey=${process.env.GEOAPIFY}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Proxy endpoint for AccuWeather city search
app.get('/api/weather/city', async (req, res) => {
    try {
        const { q } = req.query;
        const response = await fetch(`https://dataservice.accuweather.com/locations/v1/cities/search?apikey=${process.env.WEATHER_KEY}&q=${encodeURIComponent(q)}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Proxy endpoint for AccuWeather city by coordinates
app.get('/api/weather/location', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        const response = await fetch(`https://dataservice.accuweather.com/locations/v1/cities/geoposition/search?apikey=${process.env.WEATHER_KEY}&q=${lat},${lon}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Proxy endpoint for weather conditions
app.get('/api/weather/conditions', async (req, res) => {
    try {
        const { key } = req.query;
        const response = await fetch(`https://dataservice.accuweather.com/currentconditions/v1/${key}?details=true&apikey=${process.env.WEATHER_KEY}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});