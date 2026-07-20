// === Chargement des données (remplace l'ancien tableau en clair) ===
// Les fiches (noms, téléphones, adresses) ne sont plus dans le dépôt :
// elles sont chargées depuis Supabase, uniquement après authentification.
//
// Un seul select("*") ici pour toute l'appli : ce même appel ramène aussi
// les champs de suivi (visited, statut, updated_at) de la table census_points,
// pour que storage.js n'ait plus besoin de refaire sa propre requête.
window.DATA = [];

window.DataLoader = (function () {
  async function loadFromSupabase() {
    const cfg = window.APP_CONFIG;
    const supabase = window.Auth.getSupabaseClient();
    const { data, error } = await supabase
      .from(cfg.TABLE_NAME)
      .select("*")
      .order("block", { ascending: true })
      .order("order", { ascending: true });

    if (error) throw error;

    window.DATA = data.map((row) => ({
      id: row.point_id,
      block: row.block,
      order: row.order,
      name: row.name,
      tel: row.tel,
      quartier: row.quartier,
      address: row.address,
      produits: row.produits,
      sexe: row.sexe,
      status: row.status,
      lat: row.lat,
      lon: row.lon
    }));

    // Champs de suivi bruts, transmis tels quels à Storage (pas de re-fetch).
    window.RAW_ROWS = data;

    return window.DATA;
  }

  return { loadFromSupabase };
})();
