/* ================================================================
   LandScope — Satellite Land Cover Intelligence Dashboard Logic
   ================================================================ */

// ─────────────────────────────────────────
//  CONSTANTS & CONFIG
// ─────────────────────────────────────────
const MIN_YEAR = 2015;
const MAX_YEAR = Math.max(2025, new Date().getFullYear());
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000'
  : (window.location.origin.includes('onrender.com') ? window.location.origin : 'https://landscope-backend.onrender.com');

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
//  CLASS PALETTE — color per land-cover label
// ─────────────────────────────────────────
const CLASS_STYLE = {
  'Background / Bare':  { color: '#94a3b8', grad: 'from-slate-500 to-slate-400',   icon: '🏜️' },
  'Water':              { color: '#38bdf8', grad: 'from-sky-500 to-cyan-400',       icon: '💧' },
  'Vegetation':         { color: '#34d399', grad: 'from-emerald-500 to-teal-400',   icon: '🌿' },
  'Woodland':           { color: '#34d399', grad: 'from-emerald-500 to-teal-400',   icon: '🌳' },
  'Built-up / Urban':   { color: '#fbbf24', grad: 'from-amber-500 to-orange-400',   icon: '🏗️' },
  'Building':           { color: '#fbbf24', grad: 'from-amber-500 to-orange-400',   icon: '🏢' },
  'Road':               { color: '#c084fc', grad: 'from-purple-500 to-violet-400',  icon: '🛣️' },
};

function getClassStyle(name) {
  return CLASS_STYLE[name] || { color: '#e2e8f0', grad: 'from-slate-400 to-slate-300', icon: '📊' };
}

// ─────────────────────────────────────────
//  SKELETON LOADING STATE
// ─────────────────────────────────────────
function setSkeletonLoading(y1, y2) {
  document.getElementById('resultEpochBadge').textContent = `${y1} → ${y2}`;
  document.getElementById('resultHeadline').textContent = 'Acquiring Sentinel-2 Multispectral Imagery...';
  document.getElementById('resultSubheadline').textContent = 'Computing pixel-level NDVI and UNet hybrid inference via Earth Engine.';
  document.getElementById('cardYear1Label').textContent = `Year ${y1}`;
  document.getElementById('cardYear2Label').textContent = `Year ${y2}`;
  document.getElementById('modelName').textContent = 'UNet Hybrid + NDVI/NDBI Analysis';
  document.getElementById('modelPipeline').textContent = 'Google Earth Engine — Sentinel-2 Multispectral';
  document.getElementById('modelClassChips').innerHTML = '';
  document.getElementById('modelCategoryCount').textContent = '...';
  document.getElementById('y1CategoryBars').innerHTML = '<p class="text-slate-500 text-xs animate-pulse">Loading categories...</p>';
  document.getElementById('y2CategoryBars').innerHTML = '<p class="text-slate-500 text-xs animate-pulse">Loading categories...</p>';
  document.getElementById('deltaTable').innerHTML = '';
  document.getElementById('shiftVelocityBadge').textContent = 'Computing velocity...';
  document.getElementById('ecologicalInterpretation').textContent = 'Synthesizing surface reflectance indices...';
}

// ─────────────────────────────────────────
//  BUILD CATEGORY BARS HTML
// ─────────────────────────────────────────
function buildCategoryBars(details) {
  if (!details || typeof details !== 'object') return '<p class="text-slate-500 text-xs">No category data</p>';

  return Object.entries(details).map(([name, pct]) => {
    const style = getClassStyle(name);
    const val = Number(pct).toFixed(1);
    const barW = Math.min(100, Math.max(0, parseFloat(val)));
    return `
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-300 flex items-center gap-1.5">
            <span>${style.icon}</span>
            <span>${name}</span>
          </span>
          <span class="font-mono font-bold text-base" style="color:${style.color}">${val}%</span>
        </div>
        <div class="w-full bg-white/5 rounded-full h-2 overflow-hidden">
          <div class="meter-fill bg-gradient-to-r ${style.grad} h-full" style="width:${barW}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────
//  BUILD DELTA TABLE
// ─────────────────────────────────────────
function buildDeltaTable(d1, d2) {
  const keys = Object.keys(d1 || d2 || {});
  if (!keys.length) return '';
  return keys.map(name => {
    const v1 = Number((d1 || {})[name] || 0);
    const v2 = Number((d2 || {})[name] || 0);
    const delta = (v2 - v1).toFixed(1);
    const dNum = parseFloat(delta);
    const style = getClassStyle(name);
    const sign = dNum >= 0 ? '+' : '';
    const textColor = dNum > 0.5 ? 'text-emerald-400' : dNum < -0.5 ? 'text-red-400' : 'text-slate-300';
    return `
      <div class="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col gap-1">
        <span class="text-[10px] text-slate-400 flex items-center gap-1">${style.icon} ${name}</span>
        <span class="font-mono text-base font-bold ${textColor}">${sign}${delta}%</span>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────
//  MAIN RENDER FUNCTION
// ─────────────────────────────────────────
function renderResults(data, year1, year2) {
  // ── Model badge ──────────────────────────
  const model = data.model || {};
  document.getElementById('modelName').textContent     = model.name     || 'UNet Hybrid + NDVI/NDBI Analysis';
  document.getElementById('modelPipeline').textContent = model.pipeline || 'Google Earth Engine — Sentinel-2 Multispectral';
  const scheme = model.class_scheme || Object.keys(data.year1?.details || {});
  const catCount = scheme.length;
  document.getElementById('modelCategoryCount').textContent = `${catCount}-Class Output`;

  // Color chips per class
  const chipsEl = document.getElementById('modelClassChips');
  chipsEl.innerHTML = scheme.map(name => {
    const s = getClassStyle(name);
    return `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
      style="color:${s.color};border-color:${s.color}40;background:${s.color}15">${s.icon} ${name}</span>`;
  }).join('');

  // ── Epoch labels ─────────────────────────
  document.getElementById('resultEpochBadge').textContent = `${year1} → ${year2} (${year2 - year1} Year Span)`;
  document.getElementById('cardYear1Label').textContent = `Year ${year1}`;
  document.getElementById('cardYear2Label').textContent = `Year ${year2}`;

  // ── Category bars ────────────────────────
  const d1 = data.year1?.details || {};
  const d2 = data.year2?.details || {};

  // Graceful fallback: if no details, synthesize from vegetation/urbanization
  const hasDetails = Object.keys(d1).length > 0;
  const details1 = hasDetails ? d1 : {
    'Vegetation':       data.year1.vegetation,
    'Built-up / Urban': data.year1.urbanization
  };
  const details2 = hasDetails ? d2 : {
    'Vegetation':       data.year2.vegetation,
    'Built-up / Urban': data.year2.urbanization
  };

  document.getElementById('y1CategoryBars').innerHTML = buildCategoryBars(details1);
  document.getElementById('y2CategoryBars').innerHTML = buildCategoryBars(details2);

  // Animate bars after insertion
  setTimeout(() => {
    document.querySelectorAll('#y1CategoryBars .meter-fill, #y2CategoryBars .meter-fill').forEach(el => {
      el.style.transition = 'width 0.7s ease';
    });
  }, 50);

  // ── Delta table ──────────────────────────
  document.getElementById('deltaTable').innerHTML = buildDeltaTable(details1, details2);

  // ── Velocity badge ───────────────────────
  const totalChange = Object.keys(details1).reduce((sum, k) => {
    return sum + Math.abs(Number(details2[k] || 0) - Number(details1[k] || 0));
  }, 0);
  const annualized = (totalChange / (year2 - year1)).toFixed(2);
  document.getElementById('shiftVelocityBadge').innerHTML =
    `Temporal Change Velocity: <span class="font-mono text-white font-bold">${annualized}% / year</span>`;

  // ── Headline ─────────────────────────────
  const veg1 = Number(data.year1.vegetation).toFixed(1);
  const urb1 = Number(data.year1.urbanization).toFixed(1);
  const veg2 = Number(data.year2.vegetation).toFixed(1);
  const urb2 = Number(data.year2.urbanization).toFixed(1);
  const dVeg = (data.year2.vegetation - data.year1.vegetation).toFixed(1);
  const dUrb = (data.year2.urbanization - data.year1.urbanization).toFixed(1);
  const dVegNum = parseFloat(dVeg);
  const dUrbNum = parseFloat(dUrb);

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

  // ── Ecological narrative ─────────────────
  generateEcologicalSummary(details1, details2, dVegNum, dUrbNum, year1, year2, model);
}

function generateEcologicalSummary(d1, d2, dVeg, dUrb, y1, y2, model) {
  const modelLabel = model?.name || 'UNet Hybrid Analysis';
  const pipeline = model?.pipeline || 'Sentinel-2 via Google Earth Engine';

  const rows = Object.keys(d1).map(name => {
    const v1 = Number(d1[name]).toFixed(1);
    const v2 = Number(d2[name]).toFixed(1);
    const delta = (Number(d2[name]) - Number(d1[name])).toFixed(1);
    const dNum = parseFloat(delta);
    const sign = dNum >= 0 ? '+' : '';
    const cls = dNum >= 0 ? 'text-emerald-400' : 'text-red-400';
    const s = getClassStyle(name);
    return `<li>${s.icon} <strong>${name}:</strong> ${v1}% → ${v2}% (<span class="${cls} font-semibold">${sign}${delta}%</span>)</li>`;
  }).join('');

  const waterKnown = 'Water' in d1;
  const aqCheck = !waterKnown ? '' :
    (Number(d1['Water']) > 30 || Number(d2['Water']) > 30)
      ? '🌊 <strong>High water body coverage</strong> detected — this zone may encompass a significant lake, river delta, or coastal area.'
      : '';

  const narrative = `
    <div class="flex flex-col gap-3">
      <div class="text-xs font-mono text-cyan-400/80 bg-cyan-400/5 border border-cyan-400/10 px-3 py-1.5 rounded-lg">
        📡 Pipeline: ${modelLabel} · ${pipeline}
      </div>
      <p>Between <strong>${y1}</strong> and <strong>${y2}</strong>, land cover analysis reveals:</p>
      <ul class="list-disc list-inside mt-1 space-y-1 text-slate-300">${rows}</ul>
      ${aqCheck ? `<p class="text-sky-400 text-xs mt-1">${aqCheck}</p>` : ''}
      <div class="mt-2 p-3 bg-black/40 rounded-lg border border-white/5 text-xs text-slate-300">
        💡 <strong>Environmental Takeaway:</strong> ${
          dUrb > 5
            ? 'Urban expansion is the primary driver of landscape transformation. Heat island mitigation and green buffer preservation are recommended.'
            : dVeg > 3
            ? 'Positive ecological trajectory — photosynthetic cover has expanded. Land management practices show healthy biomass retention.'
            : 'Land cover structure remains relatively balanced with standard seasonal variation.'
        }
      </div>
    </div>`;
  document.getElementById('ecologicalInterpretation').innerHTML = narrative;
}





// ─────────────────────────────────────────
//  COPY SUMMARY REPORT
// ─────────────────────────────────────────
function copyReportSummary() {
  if (!currentResults) return;
  const { data, year1, year2, location, radius } = currentResults;
  const model = data.model || {};
  const d1 = (data.year1 && data.year1.details) ? data.year1.details : { 'Vegetation': data.year1.vegetation, 'Built-up / Urban': data.year1.urbanization };
  const d2 = (data.year2 && data.year2.details) ? data.year2.details : { 'Vegetation': data.year2.vegetation, 'Built-up / Urban': data.year2.urbanization };

  const catLines1 = Object.entries(d1).map(([k, v]) => `  ${k}: ${Number(v).toFixed(1)}%`).join('\n');
  const catLines2 = Object.entries(d2).map(([k, v]) => `  ${k}: ${Number(v).toFixed(1)}%`).join('\n');
  const deltaLines = Object.keys(d1).map(k => {
    const delta = (Number(d2[k] || 0) - Number(d1[k] || 0)).toFixed(1);
    return `  ${k}: ${parseFloat(delta) > 0 ? '+' : ''}${delta}%`;
  }).join('\n');

  const text = `\u{1F6F0}\uFE0F LandScope Satellite Analysis Report
Location: ${location} (${selectedLat.toFixed(5)}, ${selectedLon.toFixed(5)})
Radius: ${radius}m (~${(Math.PI * Math.pow(radius / 1000, 2)).toFixed(1)} km\u00B2)
Epoch Range: ${year1} \u2192 ${year2}
Pipeline: ${model.name || 'UNet Hybrid + NDVI/NDBI'} | ${model.pipeline || 'Sentinel-2 via GEE'}

${year1} Baseline:
${catLines1}

${year2} Target:
${catLines2}

Net \u0394 Shift:
${deltaLines}

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