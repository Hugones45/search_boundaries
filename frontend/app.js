const popupWapper = document.querySelector(".popup-wrapper");
const aboutPro = document.querySelector(".about-pro");

aboutPro.addEventListener("click", e => {
    popupWapper.style.display = 'block';
});

popupWapper.addEventListener('click', e => {
    const targetValue = e.target.classList[0];
    const toClose = ["popup-close", "popup-wrapper"];
    const condition = toClose.some((item) => item === targetValue);

    if (condition) {
        popupWapper.style.display = 'none';
    }
});

// Improved weather icon function
function getWeatherIcon(weatherText, isDayTime) {
    const weather = weatherText.toLowerCase();

    if (weather.includes('sunny') || weather.includes('clear')) {
        return isDayTime ? 'fas fa-sun weather-sun' : 'fas fa-moon weather-moon';
    } else if (weather.includes('partly cloudy')) {
        return isDayTime ? 'fas fa-cloud-sun' : 'fas fa-cloud-moon';
    } else if (weather.includes('cloud')) {
        return 'fas fa-cloud';
    } else if (weather.includes('rain')) {
        return 'fas fa-cloud-rain';
    } else if (weather.includes('snow')) {
        return 'fas fa-snowflake';
    } else if (weather.includes('thunder') || weather.includes('storm')) {
        return 'fas fa-bolt';
    } else if (weather.includes('fog') || weather.includes('haze')) {
        return 'fas fa-smog';
    }
    return isDayTime ? 'fas fa-sun weather-sun' : 'fas fa-moon weather-moon';
}

function getTemperatureIcon(temp) {
    if (temp === "N/A") return 'fas fa-thermometer';
    const temperature = parseFloat(temp);
    if (temperature > 30) return 'fas fa-temperature-high';
    if (temperature > 20) return 'fas fa-temperature-half';
    return 'fas fa-temperature-low';
}

function getHumidityIcon(humidity) {
    if (humidity === "N/A") return 'fas fa-tint';
    const level = parseFloat(humidity);
    if (level > 80) return 'fas fa-tint high';
    if (level > 50) return 'fas fa-tint medium';
    return 'fas fa-tint low';
}

// Base URL configuration
const DEV_MODE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = DEV_MODE
    ? 'http://localhost:3000'
    : 'https://search-boundaries.onrender.com';

async function fetchAPI(endpoint, params = {}) {
    const url = new URL(`${API_BASE_URL}/api/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
    });

    try {
        const response = await fetch(url, {
            mode: 'cors',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

let view;
let currentPopupContainer = null;
let popupInfo = null;

async function loadArcGISConfig() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/arcgis-config`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return (await response.json()).apiKey;
    } catch (error) {
        console.error('Failed to load ArcGIS config:', error);
        throw error;
    }
}

async function initMap() {

    document.getElementById("loading-backend").style.display = "flex";

    try {
        const apiKey = await loadArcGISConfig();

        document.getElementById("loading-backend").style.display = "none";

        await new Promise((resolve) => {
            require(["esri/config"], (esriConfig) => {
                esriConfig.apiKey = apiKey;
                resolve();
            });
        });

        require([
            "esri/Map",
            "esri/views/MapView",
            "esri/Graphic",
            "esri/layers/GraphicsLayer",
            "esri/geometry/Extent",
            "esri/geometry/support/webMercatorUtils",
            "esri/widgets/BasemapGallery",
            "esri/widgets/Expand"
        ], (Map, MapView, Graphic, GraphicsLayer, Extent, webMercatorUtils, BasemapGallery, Expand) => {

            const map = new Map({ basemap: "arcgis-imagery" });
            const graphicsLayer = new GraphicsLayer();
            map.add(graphicsLayer);

            view = new MapView({
                container: "viewDiv",
                map: map,
                center: [-30, 10],
                zoom: 3
            });

            view.on("pointer-move", async (event) => {
                const response = await view.hitTest(event);
                const graphic = response.results.find(r => r.graphic.layer === graphicsLayer);
                view.container.style.cursor = graphic ? "pointer" : "default";
            });

            view.on("click", async (event) => {
                if (!popupInfo) return;

                const response = await view.hitTest(event);
                const graphic = response.results.find(r => r.graphic.layer === graphicsLayer);

                if (graphic && popupInfo) {
                    if (currentPopupContainer) {
                        currentPopupContainer.remove();
                    }

                    const popupContainer = document.createElement("div");
                    const isDayTime = popupInfo.isDayTime;
                    const themeClass = isDayTime ? 'day-theme' : 'night-theme';
                    popupContainer.className = `custom-popup-container ${themeClass}`;
                    popupContainer.innerHTML = `
                        <h2>${popupInfo.title}</h2>
                        <div class="popup-content">${popupInfo.content}</div>
                        <span class="popup-close">×</span>
                    `;

                    document.body.appendChild(popupContainer);
                    currentPopupContainer = popupContainer;

                    popupContainer.querySelector('.popup-close').addEventListener('click', () => {
                        popupContainer.remove();
                        currentPopupContainer = null;
                    });
                }
            });

            let basemapGallery = new BasemapGallery({ view: view });
            const basemapGalleryExpand = new Expand({
                view: view,
                content: basemapGallery,
                expandIcon: "basemap"
            });

            view.ui.add(basemapGalleryExpand, { position: "bottom-right" });

            const searchForm = document.querySelector(".the-search-places");
            searchForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const input = document.getElementById("searchBoundarie");
                const cityName = input.value.trim();
                if (!cityName) return;

                try {
                    graphicsLayer.removeAll();
                    if (currentPopupContainer) {
                        currentPopupContainer.remove();
                        currentPopupContainer = null;
                    }
                    popupInfo = null;

                    const placeData = await fetchAPI('geocode', { text: cityName });
                    if (!placeData.features || placeData.features.length === 0) {
                        throw new Error("Boundaries not found");
                    }

                    const placeId = placeData.features[0].properties.place_id;
                    const placeType = placeData.features[0].properties.result_type;
                    const placeProperties = placeData.features[0].properties;
                    const isCity = !['country', 'state', 'region'].includes(placeType);

                    const boundaryData = await fetchAPI('place-details', { id: placeId });
                    if (!boundaryData.features) throw new Error("No boundary features found");

                    const boundaryFeature = boundaryData.features.find(f => f.properties.feature_type === 'details');
                    if (!boundaryFeature) throw new Error("Boundaries not available");

                    const geojson = boundaryFeature.geometry;
                    if (geojson && geojson.coordinates) {
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                        const processCoordinates = (coords) => {
                            coords.forEach(coord => {
                                if (Array.isArray(coord[0])) {
                                    processCoordinates(coord);
                                } else {
                                    const [x, y] = coord;
                                    minX = Math.min(minX, x);
                                    minY = Math.min(minY, y);
                                    maxX = Math.max(maxX, x);
                                    maxY = Math.max(maxY, y);
                                }
                            });
                        };

                        processCoordinates(geojson.coordinates);
                        const geographicExtent = new Extent({
                            xmin: minX, ymin: minY, xmax: maxX, ymax: maxY,
                            spatialReference: { wkid: 4326 }
                        });

                        const mercatorExtent = webMercatorUtils.geographicToWebMercator(geographicExtent);
                        const rings = geojson.type === "Polygon" ? geojson.coordinates : geojson.coordinates.flat();

                        rings.forEach(ring => {
                            const polygonGraphic = new Graphic({
                                geometry: { type: "polygon", rings: ring, spatialReference: { wkid: 4326 } },
                                symbol: {
                                    type: "simple-fill",
                                    color: [100, 149, 237, 0.2],
                                    outline: { color: [62, 59, 227, 0.7], width: 2 }
                                }
                            });
                            graphicsLayer.add(polygonGraphic);
                        });

                        await view.goTo({ target: mercatorExtent }, { duration: 2000, easing: "ease-in-out" });

                        if (isCity) {
                            const centerLong = (minX + maxX) / 2;
                            const centerLat = (minY + maxY) / 2;
                            const suggestedName = placeProperties.city || placeProperties.name;

                            let weatherData;
                            try {
                                const locationData = await fetchAPI('weather/location', { lat: centerLat, lon: centerLong });
                                if (locationData && locationData.Key) {
                                    weatherData = await fetchAPI('weather/conditions', { key: locationData.Key });
                                } else {
                                    throw new Error("No location found by coordinates");
                                }
                            } catch (coordError) {
                                console.log("Falling back to name-based search:", coordError.message);
                                const cityData = await fetchAPI('weather/city', { q: suggestedName });
                                if (!cityData || cityData.length === 0) throw new Error("City not found");
                                weatherData = await fetchAPI('weather/conditions', { key: cityData[0].Key });
                            }

                            const isDayTime = weatherData[0]?.IsDayTime ?? true;
                            const weatherIcon = getWeatherIcon(
                                weatherData[0]?.WeatherText ?? "Clear",
                                isDayTime
                            );
                            const tempIcon = getTemperatureIcon(weatherData[0]?.Temperature?.Metric?.Value ?? "N/A");
                            const humidityIcon = getHumidityIcon(weatherData[0]?.RelativeHumidity ?? "N/A");

                            const popupContent = `
   <div class="weather-info-item">
        <i class="fas fa-${isDayTime ? 'clock day-time-icon' : 'clock night-time-icon'}"></i>
        ${isDayTime ? 'Day Time' : 'Night Time'}
    </div>
    <div class="weather-info-item">
        <i class="${weatherIcon}"></i>
        ${weatherData[0]?.WeatherText ?? "N/A"} conditions
    </div>
    <div class="weather-info-item">
        <i class="${tempIcon}"></i>
        ${weatherData[0]?.Temperature?.Metric?.Value ?? "N/A"}°C
    </div>
    <div class="weather-info-item">
        <i class="${humidityIcon}"></i>
        ${weatherData[0]?.RelativeHumidity ?? "N/A"}% Humidity
    </div>
    <div class="weather-info-item">
        <i class="fas fa-cloud"></i>
        ${weatherData[0]?.CloudCover ?? "N/A"}% Cloud cover
    </div>
    <div class="weather-info-item">
        <i class="fas fa-location-dot"></i>
        ${centerLat.toFixed(4)}, ${centerLong.toFixed(4)}
    </div>
`;

                            popupInfo = {
                                title: `${suggestedName[0].toUpperCase()}${suggestedName.slice(1)}`,
                                content: popupContent,
                                isDayTime: isDayTime,
                                weatherIcon: weatherIcon
                            };

                            const popupContainer = document.createElement("div");
                            const themeClass = isDayTime ? 'day-theme' : 'night-theme';
                            popupContainer.className = `custom-popup-container ${themeClass}`;
                            popupContainer.innerHTML = `
                                <h2>${popupInfo.title}</h2>
                                <div class="popup-content">${popupContent}</div>
                                <span class="popup-close">×</span>
                            `;

                            document.body.appendChild(popupContainer);
                            currentPopupContainer = popupContainer;

                            popupContainer.querySelector('.popup-close').addEventListener('click', () => {
                                popupContainer.remove();
                                currentPopupContainer = null;
                            });
                        }
                    }
                } catch (error) {
                    console.error("Search error:", error);
                    alert("Error: " + error.message);
                }
            });
        });
    } catch (error) {
        console.error('Failed to initialize map:', error);
        document.getElementById("loading-backend").innerHTML = `
        <div class="loading-text">
            <i class="fas fa-triangle-exclamation"></i>
            Failed to connect to server. Please try again later.
        </div>`;
    }
}

initMap();