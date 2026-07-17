// navigation.js — Itinéraires et navigation guidée
window.Navigation = (function() {
  const cfg = window.APP_CONFIG;
  let routeLine = null, activeRoutePt = null;
  let navActive = false, navSteps = [], navStepIdx = 0;
  let navDestPt = null, navRouteCoords = [], navLine = null;
  let lastRerouteAt = 0, navRemainingDistance = 0, navRemainingDuration = 0;
  let map;
  
  const MODIFIER_FR = {
    'left': 'à gauche', 'right': 'à droite', 'sharp left': 'fortement à gauche',
    'sharp right': 'fortement à droite', 'slight left': 'légèrement à gauche',
    'slight right': 'légèrement à droite', 'straight': 'tout droit', 'uturn': 'demi-tour'
  };
  
  const MODIFIER_ICON = {
    'left': '⬅️', 'right': '➡️', 'sharp left': '↩️', 'sharp right': '↪️',
    'slight left': '↖️', 'slight right': '↗️', 'straight': '⬆️', 'uturn': '🔄'
  };
  
  function init(m) { map = m; }
  
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  
  function formatDist(km) { return km < 1 ? Math.round(km*1000)+' m' : km.toFixed(1)+' km'; }
  function formatDuration(s) {
    const min = Math.round(s/60);
    if (min < 60) return min+' min';
    return Math.floor(min/60)+' h '+(min%60 ? min%60+' min' : '');
  }
  
  async function drawRoute(pt) {
    const pos = window.GeoManager.getPosition();
    if (!pos) {
      document.getElementById('geoStatus').textContent = '⚠️ Activez la localisation';
      return;
    }
    
    activeRoutePt = pt;
    document.getElementById('routeDestName').textContent = pt.name || 'ce point';
    document.getElementById('routeInfo').textContent = 'calcul…';
    document.getElementById('routeBanner').classList.add('show');
    
    const url = `${cfg.OSRM_URL}/route/v1/driving/${pos.lng},${pos.lat};${pt.lon},${pt.lat}?overview=full&geometries=geojson`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.routes?.length) throw new Error('no route');
      
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
      
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline(coords, { color: '#1565C0', weight: 5, opacity: 0.85 }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
      document.getElementById('routeInfo').textContent = formatDist(route.distance/1000)+' · '+formatDuration(route.duration);
    } catch (e) {
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline([[pos.lat, pos.lng], [pt.lat, pt.lon]], { color: '#1565C0', weight: 4, opacity: 0.7, dashArray: '8,8' }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
      document.getElementById('routeInfo').textContent = '≈ '+formatDist(haversineKm(pos.lat, pos.lng, pt.lat, pt.lon));
    }
  }
  
  function clearRoute() {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    activeRoutePt = null;
    document.getElementById('routeBanner').classList.remove('show');
  }
  
  function stepInstruction(step) {
    const m = step.maneuver || {};
    const street = step.name ? ' sur '+step.name : '';
    const mod = MODIFIER_FR[m.modifier] || '';
    switch (m.type) {
      case 'depart': return 'Démarrez'+street;
      case 'arrive': return 'Vous êtes arrivé';
      case 'turn': return 'Tournez '+mod+street;
      default: return (mod||'Continuez')+street;
    }
  }
  
  function stepIcon(step) {
    const m = step.maneuver || {};
    if (m.type === 'arrive') return '🏁';
    if (m.type === 'depart') return '📍';
    if (m.type === 'roundabout' || m.type === 'rotary') return '🔄';
    return MODIFIER_ICON[m.modifier] || '⬆️';
  }
  
  async function startNavigation(pt) {
    const pos = window.GeoManager.getPosition();
    if (!pos) {
      document.getElementById('geoStatus').textContent = '⚠️ Activez la localisation';
      return;
    }
    
    clearRoute();
    navDestPt = pt;
    document.getElementById('navPanel').classList.add('show');
    document.getElementById('navInstruction').textContent = 'Calcul…';
    
    try {
      const url = `${cfg.OSRM_URL}/route/v1/driving/${pos.lng},${pos.lat};${pt.lon},${pt.lat}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.routes?.length) throw new Error('no route');
      
      const route = data.routes[0];
      navSteps = route.legs?.[0]?.steps || [];
      navStepIdx = 0;
      navRemainingDistance = route.distance;
      navRemainingDuration = route.duration;
      navRouteCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);
      
      if (navLine) map.removeLayer(navLine);
      navLine = L.polyline(navRouteCoords, { color: '#1565C0', weight: 6, opacity: 0.85 }).addTo(map);
      
      navActive = true;
      lastRerouteAt = Date.now();
      updateNavPanel();
      document.getElementById('navBottomBar').classList.add('show');
      map.setView([pos.lat, pos.lng], 17);
    } catch (e) {
      document.getElementById('navPanel').classList.remove('show');
      if (confirm('Service indisponible. Ouvrir Maps ?')) window.open(externalNavUrl(pt), '_blank');
    }
  }
  
  function updateNavPanel() {
    const step = navSteps[navStepIdx];
    if (!step) return;
    document.getElementById('navIcon').textContent = stepIcon(step);
    document.getElementById('navInstruction').textContent = stepInstruction(step);
    document.getElementById('navBottomBar').textContent = formatDist(navRemainingDistance/1000)+' · '+formatDuration(navRemainingDuration)+' restants';
  }
  
  function stopNavigation() {
    navActive = false; navSteps = []; navStepIdx = 0; navDestPt = null;
    if (navLine) { map.removeLayer(navLine); navLine = null; }
    document.getElementById('navPanel').classList.remove('show');
    document.getElementById('navBottomBar').classList.remove('show');
    document.getElementById('arrivalBanner').classList.remove('show');
  }
  
  function externalNavUrl(pt) {
    const dest = pt.lat+','+pt.lon;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) return 'https://maps.apple.com/?daddr='+dest+'&dirflg=d';
    let url = 'https://www.google.com/maps/dir/?api=1&destination='+dest+'&travelmode=driving';
    const pos = window.GeoManager.getPosition();
    if (pos) url += '&origin='+pos.lat+','+pos.lng;
    return url;
  }
  
  return { init, drawRoute, clearRoute, startNavigation, stopNavigation, getActiveRoute: () => activeRoutePt };
})();
