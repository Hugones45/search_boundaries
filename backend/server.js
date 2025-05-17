import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In your backend app.js
app.get('/api/arcgis-config', (req, res) => {
    try {
        if (!process.env.ESRI_API_KEY) {
            throw new Error('ESRI_API_KEY is not configured');
        }
        res.json({
            apiKey: process.env.ESRI_API_KEY
        });
    } catch (error) {
        console.error('ArcGIS config error:', error);
        res.status(500).json({ error: error.message });
    }
});

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
