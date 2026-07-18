// markers.js — Gestion des marqueurs et filtres
window.Markers = (function() {
  const cfg = window.APP_CONFIG;
  const iconCache = {};

  let mapRef = null;
  let clusterGroup = null;
  const markersById = {};
  const pointsById = {};

  // === Icônes ===
  function getIcon(color, isVis) {
    const key = color + (isVis ? '_v' : '_n');
    if (iconCache[key]) return iconCache[key];

    const opacity = isVis ? 0.45 : 1;
    const stroke = isVis ? '#555' : '#222';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
      <path d="M13 0C6 0 0 6 0 13c0 9 13 21 13 21s13-12 13-21C26 6 20 0 13 0z" fill="${color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1.5"/>
      <circle cx="13" cy="13" r="5.5" fill="white" fill-opacity="${isVis ? 0.85 : 1}"/>
      ${isVis ? '<path d="M9 13l2.5 2.5L17 10" stroke="#2e7d32" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' : ''}
    </svg>`;

    const icon = L.divIcon({ html: svg, className: '', iconSize: [26, 34], iconAnchor: [13, 34], popupAnchor: [0, -30] });
    iconCache[key] = icon;
    return icon;
  }

  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s === undefined || s === null ? '' : String(s);
    return div.innerHTML;
  }

  // === Aides visite / statut effectif (tient compte des overrides locaux/Supabase) ===
  function isVisited(id) {
    const o = window.Storage.getOverride(id);
    return !!(o && o.visited);
  }

  function effectiveStatus(pt) {
    const o = window.Storage.getOverride(pt.id);
    return (o && o.statut) || pt.status;
  }

  function currentUserLatLng() {
    if (!window.Geolocation || !window.Geolocation.getCurrentPos) return null;
    const pos = window.Geolocation.getCurrentPos();
    if (!pos) return null;
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function formatDist(km) {
    if (km < 1) return Math.round(km * 1000) + ' m';
    return km.toFixed(1) + ' km';
  }

  // === Popup ===
  function buildPopupContent(pt) {
    const div = document.createElement('div');
    const vis = isVisited(pt.id);
    const status = effectiveStatus(pt);
    const color = cfg.STATUS_COLORS[status] || '#95a5a6';
    const userLatLng = currentUserLatLng();

    let distRow = '';
    if (userLatLng) {
      const d = haversineKm(userLatLng.lat, userLatLng.lng, pt.lat, pt.lon);
      distRow = `<div class="popup-dist">📍 ${formatDist(d)} de votre position</div>`;
    }

    div.innerHTML = `
      <div class="popup-title">${esc(pt.order)}. ${esc(pt.name || '(sans nom)')}${vis ? ' <span style="color:#2e7d32">✔ Visité</span>' : ''}</div>
      <div class="popup-row"><b>Bloc:</b> ${String(pt.block).padStart(2,'0')} — Ordre ${esc(pt.order)}</div>
      <div class="popup-row"><b>Téléphone:</b> ${esc(pt.tel || '—')}</div>
      <div class="popup-row"><b>Quartier:</b> ${esc(pt.quartier || '—')}</div>
      <div class="popup-row"><b>Adresse:</b> ${esc(pt.address || '—')}</div>
      <div class="popup-row"><b>Produits:</b> ${esc(pt.produits || '—')}</div>
      <div class="popup-row"><b>Sexe:</b> ${esc(pt.sexe || '—')}</div>
      <div class="popup-status" style="background:${color}22;color:${color};border:1px solid ${color};">${esc(status)}</div>
      ${distRow}
      <div class="btn-row">
        <button class="go-btn" data-action="route" data-id="${pt.id}">🧭 Aperçu</button>
        <button class="go-btn" style="background:#0d47a1" data-action="navigate" data-id="${pt.id}">▶️ Naviguer</button>
      </div>
      <div class="btn-row">
        <button class="visit-btn ${vis ? 'btn-unvisit' : 'btn-visit'}" data-action="visit" data-id="${pt.id}">
          ${vis ? '↩️ Annuler' : '✅ Marquer visité'}
        </button>
      </div>`;

    div.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', onPopupButtonClick);
    });

    return div;
  }

  function onPopupButtonClick(e) {
    const btn = e.currentTarget;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const pt = pointsById[id];
    if (!pt) return;

    if (action === 'route' || action === 'navigate') {
      if (window.Navigation) window.Navigation.startTo(pt);
    } else if (action === 'visit') {
      const vis = isVisited(pt.id);
      window.Storage.setVisited(pt.id, !vis, pt.status).then(() => {
        refreshOne(pt.id);
        const marker = markersById[pt.id];
        if (marker) marker.openPopup();
      });
    }
  }

  // === Filtres ===
  function passesFilters(pt) {
    const b = document.getElementById('filterBlock').value;
    const s = document.getElementById('filterStatus').value;
    const v = document.getElementById('filterVisited').value;
    const q = document.getElementById('searchBox').value.trim().toLowerCase();

    if (b !== 'all' && String(pt.block) !== b) return false;
    if (s !== 'all' && effectiveStatus(pt) !== s) return false;
    if (v === 'yes' && !isVisited(pt.id)) return false;
    if (v === 'no' && isVisited(pt.id)) return false;
    if (q) {
      const hay = (pt.name + ' ' + pt.quartier + ' ' + pt.address).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function applyFilters() {
    Object.keys(markersById).forEach((id) => {
      const pt = pointsById[id];
      const marker = markersById[id];
      const show = passesFilters(pt);
      const has = clusterGroup.hasLayer(marker);
      if (show && !has) clusterGroup.addLayer(marker);
      if (!show && has) clusterGroup.removeLayer(marker);
    });
    updateStatsHeader();
  }

  // === Rafraîchissement ===
  function refreshMarker(marker, pt) {
    if (!marker) return;
    const status = effectiveStatus(pt);
    const color = cfg.STATUS_COLORS[status] || '#95a5a6';
    marker.setIcon(getIcon(color, isVisited(pt.id)));
    if (marker.getPopup() && marker.getPopup().isOpen()) {
      marker.setPopupContent(buildPopupContent(pt));
    }
  }

  function refreshOne(id) {
    const pt = pointsById[id];
    const marker = markersById[id];
    refreshMarker(marker, pt);
    updateStatsHeader();
  }

  // === En-tête statistiques ===
  function updateStatsHeader() {
    const el = document.getElementById('statsHeader');
    if (!el) return;
    const total = DATA.length;
    let visitedCount = 0;
    DATA.forEach((pt) => {
      if (isVisited(pt.id)) visitedCount++;
    });
    el.textContent = `${visitedCount} / ${total} visités`;
  }

  // === Filtre "Bloc" (peuplement dynamique) ===
  function populateBlockFilter() {
    const select = document.getElementById('filterBlock');
    if (!select) return;
    const blocks = Array.from(new Set(DATA.map((p) => p.block))).sort((a, b) => a - b);
    blocks.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = String(b);
      opt.textContent = 'Bloc ' + String(b).padStart(2, '0');
      select.appendChild(opt);
    });
  }

  // === Initialisation ===
  function init(map) {
    mapRef = map;
    clusterGroup = L.markerClusterGroup();

    DATA.forEach((pt) => {
      pointsById[pt.id] = pt;
      const status = effectiveStatus(pt);
      const color = cfg.STATUS_COLORS[status] || '#95a5a6';
      const marker = L.marker([pt.lat, pt.lon], { icon: getIcon(color, isVisited(pt.id)) });
      marker.bindPopup(buildPopupContent(pt));
      marker.on('popupopen', () => {
        marker.setPopupContent(buildPopupContent(pt));
      });
      markersById[pt.id] = marker;
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);
    populateBlockFilter();
    updateStatsHeader();
  }

  // === Accès aux données ===
  function getAllPoints() {
    return DATA.map((pt) => Object.assign({}, pt, {
      status: effectiveStatus(pt),
      visited: isVisited(pt.id)
    }));
  }

  function getMarker(id) {
    return markersById[id];
  }

  return {
    init,
    applyFilters,
    getAllPoints,
    getMarker,
    refreshOne,
    updateStatsHeader,
    getIcon,
    buildPopupContent,
    passesFilters,
    refreshMarker
  };
})();
