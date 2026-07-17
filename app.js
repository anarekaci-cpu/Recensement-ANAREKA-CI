// app.js — Point d'entrée de l'application
window.App = (function() {
  const points = window.DATA;
  
  function updateStats() {
    const total = points.length;
    const visited = points.filter(p => window.StorageManager.isVisited(p.id)).length;
    const pct = total ? Math.round(visited/total*100) : 0;
    document.getElementById('statsHeader').textContent = visited+' / '+total+' visités ('+pct+'%)';
  }
  
  function populateBlockFilter() {
    const sel = document.getElementById('filterBlock');
    const blocks = [...new Set(points.map(p => p.block))].sort((a,b) => a-b);
    blocks.forEach(b => {
      const opt = document.createElement('option');
      opt.value = String(b);
      opt.textContent = 'Bloc '+String(b).padStart(2,'0');
      sel.appendChild(opt);
    });
  }
  
  function exportCSV() {
    const rows = [['Bloc','Ordre','Nom','Tel','Quartier','Adresse','Statut','Sexe','Produits','Visité','Date']];
    points.forEach(p => {
      const v = window.StorageManager.getVisited()[p.id];
      rows.push([p.block, p.order, p.name, p.tel, p.quartier, p.address, p.status, p.sexe, p.produits, v?'OUI':'NON', v?v.at:'']);
    });
    const csv = rows.map(r => r.map(c => '"'+String(c??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bingerville_'+new Date().toISOString().slice(0,10)+'.csv';
    a.click();
  }
  
  function goToNearest() {
    const pos = window.GeoManager.getPosition();
    if (!pos) return;
    
    let candidates = points.filter(p => window.MarkerManager.passesFilters(p));
    if (!candidates.length) candidates = points.filter(p => !window.StorageManager.isVisited(p.id));
    if (!candidates.length) return;
    
    let best = null, bestDist = Infinity;
    candidates.forEach(p => {
      const d = window.Navigation ? 0 : 0; // haversine
      // Implémentation simplifiée : on utilise les coordonnées
      const dlat = p.lat - pos.lat, dlng = p.lon - pos.lng;
      const dist = Math.sqrt(dlat*dlat + dlng*dlng);
      if (dist < bestDist) { bestDist = dist; best = p; }
    });
    
    if (best) {
      document.getElementById('controls').classList.remove('open');
      map.setView([best.lat, best.lon], 17);
      setTimeout(() => {
        const marker = window.MapManager.getMarker(best.id);
        if (marker) marker.openPopup();
      }, 300);
    }
  }
  
  async function init() {
    // Charger les visites
    await window.StorageManager.load();
    
    // Initialiser la carte
    const map = window.MapManager.init();
    
    // Initialiser les modules
    window.GeoManager.init(map);
    window.Navigation.init(map);
    window.Compass.init();
    
    // Construire les marqueurs
    window.MapManager.buildAllMarkers(points, null);
    
    // Rendu initial
    populateBlockFilter();
    window.MapManager.renderMarkers(points);
    updateStats();
    
    // Cacher le loading
    document.getElementById('loading').style.display = 'none';
    
    // Abonnement temps réel
    window.StorageManager.subscribe((pointId) => {
      const pt = points.find(p => p.id === pointId);
      if (pt) {
        window.MarkerManager.refreshMarker(
          window.MapManager.getMarker(pointId),
          pt,
          window.GeoManager.getPosition()
        );
        updateStats();
      }
    });
    
    // Événements UI
    document.getElementById('menuToggleBtn').onclick = () => {
      document.getElementById('controls').classList.toggle('open');
    };
    
    ['filterBlock', 'filterStatus', 'filterVisited'].forEach(id => {
      document.getElementById(id).onchange = () => window.MapManager.debouncedRender(points);
    });
    document.getElementById('searchBox').oninput = () => window.MapManager.debouncedRender(points);
    
    document.getElementById('locateBtn').onclick = () => window.GeoManager.toggle();
    document.getElementById('nearestBtn').onclick = goToNearest;
    document.getElementById('fabNearest').onclick = goToNearest;
    document.getElementById('exportBtn').onclick = exportCSV;
    document.getElementById('closeRouteBtn').onclick = () => window.Navigation.clearRoute();
    document.getElementById('navStopBtn').onclick = () => window.Navigation.stopNavigation();
    
    document.getElementById('resetBtn').onclick = async () => {
      if (confirm('Effacer TOUS les marquages ? Irréversible.')) {
        await window.StorageManager.resetAll();
        window.MapManager.renderMarkers(points);
        updateStats();
      }
    };
    
    // Raccourci recherche
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('searchBox').focus();
      }
    });
  }
  
  return { init, updateStats };
})();

// Démarrage
window.App.init();
