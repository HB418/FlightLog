/* js/map-icons.js
   Tee/basket icon factories, zoom-based scaling, and the draggable
   hole-number label system. Shared by the round-view map, the
   course-creation wizard, and the Admin Map Entry panel. */

// Default (non-current-hole) tee pad — pink box, yellow border/arrow.
const TEE_PAD_ICON_URL = 'img/Tee-Pad-Pink.png?v=1';
// Current-hole tee pad — yellow box, pink border/arrow.
const TEE_PAD_CURRENT_ICON_URL = 'img/Tee-Pad-Yellow.png?v=1';

// Base sizes (in px) at ICON_BASE_ZOOM — icons scale up/down from here as
// the map zooms, like a real object on the ground rather than a fixed
// on-screen HUD element.
const ICON_BASE_ZOOM = 18;
const TEE_BASE_W = 47, TEE_BASE_H = 20;
const BASKET_BASE_W = 18, BASKET_BASE_H = 23;
// Floor for marker pixel dimensions, matching the hole-number label's
// rendered size (font-size: 0.95rem ≈ 15-16px) — without this, markers
// can keep shrinking with zoom-out past the point where they're smaller
// than their own number label, which looks broken. Below the zoom level
// where a marker would cross this floor, it just stays locked at this
// size instead (effectively "scaling with" the fixed-size label).
const MIN_ICON_PX = 16;

function scaleForZoom(map) {
  const z = map.getZoom();
  // A freshly-created map has no zoom set yet until setView() runs (which
  // happens on a delay, after tiles/markers are added) — getZoom() returns
  // undefined in that window, which would otherwise propagate NaN through
  // every icon size calculation below.
  if (typeof z !== 'number' || isNaN(z)) return 1;
  const scale = Math.pow(2, z - ICON_BASE_ZOOM);
  return Math.max(0.35, Math.min(scale, 3));
}

// Font size (rem) for the draggable hole-number labels. Grows/shrinks
// with zoom, but DAMPENED (scale^0.7, not scale directly) — full 1:1
// scaling with the icon was what caused labels to grow large enough to
// overlap the icon at high zoom; freezing it entirely (tested
// previously) mostly fixed that but caused the label to visually fall
// behind the icon's own growth, reading as a slight leftward drift at
// higher zoom. This dampened growth is the middle ground: still
// noticeably bigger at high zoom (closer to matching the icon's own
// growth than before, to reduce that drift further), without growing
// as fast as the icon itself.
const LABEL_BASE_REM = 0.6;
function labelFontRemForZoom(map) {
  const scale = scaleForZoom(map);
  return LABEL_BASE_REM * Math.pow(scale, 0.7);
}

function makeTeeDivIcon(rotationDeg, scale, isCurrent) {
  scale = scale || 1;
  const url = isCurrent ? TEE_PAD_CURRENT_ICON_URL : TEE_PAD_ICON_URL;
  const w = Math.max(MIN_ICON_PX, Math.round(TEE_BASE_W * scale));
  const h = Math.max(MIN_ICON_PX, Math.round(TEE_BASE_H * scale));
  return L.divIcon({
    html: '<img src="' + url + '" style="width:100%;height:100%;object-fit:contain;display:block;transform:rotate(' + (rotationDeg || 0) + 'deg);"/>',
    className: 'placement-div-icon',
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2]
  });
}

// Basket marker icon — anchored at the bottom-center of the pole, since
// this marker should point at one exact ground spot (unlike the tee pad,
// which represents an area and is anchored at its own center).
// Uses a divIcon (not L.icon) with object-fit:contain so the real image's
// aspect ratio is preserved instead of being stretched to fill iconSize.
// Default (non-current-hole) basket — yellow. Current-hole basket — pink.
const BASKET_ICON_URL = 'img/BasketYellow.png?v=1';
const BASKET_CURRENT_ICON_URL = 'img/BasketPink.png?v=1';
function makeBasketIcon(scale, isCurrent) {
  scale = scale || 1;
  const url = isCurrent ? BASKET_CURRENT_ICON_URL : BASKET_ICON_URL;
  const w = Math.max(MIN_ICON_PX, Math.round(BASKET_BASE_W * scale));
  const h = Math.max(MIN_ICON_PX, Math.round(BASKET_BASE_H * scale));
  return L.divIcon({
    html: '<img src="' + url + '" style="width:100%;height:100%;object-fit:contain;object-position:center bottom;display:block;"/>',
    className: 'placement-div-icon',
    iconSize: [w, h],
    iconAnchor: [w / 2, h]
  });
}

// Marker registries so tee/basket icons can be rescaled together whenever
// a map's zoom changes. Each entry: {marker, kind:'tee'|'basket',
// holeNumber, isCurrent}. Tee markers also carry marker._rotationDeg so a
// rescale (setIcon) doesn't lose the rotation the user set.
let headerMapIcons = [];
let mapZoomMapIcons = [];
let holePlacementIcons = [];

// Leaflet's Handler.enable() checks an internal "already enabled" flag
// and no-ops if it thinks dragging is already on — so calling it after
// setIcon() (which swaps in a new DOM element) doesn't actually rebind
// the drag listeners to the new element. Forcing a real disable+enable
// roundtrip is what actually re-attaches them.
function forceReenableDragging(marker) {
  if (!marker || !marker.dragging) return;
  // Only re-enable if the marker was actually created draggable in the
  // first place (Admin panel / wizard). Without this check, calling
  // .enable() unconditionally — even just to fix the stale-handler bug —
  // would turn dragging ON for markers that were never meant to be
  // draggable at all, like the round-view's tee/basket pins during play.
  if (marker.options.draggable) {
    marker.dragging.disable();
    marker.dragging.enable();
  } else {
    marker.dragging.disable();
  }
}

function rescaleIconMarkers(map, registry) {
  const scale = scaleForZoom(map);
  registry.forEach(entry => {
    if (entry.kind === 'tee') {
      entry.marker.setIcon(makeTeeDivIcon(entry.marker._rotationDeg || 0, scale, entry.isCurrent));
    } else {
      entry.marker.setIcon(makeBasketIcon(scale, entry.isCurrent));
    }
    // setIcon() replaces the marker's DOM element — re-assert dragging
    // explicitly afterward, since Leaflet's drag handler can otherwise
    // end up stuck referencing the old (now-detached) element, silently
    // "locking" the marker/label in place after a zoom-triggered rescale.
    forceReenableDragging(entry.marker);
    rescaleHoleLabel(entry.marker, map);
  });
}

// Updates a marker's attached draggable hole-number label (if any) to
// match the current zoom's font size, and repositions it from its
// stored base offset (position-scaling always applies, everywhere).
// draggableOverride, if given, forces the recreated label's draggable
// state (used by the Admin panel's "Lock numbers" feature); otherwise
// it's inferred from whatever the label's current state already is.
function rescaleHoleLabel(marker, map, draggableOverride) {
  const oldLabel = marker._holeLabelMarker;
  if (!oldLabel) return;
  const text = oldLabel._labelText || '';
  const baseOffset = oldLabel._baseOffsetPx || { x: 16, y: 0 };
  // Always fully recreate the label rather than mutate the existing one
  // — that's what actually guarantees a working drag handler every time
  // (see buildHoleLabelMarker for why). Position/scale always applies;
  // "locked" only ever controls whether the recreated label is draggable.
  const draggable = (draggableOverride !== undefined)
    ? draggableOverride
    : !!(oldLabel.dragging && oldLabel.dragging.enabled());

  map.removeLayer(oldLabel);
  buildHoleLabelMarker(marker, map, text, baseOffset, draggable);
}

function updateMarkerHoleLabel(marker, holeNumbers, options) {
  options = options || {};
  const text = holeNumbers.join(', ');
  const map = marker._map;
  if (!map) return;

  // Remove any existing label for this marker first, so repeated calls
  // (e.g. reusing a basket across holes) don't stack duplicate markers.
  if (marker._holeLabelMarker) {
    map.removeLayer(marker._holeLabelMarker);
    marker._holeLabelMarker = null;
  }

  const draggable = options.draggable !== false; // default: draggable, unless explicitly told otherwise
  // Base offset (scale=1 px units) — a saved one if provided (loading a
  // course you already positioned numbers on), else the default spot.
  const baseOffset = options.baseOffset || { x: 16, y: 0 };

  buildHoleLabelMarker(marker, map, text, baseOffset, draggable);

  // Keep the label following the parent marker whenever IT moves (drag
  // or a programmatic setLatLng both fire Leaflet's 'move' event) —
  // recomputed from the label's own stored base offset every time, so
  // it tracks correctly regardless of zoom.
  if (!marker._hasLabelMoveListener) {
    marker._hasLabelMoveListener = true;
    marker.on('move', () => {
      if (!marker._holeLabelMarker) return;
      repositionHoleLabel(marker, map);
    });
  }
}

// Builds (or rebuilds) a marker's attached number-label marker at the
// given base offset. Always creates a FRESH Leaflet marker rather than
// trying to reuse/repair an existing one — recreating is what actually
// guarantees a correctly working drag handler; toggling .enable() on an
// existing one after its parent's icon was swapped (setIcon) was not
// reliable (Leaflet's Handler.enable() no-ops if it thinks it's already
// enabled, so it doesn't rebind to a new DOM element).
function buildHoleLabelMarker(marker, map, text, baseOffset, draggable) {
  const scale = scaleForZoom(map);
  const parentPt = map.latLngToContainerPoint(marker.getLatLng());
  const labelPt = L.point(parentPt.x + baseOffset.x * scale, parentPt.y + baseOffset.y * scale);
  const labelLatLng = map.containerPointToLatLng(labelPt);

  const fontRem = labelFontRemForZoom(map);
  const icon = L.divIcon({
    html: '<div class="hole-number-label-draggable" style="font-size:' + fontRem + 'rem;">' + text + '</div>',
    className: 'placement-div-icon',
    iconSize: [1, 1],
    iconAnchor: [0, 8]
  });
  const labelMarker = L.marker(labelLatLng, { icon: icon, draggable: draggable, keyboard: false }).addTo(map);
  labelMarker._labelText = text;
  labelMarker._baseOffsetPx = baseOffset;

  if (draggable) {
    // Recompute the stored base offset once the user finishes dragging,
    // so future zoom changes scale from the new position, not the old.
    labelMarker.on('dragend', () => {
      const s = scaleForZoom(map);
      const pPt = map.latLngToContainerPoint(marker.getLatLng());
      const lPt = map.latLngToContainerPoint(labelMarker.getLatLng());
      labelMarker._baseOffsetPx = { x: (lPt.x - pPt.x) / s, y: (lPt.y - pPt.y) / s };
    });
  }

  marker._holeLabelMarker = labelMarker;
  return labelMarker;
}

// Repositions a marker's attached label from its stored base offset —
// used both when the parent marker moves and on every zoom rescale.
function repositionHoleLabel(marker, map) {
  const label = marker._holeLabelMarker;
  if (!label) return;
  const scale = scaleForZoom(map);
  const offset = label._baseOffsetPx || { x: 16, y: 0 };
  const parentPt = map.latLngToContainerPoint(marker.getLatLng());
  const newPt = L.point(parentPt.x + offset.x * scale, parentPt.y + offset.y * scale);
  label.setLatLng(map.containerPointToLatLng(newPt));
}
