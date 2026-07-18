// === Navigation / itinéraire ===
window.Navigation = (function () {
  let map = null;
  let routeLine = null;
  let destination = null;
  let active = false;

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
    if (d <= window.APP_CONFIG.ARRIVAL_RADIUS_M) {
      document.getElementById("arrivalBanner").style.display = "flex";
    }
  }

  function updateHeading(h) {
    const icon = document.getElementById("navIcon");
    if (icon && active) icon.style.transform = `rotate(${h}deg)`;
  }

  function stop() {
    active = false;
    destination = null;
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
