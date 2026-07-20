// === Géolocalisation ===
window.Geolocation = (function () {
  let currentPos = null;
  let userMarker = null;
  let watchId = null;
  const ACCURACY_WARN_M = 50;

  function toRad(v) {
    return (v * Math.PI) / 180;
  }

  function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function setStatus(msg) {
    const el = document.getElementById("geoStatus");
    if (el) el.textContent = msg;
  }

  function updateUserMarker(map) {
    if (!currentPos) return;
    const latlng = [currentPos.coords.latitude, currentPos.coords.longitude];
    if (!userMarker) {
      userMarker = L.circleMarker(latlng, {
        radius: 8,
        color: "#1B5E20",
        fillColor: "#4CAF50",
        fillOpacity: 0.9
      }).addTo(map);
    } else {
      userMarker.setLatLng(latlng);
    }
  }

  function start(map) {
    if (!navigator.geolocation) {
      setStatus("Géolocalisation non supportée sur cet appareil.");
      return;
    }
    if (watchId !== null) return; // déjà en cours, évite les doublons de watch
    setStatus("Localisation en cours…");
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        currentPos = pos;
        updateUserMarker(map);
        const nearestBtn = document.getElementById("nearestBtn");
        if (nearestBtn) nearestBtn.disabled = false;
        const tourBtn = document.getElementById("tourBtn");
        if (tourBtn) tourBtn.disabled = false;
        const acc = Math.round(pos.coords.accuracy);
        setStatus(
          acc > ACCURACY_WARN_M
            ? `⚠️ Précision faible : ${acc} m — déplacez-vous à ciel ouvert`
            : `Précision : ${acc} m`
        );
        if (window.Navigation) window.Navigation.onPositionUpdate(pos);
      },
      (err) => {
        setStatus("Erreur de localisation : " + err.message);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
  }

  function stop() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  function locateAndCenter(map) {
    start(map);
    if (currentPos) {
      map.setView(
        [currentPos.coords.latitude, currentPos.coords.longitude],
        17
      );
    }
  }

  // Points de census.js utilisent "lon" (pas "lng") pour la longitude.
  function findNearest() {
    if (!currentPos) return null;
    const points = window.Markers.getAllPoints().filter((p) => !p.visited);
    let best = null;
    let bestDist = Infinity;
    points.forEach((p) => {
      if (typeof p.lat !== "number" || typeof p.lon !== "number") return;
      const d = distanceMeters(
        currentPos.coords.latitude,
        currentPos.coords.longitude,
        p.lat,
        p.lon
      );
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    });
    return best ? { point: best, distance: bestDist } : null;
  }

  function getCurrentPos() {
    return currentPos;
  }

  return {
    start,
    stop,
    locateAndCenter,
    findNearest,
    getCurrentPos,
    distanceMeters
  };
})();
