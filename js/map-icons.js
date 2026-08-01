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

// Font size (rem) for the draggable hole-number labels. Uses the exact
// same scale factor as the markers AND the label's own position offset
// (no separate compressed range) — so the label's size, its distance
// from its marker, and the marker's own size all grow/shrink together
// at the identical rate. That's what actually fixes labels drifting far
// from their marker or overlapping it at zooms other than wherever they
// were originally positioned — the offset and the font were previously
// scaling by two different formulas.
const LABEL_BASE_REM = 0.6;
function labelFontRemForZoom(map) {
  return LABEL_BASE_REM * scaleForZoom(map);
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
  // Always fully recreate the label rather than mutate the existing one
  // — that's what actually guarantees a working drag handler every time
  // (see buildHoleLabelMarker for why). Position/scale always applies;
  // "locked" only ever controls whether the recreated label is draggable.
  // The offset itself lives on the PARENT marker (_labelOffsetRatio),
  // not the label, so it isn't affected by recreating the label here.
  const draggable = (draggableOverride !== undefined)
    ? draggableOverride
    : !!(oldLabel.dragging && oldLabel.dragging.enabled());

  map.removeLayer(oldLabel);
  buildHoleLabelMarker(marker, map, text, null, draggable);
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
  // A saved course may have a legacy offset (raw pixels at scale=1,
  // from an earlier version of this system) — convert it into today's
  // ratio format, relative to the marker's own fixed base half-width,
  // so it positions correctly under the current (fixed) math instead
  // of being ignored or reapplied with the wrong scale.
  if (options.baseOffset) {
    const baseHalfWidth = baseIconHalfWidthFor(marker);
    marker._labelOffsetRatio = { x: options.baseOffset.x / baseHalfWidth, y: options.baseOffset.y / baseHalfWidth };
  }

  buildHoleLabelMarker(marker, map, text, options.baseOffset, draggable);

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

// A marker's own fixed BASE half-width (at scale=1, i.e. ICON_BASE_ZOOM)
// — tee markers carry _rotationDeg, basket markers don't, so this is a
// reliable way to tell them apart without a separate parameter.
function baseIconHalfWidthFor(marker) {
  return (marker._rotationDeg !== undefined ? TEE_BASE_W : BASKET_BASE_W) / 2;
}

// Computes a label's position offset from its marker. If the marker has
// a custom dragged ratio stored, uses that; otherwise a small default
// padding just past the marker's edge. Critically, BOTH cases scale the
// offset using the marker's CURRENT rendered icon half-width — the same
// value that already correctly respects the MIN_ICON_PX floor icons
// have. That floor was the actual bug before: the marker's size stops
// shrinking below 16px at low zoom, but an offset scaled by the raw
// zoom factor alone (with no floor of its own) kept shrinking toward
// zero, so the label collapsed onto the marker. Scaling from the same
// floored value the icon itself uses keeps them moving together at
// every zoom, custom-dragged or not.
function computeLabelOffsetForMarker(marker) {
  const icon = marker.options.icon;
  const iconSize = (icon && icon.options && icon.options.iconSize) || [16, 16];
  const halfWidth = iconSize[0] / 2;
  if (marker._labelOffsetRatio) {
    return { x: marker._labelOffsetRatio.x * halfWidth, y: marker._labelOffsetRatio.y * halfWidth };
  }
  const PADDING = 6;
  return { x: halfWidth + PADDING, y: 0 };
}

// Builds (or rebuilds) a marker's attached number-label marker. Always
// creates a FRESH Leaflet marker rather than reusing/repairing an
// existing one — recreating is what guarantees a working drag handler;
// toggling .enable() on one after its parent's icon was swapped
// (setIcon) was not reliable.
function buildHoleLabelMarker(marker, map, text, baseOffset, draggable) {
  const offset = computeLabelOffsetForMarker(marker);
  const parentPt = map.latLngToContainerPoint(marker.getLatLng());
  const labelPt = L.point(parentPt.x + offset.x, parentPt.y + offset.y);
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

  if (draggable) {
    // On drag, store the new position as a RATIO of the marker's current
    // icon half-width (not raw pixels) — that's what lets it be
    // reapplied correctly at any other zoom later (see
    // computeLabelOffsetForMarker above).
    labelMarker.on('dragend', () => {
      const pPt = map.latLngToContainerPoint(marker.getLatLng());
      const lPt = map.latLngToContainerPoint(labelMarker.getLatLng());
      const curIcon = marker.options.icon;
      const curIconSize = (curIcon && curIcon.options && curIcon.options.iconSize) || [16, 16];
      const curHalfWidth = curIconSize[0] / 2;
      marker._labelOffsetRatio = { x: (lPt.x - pPt.x) / curHalfWidth, y: (lPt.y - pPt.y) / curHalfWidth };
    });
  }

  marker._holeLabelMarker = labelMarker;
  return labelMarker;
}

// Repositions a marker's attached label — recomputed fresh every time
// from the marker's current icon size and its stored ratio (if any),
// used both when the parent marker moves and on every zoom rescale.
function repositionHoleLabel(marker, map) {
  const label = marker._holeLabelMarker;
  if (!label) return;
  const offset = computeLabelOffsetForMarker(marker);
  const parentPt = map.latLngToContainerPoint(marker.getLatLng());
  const newPt = L.point(parentPt.x + offset.x, parentPt.y + offset.y);
  label.setLatLng(map.containerPointToLatLng(newPt));
}
