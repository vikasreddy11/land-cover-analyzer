/* ================================================================
   LandScope — Satellite Land Cover Intelligence Dashboard Logic
   ================================================================ */

// ─────────────────────────────────────────
//  CONSTANTS & CONFIG
// ─────────────────────────────────────────
const MIN_YEAR = 2015;
const MAX_YEAR = Math.max(2025, new Date().getFullYear());
const API_BASE_URL = 'https://landscope-backend.onrender.com';

// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
let selectedLat = null;
let selectedLon = null;
let selectedLabel = '';
let currentRadius = 2000;
let marker = null;
let radiusCircle = null;
let searchTimer = null;
let suggestions = [];
let currentResults = null;

// ─────────────────────────────────────────
//  MAP SETUP & MULTI-LAYER TILES
// ─────────────────────────────────────────
const map = L.map('map', {
  center: [25.1972, 55.2744], // Default to Dubai
  zoom: 12,
  zoomControl: true,
  attributionControl: true
});

// Tile Layer Definitions
const tileLayers = {
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Earthstar Geographics',
    maxZoom: 18
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }),
  street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  })
};

// Add default satellite layer
let activeLayer = tileLayers.satellite;
activeLayer.addTo(map);

// Pin marker styling
const pinIcon = L.divIcon({
  html: `<div style="
    width: 28px;
    height: 28px;
    border-radius: 50% 50% 50% 0;
    background: linear-gradient(135deg, #10d97e, #06b6d4);
    transform: rotate(-45deg);
    border: 3px solid #ffffff;
    box-shadow: 0 4px 18px rgba(16, 217, 126, 0.6);
  "></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  className: 'custom-pin-marker'
});

// ─────────────────────────────────────────
//  INITIALIZATION
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  populateYearDropdowns();
  updateAreaDisplay();
  
  // Initialize with Dubai preset by default
  loadPreset(25.1972, 55.2744, 'Dubai, UAE', 3000, 2016, 2024);
});

// ─────────────────────────────────────────
//  MAP INTERACTION & HOVER TRACKER
// ─────────────────────────────────────────
map.on('click', (e) => {
  setLocation(e.latlng.lat, e.latlng.lng, `Custom Point (${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)})`);
});

map.on('mousemove', (e) => {
  const coordsEl = document.getElementById('cursorCoords');
  if (coordsEl) {
    coordsEl.textContent = `${e.latlng.lat.toFixed(4)}°N, ${e.latlng.lng.toFixed(4)}°E | Z${map.getZoom()}`;
  }
});

// Switch basemap layer
function switchBasemap(type) {
  if (!tileLayers[type] || activeLayer === tileLayers[type]) return;

  map.removeLayer(activeLayer);
  activeLayer = tileLayers[type];
  activeLayer.addTo(map);

  ['btnSatLayer', 'btnDarkLayer', 'btnStreetLayer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  if (type === 'satellite') document.getElementById('btnSatLayer')?.classList.add('active');
  if (type === 'dark') document.getElementById('btnDarkLayer')?.classList.add('active');
  if (type === 'street') document.getElementById('btnStreetLayer')?.classList.add('active');
}

// ─────────────────────────────────────────
//  LOCATION MANAGEMENT
// ─────────────────────────────────────────
function setLocation(lat, lon, label) {
  selectedLat = lat;
  selectedLon = lon;
  selectedLabel = label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

  // Update UI Displays
  document.getElementById('latDisplay').textContent = lat.toFixed(5);
  document.getElementById('lonDisplay').textContent = lon.toFixed(5);
  document.getElementById('placeDisplay').textContent = selectedLabel;
  document.getElementById('mapStatusText').textContent = `Target: ${selectedLabel}`;

  // Update Map Pin & Radius Circle
  if (marker) map.removeLayer(marker);
  if (radiusCircle) map.removeLayer(radiusCircle);

  marker = L.marker([lat, lon], { icon: pinIcon }).addTo(map);

  radiusCircle = L.circle([lat, lon], {
    radius: currentRadius,
    color: '#10d97e',
    fillColor: '#10d97e',
    fillOpacity: 0.12,
    weight: 2,
    dashArray: '6 6'
  }).addTo(map);

  map.setView([lat, lon], map.getZoom() < 12 ? 12 : map.getZoom(), { animate: true });
}

function loadPreset(lat, lon, label, radius, y1, y2) {
  currentRadius = radius;
  document.getElementById('radiusInput').value = radius;
  document.getElementById('radiusRange').value = radius;
  
  if (y1) document.getElementById('year1').value = y1;
  if (y2) document.getElementById('year2').value = y2;

  updateAreaDisplay();
  updateRadiusPills();
  setLocation(lat, lon, label);
}

function resetMapTarget() {
  if (selectedLat !== null && selectedLon !== null) {
    map.flyTo([selectedLat, selectedLon], 13, { duration: 1 });
  }
}

function locateUserPosition() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setLocation(pos.coords.latitude, pos.coords.longitude, 'Your Current Location');
    },
    (err) => {
      alert(`Could not fetch location: ${err.message}`);
    }
  );
}

function copyCoordinates() {
  if (selectedLat === null) return;
  const text = `${selectedLat.toFixed(6)}, ${selectedLon.toFixed(6)}`;
  navigator.clipboard.writeText(text).then(() => {
    const el = document.getElementById('placeDisplay');
    const old = el.textContent;
    el.textContent = 'Copied to clipboard!';
    setTimeout(() => { el.textContent = old; }, 1500);
  });
}

// ─────────────────────────────────────────
//  RADIUS CONTROLS & AREA CALCULATION
// ─────────────────────────────────────────
function syncRadiusFromNumber(val) {
  const parsed = Math.max(500, Math.min(10000, parseInt(val) || 2000));
  currentRadius = parsed;
  document.getElementById('radiusInput').value = parsed;
  document.getElementById('radiusRange').value = parsed;
  updateRadiusCircle();
  updateAreaDisplay();
  updateRadiusPills();
}

function syncRadiusFromSlider(val) {
  currentRadius = parseInt(val);
  document.getElementById('radiusInput').value = currentRadius;
  updateRadiusCircle();
  updateAreaDisplay();
  updateRadiusPills();
}

function setRadius(r) {
  currentRadius = r;
  document.getElementById('radiusInput').value = r;
  document.getElementById('radiusRange').value = r;
  updateRadiusCircle();
  updateAreaDisplay();
  updateRadiusPills();
}

function updateRadiusPills() {
  document.querySelectorAll('.radius-pill').forEach(btn => {
    const rVal = parseInt(btn.textContent) * 1000;
    if (rVal === currentRadius) {
      btn.className = 'radius-pill active text-xs py-1 px-2 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 font-semibold';
    } else {
      btn.className = 'radius-pill text-xs py-1 px-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300';
    }
  });
}

function updateRadiusCircle() {
  if (radiusCircle && selectedLat !== null) {
    radiusCircle.setRadius(currentRadius);
  }
}

function updateAreaDisplay() {
  const areaKm2 = (Math.PI * Math.pow(currentRadius / 1000, 2)).toFixed(1);
  const areaEl = document.getElementById('areaDisplay');
  if (areaEl) {
    areaEl.textContent = `Area: ~${areaKm2} km²`;
  }
}

// ─────────────────────────────────────────
//  YEAR SELECTORS
// ─────────────────────────────────────────
function populateYearDropdowns() {
  const y1Select = document.getElementById('year1');
  const y2Select = document.getElementById('year2');

  y1Select.innerHTML = '';
  y2Select.innerHTML = '';

  for (let year = MIN_YEAR; year <= MAX_YEAR; year++) {
    const opt1 = document.createElement('option');
    opt1.value = year;
    opt1.textContent = `Year ${year}`;
    if (year === 2017) opt1.selected = true;
    y1Select.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = year;
    opt2.textContent = `Year ${year}`;
    if (year === 2024) opt2.selected = true;
    y2Select.appendChild(opt2);
  }
}

function validateYears() {
  const y1 = parseInt(document.getElementById('year1').value);
  const y2 = parseInt(document.getElementById('year2').value);
  const hint = document.getElementById('yearErrorHint');

  if (y1 >= y2) {
    hint.textContent = 'Baseline Year 1 must be strictly earlier than Target Year 2.';
    hint.classList.remove('hidden');
    return false;
  }
  hint.classList.add('hidden');
  return true;
}

// ─────────────────────────────────────────
//  SEARCH & NOMINATIM AUTOCOMPLETE
// ─────────────────────────────────────────
function onSearchInput() {
  clearTimeout(searchTimer);
  const val = document.getElementById('placeInput').value.trim();
  if (val.length < 2) {
    closeDropdown();
    return;
  }
  searchTimer = setTimeout(() => fetchSuggestions(val), 320);
}

function onSearchKey(e) {
  if (e.key === 'Enter') {
    closeDropdown();
    searchPlace();
  }
  if (e.key === 'Escape') {
    closeDropdown();
  }
}

async function fetchSuggestions(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    suggestions = await res.json();
    renderDropdown(suggestions);
  } catch {
    closeDropdown();
  }
}

function renderDropdown(items) {
  const dropdown = document.getElementById('autocompleteDropdown');
  if (!items || items.length === 0) {
    closeDropdown();
    return;
  }

  dropdown.innerHTML = items.map((item, i) => {
    const name = item.display_name.split(',')[0];
    const rest = item.display_name.split(',').slice(1, 3).join(',');
    return `
      <div class="autocomplete-item text-xs" onclick="selectSuggestion(${i})">
        <span class="text-slate-400">📍</span>
        <span class="font-medium text-slate-100 flex-1 truncate">${escHtml(name)}</span>
        <span class="text-[11px] text-slate-400 truncate max-w-[140px]">${escHtml(rest)}</span>
      </div>`;
  }).join('');

  dropdown.classList.remove('hidden');
}

function closeDropdown() {
  const d = document.getElementById('autocompleteDropdown');
  if (d) d.classList.add('hidden');
}

function selectSuggestion(i) {
  const item = suggestions[i];
  if (!item) return;
  const name = item.display_name.split(',')[0];
  document.getElementById('placeInput').value = item.display_name.split(',').slice(0, 2).join(', ');
  closeDropdown();
  setLocation(parseFloat(item.lat), parseFloat(item.lon), name);
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#searchWrapper')) closeDropdown();
});

async function searchPlace() {
  const query = document.getElementById('placeInput').value.trim();
  if (!query) return;

  const btn = document.getElementById('searchBtn');
  btn.textContent = '...';
  btn.disabled = true;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();

    if (data && data.length > 0) {
      const first = data[0];
      const name = first.display_name.split(',')[0];
      setLocation(parseFloat(first.lat), parseFloat(first.lon), name);
    } else {
      alert('Location not found. Please try another place name.');
    }
  } catch (err) {
    alert('Search error: ' + err.message);
  } finally {
    btn.textContent = 'Locate';
    btn.disabled = false;
  }
}

// ─────────────────────────────────────────
//  EXECUTE COMPARISON ANALYSIS
// ─────────────────────────────────────────
async function runCompare() {
  if (selectedLat === null || selectedLon === null) {
    alert('Please choose a location on the map or search for a place first.');
    return;
  }

  if (!validateYears()) return;

  const year1 = parseInt(document.getElementById('year1').value);
  const year2 = parseInt(document.getElementById('year2').value);
  const radius = currentRadius;

  hideError();

  // Button loading state
  const btn = document.getElementById('compareBtn');
  const btnSpinner = document.getElementById('btnSpinner');
  const btnText = document.getElementById('btnText');

  btn.classList.add('pointer-events-none', 'opacity-80');
  btnSpinner.classList.remove('hidden');
  btnText.textContent = 'Processing Earth Engine Satellite Bands...';

  // Smooth scroll to view progress
  const resultsSection = document.getElementById('resultsSection');
  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Temporary skeleton/placeholder state
  setSkeletonLoading(year1, year2);

  const url = `${API_BASE_URL}/api/compare?lat=${selectedLat}&lon=${selectedLon}&radius=${radius}&year1=${year1}&year2=${year2}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || `Server responded with status ${response.status}`);
    }

    currentResults = { data, year1, year2, location: selectedLabel, radius };
    renderResults(data, year1, year2);
  } catch (err) {
    showError('Analysis Failed', err.message || 'Unable to connect to Google Earth Engine satellite pipeline.');
    resultsSection.classList.add('hidden');
  } finally {
    btn.classList.remove('pointer-events-none', 'opacity-80');
    btnSpinner.classList.add('hidden');
    btnText.innerHTML = '🔬 Run Multi-Spectral Analysis';
  }
}

// ─────────────────────────────────────────
//  RENDER RESULTS & INTERPRETATION
// ─────────────────────────────────────────
function setSkeletonLoading(y1, y2) {
  document.getElementById('resultEpochBadge').textContent = `${y1} → ${y2}`;
  document.getElementById('resultHeadline').textContent = 'Acquiring Sentinel-2 Multispectral Imagery...';
  document.getElementById('resultSubheadline').textContent = 'Computing pixel-level NDVI and NDBI matrices via Earth Engine.';
  document.getElementById('cardYear1Label').textContent = `Year ${y1}`;
  document.getElementById('cardYear2Label').textContent = `Year ${y2}`;

  document.getElementById('y1VegVal').textContent = '...';
  document.getElementById('y1UrbVal').textContent = '...';
  document.getElementById('y2VegVal').textContent = '...';
  document.getElementById('y2UrbVal').textContent = '...';
  document.getElementById('deltaVegVal').textContent = '...';
  document.getElementById('deltaUrbVal').textContent = '...';
  document.getElementById('ecologicalInterpretation').textContent = 'Synthesizing surface reflectance indices...';
}

function renderResults(data, year1, year2) {
  const veg1 = Number(data.year1.vegetation).toFixed(1);
  const urb1 = Number(data.year1.urbanization).toFixed(1);
  const veg2 = Number(data.year2.vegetation).toFixed(1);
  const urb2 = Number(data.year2.urbanization).toFixed(1);
  const dVeg = Number(data.change.vegetation).toFixed(1);
  const dUrb = Number(data.change.urbanization).toFixed(1);

  // Epoch Badge
  document.getElementById('resultEpochBadge').textContent = `${year1} → ${year2} (${year2 - year1} Year Span)`;

  // Values
  document.getElementById('cardYear1Label').textContent = `Year ${year1}`;
  document.getElementById('cardYear2Label').textContent = `Year ${year2}`;
  document.getElementById('y1VegVal').textContent = `${veg1}%`;
  document.getElementById('y1UrbVal').textContent = `${urb1}%`;
  document.getElementById('y2VegVal').textContent = `${veg2}%`;
  document.getElementById('y2UrbVal').textContent = `${urb2}%`;

  // Bars width
  setTimeout(() => {
    document.getElementById('y1VegBar').style.width = `${Math.min(100, Math.max(0, veg1))}%`;
    document.getElementById('y1UrbBar').style.width = `${Math.min(100, Math.max(0, urb1))}%`;
    document.getElementById('y2VegBar').style.width = `${Math.min(100, Math.max(0, veg2))}%`;
    document.getElementById('y2UrbBar').style.width = `${Math.min(100, Math.max(0, urb2))}%`;
  }, 100);

  // Delta Formatting
  const dVegNum = parseFloat(dVeg);
  const dUrbNum = parseFloat(dUrb);

  const deltaVegEl = document.getElementById('deltaVegVal');
  const deltaUrbEl = document.getElementById('deltaUrbVal');

  deltaVegEl.textContent = `${dVegNum >= 0 ? '+' : ''}${dVeg}%`;
  deltaVegEl.className = `font-mono text-base font-bold ${dVegNum >= 0 ? 'text-emerald-400' : 'text-red-400'}`;

  deltaUrbEl.textContent = `${dUrbNum >= 0 ? '+' : ''}${dUrb}%`;
  deltaUrbEl.className = `font-mono text-base font-bold ${dUrbNum > 0 ? 'text-amber-400' : 'text-slate-300'}`;

  // Headline Determination
  let headline = 'Stable Land Cover Dynamics';
  let subheadline = `Surface indices indicate minimal anthropogenic or canopy change over the ${year2 - year1}-year observation period.`;

  if (dUrbNum >= 3.0 && dVegNum <= -3.0) {
    headline = 'Accelerated Urban Sprawl & Canopy Depletion';
    subheadline = `Significant conversion of green biomass into impervious urban surface footprint (+${dUrb}% built-up shift).`;
  } else if (dUrbNum >= 3.0) {
    headline = 'Intensive Built-Up & Infrastructure Expansion';
    subheadline = `Built-up index (NDBI) increased by +${dUrb}%, indicating rapid land development and construction.`;
  } else if (dVegNum >= 3.0) {
    headline = 'Vegetation Recovery & Canopy Expansion';
    subheadline = `Photosynthetic activity (NDVI) expanded by +${dVeg}%, reflecting reforestation or agricultural growth.`;
  } else if (dVegNum <= -5.0) {
    headline = 'Severe Vegetation Canopy Loss';
    subheadline = `Marked decline of -${Math.abs(dVeg)}% in NDVI density, typical of deforestation, drought, or land clearing.`;
  }

  document.getElementById('resultHeadline').textContent = headline;
  document.getElementById('resultSubheadline').textContent = subheadline;

  // Velocity Tag
  const velocityEl = document.getElementById('shiftVelocityBadge');
  const totalChange = Math.abs(dVegNum) + Math.abs(dUrbNum);
  const annualizedChange = (totalChange / (year2 - year1)).toFixed(2);
  velocityEl.innerHTML = `Temporal Change Velocity: <span class="font-mono text-white font-bold">${annualizedChange}% / year</span>`;

  // Ecological Interpretation Generator
  generateEcologicalSummary(veg1, urb1, veg2, urb2, dVegNum, dUrbNum, year1, year2);
}

function generateEcologicalSummary(v1, u1, v2, u2, dVeg, dUrb, y1, y2) {
  let narrative = '';

  if (v1 < 5 && u1 < 5 && v2 < 5 && u2 < 5) {
    narrative = `🌊 <strong>Aquatic / Low-Reflectance Area:</strong> Both NDVI and NDBI values are near zero across ${y1} and ${y2}, indicating the analyzed buffer predominantly encompasses open water bodies (lake, sea, or wide river basin) with minimal terrestrial vegetation or impervious structures.`;
  } else {
    narrative = `Between <strong>${y1}</strong> and <strong>${y2}</strong>, multispectral analysis across Sentinel-2 bands reveals:
    <ul class="list-disc list-inside mt-2 space-y-1 text-slate-300">
      <li><strong>Vegetation Canopy (NDVI):</strong> Shifted from <strong>${v1}%</strong> to <strong>${v2}%</strong> (a net change of <span class="${dVeg >= 0 ? 'text-emerald-400' : 'text-red-400'} font-semibold">${dVeg >= 0 ? '+' : ''}${dVeg}%</span>).</li>
      <li><strong>Built-Up & Infrastructure (NDBI):</strong> Shifted from <strong>${u1}%</strong> to <strong>${u2}%</strong> (a net change of <span class="${dUrb >= 0 ? 'text-amber-400' : 'text-slate-300'} font-semibold">${dUrb >= 0 ? '+' : ''}${dUrb}%</span>).</li>
    </ul>
    <div class="mt-3 p-3 bg-black/40 rounded-lg border border-white/5 text-xs text-slate-300">
      💡 <strong>Environmental Takeaway:</strong> ${
        dUrb > 5
          ? 'Urban expansion is the primary driver of landscape transformation in this zone. Urban heat island mitigation and green buffer preservation are recommended.'
          : dVeg > 3
          ? 'Positive ecological trends with enhanced photosynthetic index. Land management practices show healthy biomass retention.'
          : 'Land cover structure remains relatively balanced with standard seasonal variation.'
      }
    </div>`;
  }

  document.getElementById('ecologicalInterpretation').innerHTML = narrative;
}

// ─────────────────────────────────────────
//  COPY SUMMARY REPORT
// ─────────────────────────────────────────
function copyReportSummary() {
  if (!currentResults) return;
  const { data, year1, year2, location, radius } = currentResults;

  const text = `🛰️ LandScope Satellite Analysis Report
Location: ${location} (${selectedLat.toFixed(5)}, ${selectedLon.toFixed(5)})
Radius: ${radius}m (~${(Math.PI * Math.pow(radius / 1000, 2)).toFixed(1)} km²)
Epoch Range: ${year1} → ${year2}

• ${year1} Baseline: Vegetation ${data.year1.vegetation}% | Urban ${data.year1.urbanization}%
• ${year2} Target:   Vegetation ${data.year2.vegetation}% | Urban ${data.year2.urbanization}%
• Net Shift:        Vegetation ${data.change.vegetation > 0 ? '+' : ''}${data.change.vegetation}% | Urbanization ${data.change.urbanization > 0 ? '+' : ''}${data.change.urbanization}%

Source: ESA Sentinel-2 MSI via Google Earth Engine`;

  navigator.clipboard.writeText(text).then(() => {
    alert('Analysis report copied to clipboard!');
  });
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────
//  ERROR HANDLING & MODAL TOGGLE
// ─────────────────────────────────────────
function showError(title, msg) {
  const container = document.getElementById('errorContainer');
  document.getElementById('errorTitle').textContent = title;
  document.getElementById('errorMessage').textContent = msg;
  container.classList.remove('hidden');
  container.scrollIntoView({ behavior: 'smooth' });
}

function hideError() {
  document.getElementById('errorContainer').classList.add('hidden');
}

function toggleScienceModal(show) {
  const modal = document.getElementById('scienceModal');
  if (show) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  } else {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}