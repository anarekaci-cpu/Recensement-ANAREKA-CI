// === Stockage / synchronisation des visites ===
// Ne conserve que l'état de suivi (visited, statut, updated_at) par point,
// jamais les fiches complètes (nom, téléphone, adresse) : ces dernières
// restent uniquement en mémoire (window.DATA), rechargées à chaque
// connexion depuis Supabase par data.js. Le cache local sur l'appareil
// de l'agent expose ainsi beaucoup moins de données sensibles.
window.Storage = (function () {
  let supabase = null;
  let localState = {};
  const LS_KEY = "anareka_visits_v1";

  function loadLocal() {
    try {
      localState = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    } catch (e) {
      localState = {};
    }
    console.log("Loaded", Object.keys(localState).length, "visited points");
  }

  function saveLocal() {
    localStorage.setItem(LS_KEY, JSON.stringify(localState));
  }

  function setSyncStatus(online) {
    const el = document.getElementById("syncStatus");
    if (!el) return;
    el.textContent = online ? "🟢 Synchronisé" : "🟡 Mode local";
  }

  // Alimenté par data.js (window.RAW_ROWS), qui a déjà fait l'unique
  // select("*") de l'appli — plus aucun appel réseau ici.
  function hydrateFromRows(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach((row) => {
      const existing = localState[row.point_id];
      // Ne garder que les champs de suivi, jamais nom/tel/adresse.
      const fresh = {
        point_id: row.point_id,
        visited: !!row.visited,
        statut: row.statut !== undefined ? row.statut : row.status,
        updated_at: row.updated_at || null
      };
      // Une modif locale pas encore synchronisée (plus récente) est conservée.
      if (
        existing &&
        existing.updated_at &&
        fresh.updated_at &&
        existing.updated_at > fresh.updated_at
      ) {
        return;
      }
      localState[row.point_id] = fresh;
    });
    saveLocal();
  }

  async function init() {
    loadLocal();
    try {
      supabase = window.Auth.getSupabaseClient();
      hydrateFromRows(window.RAW_ROWS);
      setSyncStatus(true);
    } catch (e) {
      console.warn("Supabase indisponible, passage en mode local.", e);
      setSyncStatus(false);
    }
  }

  function getOverride(id) {
    return localState[id] || null;
  }

  async function setVisited(id, visited, statut) {
    const entry = {
      point_id: id,
      visited: visited,
      statut:
        statut !== undefined
          ? statut
          : localState[id]
          ? localState[id].statut
          : undefined,
      updated_at: new Date().toISOString()
    };
    localState[id] = entry;
    saveLocal();

    if (supabase) {
      try {
        await supabase
          .from(window.APP_CONFIG.TABLE_NAME)
          .upsert(entry, { onConflict: "point_id" });
      } catch (e) {
        console.warn("Échec de synchronisation Supabase.", e);
      }
    }
  }

  function reset() {
    localState = {};
    saveLocal();
  }

  function all() {
    return localState;
  }

  return { init, hydrateFromRows, getOverride, setVisited, reset, all };
})();
