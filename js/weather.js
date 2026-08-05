/* js/weather.js
   Shared weather module used by the scorecard, Field Work, and Putt
   Practice screens: current-conditions fetch (National Weather Service,
   api.weather.gov — free, no API key, US coverage only), a small inline
   SVG icon set (no external image assets to manage), and device-compass
   tracking so the wind arrow can rotate relative to whichever way the
   phone is currently facing rather than a fixed "up = north" arrow.

   Wind is shown as the direction it's blowing TOWARD (not the
   meteorological "from" convention NWS itself reports).
*/

/* ---------- Fetching current conditions ---------- */

const COMPASS_DEGREES = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5
};

function compassToDegrees(str) {
  if (!str) return null;
  const key = str.trim().toUpperCase();
  return (key in COMPASS_DEGREES) ? COMPASS_DEGREES[key] : null;
}

// Maps NWS's free-text "shortForecast" (e.g. "Partly Cloudy",
// "Rain Showers Likely") to one of our own icon categories. Order
// matters — more specific/severe conditions are checked first so e.g.
// "Thunderstorms" doesn't get caught by a later, looser "rain" check.
function classifyWeatherCondition(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('thunder')) return 'thunderstorm';
  if (t.includes('snow') || t.includes('sleet') || t.includes('ice')) return 'snow';
  if (t.includes('rain') || t.includes('shower') || t.includes('drizzle')) return 'rain';
  if (t.includes('fog') || t.includes('mist') || t.includes('haze')) return 'fog';
  if (t.includes('partly') || t.includes('mostly cloudy')) return 'partly-cloudy';
  if (t.includes('cloudy') || t.includes('overcast')) return 'cloudy';
  return 'sunny'; // Clear, Sunny, Mostly Sunny, Mostly Clear, or anything unmatched
}

// Two-hop NWS lookup: /points/{lat},{lng} resolves the grid, whose
// forecastHourly link gives temp/wind/condition for the current hour
// in one call. Simpler than the alternative /stations/.../observations
// route, at the cost of "current hour's forecast" instead of a live
// observation — a reasonable proxy for a round/session's conditions.
async function fetchNwsWeather(lat, lng) {
  if (lat == null || lng == null) return { available: false };
  try {
    const pointsRes = await fetch('https://api.weather.gov/points/' + lat.toFixed(4) + ',' + lng.toFixed(4));
    if (!pointsRes.ok) return { available: false };
    const pointsData = await pointsRes.json();
    const forecastHourlyUrl = pointsData.properties && pointsData.properties.forecastHourly;
    if (!forecastHourlyUrl) return { available: false };

    const forecastRes = await fetch(forecastHourlyUrl);
    if (!forecastRes.ok) return { available: false };
    const forecastData = await forecastRes.json();
    const period = forecastData.properties && forecastData.properties.periods && forecastData.properties.periods[0];
    if (!period) return { available: false };

    // NWS reports calm wind as the literal text "Calm" (no digits) and
    // often omits a direction for it entirely — treat that as 0 mph
    // rather than letting the regex/compass lookup both come back null
    // and silently hiding the whole wind readout.
    const windSpeedText = (period.windSpeed || '').toLowerCase();
    let windSpeedMph = null;
    if (windSpeedText.includes('calm')) {
      windSpeedMph = 0;
    } else {
      const speedMatch = /(\d+)/.exec(period.windSpeed || '');
      windSpeedMph = speedMatch ? Number(speedMatch[1]) : null;
    }
    const windFromDeg = compassToDegrees(period.windDirection);
    const windTowardDeg = (windFromDeg != null) ? (windFromDeg + 180) % 360 : null;

    return {
      available: true,
      tempF: period.temperature,
      condition: classifyWeatherCondition(period.shortForecast),
      shortForecast: period.shortForecast,
      isDaytime: !!period.isDaytime,
      windSpeedMph,
      windFromDeg,
      windTowardDeg,
      fetchedAt: Date.now()
    };
  } catch (err) {
    return { available: false };
  }
}

/* ---------- Icons (inline SVG — no external image files) ---------- */

const WEATHER_ICON_PATHS = {
  sunny: '<circle cx="32" cy="32" r="14" fill="#FFC107"/>' +
    [0, 45, 90, 135, 180, 225, 270, 315].map(a =>
      '<line x1="32" y1="32" x2="32" y2="8" stroke="#FFC107" stroke-width="4" stroke-linecap="round" transform="rotate(' + a + ' 32 32)"/>'
    ).join(''),
  'partly-cloudy': '<circle cx="23" cy="22" r="9" fill="#FFC107"/>' +
    '<ellipse cx="36" cy="40" rx="18" ry="12" fill="#B0BEC5"/>',
  cloudy: '<ellipse cx="34" cy="36" rx="20" ry="13" fill="#90A4AE"/>' +
    '<ellipse cx="20" cy="32" rx="12" ry="9" fill="#B0BEC5"/>',
  rain: '<ellipse cx="32" cy="24" rx="18" ry="11" fill="#90A4AE"/>' +
    [-10, 4, 18].map(x =>
      '<line x1="' + (22 + x) + '" y1="38" x2="' + (18 + x) + '" y2="54" stroke="#2196F3" stroke-width="3" stroke-linecap="round"/>'
    ).join(''),
  thunderstorm: '<ellipse cx="32" cy="22" rx="18" ry="11" fill="#78909C"/>' +
    '<polygon points="30,34 22,50 30,48 26,60 42,42 33,44" fill="#FFC107"/>',
  snow: '<ellipse cx="32" cy="22" rx="18" ry="11" fill="#B0BEC5"/>' +
    [16, 32, 48].map(x =>
      '<circle cx="' + x + '" cy="50" r="3" fill="#90CAF9"/>'
    ).join(''),
  fog: [18, 30, 42].map(y =>
    '<line x1="10" y1="' + y + '" x2="54" y2="' + y + '" stroke="#B0BEC5" stroke-width="4" stroke-linecap="round"/>'
  ).join('')
};

// A real crescent, via an SVG mask cutting a circular "bite" out of a
// full moon disc — robust regardless of light/dark background, unlike
// the common two-arcs-with-different-radii path trick, which only
// produces a valid crescent when the endpoints aren't perfectly
// diametrically opposite (they were here, which silently collapsed the
// whole shape to nothing — the bug behind the "no moon" report).
function moonSvg(sizePx) {
  const maskId = 'moon-mask-' + Math.random().toString(36).slice(2);
  return '<svg viewBox="0 0 64 64" width="' + sizePx + '" height="' + sizePx + '" style="display:block;">' +
    '<defs><mask id="' + maskId + '"><rect width="64" height="64" fill="#fff"/><circle cx="41" cy="23" r="15" fill="#000"/></mask></defs>' +
    '<circle cx="32" cy="32" r="18" fill="#FFD54F" mask="url(#' + maskId + ')"/>' +
    '<circle cx="52" cy="14" r="2" fill="#FFD54F"/>' +
    '<circle cx="56" cy="25" r="1.3" fill="#FFD54F"/>' +
    '</svg>';
}

function partlyCloudyNightSvg(sizePx) {
  const maskId = 'moon-mask-' + Math.random().toString(36).slice(2);
  return '<svg viewBox="0 0 64 64" width="' + sizePx + '" height="' + sizePx + '" style="display:block;">' +
    '<defs><mask id="' + maskId + '"><rect width="64" height="64" fill="#fff"/><circle cx="28" cy="15" r="8" fill="#000"/></mask></defs>' +
    '<circle cx="23" cy="22" r="10" fill="#FFD54F" mask="url(#' + maskId + ')"/>' +
    '<ellipse cx="36" cy="40" rx="18" ry="12" fill="#B0BEC5"/>' +
    '</svg>';
}

function weatherIconSvg(condition, sizePx, isDaytime) {
  sizePx = sizePx || 32;
  if (isDaytime === false && condition === 'sunny') return moonSvg(sizePx);
  if (isDaytime === false && condition === 'partly-cloudy') return partlyCloudyNightSvg(sizePx);
  const inner = WEATHER_ICON_PATHS[condition] || WEATHER_ICON_PATHS.cloudy;
  return '<svg viewBox="0 0 64 64" width="' + sizePx + '" height="' + sizePx + '" style="display:block;">' + inner + '</svg>';
}

// Points "up" (toward whatever bearing 0 currently means for it) by
// default — rotated via CSS transform to the real bearing at render
// time and live-updated as the device heading changes.
function windArrowSvg(sizePx) {
  sizePx = sizePx || 24;
  return '<svg viewBox="0 0 64 64" width="' + sizePx + '" height="' + sizePx + '" style="display:block;">' +
    '<polygon points="32,6 44,30 34,30 34,58 30,58 30,30 20,30" fill="#FF2D95"/>' +
    '</svg>';
}

/* ---------- Device compass (wind arrow relative to facing direction) ---------- */

let deviceHeading = null;          // degrees, 0 = facing true/magnetic north, clockwise
let compassPermissionGranted = false;
const activeWindArrowEls = new Set();

function handleOrientationEvent(e) {
  let heading = null;
  if (typeof e.webkitCompassHeading === 'number') {
    heading = e.webkitCompassHeading; // iOS Safari: already a true heading, 0=N clockwise
  } else if (e.absolute && typeof e.alpha === 'number') {
    heading = (360 - e.alpha) % 360; // best-effort for standard 'deviceorientationabsolute'
  }
  if (heading != null && !isNaN(heading)) {
    deviceHeading = heading;
    updateAllWindArrows();
  }
}

function attachCompassListeners() {
  window.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
  window.addEventListener('deviceorientation', handleOrientationEvent, true);
}

// iOS 13+ requires an explicit user gesture (a button tap) before it
// will grant compass access — this is called from that button's click
// handler. Everywhere else (Android, desktop, older iOS) has no such
// gate, so we just attach directly there with no visible prompt.
function requestCompassPermission(onDone) {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(state => {
      compassPermissionGranted = (state === 'granted');
      if (compassPermissionGranted) attachCompassListeners();
      if (onDone) onDone(compassPermissionGranted);
    }).catch(() => { if (onDone) onDone(false); });
  } else {
    compassPermissionGranted = true;
    attachCompassListeners();
    if (onDone) onDone(true);
  }
}

// Environments with no permission gate at all can just start listening
// immediately — only iOS's explicit requestPermission() gate needs the
// visible "Enable Compass" button deferred to a user tap.
if (typeof DeviceOrientationEvent === 'undefined' || typeof DeviceOrientationEvent.requestPermission !== 'function') {
  compassPermissionGranted = true;
  attachCompassListeners();
}

function updateAllWindArrows() {
  activeWindArrowEls.forEach(el => {
    if (!el.isConnected) { activeWindArrowEls.delete(el); return; }
    const windTowardDeg = Number(el.dataset.windTowardDeg);
    if (isNaN(windTowardDeg)) return;
    const relative = (deviceHeading != null) ? (windTowardDeg - deviceHeading + 360) % 360 : windTowardDeg;
    el.style.transform = 'rotate(' + relative + 'deg)';
  });
}

/* ---------- Shared widget renderer ---------- */

// Renders into containerEl and returns nothing — callers just need to
// have already fetched weatherData via fetchNwsWeather() and have a
// container element ready (a plain <div> is fine).
function renderWeatherWidget(containerEl, weatherData) {
  if (!containerEl) return;

  if (!weatherData || !weatherData.available) {
    containerEl.innerHTML = '<div class="weather-widget-unavailable">Weather unavailable for this location.</div>';
    return;
  }

  const arrowId = 'w-arrow-' + Math.random().toString(36).slice(2);
  let html = '<div class="weather-widget">' +
    '<span class="weather-widget-icon">' + weatherIconSvg(weatherData.condition, 30, weatherData.isDaytime) + '</span>' +
    '<span class="weather-widget-temp">' + Math.round(weatherData.tempF) + '&deg;F</span>';

  // Show the wind speed whenever we have it, even if the direction is
  // unknown (calm wind, or NWS just didn't report one for this period)
  // — only the rotating arrow itself needs a real bearing to make sense.
  if (weatherData.windSpeedMph != null) {
    const speedText = (weatherData.windSpeedMph === 0) ? 'Calm' : (Math.round(weatherData.windSpeedMph) + ' mph');
    if (weatherData.windSpeedMph > 0 && weatherData.windTowardDeg != null) {
      html += '<span class="weather-widget-wind">' +
        '<span class="weather-widget-arrow" id="' + arrowId + '" data-wind-toward-deg="' + weatherData.windTowardDeg + '">' + windArrowSvg(22) + '</span>' +
        '<span>' + speedText + '</span>' +
        '</span>';
    } else {
      html += '<span class="weather-widget-wind"><span>' + speedText + '</span></span>';
    }
  }

  if (!compassPermissionGranted) {
    html += '<button type="button" class="weather-widget-compass-btn">Enable Compass</button>';
  }

  html += '</div>';
  containerEl.innerHTML = html;

  const arrowEl = document.getElementById(arrowId);
  if (arrowEl) {
    activeWindArrowEls.add(arrowEl);
    updateAllWindArrows();
  }

  const compassBtn = containerEl.querySelector('.weather-widget-compass-btn');
  if (compassBtn) {
    compassBtn.addEventListener('click', () => {
      requestCompassPermission((granted) => {
        if (granted) {
          compassBtn.remove();
          updateAllWindArrows();
        }
      });
    });
  }
}
