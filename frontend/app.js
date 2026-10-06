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

// Weather icon — adapted for OpenWeather "main" + "description" values
function getWeatherIcon(weatherMain, weatherDescription, isDayTime) {
    const main = (weatherMain || '').toLowerCase();
    const desc = (weatherDescription || '').toLowerCase();

    if (main.includes('clear')) {
        return isDayTime ? 'fas fa-sun weather-sun' : 'fas fa-moon weather-moon';
    }
    if (main.includes('cloud')) {
        if (desc.includes('few') || desc.includes('scattered')) {
            return isDayTime ? 'fas fa-cloud-sun' : 'fas fa-cloud-moon';
        }
        return 'fas fa-cloud';
    }
    if (main.includes('rain') || main.includes('drizzle')) {
        return 'fas fa-cloud-rain';
    }
    if (main.includes('snow')) {
        return 'fas fa-snowflake';
    }
    if (main.includes('thunder')) {
        return 'fas fa-bolt';
    }
    if (
        main.includes('mist') || main.includes('fog') || main.includes('haze') ||
        main.includes('smoke') || main.includes('dust') || main.includes('sand') ||
        main.includes('ash')
    ) {
        return 'fas fa-smog';
    }
    if (main.includes('squall') || main.includes('tornado')) {
        return 'fas fa-wind';
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

/* ------------------------------------------------------------------
   SEARCH LOADER CONTROLS
   ------------------------------------------------------------------ */
const searchLoader = document.getElementById("search-loader");
let isSearching = false; // guards against duplicate submissions

function showSearchLoader() {
    searchLoader.classList.add("visible");
    searchLoader.setAttribute("aria-hidden", "false");
}

function hideSearchLoader() {
    searchLoader.classList.remove("visible");
    searchLoader.setAttribute("aria-hidden", "true");
}

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

    let secondsElapsed = 0;
    const timerElement = document.getElementById("wake-timer");
    timerElement.textContent = `Elapsed time: 0s`;

    const timerInterval = setInterval(() => {
        secondsElapsed++;
        timerElement.textContent = `Elapsed time: ${secondsElapsed}s`;
    }, 1000);

    try {
        const apiKey = await loadArcGISConfig();

        clearInterval(timerInterval);
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

                // ---- Duplicate-submission guard ----
                if (isSearching) {
                    console.log("Search already in progress — ignoring click.");
                    return;
                }

                const input = document.getElementById("searchBoundarie");
                const cityName = input.value.trim();
                if (!cityName) return;

                isSearching = true;
                showSearchLoader();

                // Helper so we always hide the loader, no matter what path we exit by
                let loaderHidden = false;
                const hideLoaderOnce = () => {
                    if (!loaderHidden) {
                        loaderHidden = true;
                        hideSearchLoader();
                    }
                };

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

                        // FIX: use Geoapify's real place coordinates, not the bbox midpoint. 

                        const placeLat = Number(placeProperties.lat);
                        const placeLon = Number(placeProperties.lon);

                        // Fallback to bbox midpoint ONLY if Geoapify didn't return coords
                        const hasPlaceCoords = Number.isFinite(placeLat) && Number.isFinite(placeLon);
                        const weatherLat = hasPlaceCoords ? placeLat : (minY + maxY) / 2;
                        const weatherLon = hasPlaceCoords ? placeLon : (minX + maxX) / 2;

                        // ============================================================
                        // Hide the loader right before the zoom animation starts.
                        // ============================================================
                        hideLoaderOnce();
                        isSearching = false;

                        await view.goTo({ target: mercatorExtent }, { duration: 2000, easing: "ease-in-out" });

                        if (isCity) {
                            const suggestedName = placeProperties.city || placeProperties.name;

                            let weatherData;
                            try {
                                // Primary: OpenWeather directly with the place's real coordinates
                                weatherData = await fetchAPI('weather/conditions', {
                                    lat: weatherLat,
                                    lon: weatherLon
                                });
                                if (!weatherData || !weatherData.main) {
                                    throw new Error("Weather not available by coordinates");
                                }
                            } catch (coordError) {
                                // Fallback: get coordinates by city name via Geocoding
                                console.log("Falling back to name-based search:", coordError.message);
                                const cityData = await fetchAPI('weather/city', { q: suggestedName });

                                if (!Array.isArray(cityData) || cityData.length === 0) {
                                    console.error("Invalid cityData received from backend:", cityData);
                                    throw new Error("City not found or OpenWeather API error");
                                }

                                const { lat, lon } = cityData[0];
                                weatherData = await fetchAPI('weather/conditions', { lat, lon });
                                if (!weatherData || !weatherData.main) {
                                    throw new Error("Weather not available for this city");
                                }
                            }

                            // Day/Night detection from sunrise / sunset (unix, UTC)
                            const now = weatherData.dt;
                            const sunrise = weatherData.sys?.sunrise ?? 0;
                            const sunset = weatherData.sys?.sunset ?? 0;
                            const isDayTime = now >= sunrise && now < sunset;

                            const weatherMain = weatherData.weather?.[0]?.main ?? "Clear";
                            const weatherDesc = weatherData.weather?.[0]?.description ?? "clear sky";
                            const temperature = weatherData.main?.temp ?? "N/A";
                            const humidity = weatherData.main?.humidity ?? "N/A";
                            const cloudCover = weatherData.clouds?.all ?? "N/A";

                            const weatherIcon = getWeatherIcon(weatherMain, weatherDesc, isDayTime);
                            const tempIcon = getTemperatureIcon(temperature);
                            const humidityIcon = getHumidityIcon(humidity);

                            // Display the coordinates actually used for weather
                            const displayedLat = weatherData.coord?.lat ?? weatherLat;
                            const displayedLon = weatherData.coord?.lon ?? weatherLon;

                            const popupContent = `
    <div class="weather-info-item">
        <i class="fas fa-${isDayTime ? 'clock day-time-icon' : 'clock night-time-icon'}"></i>
        ${isDayTime ? 'Day Time' : 'Night Time'}
    </div>
    <div class="weather-info-item">
        <i class="${weatherIcon}"></i>
        ${weatherDesc} conditions
    </div>
    <div class="weather-info-item">
        <i class="${tempIcon}"></i>
        ${temperature}°C
    </div>
    <div class="weather-info-item">
        <i class="${humidityIcon}"></i>
        ${humidity}% Humidity
    </div>
    <div class="weather-info-item">
        <i class="fas fa-cloud"></i>
        ${cloudCover}% Cloud cover
    </div>
    <div class="weather-info-item">
        <i class="fas fa-location-dot"></i>
        ${Number(displayedLat).toFixed(4)}, ${Number(displayedLon).toFixed(4)}
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
                    hideLoaderOnce();
                    alert("Error: " + error.message);
                } finally {
                    // Safety net: always release the guard and hide the loader
                    hideLoaderOnce();
                    isSearching = false;
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