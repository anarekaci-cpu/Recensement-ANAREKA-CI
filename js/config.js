// === Configuration globale de l'application ===
window.APP_CONFIG = {
  // --- Supabase (authentification requise) ---
  SUPABASE_URL: "https://xqfdhgrdvsdngfgiuomk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_8Vyba1dTaQDTx1EuDz9naQ__fvezy3N",
  TABLE_NAME: "census_points",

  // --- Carte ---
  MAP_CENTER: [5.355, -3.88],
  MAP_ZOOM: 13,

  // --- Itinéraire (OSRM public) ---
  OSRM_URL: "https://router.project-osrm.org/route/v1/foot",

  // --- Couleurs par statut (doivent correspondre exactement aux valeurs de data.js) ---
  STATUS_COLORS: {
    "VERT (Joignable)": "#2ecc71",
    "JAUNE (Injoignable)": "#f1c40f",
    "ROUGE (Refus)": "#e74c3c",
    "VIOLET (A verifier)": "#9b59b6",
    "NON DEFINI": "#95a5a6"
  },

  ARRIVAL_RADIUS_M: 25
};
