// routing.js — Moteur d'itinéraire intelligent
//
// Deux modes complémentaires :
//  1) "Plus proche" (existant, affiné ici) : trouve instantanément le point
//     non-visité le plus proche à vol d'oiseau, pour une décision rapide.
//  2) "Tournée optimisée" (nouveau) : calcule l'ORDRE de passage sur TOUS
//     les points non-visités (filtrés) qui minimise la distance totale à
//     parcourir. Algorithme : construction gloutonne (plus proche voisin)
//     puis amélioration locale par 2-opt + Or-opt (ré-insertion) — la même
//     famille d'algorithmes que celle utilisée pour optimiser les blocs
//     terrain à Bingerville (505 points, -19 km). Tout est calculé en local
//     à partir des distances à vol d'oiseau (rapide, aucun appel réseau) ;
//     la navigation pas-à-pas réelle (OSRM, voirie) prend ensuite le relais
//     tronçon par tronçon via navigation.js.
window.Routing = (function () {
  const R = 6371; // km

  function toRad(v) { return (v * Math.PI) / 180; }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function pointDist(a, b) {
    return haversineKm(a.lat, a.lon, b.lat, b.lon);
  }

  // --- Étape 1 : construction gloutonne (plus proche voisin) ---
  function nearestNeighborOrder(start, points) {
    const remaining = points.slice();
    const order = [];
    let current = start;
    while (remaining.length) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = pointDist(current, remaining[i]);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      order.push(next);
      current = next;
    }
    return order;
  }

  function tourLength(start, order) {
    let total = 0;
    let prev = start;
    for (const p of order) {
      total += pointDist(prev, p);
      prev = p;
    }
    return total;
  }

  // --- Étape 2 : amélioration locale 2-opt ---
  // Inverse des segments du parcours tant que ça raccourcit la distance
  // totale. Budget de temps pour rester fluide même avec ~500 points.
  function twoOpt(start, order, deadline) {
    let improved = true;
    const nodes = [start, ...order];
    while (improved && Date.now() < deadline) {
      improved = false;
      for (let i = 1; i < nodes.length - 1; i++) {
        for (let k = i + 1; k < nodes.length; k++) {
          if (Date.now() > deadline) break;
          const a = nodes[i - 1], b = nodes[i];
          const c = nodes[k], d = nodes[k + 1] || null;
          const before = pointDist(a, b) + (d ? pointDist(c, d) : 0);
          const after = pointDist(a, c) + (d ? pointDist(b, d) : 0);
          if (after + 1e-9 < before) {
            // Inverse le segment [i, k]
            let lo = i, hi = k;
            while (lo < hi) {
              const tmp = nodes[lo]; nodes[lo] = nodes[hi]; nodes[hi] = tmp;
              lo++; hi--;
            }
            improved = true;
          }
        }
      }
    }
    return nodes.slice(1);
  }

  // --- Étape 3 : Or-opt — déplace un point isolé à un meilleur endroit ---
  // Corrige les cas où 2-opt seul laisse un point "excentré" par rapport à
  // sa position optimale dans la séquence.
  function orOpt(start, order, deadline) {
    let improved = true;
    let nodes = order.slice();
    while (improved && Date.now() < deadline) {
      improved = false;
      for (let i = 0; i < nodes.length; i++) {
        if (Date.now() > deadline) break;
        const p = nodes[i];
        const prev = i === 0 ? start : nodes[i - 1];
        const next = nodes[i + 1] || null;
        const removalGain =
          pointDist(prev, p) + (next ? pointDist(p, next) : 0) -
          (next ? pointDist(prev, next) : 0);

        let bestJ = -1, bestDelta = -1e-9;
        for (let j = 0; j < nodes.length; j++) {
          if (j === i || j === i - 1) continue;
          const A = j === 0 ? start : nodes[j - 1];
          const B = nodes[j];
          if (A === p || B === p) continue;
          const insertionCost = pointDist(A, p) + pointDist(p, B) - pointDist(A, B);
          const delta = removalGain - insertionCost;
          if (delta > bestDelta) { bestDelta = delta; bestJ = j; }
        }
        if (bestJ >= 0) {
          nodes.splice(i, 1);
          const insertAt = bestJ > i ? bestJ - 1 : bestJ;
          nodes.splice(insertAt, 0, p);
          improved = true;
        }
      }
    }
    return nodes;
  }

  // Calcule la tournée optimisée sur un ensemble de points, en partant
  // d'une position de départ (l'agent). Retourne l'ordre + le détail des
  // tronçons + la distance/temps de marche estimés.
  function computeOptimizedTour(startLatLng, points, opts) {
    opts = opts || {};
    const timeBudgetMs = opts.timeBudgetMs || 900;
    const start = { lat: startLatLng.lat, lon: startLatLng.lng ?? startLatLng.lon };

    if (!points.length) return { order: [], legs: [], totalKm: 0, etaMin: 0 };

    let order = nearestNeighborOrder(start, points);
    const deadline = Date.now() + timeBudgetMs;
    order = twoOpt(start, order, deadline);
    order = orOpt(start, order, Date.now() + Math.min(300, Math.max(0, deadline - Date.now())));

    const legs = [];
    let prev = start;
    let totalKm = 0;
    order.forEach((p) => {
      const d = pointDist(prev, p);
      totalKm += d;
      legs.push({ point: p, distKm: d });
      prev = p;
    });

    // Vitesse de marche moyenne terrain (avec arrêts) ≈ 4.2 km/h
    const etaMin = Math.round((totalKm / 4.2) * 60);

    return { order, legs, totalKm, etaMin };
  }

  return {
    haversineKm,
    pointDist,
    tourLength,
    computeOptimizedTour
  };
})();
