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

// Base URL configuration
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://searchboundaries-production.up.railway.app';

async function fetchAPI(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE_URL}/api/${endpoint}?${queryString}`);
    if (!response.ok) {
        const error = await response.text();
        console.error('API Error:', error);
        throw new Error(error);
    }
    return response.json();
}

let view;

async function loadArcGISConfig() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/arcgis-config`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const config = await response.json();
        return config.apiKey;
    } catch (error) {
        console.error('Failed to load ArcGIS config:', error);
        throw error;
    }
}

async function initMap() {
    try {
        const apiKey = await loadArcGISConfig();

        // Configure the ArcGIS API before loading other modules
        await new Promise((resolve) => {
            require(["esri/config"], (esriConfig) => {
                esriConfig.apiKey = apiKey;
                resolve();
            });
        });

        // Now load the rest of the ArcGIS modules
        require([
            "esri/Map",
            "esri/views/MapView",
            "esri/Graphic",
            "esri/layers/GraphicsLayer",
            "esri/geometry/Extent",
            "esri/geometry/support/webMercatorUtils"
        ], (Map, MapView, Graphic, GraphicsLayer, Extent, webMercatorUtils) => {

            document.querySelector("#styleCombobox").addEventListener("calciteComboboxChange", (event) => {
                map.basemap = event.target.value;
            });

            const map = new Map({
                basemap: "arcgis-topographic"
            });

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

            let popupInfo = null;
            view.popupEnabled = false;

            view.on("click", async (event) => {
                if (!popupInfo) return;
                const response = await view.hitTest(event);
                const graphic = response.results.find(r => r.graphic.layer === graphicsLayer);
                if (graphic) {
                    view.openPopup(popupInfo);
                }
            });

            const searchForm = document.querySelector(".the-search-places");

            searchForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const input = document.getElementById("searchBoundarie");
                const cityName = input.value.trim();
                if (!cityName) return;

                try {
                    graphicsLayer.removeAll();
                    view.closePopup();
                    popupInfo = null;

                    const existingSuggestions = document.querySelectorAll('.name-suggestion');
                    existingSuggestions.forEach(el => el.remove());

                    const placeData = await fetchAPI('geocode', { text: cityName });

                    if (!placeData.features || placeData.features.length === 0) {
                        throw new Error("Boundaries not found");
                    }

                    const placeId = placeData.features[0].properties.place_id;
                    const placeType = placeData.features[0].properties.result_type;
                    const placeProperties = placeData.features[0].properties;
                    const isCity = !['country', 'state', 'region'].includes(placeType);

                    const boundaryData = await fetchAPI('place-details', { id: placeId });

                    if (!boundaryData.features) {
                        throw new Error("No boundary features found");
                    }

                    const boundaryFeature = boundaryData.features.find(f => f.properties.feature_type === 'details');
                    if (!boundaryFeature) {
                        throw new Error("Boundaries not available");
                    }

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
                            xmin: minX,
                            ymin: minY,
                            xmax: maxX,
                            ymax: maxY,
                            spatialReference: { wkid: 4326 }
                        });

                        const mercatorExtent = webMercatorUtils.geographicToWebMercator(geographicExtent);

                        const rings = geojson.type === "Polygon"
                            ? geojson.coordinates
                            : geojson.coordinates.flat();

                        rings.forEach(ring => {
                            const polygonGraphic = new Graphic({
                                geometry: {
                                    type: "polygon",
                                    rings: ring,
                                    spatialReference: { wkid: 4326 }
                                },
                                symbol: {
                                    type: "simple-fill",
                                    color: [100, 149, 237, 0.2],
                                    outline: {
                                        color: [62, 59, 227, 0.7],
                                        width: 2
                                    }
                                }
                            });
                            graphicsLayer.add(polygonGraphic);
                        });

                        await view.goTo({
                            target: mercatorExtent,
                        }, {
                            duration: 2000,
                            easing: "ease-in-out"
                        });

                        if (isCity) {
                            const centerLong = (minX + maxX) / 2;
                            const centerLat = (minY + maxY) / 2;
                            const suggestedName = placeProperties.city || placeProperties.name;

                            let weatherData;
                            try {
                                const locationData = await fetchAPI('weather/location', {
                                    lat: centerLat,
                                    lon: centerLong
                                });

                                if (locationData && locationData.Key) {
                                    weatherData = await fetchAPI('weather/conditions', {
                                        key: locationData.Key
                                    });
                                } else {
                                    throw new Error("No location found by coordinates");
                                }
                            } catch (coordError) {
                                console.log("Falling back to name-based search:", coordError.message);
                                const cityData = await fetchAPI('weather/city', { q: suggestedName });
                                if (!cityData || cityData.length === 0) throw new Error("City not found");
                                weatherData = await fetchAPI('weather/conditions', { key: cityData[0].Key });
                            }

                            const popupContent = `
                                Latitude: ${centerLat.toFixed(4)} <br>
                                Longitude: ${centerLong.toFixed(4)} <br>
                                Cloud cover: ${weatherData[0]?.CloudCover ?? "N/A"}%<br>
                                Temperature: ${weatherData[0]?.Temperature?.Metric?.Value ?? "N/A"}°C<br>
                                Humidity: ${weatherData[0]?.RelativeHumidity ?? "N/A"}%<br>
                                Weather: ${weatherData[0]?.WeatherText ?? "N/A"}<br>
                                Day or Night? ${weatherData[0]?.IsDayTime ? "Day" : "Night"}
                            `;

                            popupInfo = {
                                title: `${suggestedName[0].toUpperCase()}${suggestedName.slice(1)}`,
                                content: popupContent,
                                location: {
                                    longitude: centerLong,
                                    latitude: centerLat
                                }
                            };

                            view.openPopup(popupInfo);
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
        alert('Failed to initialize the map. Please try again later.');
    }
}

// Initialize the map
initMap();