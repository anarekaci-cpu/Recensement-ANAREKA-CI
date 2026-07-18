// === Initialisation de la carte ===
window.MapModule = (function () {
  let map = null;

  function init() {
    const cfg = window.APP_CONFIG;
    map = L.map("map", { zoomControl: false }).setView(
      cfg.MAP_CENTER,
      cfg.MAP_ZOOM
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const loading = document.getElementById("loading");
    if (loading) loading.style.display = "none";

    window.Markers.init(map);
    window.Markers.updateStatsHeader();
    return map;
  }

  function getMap() {
    return map;
  }

  return { init, getMap };
})();
