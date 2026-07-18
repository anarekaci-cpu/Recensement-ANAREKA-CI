// === Stockage / synchronisation des visites ===
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

  async function init() {
    loadLocal();
    const cfg = window.APP_CONFIG;
    const configured =
      cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf("YOUR-PROJECT") === -1;

    if (configured && window.supabase) {
      try {
        supabase = window.supabase.createClient(
          cfg.SUPABASE_URL,
          cfg.SUPABASE_ANON_KEY
        );
        const { data, error } = await supabase
          .from(cfg.TABLE_NAME)
          .select("*");
        if (!error && data) {
          data.forEach((row) => {
            localState[row.point_id] = row;
          });
          saveLocal();
        }
        setSyncStatus(true);
      } catch (e) {
        console.warn("Supabase indisponible, passage en mode local.", e);
        setSyncStatus(false);
      }
    } else {
      setSyncStatus(false);
    }
  }

  function getOverride(id) {
    return localState[id] || null;
  }

  async function setVisited(id, visited, statut) {
    const entry = Object.assign({}, localState[id], {
      point_id: id,
      visited: visited,
      statut:
        statut !== undefined
          ? statut
          : localState[id]
          ? localState[id].statut
          : undefined,
      updated_at: new Date().toISOString()
    });
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

  return { init, getOverride, setVisited, reset, all };
})();
