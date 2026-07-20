// === Point d'entrée de l'application ===

// Affiche un message d'erreur clair (à la place du spinner "Chargement…")
// quand le chargement des données Supabase échoue, avec un bouton pour
// réessayer sans avoir à se reconnecter.
function showLoadError(err) {
  const loading = document.getElementById("loading");
  if (!loading) return;

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const message = offline
    ? "Pas de connexion internet. Vérifiez votre réseau puis réessayez."
    : "Impossible de charger les données du recensement. Le serveur est peut-être temporairement indisponible.";

  loading.innerHTML = "";
  loading.style.flexDirection = "column";
  loading.style.gap = "12px";
  loading.style.textAlign = "center";
  loading.style.padding = "24px";

  const msgEl = document.createElement("div");
  msgEl.textContent = "⚠️ " + message;
  loading.appendChild(msgEl);

  const retryBtn = document.createElement("button");
  retryBtn.textContent = "🔄 Réessayer";
  retryBtn.style.padding = "10px 18px";
  retryBtn.style.fontSize = "14px";
  retryBtn.style.border = "none";
  retryBtn.style.borderRadius = "6px";
  retryBtn.style.background = "#1B5E20";
  retryBtn.style.color = "white";
  retryBtn.style.cursor = "pointer";
  retryBtn.onclick = () => {
    loading.innerHTML = "Chargement de la carte…";
    loading.style.display = "flex";
    startApp();
  };
  loading.appendChild(retryBtn);

  loading.style.display = "flex";
}

async function startApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("app").style.display = "";

  try {
    await window.DataLoader.loadFromSupabase();
  } catch (e) {
    console.error("Échec du chargement des données Supabase.", e);
    showLoadError(e);
    return; // On ne continue pas l'initialisation sans données.
  }

  await window.Storage.init();

  const map = window.MapModule.init();
  window.Navigation.init(map);
  window.Compass.init();
  window.Geolocation.start(map);

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await window.Auth.signOut();
      location.reload();
    };
  }

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
}

document.addEventListener("DOMContentLoaded", async () => {
  const loginBtn = document.getElementById("loginBtn");
  const emailEl = document.getElementById("loginEmail");
  const passwordEl = document.getElementById("loginPassword");
  const errorEl = document.getElementById("loginError");

  let session = null;
  try {
    session = await window.Auth.getSession();
  } catch (e) {
    console.error("Impossible de vérifier la session.", e);
    errorEl.textContent =
      "Connexion au serveur impossible. Vérifiez votre réseau puis rechargez la page.";
  }

  if (session) {
    startApp();
    return;
  }

  async function attemptLogin() {
    errorEl.textContent = "";
    loginBtn.disabled = true;
    loginBtn.textContent = "Connexion…";
    try {
      await window.Auth.signIn(emailEl.value.trim(), passwordEl.value);
      startApp();
    } catch (e) {
      errorEl.textContent = "Échec de connexion : email ou mot de passe incorrect.";
      loginBtn.disabled = false;
      loginBtn.textContent = "Se connecter";
    }
  }

  loginBtn.onclick = attemptLogin;
  passwordEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptLogin();
  });
});
