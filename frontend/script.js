/* ================================================================
   script.js — LandScope
   Place search (Nominatim) · Leaflet map · Flask API integration
================================================================ */

// ─────────────────────────────────────────
//  MAP SETUP
// ─────────────────────────────────────────
const map = L.map('map').setView([17.385, 78.4867], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Custom pin marker
const pinIcon = L.divIcon({
  html: `<div style="
    width:28px; height:28px; border-radius:50% 50% 50% 0;
    background: linear-gradient(135deg, #10d97e, #3b82f6);
    transform: rotate(-45deg);
    border: 3px solid #fff;
    box-shadow: 0 4px 16px rgba(16,217,126,0.5);
  "></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  className: ''
});

// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
let selectedLat = null;
let selectedLon = null;
let marker      = null;
let circle      = null;
let searchTimer = null;
let suggestions = [];

const radiusInput = document.getElementById('radius');

// ─────────────────────────────────────────
//  MAP CLICK — SET LOCATION
// ─────────────────────────────────────────
map.on('click', function (e) {
  setLocation(e.latlng.lat, e.latlng.lng, null);
});

// ─────────────────────────────────────────
//  SET LOCATION (shared by map click & search)
// ─────────────────────────────────────────
function setLocation(lat, lon, label) {
  selectedLat = lat;
  selectedLon = lon;

  // Update coordinate badges
  document.getElementById('latDisplay').textContent   = lat.toFixed(5);
  document.getElementById('lonDisplay').textContent   = lon.toFixed(5);
  document.getElementById('placeDisplay').textContent = label ? truncate(label, 20) : 'Custom pin';

  ['latBadge', 'lonBadge', 'placeBadge'].forEach(id =>
    document.getElementById(id).classList.add('active')
  );

  // Remove old map layers
  if (marker) map.removeLayer(marker);
  if (circle) map.removeLayer(circle);

  // Draw pin + radius circle
  marker = L.marker([lat, lon], { icon: pinIcon }).addTo(map);
  const radius = parseInt(radiusInput.value) || 2000;
  circle = L.circle([lat, lon], {
    radius,
    color:       '#10d97e',
    fillColor:   '#10d97e',
    fillOpacity: 0.1,
    weight:      2,
    dashArray:   '6 4'
  }).addTo(map);

  // Fly map to location
  map.setView([lat, lon], Math.max(map.getZoom(), 13), { animate: true });

  // Update map overlay text
  document.getElementById('mapOverlay').innerHTML =
    `<span class="map-pulse inline-block w-2 h-2 rounded-full bg-accent-green mr-2"></span>
     📍 ${label ? truncate(label, 40) : lat.toFixed(4) + ', ' + lon.toFixed(4)}`;
}

// ─────────────────────────────────────────
//  RADIUS CHANGE — REDRAW CIRCLE
// ─────────────────────────────────────────
radiusInput.addEventListener('input', function () {
  if (circle && selectedLat !== null) {
    map.removeLayer(circle);
    circle = L.circle([selectedLat, selectedLon], {
      radius:      parseInt(this.value) || 2000,
      color:       '#10d97e',
      fillColor:   '#10d97e',
      fillOpacity: 0.1,
      weight:      2,
      dashArray:   '6 4'
    }).addTo(map);
  }
});

// ─────────────────────────────────────────
//  PLACE SEARCH — INPUT HANDLER
// ─────────────────────────────────────────
function onSearchInput() {
  clearTimeout(searchTimer);
  const val = document.getElementById('placeInput').value.trim();
  if (val.length < 2) { closeDropdown(); return; }
  searchTimer = setTimeout(() => fetchSuggestions(val), 350);
}

function onSearchKey(e) {
  if (e.key === 'Enter')  { closeDropdown(); searchPlace(); }
  if (e.key === 'Escape') { closeDropdown(); }
}

// ─────────────────────────────────────────
//  AUTOCOMPLETE — FETCH SUGGESTIONS
// ─────────────────────────────────────────
async function fetchSuggestions(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    suggestions = await res.json();
    renderDropdown(suggestions);
  } catch {
    closeDropdown();
  }
}

// ─────────────────────────────────────────
//  AUTOCOMPLETE — RENDER DROPDOWN
// ─────────────────────────────────────────
function renderDropdown(items) {
  const dropdown = document.getElementById('autocompleteDropdown');
  if (!items || items.length === 0) { closeDropdown(); return; }

  dropdown.innerHTML = items.map((item, i) => {
    const addr   = item.address || {};
    const city   = addr.city || addr.town || addr.village || addr.county || '';
    const country= addr.country || '';
    const region = [city, country].filter(Boolean).join(', ');
    const name   = item.display_name.split(',')[0];

    return `
      <div class="autocomplete-item" onclick="selectSuggestion(${i})">
        <span>📍</span>
        <span class="place-name">${escHtml(name)}</span>
        <span class="place-region">${escHtml(region)}</span>
      </div>`;
  }).join('');

  dropdown.classList.remove('hidden');
  dropdown.classList.add('show');
}

function closeDropdown() {
  const d = document.getElementById('autocompleteDropdown');
  d.classList.add('hidden');
  d.classList.remove('show');
}

function selectSuggestion(i) {
  const item = suggestions[i];
  if (!item) return;
  const name = item.display_name.split(',')[0];
  document.getElementById('placeInput').value = item.display_name.split(',').slice(0, 2).join(', ');
  closeDropdown();
  setLocation(parseFloat(item.lat), parseFloat(item.lon), name);
}

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#searchWrapper')) closeDropdown();
});

// ─────────────────────────────────────────
//  SEARCH BUTTON — GEOCODE PLACE
// ─────────────────────────────────────────
async function searchPlace() {
  const query = document.getElementById('placeInput').value.trim();
  if (!query) return;

  const btn = document.getElementById('searchBtn');
  btn.textContent = '…';
  btn.disabled    = true;

  try {
    const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();

    if (data && data.length > 0) {
      suggestions = data;
      const first = data[0];
      const name  = first.display_name.split(',')[0];
      setLocation(parseFloat(first.lat), parseFloat(first.lon), name);
      renderDropdown(data);
    } else {
      flashSearchError();
    }
  } catch {
    flashSearchError();
  } finally {
    btn.textContent = 'Search';
    btn.disabled    = false;
  }
}

function flashSearchError() {
  const input = document.getElementById('placeInput');
  input.classList.add('!border-red-500', '!ring-red-500/20', '!ring-2');
  setTimeout(() => input.classList.remove('!border-red-500', '!ring-red-500/20', '!ring-2'), 2000);
}

// ─────────────────────────────────────────
//  RUN COMPARISON
// ─────────────────────────────────────────
// Sentinel-2 data is available from 2015 onwards
const MIN_YEAR = 2015;
const MAX_YEAR = new Date().getFullYear();

// Fill the dynamic year-range labels in the UI
document.getElementById('maxYearLabel1').textContent = MAX_YEAR;
document.getElementById('maxYearLabel2').textContent = MAX_YEAR;

// ── Inline year-field warning helpers ────────────────────────────
function warnYearField(id, msg) {
  const el   = document.getElementById(id);
  const hint = document.getElementById(id + 'Hint');
  el.classList.add('!border-red-500', '!ring-2', '!ring-red-500/20');
  if (hint) {
    hint.innerHTML = `<span class="text-red-400">⚠️ ${msg}</span>`;
  }
}

function clearYearWarning(id) {
  const el   = document.getElementById(id);
  const hint = document.getElementById(id + 'Hint');
  el.classList.remove('!border-red-500', '!ring-2', '!ring-red-500/20');
  if (hint) {
    hint.innerHTML = `<span class="text-accent-green opacity-70">🛰️</span>
      Sentinel-2 available: <span class="year-range-label font-semibold text-slate-400">2015 – ${MAX_YEAR}</span>`;
  }
}
// ─────────────────────────────────────────────────────────────────

function clampYear(id) {
  const el  = document.getElementById(id);
  let   val = parseInt(el.value) || MIN_YEAR;
  if (val < MIN_YEAR) val = MIN_YEAR;
  if (val > MAX_YEAR) val = MAX_YEAR;
  el.value = val;
  return val;
}

// Keep year inputs clamped as the user types
['year1', 'year2'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    clampYear(id);
    clearYearWarning(id);
  });
});

function runCompare() {
  if (selectedLat === null || selectedLon === null) {
    shake(document.getElementById('placeInput'));
    shake(document.getElementById('mapOverlay'));
    return;
  }

  const year1  = clampYear('year1');
  const year2  = clampYear('year2');
  const radius = Math.max(500, Math.min(20000, parseInt(radiusInput.value) || 2000));

  if (year1 >= year2) {
    showParamError('Year 1 must be earlier than Year 2.');
    shake(document.getElementById('year1'));
    shake(document.getElementById('year2'));
    return;
  }

  // These should never fire now (clampYear handles it), but kept as a safety net
  if (year1 < MIN_YEAR) {
    warnYearField('year1', `Must be ${MIN_YEAR} or later — Sentinel-2 data starts in ${MIN_YEAR}`);
    shake(document.getElementById('year1'));
    return;
  }
  if (year2 < MIN_YEAR) {
    warnYearField('year2', `Must be ${MIN_YEAR} or later — Sentinel-2 data starts in ${MIN_YEAR}`);
    shake(document.getElementById('year2'));
    return;
  }

  // Button loading state
  const btn = document.getElementById('compareBtn');
  btn.classList.add('btn-loading', 'pointer-events-none');
  btn.querySelector('.btn-spinner').classList.remove('hidden');

  // Show results panel with loading spinner
  const container = document.getElementById('resultContainer');
  const resultDiv = document.getElementById('result');
  container.classList.add('visible');
  resultDiv.innerHTML = `
    <div class="flex flex-col items-center justify-center py-12 gap-4">
      <div class="loading-ring"></div>
      <p class="text-sm text-slate-400">Downloading satellite imagery and running AI analysis…</p>
    </div>`;

  container.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const url = `http://127.0.0.1:5000/api/compare?lat=${selectedLat}&lon=${selectedLon}&radius=${radius}&year1=${year1}&year2=${year2}`;

  fetch(url)
    .then(r => r.json())
    .then(data => {
      btn.classList.remove('btn-loading', 'pointer-events-none');
      btn.querySelector('.btn-spinner').classList.add('hidden');

      // Backend may return { error: "..." } on failure
      if (data.error) {
        resultDiv.innerHTML = buildErrorHtml(data.error);
        return;
      }

      // Guard: validate expected structure before rendering
      if (!data.year1 || !data.year2 || !data.change) {
        resultDiv.innerHTML = buildErrorHtml('Unexpected response from server. Please try again.');
        return;
      }

      renderResults(data, year1, year2);
    })
    .catch(err => {
      btn.classList.remove('btn-loading', 'pointer-events-none');
      btn.querySelector('.btn-spinner').classList.add('hidden');
      resultDiv.innerHTML = buildErrorHtml(err.message || 'Server error. Make sure the Flask API is running on port 5000.');
    });
}

function showParamError(msg) {
  const resultDiv = document.getElementById('result');
  const container = document.getElementById('resultContainer');
  container.classList.add('visible');
  resultDiv.innerHTML = buildErrorHtml(msg);
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildErrorHtml(msg) {
  return `
    <div class="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
      ⚠️ &nbsp;${escHtml(String(msg))}
    </div>`;
}

// ─────────────────────────────────────────
//  RENDER RESULTS
// ─────────────────────────────────────────
function safeFixed(val, decimals = 1) {
  const n = parseFloat(val);
  return isNaN(n) ? '—' : n.toFixed(decimals);
}

function renderResults(data, year1, year2) {
  const resultDiv = document.getElementById('result');

  const veg1 = safeFixed(data.year1.vegetation);
  const urb1 = safeFixed(data.year1.urbanization);
  const veg2 = safeFixed(data.year2.vegetation);
  const urb2 = safeFixed(data.year2.urbanization);
  const dVeg = safeFixed(data.change.vegetation);
  const dUrb = safeFixed(data.change.urbanization);

  // Detect likely water-dominated area (very low veg + urban)
  const totalLand1 = parseFloat(veg1) + parseFloat(urb1);
  const totalLand2 = parseFloat(veg2) + parseFloat(urb2);
  const isLikelyWater = totalLand1 < 5 || totalLand2 < 5;
  const waterWarning = isLikelyWater
    ? `<div class="flex items-center gap-3 p-3 mb-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300 text-xs">
         🌊 &nbsp;<span>Low land coverage detected — the selected area may include large water bodies (rivers, lakes, ocean). Results may not reflect typical land-cover patterns.</span>
       </div>`
    : '';

  const vegUp   = parseFloat(dVeg) >= 0;
  const urbUp   = parseFloat(dUrb) >= 0;
  const vegArrow= vegUp ? '▲' : '▼';
  const urbArrow= urbUp ? '▲' : '▼';
  const vegCol  = vegUp ? 'text-emerald-400' : 'text-red-400';
  const urbCol  = !urbUp ? 'text-emerald-400' : 'text-red-400'; // urban up = bad

  resultDiv.innerHTML = waterWarning + `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

      <!-- Year 1 -->
      <div class="result-card card-year1">
        <p class="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">🕐 Year ${year1}</p>

        <div class="flex items-center justify-between mb-1">
          <span class="flex items-center gap-2 text-sm text-slate-400">
            <span class="w-2 h-2 rounded-full dot-green flex-shrink-0"></span>Vegetation
          </span>
          <span class="font-grotesk font-bold text-base text-emerald-400">${veg1}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill bar-green" data-to="${veg1}%"></div></div>

        <div class="flex items-center justify-between mt-4 mb-1">
          <span class="flex items-center gap-2 text-sm text-slate-400">
            <span class="w-2 h-2 rounded-full dot-orange flex-shrink-0"></span>Urbanization
          </span>
          <span class="font-grotesk font-bold text-base text-amber-400">${urb1}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill bar-orange" data-to="${urb1}%"></div></div>
      </div>

      <!-- Year 2 -->
      <div class="result-card card-year2">
        <p class="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">🕐 Year ${year2}</p>

        <div class="flex items-center justify-between mb-1">
          <span class="flex items-center gap-2 text-sm text-slate-400">
            <span class="w-2 h-2 rounded-full dot-green flex-shrink-0"></span>Vegetation
          </span>
          <span class="font-grotesk font-bold text-base text-emerald-400">${veg2}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill bar-green" data-to="${veg2}%"></div></div>

        <div class="flex items-center justify-between mt-4 mb-1">
          <span class="flex items-center gap-2 text-sm text-slate-400">
            <span class="w-2 h-2 rounded-full dot-orange flex-shrink-0"></span>Urbanization
          </span>
          <span class="font-grotesk font-bold text-base text-amber-400">${urb2}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill bar-orange" data-to="${urb2}%"></div></div>
      </div>

      <!-- Change -->
      <div class="result-card card-change">
        <p class="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">📈 Change (${year1} → ${year2})</p>

        <div class="flex items-center justify-between mb-4">
          <span class="flex items-center gap-2 text-sm text-slate-400">
            <span class="w-2 h-2 rounded-full dot-green flex-shrink-0"></span>Vegetation
          </span>
          <span class="font-grotesk font-bold text-lg ${vegCol}">${vegArrow} ${Math.abs(dVeg)}%</span>
        </div>

        <div class="flex items-center justify-between mb-4">
          <span class="flex items-center gap-2 text-sm text-slate-400">
            <span class="w-2 h-2 rounded-full dot-orange flex-shrink-0"></span>Urbanization
          </span>
          <span class="font-grotesk font-bold text-lg ${urbCol}">${urbArrow} ${Math.abs(dUrb)}%</span>
        </div>

        <div class="pt-3 border-t border-white/[0.06] text-xs text-slate-600 leading-relaxed">
          Based on Sentinel-2 imagery classified by the Land Cover Model.
        </div>
      </div>

    </div>`;

  // Animate progress bars after paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.bar-fill').forEach(bar => {
        bar.style.width = bar.dataset.to;
      });
    }, 80);
  });
}

// ─────────────────────────────────────────
//  UTILITY HELPERS
// ─────────────────────────────────────────
function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shake(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth; // reflow
  el.classList.add('shake');
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
}