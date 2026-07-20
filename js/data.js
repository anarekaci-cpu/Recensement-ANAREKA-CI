// === Chargement des données (remplace l'ancien tableau en clair) ===
// Les fiches (noms, téléphones, adresses) ne sont plus dans le dépôt :
// elles sont chargées depuis Supabase, uniquement après authentification.
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
    return window.DATA;
  }

  return { loadFromSupabase };
})();
