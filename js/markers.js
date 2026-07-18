// markers.js — Gestion des marqueurs et filtres
window.MarkerManager = (function() {
  const cfg = window.APP_CONFIG;
  const iconCache = {};
  
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
  
  function buildPopupContent(pt, userLatLng) {
    const div = document.createElement('div');
    const vis = window.StorageManager.isVisited(pt.id);
    const color = cfg.STATUS_COLOR[pt.status] || '#95a5a6';
    
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
      <div class="popup-status" style="background:${color}22;color:${color};border:1px solid ${color};">${esc(pt.status)}</div>
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
    
    return div;
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
  
  function passesFilters(pt) {
    const b = document.getElementById('filterBlock').value;
    const s = document.getElementById('filterStatus').value;
    const v = document.getElementById('filterVisited').value;
    const q = document.getElementById('searchBox').value.trim().toLowerCase();
    
    if (b !== 'all' && String(pt.block) !== b) return false;
    if (s !== 'all' && pt.status !== s) return false;
    if (v === 'yes' && !window.StorageManager.isVisited(pt.id)) return false;
    if (v === 'no' && window.StorageManager.isVisited(pt.id)) return false;
    if (q) {
      const hay = (pt.name + ' ' + pt.quartier + ' ' + pt.address).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }
  
  function refreshMarker(marker, pt, userLatLng) {
    if (!marker) return;
    const color = cfg.STATUS_COLOR[pt.status] || '#95a5a6';
    marker.setIcon(getIcon(color, window.StorageManager.isVisited(pt.id)));
    if (marker.getPopup() && marker.getPopup().isOpen()) {
      marker.setPopupContent(buildPopupContent(pt, userLatLng));
    }
  }
  
  return { getIcon, buildPopupContent, passesFilters, refreshMarker };
})();
