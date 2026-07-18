// geolocation.js — Géolocalisation
window.GeoManager = (function() {
  let userLatLng = null;
  let userMarker = null;
  let userAccuracyCircle = null;
  let watchId = null;
  let active = false;
  let map;
  
  const userIcon = L.divIcon({
    html: '<div class="user-dot-wrap"><div class="user-dot-pulse"></div><div class="user-dot"></div></div>',
    className: '', iconSize: [34, 34], iconAnchor: [17, 17]
  });
  
  function init(m) {
    map = m;
  }
  
  function onSuccess(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    userLatLng = { lat: latitude, lng: longitude };
    
    if (!userMarker) {
      userMarker = L.marker([latitude, longitude], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      userMarker.setLatLng([latitude, longitude]);
    }
    
    if (!userAccuracyCircle) {
      userAccuracyCircle = L.circle([latitude, longitude], { radius: accuracy, color: '#1565C0', weight: 1, fillOpacity: 0.08 }).addTo(map);
    } else {
      userAccuracyCircle.setLatLng([latitude, longitude]);
      userAccuracyCircle.setRadius(accuracy);
    }
    
    document.getElementById('nearestBtn').disabled = false;
    document.getElementById('fabNearest').classList.add('show');
    document.getElementById('geoStatus').textContent = '✅ Position à ±' + Math.round(accuracy) + ' m';
    
    if (window.Compass && window.Compass.isSupported()) {
      window.Compass.show();
    }
  }
  
  function onError(err) {
    let msg = 'Position indisponible';
    if (err.code === 1) msg = 'Autorisation refusée';
    else if (err.code === 2) msg = 'Position indisponible';
    else if (err.code === 3) msg = 'Délai dépassé';
    document.getElementById('geoStatus').textContent = '⚠️ ' + msg;
  }
  
  function toggle() {
    const btn = document.getElementById('locateBtn');
    if (!navigator.geolocation) {
      document.getElementById('geoStatus').textContent = '⚠️ Non supporté';
      return;
    }
    
    if (active) {
      navigator.geolocation.clearWatch(watchId);
      active = false;
      btn.classList.remove('active');
      btn.textContent = '📍 Me localiser';
      document.getElementById('geoStatus').textContent = '';
      document.getElementById('nearestBtn').disabled = true;
      document.getElementById('fabNearest').classList.remove('show');
      return;
    }
    
    active = true;
    btn.classList.add('active');
    btn.textContent = '📍 Suivi actif…';
    document.getElementById('geoStatus').textContent = 'Localisation…';
    
    navigator.geolocation.getCurrentPosition(pos => {
      onSuccess(pos);
      map.setView([pos.coords.latitude, pos.coords.longitude], 16);
    }, onError, { enableHighAccuracy: true, timeout: 10000 });
    
    watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true, maximumAge: 5000, timeout: 15000
    });
  }
  
  function getPosition() { return userLatLng; }
  function isActive() { return active; }
  
  return { init, toggle, getPosition, isActive };
})();
