// tour.js — Panneau "Tournée optimisée"
// Affiche la séquence de passage calculée par routing.js : liste des
// arrêts dans l'ordre, tracé sur la carte, et bascule automatique vers le
// prochain arrêt au fur et à mesure des visites.
window.Tour = (function () {
  let map = null;
  let tourLayer = null;   // polylignes + pastilles numérotées
  let active = false;
  let currentOrder = [];  // liste ordonnée de points (objets DATA)
  let startLatLng = null;

  function init(mapInstance) {
    map = mapInstance;
    tourLayer = L.layerGroup();
  }

  function numberIcon(n, dimmed) {
    const html = `<div class="tour-pin${dimmed ? " tour-pin-done" : ""}">${n}</div>`;
    return L.divIcon({ html, className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
  }

  function drawOnMap() {
    tourLayer.clearLayers();
    if (!currentOrder.length) return;

    const latlngs = [startLatLng, ...currentOrder.map((p) => [p.lat, p.lon])];
    L.polyline(latlngs, {
      color: "#C9A84C",
      weight: 4,
      opacity: 0.9,
      dashArray: "1,10",
      lineCap: "round"
    }).addTo(tourLayer);

    currentOrder.forEach((p, idx) => {
      const visited = window.Storage.getOverride(p.id) && window.Storage.getOverride(p.id).visited;
      L.marker([p.lat, p.lon], { icon: numberIcon(idx + 1, visited), zIndexOffset: 500 })
        .addTo(tourLayer)
        .on("click", () => {
          map.setView([p.lat, p.lon], 18);
          const marker = window.Markers.getMarker(p.id);
          if (marker) marker.openPopup();
        });
    });

    tourLayer.addTo(map);
  }

  function fmtKm(km) {
    return km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km";
  }

  function activeStops() {
    return currentOrder.filter((p) => {
      const o = window.Storage.getOverride(p.id);
      return !(o && o.visited);
    });
  }

  function render() {
    const panel = document.getElementById("tourPanel");
    const list = document.getElementById("tourList");
    if (!panel || !list) return;

    const stops = activeStops();
    const done = currentOrder.length - stops.length;

    document.getElementById("tourProgress").textContent =
      `${done} / ${currentOrder.length} arrêts effectués`;

    if (!stops.length) {
      document.getElementById("tourSummary").textContent = "🎉 Tournée terminée !";
      document.getElementById("tourGoNextBtn").disabled = true;
    } else {
      let km = 0, prev = startLatLng;
      stops.forEach((p) => { km += window.Routing.pointDist({ lat: prev[0], lon: prev[1] }, p); prev = [p.lat, p.lon]; });
      const eta = Math.round((km / 4.2) * 60);
      document.getElementById("tourSummary").textContent =
        `${fmtKm(km)} restants · ~${eta} min de marche`;
      document.getElementById("tourGoNextBtn").disabled = false;
    }

    list.innerHTML = "";
    currentOrder.forEach((p, idx) => {
      const o = window.Storage.getOverride(p.id);
      const visited = !!(o && o.visited);
      const status = (o && o.statut) || p.status;
      const color = (window.APP_CONFIG.STATUS_COLORS[status]) || "#95a5a6";

      const row = document.createElement("div");
      row.className = "tour-row" + (visited ? " tour-row-done" : "");
      row.innerHTML = `
        <div class="tour-row-num">${idx + 1}</div>
        <div class="tour-row-dot" style="background:${color}"></div>
        <div class="tour-row-main">
          <div class="tour-row-name">${p.name || "(sans nom)"}</div>
          <div class="tour-row-sub">${p.quartier || "—"}</div>
        </div>
        <button class="tour-row-go" data-id="${p.id}" title="Naviguer">▶</button>
      `;
      row.querySelector(".tour-row-go").addEventListener("click", (e) => {
        e.stopPropagation();
        window.Navigation.startTo(p);
      });
      row.addEventListener("click", () => {
        map.setView([p.lat, p.lon], 18);
        const marker = window.Markers.getMarker(p.id);
        if (marker) marker.openPopup();
      });
      list.appendChild(row);
    });

    drawOnMap();
  }

  function start(points, userLatLng) {
    if (!points.length) {
      alert("Aucun point non-visité à inclure dans la tournée (vérifiez vos filtres).");
      return;
    }
    if (!userLatLng) {
      alert("Position GPS inconnue. Activez la localisation avant de lancer la tournée.");
      return;
    }
    startLatLng = [userLatLng.lat, userLatLng.lng];

    const btn = document.getElementById("tourBtn");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Calcul…"; }

    // setTimeout pour laisser l'UI se rafraîchir avant le calcul (peut être
    // un peu lourd sur de gros lots de points).
    setTimeout(() => {
      const result = window.Routing.computeOptimizedTour(userLatLng, points);
      currentOrder = result.order;
      active = true;

      if (btn) { btn.disabled = false; btn.textContent = "🧭 Tournée optimisée"; }

      document.getElementById("tourPanel").classList.add("open");
      render();

      if (currentOrder.length) {
        const bounds = L.latLngBounds([startLatLng, ...currentOrder.map((p) => [p.lat, p.lon])]);
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }, 30);
  }

  function goToNext() {
    const stops = activeStops();
    if (stops.length) window.Navigation.startTo(stops[0]);
  }

  function stop() {
    active = false;
    currentOrder = [];
    if (tourLayer) tourLayer.clearLayers();
    const panel = document.getElementById("tourPanel");
    if (panel) panel.classList.remove("open");
  }

  // Appelé par markers.js / navigation.js quand une visite change d'état.
  function onVisitChanged() {
    if (active) render();
  }

  return { init, start, stop, goToNext, onVisitChanged, isActive: () => active };
})();
