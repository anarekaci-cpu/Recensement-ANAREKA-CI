// === Navigation / itinéraire ===
window.Navigation = (function () {
  let map = null;
  let routeLine = null;
  let destination = null;
  let active = false;
  let lastDeviceHeading = null;

  function init(mapInstance) {
    map = mapInstance;
  }

  async function startTo(point) {
    destination = point;
    active = true;
    document.getElementById("routeDestName").textContent =
      point.name || point.id;
    document.getElementById("routeBanner").style.display = "flex";
    document.getElementById("navPanel").style.display = "flex";
    await computeRoute();
  }

  async function computeRoute() {
    const pos = window.Geolocation.getCurrentPos();
    if (!pos || !destination) return;
    const cfg = window.APP_CONFIG;
    const url = `${cfg.OSRM_URL}/${pos.coords.longitude},${pos.coords.latitude};${destination.lon},${destination.lat}?overview=full&geometries=geojson`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.routes && json.routes[0]) {
        const coords = json.routes[0].geometry.coordinates.map((c) => [
          c[1],
          c[0]
        ]);
        if (routeLine) map.removeLayer(routeLine);
        routeLine = L.polyline(coords, { color: "#1B5E20", weight: 5 }).addTo(
          map
        );
        map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
        const dist = (json.routes[0].distance / 1000).toFixed(2);
        const dur = Math.round(json.routes[0].duration / 60);
        document.getElementById(
          "routeInfo"
        ).textContent = `${dist} km · ${dur} min`;
      }
    } catch (e) {
      console.warn("Erreur de calcul d'itinéraire.", e);
      document.getElementById("routeInfo").textContent =
        "Itinéraire indisponible";
    }
  }

  // Cap géographique (bearing) de la position courante vers la destination, en degrés (0-360, 0 = Nord)
  function bearingTo(lat1, lon1, lat2, lon2) {
    const toRad = (v) => (v * Math.PI) / 180;
    const toDeg = (v) => (v * 180) / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function setArrowRotation(deg) {
    const icon = document.getElementById("navIcon");
    if (icon && active) icon.style.transform = `rotate(${deg}deg)`;
  }

  function refreshArrowDirection(pos) {
    if (!active || !destination) return;
    const targetBearing = bearingTo(
      pos.coords.latitude,
      pos.coords.longitude,
      destination.lat,
      destination.lon
    );

    const compassSupported =
      window.Compass && window.Compass.isSupported() && lastDeviceHeading !== null;

    // Si on connaît le cap du téléphone, la flèche pointe vers la destination
    // quelle que soit l'orientation du téléphone. Sinon, on affiche le cap
    // brut (Nord = 0°) comme repli, moins précis mais toujours utile.
    const rotation = compassSupported
      ? targetBearing - lastDeviceHeading
      : targetBearing;

    setArrowRotation(rotation);

    const navSub = document.getElementById("navSub");
    if (navSub) {
      navSub.textContent = compassSupported
        ? `Cap ${Math.round(targetBearing)}°`
        : `Cap ${Math.round(targetBearing)}° (boussole indisponible)`;
    }
  }

  function onPositionUpdate(pos) {
    if (!active || !destination) return;
    const d = window.Geolocation.distanceMeters(
      pos.coords.latitude,
      pos.coords.longitude,
      destination.lat,
      destination.lon
    );
    document.getElementById("navInstruction").textContent = `${Math.round(
      d
    )} m restants`;
    refreshArrowDirection(pos);
    if (d <= window.APP_CONFIG.ARRIVAL_RADIUS_M) {
      document.getElementById("arrivalBanner").style.display = "flex";
    }
  }

  // Appelé par compass.js à chaque lecture du capteur d'orientation du téléphone.
  function updateHeading(deviceHeading) {
    lastDeviceHeading = deviceHeading;
    // Recalcule immédiatement la flèche avec le nouveau cap, si une nav est active.
    const pos = window.Geolocation && window.Geolocation.getCurrentPos();
    if (pos) refreshArrowDirection(pos);
  }

  function stop() {
    active = false;
    destination = null;
    lastDeviceHeading = null;
    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }
    document.getElementById("routeBanner").style.display = "none";
    document.getElementById("navPanel").style.display = "none";
    document.getElementById("arrivalBanner").style.display = "none";
  }

  function markArrivedVisited() {
    if (!destination) return;
    const dest = destination;
    window.Storage.setVisited(dest.id, true, dest.status).then(() => {
      window.Markers.refreshOne(dest.id);
      stop();
    });
  }

  return {
    init,
    startTo,
    onPositionUpdate,
    updateHeading,
    stop,
    markArrivedVisited
  };
})();
