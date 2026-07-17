// compass.js — Gestion de la boussole
window.Compass = (function() {
  let compassHeading = 0;
  let supported = false;
  
  function init() {
    const container = document.getElementById('compassContainer');
    const rose = document.getElementById('compassRose');
    const degree = document.getElementById('compassDegree');
    
    if (!window.DeviceOrientationEvent) return;
    
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS 13+
      document.getElementById('locateBtn').addEventListener('click', async () => {
        try {
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm === 'granted') {
            supported = true;
            window.addEventListener('deviceorientation', handler);
            if (window.GeoManager && window.GeoManager.getPosition()) {
              container.classList.add('visible');
            }
          }
        } catch (e) { console.log('Compass permission denied'); }
      });
    } else {
      supported = true;
      window.addEventListener('deviceorientation', handler);
    }
    
    function handler(event) {
      let heading;
      if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        heading = 360 - event.alpha;
      } else { return; }
      
      compassHeading = Math.round(heading);
      rose.style.transform = `rotate(${heading}deg)`;
      degree.textContent = compassHeading + '° N';
      
      if (window.GeoManager && window.GeoManager.getPosition()) {
        container.classList.add('visible');
      }
    }
    
    container.addEventListener('click', () => {
      const pos = window.GeoManager ? window.GeoManager.getPosition() : null;
      if (pos) {
        const map = window.MapManager.getMap();
        map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 17), { animate: true, duration: 0.5 });
      }
    });
  }
  
  function show() { document.getElementById('compassContainer').classList.add('visible'); }
  
  return { init, show, getHeading: () => compassHeading, isSupported: () => supported };
})();
