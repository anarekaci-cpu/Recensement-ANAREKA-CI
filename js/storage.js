// storage.js — Gestion du stockage (Supabase + localStorage)
window.StorageManager = (function() {
  const cfg = window.APP_CONFIG;
  
  let supabase;
  try {
    supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  } catch (e) {
    console.error('Supabase init failed, using localStorage only');
    supabase = null;
  }
  
  let visited = {};
  
  async function loadFromSupabase() {
    if (!supabase) return {};
    try {
      const { data, error } = await supabase.from('visites').select('point_id, visited_at, visited_by');
      if (error) throw error;
      const result = {};
      (data || []).forEach(row => {
        result[row.point_id] = { at: row.visited_at, by: row.visited_by || '' };
      });
      return result;
    } catch (e) {
      console.error('Supabase load error:', e);
      return {};
    }
  }
  
  function loadFromLocal() {
    try {
      const raw = localStorage.getItem('bingerville_visited');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }
  
  function saveToLocal(data) {
    try {
      localStorage.setItem('bingerville_visited', JSON.stringify(data));
    } catch (e) {
      console.error('localStorage save error:', e);
    }
  }
  
  async function load() {
    visited = await loadFromSupabase();
    if (Object.keys(visited).length === 0) {
      visited = loadFromLocal();
    }
    console.log(`Loaded ${Object.keys(visited).length} visited points`);
    return visited;
  }
  
  async function markVisited(id, who) {
    const record = { at: new Date().toISOString(), by: who || '' };
    visited[id] = record;
    saveToLocal(visited);
    
    if (supabase) {
      try {
        await supabase.from('visites').upsert({
          point_id: id, visited_at: record.at, visited_by: record.by
        });
      } catch (e) {
        console.error('Supabase mark error:', e);
      }
    }
    return record;
  }
  
  async function unmarkVisited(id) {
    delete visited[id];
    saveToLocal(visited);
    
    if (supabase) {
      try {
        await supabase.from('visites').delete().eq('point_id', id);
      } catch (e) {
        console.error('Supabase unmark error:', e);
      }
    }
  }
  
  async function resetAll() {
    visited = {};
    saveToLocal(visited);
    localStorage.removeItem('bingerville_visited');
    if (supabase) {
      try {
        await supabase.from('visites').delete().neq('point_id', '');
      } catch (e) {
        console.error('Supabase reset error:', e);
      }
    }
  }
  
  function isVisited(id) { return !!visited[id]; }
  function getVisited() { return visited; }
  function getAll() { return visited; }
  
  function subscribe(callback) {
    if (!supabase) return;
    supabase.channel('visites-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visites' }, (payload) => {
        const id = payload.eventType === 'DELETE' ? payload.old.point_id : payload.new.point_id;
        if (!id) return;
        if (payload.eventType === 'DELETE') {
          delete visited[id];
        } else {
          visited[id] = { at: payload.new.visited_at, by: payload.new.visited_by || '' };
        }
        saveToLocal(visited);
        if (callback) callback(id, payload.eventType);
      })
      .subscribe((status) => {
        const el = document.getElementById('syncStatus');
        if (!el) return;
        if (status === 'SUBSCRIBED') { el.textContent = '🟢 Sync en direct'; }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { el.textContent = '🔴 Hors ligne'; }
        else { el.textContent = '🟡 Connexion...'; }
      });
  }
  
  return { load, markVisited, unmarkVisited, resetAll, isVisited, getVisited, getAll, subscribe };
})();
