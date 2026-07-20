// tour.js — Panneau "Tournée optimisée"
window.Tour = (function () {
  let map = null;
  let tourLayer = null;
  let active = false;
  let currentOrder = [];
  let startLatLng = null;

  function init(mapInstance) {
    map = mapInstance;
    tourLayer = L.layerGroup();
  }

  function numberIcon(n, dimmed) {
    const html = `<div class="tour-pin${dimmed ? " tour-pin-done" : ""}">${n}</div>`;
    return L.divIcon({ html, className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
  }

  // Récupère un tronçon réel via OSRM (utilise la fonction centralisée)
  async function fetchRoadLeg(from, to) {
    if (window.Routing && window.Routing.fetchRoute) {
      const route = await window.Routing.fetchRoute(from, to);
      return route ? route.geometry : null;
    }
    return null;
  }

  let drawToken = 0;
  async function drawOnMap() {
    tourLayer.clearLayers();
    if (!currentOrder.length) return;

    const myToken = ++drawToken;
    const stopsLatLng = currentOrder.map((p) => [p.lat, p.lon]);
    const waypoints = [startLatLng, ...stopsLatLng];

    const provisionalLine = L.polyline(waypoints, {
      color: "#C9A84C",
      weight: 4,
      opacity: 0.55,
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

    const legPromises = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      legPromises.push(fetchRoadLeg(waypoints[i], waypoints[i + 1]));
    }
    const legs = await Promise.all(legPromises);
    if (myToken !== drawToken) return;

    let fullPath = [];
    let allOk = true;
    legs.forEach((legCoords, i) => {
      if (legCoords) {
        fullPath = fullPath.concat(legCoords);
      } else {
        allOk = false;
        fullPath.push(waypoints[i], waypoints[i + 1]);
      }
    });

    tourLayer.removeLayer(provisionalLine);
    L.polyline(fullPath, {
      color: "#C9A84C",
      weight: 4,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(tourLayer);

    if (!allOk) {
      console.warn("Certains tronçons du tracé de tournée sont restés en ligne droite (voirie indisponible).");
    }
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

  async function start(points, userLatLng) {
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
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Calcul de l'itinéraire réel…"; }

    try {
      const result = await window.Routing.computeOptimizedTour(userLatLng, points);
      currentOrder = result.order;
      active = true;

      if (!result.usedRoadDistance) {
        console.warn("Tournée calculée en distance à vol d'oiseau (voirie indisponible) — ordre approximatif.");
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "🧭 Tournée optimisée"; }
    }

    document.getElementById("tourPanel").classList.add("open");
    render();

    if (currentOrder.length) {
      const bounds = L.latLngBounds([startLatLng, ...currentOrder.map((p) => [p.lat, p.lon])]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  function goToNext() {
    if (!active) {
      console.warn("Tour.goToNext appelée sans tournée active.");
      return;
    }
    const stops = activeStops();
    if (!stops.length) {
      alert("Tous les points de la tournée ont été visités !");
      stop();
      return;
    }
    const nextPoint = stops[0];
    // Nettoie l'itinéraire précédent si nécessaire
    if (window.Navigation) {
      window.Navigation.stop();
      window.Navigation.startTo(nextPoint);
    }
  }

  function stop() {
    active = false;
    currentOrder = [];
    if (tourLayer) {
      tourLayer.clearLayers();
      map.removeLayer(tourLayer);
    }
    document.getElementById("tourPanel").classList.remove("open");
    if (window.Navigation) window.Navigation.stop();
  }

  function onVisitChanged() {
    if (active) render();
  }

  return { init, start, stop, goToNext, onVisitChanged, isActive: () => active };
})();
