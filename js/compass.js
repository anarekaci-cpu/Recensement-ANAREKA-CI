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
            if (window.Geolocation && window.Geolocation.getCurrentPos()) {
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

      if (window.Geolocation && window.Geolocation.getCurrentPos()) {
        container.classList.add('visible');
      }

      if (window.Navigation) window.Navigation.updateHeading(compassHeading);
    }

    container.addEventListener('click', () => {
      const pos = window.Geolocation ? window.Geolocation.getCurrentPos() : null;
      if (pos) {
        const map = window.MapModule.getMap();
        map.setView(
          [pos.coords.latitude, pos.coords.longitude],
          Math.max(map.getZoom(), 17),
          { animate: true, duration: 0.5 }
        );
      }
    });
  }

  function show() { document.getElementById('compassContainer').classList.add('visible'); }

  return { init, show, getHeading: () => compassHeading, isSupported: () => supported };
})();
