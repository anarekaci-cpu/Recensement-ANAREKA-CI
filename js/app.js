// === Point d'entrée de l'application ===
document.addEventListener("DOMContentLoaded", async () => {
  await window.Storage.init();
  const map = window.MapModule.init();
  window.Navigation.init(map);
  window.Compass.init();
  window.Geolocation.start(map);

  const menuBtn = document.getElementById("menuToggleBtn");
  if (menuBtn) {
    menuBtn.onclick = () => {
      document.getElementById("controls").classList.toggle("open");
    };
  }

  function currentFilters() {
    return {
      block: document.getElementById("filterBlock").value,
      status: document.getElementById("filterStatus").value,
      visited: document.getElementById("filterVisited").value,
      search: document.getElementById("searchBox").value.trim()
    };
  }

  ["filterBlock", "filterStatus", "filterVisited"].forEach((id) => {
    const el = document.getElementById(id);
    if (el)
      el.addEventListener("change", () =>
        window.Markers.applyFilters(currentFilters())
      );
  });

  const searchBox = document.getElementById("searchBox");
  if (searchBox) {
    searchBox.addEventListener("input", () =>
      window.Markers.applyFilters(currentFilters())
    );
  }

  const locateBtn = document.getElementById("locateBtn");
  if (locateBtn) locateBtn.onclick = () => window.Geolocation.locateAndCenter(map);

  const fitFilteredBtn = document.getElementById("fitFilteredBtn");
  if (fitFilteredBtn) {
    fitFilteredBtn.onclick = () => {
      const bounds = window.Markers.getFilteredBounds();
      if (bounds) {
        map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        alert("Aucun point ne correspond aux filtres actuels.");
      }
    };
  }

  const nearestBtn = document.getElementById("nearestBtn");
  if (nearestBtn) {
    nearestBtn.onclick = () => {
      const res = window.Geolocation.findNearest();
      if (res) {
        map.setView([res.point.lat, res.point.lon], 17);
        window.Markers.getMarker(res.point.id).openPopup();
      } else {
        alert("Aucun point non-visité trouvé, ou position inconnue.");
      }
    };
  }

  const fabNearest = document.getElementById("fabNearest");
  if (fabNearest) fabNearest.onclick = () => nearestBtn && nearestBtn.click();

  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    exportBtn.onclick = () => {
      const points = window.Markers.getAllPoints();
      const header = [
        "id", "block", "name", "tel", "quartier", "address",
        "produits", "sexe", "status", "visite", "lat", "lon"
      ];
      const rows = points.map((p) => [
        p.id, p.block, p.name, p.tel, p.quartier, p.address,
        p.produits, p.sexe, p.status, p.visited ? "oui" : "non", p.lat, p.lon
      ]);
      const csv = [header, ...rows]
        .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "recensement_export.csv";
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      if (confirm("Réinitialiser toutes les visites enregistrées localement ?")) {
        window.Storage.reset();
        location.reload();
      }
    };
  }

  const closeRouteBtn = document.getElementById("closeRouteBtn");
  if (closeRouteBtn) closeRouteBtn.onclick = () => window.Navigation.stop();

  const navStopBtn = document.getElementById("navStopBtn");
  if (navStopBtn) navStopBtn.onclick = () => window.Navigation.stop();

  const arrivalYesBtn = document.getElementById("arrivalYesBtn");
  if (arrivalYesBtn)
    arrivalYesBtn.onclick = () => window.Navigation.markArrivedVisited();

  const arrivalNoBtn = document.getElementById("arrivalNoBtn");
  if (arrivalNoBtn)
    arrivalNoBtn.onclick = () => {
      document.getElementById("arrivalBanner").style.display = "none";
    };
});
