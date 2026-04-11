// app.js
document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');
  const locationInput = document.getElementById('location-input');
  
  // Elements
  const alertsContainer = document.getElementById('alerts-container');
  const risksContainer = document.getElementById('risks-container');
  const hourlyGrid = document.getElementById('hourly-grid');
  const forecastGrid = document.getElementById('forecast-grid');
  const loadingIndicator = document.getElementById('loading-indicator');
  const metarStation = document.getElementById('metar-station');
  const metarData = document.getElementById('metar-data');
  const tafStation = document.getElementById('taf-station');
  const tafData = document.getElementById('taf-data');
  const discussionData = document.getElementById('discussion-data');
  const geoButton = document.getElementById('geo-button');
  const refreshSelect = document.getElementById('auto-refresh-select');
  const clockContainer = document.getElementById('clock-container');
  const solarContainer = document.getElementById('solar-container');
  
  // Global State
  let map, radarLayer, locationMarker;
  let isDarkMode = false;
  let baseLayer;
  let currentLat = null;
  let currentLon = null;
  let refreshTimerId = null;
  let clockTimerId = null;

  function initMap() {
    map = L.map('radar-map').setView([39.828, -98.579], 4); 
    baseLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    radarLayer = L.tileLayer.wms("https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi", {
        layers: 'nexrad-n0q-900913',
        format: 'image/png',
        transparent: true,
        opacity: 0.7
    }).addTo(map);

    const themeBtn = document.getElementById('map-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        themeBtn.innerText = isDarkMode ? "Switch to Light Map" : "Switch to Dark Map";
        baseLayer.setUrl(isDarkMode ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png');
      });
    }
  }
  
  initMap();

  function formatMilitaryTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date)) return '';
    return `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  }

  // --- Auto Refresh Logic ---
  if (refreshSelect) {
    refreshSelect.addEventListener('change', (e) => { setupAutoRefresh(parseInt(e.target.value)); });
  }

  function setupAutoRefresh(minutes) {
    if (refreshTimerId) clearInterval(refreshTimerId);
    if (minutes > 0 && currentLat !== null && currentLon !== null) {
      refreshTimerId = setInterval(() => {
        console.log(`Auto-refreshing dashboard data... (${minutes} min)`);
        fetchDashboardDataByCoords(currentLat, currentLon, true);
      }, minutes * 60 * 1000); // ms conversion
    }
  }

  // --- Clock & Solar Geometrics ---
  function startClocks(timeZone) {
    if (clockTimerId) clearInterval(clockTimerId);
    if (!timeZone) return;
    clockContainer.classList.remove('hidden');
    function update() {
      const now = new Date();
      try {
        const localStr = now.toLocaleTimeString('en-US', { timeZone: timeZone, hour12: false, hour: '2-digit', minute:'2-digit' });
        const zuluStr = now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false, hour: '2-digit', minute:'2-digit' }) + 'Z';
        clockContainer.innerHTML = `<span class="clock-label">LCL:</span> ${localStr} &nbsp; <span class="clock-label">Z:</span> ${zuluStr}`;
      } catch (e) {
        clockContainer.innerHTML = 'Clock Error';
      }
    }
    update();
    clockTimerId = setInterval(update, 60000);
  }

  async function fetchSunriseSunset(lat, lon) {
    if (!solarContainer) return;
    solarContainer.classList.add('hidden');
    try {
      const res = await fetch(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`);
      const data = await res.json();
      if (data.status === "OK") {
        // Output as strictly 24hr military time to align with requirements
        const sunrise = new Date(data.results.sunrise).toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute:'2-digit'});
        const sunset = new Date(data.results.sunset).toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute:'2-digit'});
        solarContainer.innerHTML = `☀ Rise: ${sunrise} | Set: ${sunset}`;
        solarContainer.classList.remove('hidden');
      }
    } catch(e) { } // safe fail
  }

  // --- Search & Geolocation Config ---
  if (geoButton) {
    geoButton.addEventListener('click', () => {
      if ("geolocation" in navigator) {
        geoButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
             const lat = pos.coords.latitude;
             const lon = pos.coords.longitude;
             locationInput.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
             geoButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="spin" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`;
             fetchDashboardDataByCoords(lat, lon);
          },
          (err) => {
             geoButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`;
             alert("Geolocation failed: " + err.message);
          }
        );
      } else { alert("Geolocation not supported by your browser."); }
    });
  }

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = locationInput.value.trim();
    if (!query) return;

    clearUI();
    loadingIndicator.classList.remove('hidden');

    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
      const geoData = await geoRes.json();
      if (!geoData || geoData.length === 0) throw new Error("Location not found.");
      fetchDashboardDataByCoords(geoData[0].lat, geoData[0].lon);
    } catch (err) { handleError(err); }
  });

  // --- Core API Processor Algorithm ---
  async function fetchDashboardDataByCoords(lat, lon, isRefresh = false) {
    currentLat = lat;
    currentLon = lon;
    if (geoButton) geoButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`;

    if (refreshSelect) setupAutoRefresh(parseInt(refreshSelect.value));
    
    if (!isRefresh) {
      clearUI();
      loadingIndicator.classList.remove('hidden');
    }

    try {
      map.setView([lat, lon], 8);
      if (locationMarker) map.removeLayer(locationMarker);
      locationMarker = L.marker([lat, lon]).addTo(map);
      
      if (radarLayer) map.removeLayer(radarLayer);
      radarLayer = L.tileLayer.wms("https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi?" + new Date().getTime(), {
          layers: 'nexrad-n0q-900913',
          format: 'image/png', transparent: true, opacity: 0.7
      }).addTo(map);

      // Invoke Solar Parallel Execution
      fetchSunriseSunset(lat, lon);

      const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
      if (!pointsRes.ok) throw new Error("Weather data not available for this location.");
      const pointsData = await pointsRes.json();
      
      startClocks(pointsData.properties.timeZone);

      const wfo = pointsData.properties.cwa;
      const forecastUrl = pointsData.properties.forecast;
      const gridUrl = pointsData.properties.forecastGridData;
      const forecastHourlyUrl = pointsData.properties.forecastHourly;
      const stationsUrl = pointsData.properties.observationStations;

      // Extract Grid Raw Properties
      let gridProps = null;
      try {
        const gridRes = await fetch(gridUrl);
        const gridData = await gridRes.json();
        gridProps = gridData.properties;
      } catch(e) { console.warn("Grid API Failed", e); }

      const fetches = [
        fetchForecastExt(forecastUrl, lat, lon, gridProps),
        fetchHourlyForecast(forecastHourlyUrl, gridProps),
        fetchAviation(stationsUrl),
        fetchDiscussion(wfo)
      ];

      await Promise.all(fetches);
    } catch (err) {
      if (!isRefresh) handleError(err);
    } finally {
      loadingIndicator.classList.add('hidden');
    }
  }

  function handleError(err) {
      alertsContainer.innerHTML = `
        <div class="alert-banner">
          <div class="alert-header"><span class="alert-title">System Alert</span></div>
          <div class="alert-desc">${err.message || 'Failed to load weather data streams.'}</div>
        </div>
      `;
      loadingIndicator.classList.add('hidden');
  }

  // --- Translators & Utilities ---
  function getWeatherSVG(shortForecast, isDay) {
    const text = shortForecast.toLowerCase();
    let svg = '';
    if (text.includes('thunder') || text.includes('t-storm') || text.includes('lightning')) {
      svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>`;
    } else if (text.includes('rain') || text.includes('showers') || text.includes('drizzle')) {
      svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`;
    } else if (text.includes('snow') || text.includes('ice') || text.includes('flurries')) {
      svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><path d="M8 16h.01"/><path d="M8 20h.01"/><path d="M12 18h.01"/><path d="M12 22h.01"/><path d="M16 16h.01"/><path d="M16 20h.01"/></svg>`;
    } else if (text.includes('cloud') || text.includes('overcast')) {
      svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
    } else {
      if (isDay) { 
        svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
      } else { 
        svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
      }
    }
    return svg;
  }

  function getGridVals(valuesArr, matchDateStr) {
     if (!valuesArr) return [];
     return valuesArr.filter(v => typeof v.validTime === 'string' && v.validTime.startsWith(matchDateStr)).map(v => v.value).filter(v => v !== null);
  }

  function getGridRateForHour(valuesArr, hourlyStartTimeStr) {
     if (!valuesArr) return 0;
     const targetTime = new Date(hourlyStartTimeStr).getTime();
     for (let v of valuesArr) {
        const parts = v.validTime.split('/'); // e.g. ["2026-04-11T16:00:00+00:00", "PT6H"]
        const start = new Date(parts[0]).getTime();
        let durationHours = 1;
        if (parts[1] && parts[1].includes('H')) {
           durationHours = parseInt(parts[1].replace('PT', '').replace('H', ''));
        }
        const end = start + (durationHours * 60 * 60 * 1000);
        
        if (targetTime >= start && targetTime < end) {
            return (v.value * 0.0393701) / durationHours; // mm to inches per hour
        }
     }
     return 0;
  }

  // --- Sub Routines ---
  async function fetchHourlyForecast(url, gridProps) {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const periods = data.properties.periods.slice(0, 12);
    
    let html = '';
    periods.forEach(p => {
      const timeStr = formatMilitaryTime(p.startTime);
      const icon = getWeatherSVG(p.shortForecast, p.isDaytime);
      
      // Compute advanced metrics directly mapped from NWS hourly array limits or via gridProps correlation
      const feelTempC = p.apparentTemperature?.value;
      const feelTempF = typeof feelTempC === 'number' ? Math.round((feelTempC * 9/5) + 32) : 'N/A';
      const humidity = p.relativeHumidity?.value || 'N/A';
      const precipProb = p.probabilityOfPrecipitation?.value || 0;
      
      // Extrapolate hourly rate precisely from the quantitative grid boundaries
      const rateInches = getGridRateForHour(gridProps?.quantitativePrecipitation?.values, p.startTime);
      const rateStr = rateInches > 0 ? rateInches.toFixed(3) : '0';

      html += `
        <div class="hourly-card glass-panel" style="min-width: 140px; align-items: stretch;">
          <div class="hourly-time" style="text-align: center;">${timeStr}</div>
          <div style="text-align:center;">${icon}</div>
          <div class="hourly-temp" style="text-align:center;">${p.temperature}&deg;</div>
          
          <div class="forecast-metric"><span class="label">Wind</span> <span> ${p.windSpeed || '0'}</span></div>
          <div class="forecast-metric"><span class="label">Feels Like</span> <span>${feelTempF}&deg;</span></div>
          <div class="forecast-metric"><span class="label">Humidity</span> <span>${humidity}%</span></div>
          <div class="forecast-metric"><span class="label">Precip Prob</span> <span>${precipProb}%</span></div>
          <div class="forecast-metric" style="color:#fcd34d;"><span class="label">Rate</span> <span>${rateStr}"/hr</span></div>
        </div>
      `;
    });
    hourlyGrid.innerHTML = html;
  }

  async function fetchForecastExt(url, lat, lon, gridProps) {
    const [res, alertsRisks] = await Promise.all([ fetch(url), fetchAlertsExt(lat, lon) ]);
    if(!res.ok) return;
    const data = await res.json();
    const periods = data.properties.periods;

    const displayPeriods = periods.slice(0, 14); // 7-Days
    let html = '';
    let hasExtremeHeat = false, hasExtremeCold = false, hasSnowRisk = false, hasLightningRisk = false;

    for (let i = 0; i < displayPeriods.length; i += 2) {
      const day = displayPeriods[i];
      const night = displayPeriods[i+1] || day; 
      
      const t1 = day.temperature;
      const t2 = night.temperature;
      const highTemp = Math.max(t1, t2);
      const lowTemp = Math.min(t1, t2);
      
      if (highTemp >= 100 || lowTemp >= 100) hasExtremeHeat = true;
      if (highTemp <= 32 || lowTemp <= 32) hasExtremeCold = true;
      if (day.shortForecast.toLowerCase().includes('snow') || night.shortForecast.toLowerCase().includes('snow')) hasSnowRisk = true;
      if (day.shortForecast.toLowerCase().includes('thunder') || night.shortForecast.toLowerCase().includes('thunder')) hasLightningRisk = true;

      const rainProb = day.probabilityOfPrecipitation?.value || night.probabilityOfPrecipitation?.value || 0;
      const windSpeed = day.windSpeed;
      
      // Parse Grid Arrays per Period Date
      const targetDate = day.startTime.split('T')[0];
      
      // Relative Humidity
      const rhVals = getGridVals(gridProps?.relativeHumidity?.values, targetDate);
      let rhStr = "N/A";
      if (rhVals.length > 0) rhStr = Math.round(rhVals.reduce((a,b)=>a+b,0)/rhVals.length) + "%";

      // Apparent Temp
      const atVals = getGridVals(gridProps?.apparentTemperature?.values, targetDate);
      let feelStr = "N/A";
      if (atVals.length > 0) {
         let avgC = atVals.reduce((a,b)=>a+b,0)/atVals.length;
         feelStr = Math.round((avgC * 9/5) + 32) + "&deg;F";
      }

      // 24 HR Precipitation sum exactly required in 7 day forecast by user
      const precVals = getGridVals(gridProps?.quantitativePrecipitation?.values, targetDate);
      let precipAccumulationStr = '0.00"';
      if (precVals.length > 0) precipAccumulationStr = (precVals.reduce((a,b)=>a+b,0) * 0.0393701).toFixed(2) + `"`;

      const simpleIcon = getWeatherSVG(day.shortForecast, day.isDaytime);
      html += `
        <div class="forecast-card glass-panel" style="align-items: stretch;">
          <div class="forecast-name" style="text-align:center;">${day.name}</div>
          <div style="text-align:center;">${simpleIcon}</div>
          <div class="forecast-temp" style="justify-content:center;"><span class="high">H: ${highTemp}&deg;</span> <span class="low">L: ${lowTemp}&deg;</span></div>
          <div class="forecast-short" style="text-align:center;">${day.shortForecast.substring(0,40)}</div>
          
          <!-- Detailed Block -->
          <div class="forecast-metric"><span class="label">Wind</span> <span> ${windSpeed}</span></div>
          <div class="forecast-metric"><span class="label">Precip Prob</span> <span>${rainProb}%</span></div>
          <div class="forecast-metric" style="color:#fcd34d;"><span class="label">24 HR Precip</span> <span>${precipAccumulationStr}</span></div>
          <div class="forecast-metric"><span class="label">Humidity</span> <span>${rhStr}</span></div>
          <div class="forecast-metric"><span class="label">Feels Like</span> <span>${feelStr}</span></div>
        </div>
      `;
    }
    forecastGrid.innerHTML = html;

    // Compile Expansion Risk Blocks
    let allRisks = [...alertsRisks];
    if (hasExtremeHeat) allRisks.push({title:'Extreme Heat Activated', desc:'Dangerous heat thresholds breached natively in the simulation bounds. Temperatures are forecast to exceed 100°F. Hydrate rigorously and limit direct outdoor exposure parameters.'});
    if (hasExtremeCold) allRisks.push({title:'Extreme Cold Activated', desc:'Temperatures are currently forecast to drop below freezing (32°F bounds). Ensure vulnerable pipe networks are insulated and sensitive systems are brought inside safely.'});
    if (hasSnowRisk) allRisks.push({title:'Snow Geometry Event', desc:'Accumulation conditions are indicated within the long-term forecast grids natively. Monitor localized road friction models and optical visibility limitations.'});
    if (hasLightningRisk) allRisks.push({title:'Lightning / Thunder', desc:'Elevated atmospheric capacitance risk mapped over the upcoming matrices. Consistently monitor localized thunder formations and rapidly engage interior shelter structures.'});

    if (allRisks.length > 0) {
      risksContainer.innerHTML = allRisks.map(r => `
        <div class="risk-briefing">
          <span class="risk-title">${r.title}</span>
          <span class="risk-value">${r.desc}</span>
        </div>
      `).join('');
    } else { risksContainer.innerHTML = ''; }
  }

  async function fetchAlertsExt(lat, lon) {
    const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
    if(!res.ok) return [];
    const data = await res.json();
    const features = data.features;
    let alertsHtml = '';
    let risks = [];

    if (features.length === 0) {
      alertsContainer.innerHTML = '';
      return risks;
    }

    features.forEach(f => {
      const props = f.properties;
      const startTime = formatMilitaryTime(props.effective);
      const endTime = formatMilitaryTime(props.expires);
      let timeStr = (startTime && endTime) ? `<span class="alert-time">${startTime} - ${endTime}</span>` : '';

      alertsHtml += `<div class="alert-banner"><div class="alert-header"><span class="alert-title">${props.event} (${props.severity})</span>${timeStr}</div><div class="alert-desc">${props.headline || props.description.substring(0, 200) + '...'}</div></div>`;
      
      if (props.parameters) {
        if (props.parameters.maxHailSize && props.parameters.maxHailSize[0]) {
           risks.push({title: 'Severe Hail Threshold', desc:`A severe hail threat mechanism is currently active geometry bounds. Modes dictate hail stones could reach up to ${props.parameters.maxHailSize[0]} in diameter. Seek heavy structural cover.`});
        }
        if (props.parameters.maxWindGust && props.parameters.maxWindGust[0]) {
           risks.push({title: 'Extreme Wind Gusts', desc: `Heavy air displacement limits tracking up to ${props.parameters.maxWindGust[0]} are flagged. Secure loose orbital objects and halt high profile vehicle transits.`});
        }
        if (props.parameters.tornadoDetection && props.parameters.tornadoDetection[0]) {
           risks.push({title: 'Tornado Warning Detection', desc:`A Tornado risk parameter is currently firing dynamically: ${props.parameters.tornadoDetection[0]}. Take absolute immediate structural precautions and monitor localized siren relays.`});
        }
      }
    });

    alertsContainer.innerHTML = alertsHtml;
    const uniqueRisksMap = new Map();
    risks.forEach(r => uniqueRisksMap.set(r.title, r));
    return Array.from(uniqueRisksMap.values());
  }

  // Translates TAF shorthand
  function translateTAF(text) {
     if (!text) return text;
     return text
        .replace(/BKN/g, 'Broken Clouds at ')
        .replace(/OVC/g, 'Overcast Clouds at ')
        .replace(/SCT/g, 'Scattered Clouds at ')
        .replace(/FEW/g, 'Few Clouds at ')
        .replace(/KT/g, ' knots ')
        .replace(/SM/g, ' statute miles ')
        .replace(/TSRA/g, 'Thunderstorm Rain')
        .replace(/SHRA/g, 'Rain Showers')
        .replace(/BR/g, 'Mist')
        .replace(/FM/g, '\n  ▶ From ')
        .replace(/TEMPO/g, '\n  ▶ Temporary Condition: ')
        .replace(/PROB30/g, '\n  ▶ 30% Probability ');
  }

  // Translates NWS JSON observation payload to English
  function translateMETAR(props) {
     if (!props) return "Observation payload missing.";
     let translation = `Current Condition: ${props.textDescription || 'N/A'}\n`;
     if (props.temperature?.value !== null) {
         let f = Math.round(props.temperature.value * 1.8 + 32);
         translation += `Temperature:       ${f}°F (${Math.round(props.temperature.value)}°C)\n`;
     }
     if (props.dewpoint?.value !== null) {
         let df = Math.round(props.dewpoint.value * 1.8 + 32);
         translation += `Dewpoint:          ${df}°F\n`;
     }
     if (props.relativeHumidity?.value !== null) {
         translation += `Humidity:          ${Math.round(props.relativeHumidity.value)}%\n`;
     }
     if (props.windDirection?.value !== null && props.windSpeed?.value !== null) {
         let wT = Math.round(props.windSpeed.value * 0.539957); // kmh to kt
         translation += `Wind Vectors:      ${props.windDirection.value}° at ${wT} knots\n`;
     }
     if (props.visibility?.value !== null) {
         let v = (props.visibility.value * 0.000621371).toFixed(1); // meters to miles
         translation += `Visibility:        ${v} miles\n`;
     }
     return translation;
  }

  async function fetchAviation(stationsUrl) {
    const res = await fetch(stationsUrl);
    if (!res.ok) return;
    const data = await res.json();
    
    if (!data.features || data.features.length === 0) {
      metarData.innerText = "No nearby aviation hubs identified.";
      tafData.innerText = "No nearby aviation hubs identified.";
      return;
    }

    const station = data.features[0].properties.stationIdentifier; 
    metarStation.innerText = `(${station}) TRANSLATED`;
    tafStation.innerText = `(${station}) DECODED`;

    try {
      const metarRes = await fetch(`https://api.weather.gov/stations/${station}/observations/latest`);
      if (metarRes.ok) {
        const metarJson = await metarRes.json();
        // Insert Translated output instead of rawMessage
        metarData.innerText = translateMETAR(metarJson.properties) || "No valid METAR properties found.";
      } else { metarData.innerText = "Error loading METAR telemetry."; }
    } catch(err) { metarData.innerText = "Error loading METAR telemetry."; }

    try {
      const shortStation = station.length === 4 ? station.substring(1) : station;
      const tafListRes = await fetch(`https://api.weather.gov/products/types/TAF/locations/${shortStation}`);
      if (tafListRes.ok) {
        const tafListJson = await tafListRes.json();
        if (tafListJson["@graph"] && tafListJson["@graph"].length > 0) {
          const tafId = tafListJson["@graph"][0]["@id"];
          const tafRes = await fetch(tafId);
          const tafDataJson = await tafRes.json();
          const cleanText = tafDataJson.productText.replace(/\n\s*\n/g, '\n\n');
          // Translate and format properly
          tafData.innerText = translateTAF(cleanText) || "No valid TAF string found.";
        } else { tafData.innerText = "No connected TAF pipelines found."; }
      } else { tafData.innerText = "Error loading TAF structures."; }
    } catch(err) { tafData.innerText = "Error loading TAF structures."; }
  }

  async function fetchDiscussion(wfo) {
    try {
      const listRes = await fetch(`https://api.weather.gov/products/types/AFD/locations/${wfo}`);
      if (!listRes.ok) throw new Error("No discussion available.");
      const listData = await listRes.json();
      
      if(listData["@graph"] && listData["@graph"].length > 0) {
        const docId = listData["@graph"][0]["@id"];
        const textRes = await fetch(docId);
        const textData = await textRes.json();
        discussionData.innerText = textData.productText.replace(/\n\s*\n/g, '\n\n');
      } else { discussionData.innerText = "No ambient discussion payloads."; }
    } catch (err) { discussionData.innerText = "Discussion parsing failure.\n" + err.message; }
  }

  function clearUI() {
    alertsContainer.innerHTML = '';
    risksContainer.innerHTML = '';
    hourlyGrid.innerHTML = '';
    forecastGrid.innerHTML = '';
    metarStation.innerText = '';
    metarData.innerText = 'Loading...';
    tafStation.innerText = '';
    tafData.innerText = 'Loading...';
    discussionData.innerText = 'Loading...';
    if (clockTimerId) clearInterval(clockTimerId);
    if (clockContainer) clockContainer.classList.add('hidden');
    if (solarContainer) solarContainer.classList.add('hidden');
  }
});
