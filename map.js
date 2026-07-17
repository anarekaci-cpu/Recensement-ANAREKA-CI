// map.js — Initialisation de la carte et gestion des marqueurs
window.MapManager = (function() {
  const cfg = window.APP_CONFIG;
  let map, markersCluster, markerRefs = {};
  let debounceTimer = null;
  
  function init() {
    map = L.map('map', { zoomControl: true, preferCanvas: true, tap: true })
      .setView(cfg.MAP_CENTER, cfg.MAP_ZOOM);
    
    L.tileLayer(cfg.TILE_URL, {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
      updateWhenIdle: true,
      keepBuffer: 2
    }).addTo(map);
    
    markersCluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      chunkedLoading: true,
      chunkInterval: 50,
      chunkDelay: 20,
      disableClusteringAtZoom: 17
    });
    map.addLayer(markersCluster);
    
    return map;
  }
  
  function buildAllMarkers(points, userLatLng) {
    markerRefs = {};
    points.forEach(pt => {
      const color = cfg.STATUS_COLOR[pt.status] || '#95a5a6';
      const marker = L.marker([pt.lat, pt.lon], {
        icon: window.MarkerManager.getIcon(color, window.StorageManager.isVisited(pt.id))
      });
      
      const popupContent = window.MarkerManager.buildPopupContent(pt, userLatLng);
      marker.bindPopup(popupContent, { minWidth: 240 });
      
      marker.on('popupopen', function() {
        const popup = this.getPopup();
        const content = popup.getContent();
        
        // Attacher les événements aux boutons du popup
        setTimeout(() => {
          const el = document.getElementById('map').querySelector('.leaflet-popup-content');
          if (!el) return;
          
          el.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async function(e) {
              const action = this.dataset.action;
              const id = this.dataset.id;
              const point = points.find(p => p.id === id);
              if (!point) return;
              
              if (action === 'visit') {
                if (window.StorageManager.isVisited(id)) {
                  await window.StorageManager.unmarkVisited(id);
                } else {
                  await window.StorageManager.markVisited(id);
                }
                window.MarkerManager.refreshMarker(markerRefs[id], point, getCurrentUserLatLng());
                window.App.updateStats();
                map.closePopup();
              } else if (action === 'route') {
                window.Navigation.drawRoute(point);
                map.closePopup();
              } else if (action === 'navigate') {
                window.Navigation.startNavigation(point);
                map.closePopup();
              }
            });
          });
        }, 50);
      });
      
      markerRefs[pt.id] = marker;
    });
    return markerRefs;
  }
  
  function renderMarkers(points) {
    markersCluster.clearLayers();
    const toAdd = [];
    points.forEach(pt => {
      if (window.MarkerManager.passesFilters(pt)) {
        toAdd.push(markerRefs[pt.id]);
      }
    });
    markersCluster.addLayers(toAdd);
  }
  
  function debouncedRender(points) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderMarkers(points), 150);
  }
  
  function getMarker(id) { return markerRefs[id]; }
  function getMap() { return map; }
  function getMarkers() { return markerRefs; }
  
  return { init, buildAllMarkers, renderMarkers, debouncedRender, getMarker, getMap, getMarkers };
})();
