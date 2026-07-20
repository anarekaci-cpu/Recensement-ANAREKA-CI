// === Authentification (Supabase Auth) ===
window.Auth = (function () {
  let client = null;
  let session = null;

  function getClient() {
    if (client) return client;
    const cfg = window.APP_CONFIG;
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return client;
  }

  async function getSession() {
    const { data } = await getClient().auth.getSession();
    session = data.session;
    return session;
  }

  async function signIn(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    session = data.session;
    return session;
  }

  async function signOut() {
    await getClient().auth.signOut();
    session = null;
  }

  function getSupabaseClient() {
    return getClient();
  }

  function onAuthChange(cb) {
    getClient().auth.onAuthStateChange((_event, sess) => {
      session = sess;
      cb(sess);
    });
  }

  return { getSession, signIn, signOut, getSupabaseClient, onAuthChange };
})();
