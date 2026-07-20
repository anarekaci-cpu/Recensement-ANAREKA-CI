// routing.js — Moteur d'itinéraire intelligent
//
// Deux modes complémentaires :
//  1) "Plus proche" : combine vol d'oiseau + OSRM pour trouver le point
//     non‑visité réellement le plus proche à pied (pas celui qui paraît
//     proche à vol d'oiseau mais qui oblige à un long détour).
//  2) "Tournée optimisée" : calcule l'ordre de passage sur tous les points
//     non‑visités en minimisant la distance totale. Utilise en priorité
//     les distances réelles (OSRM) si disponibles, avec fallback local
//     (vol d'oiseau). Algorithme d'optimisation : construction gloutonne
//     puis 2-opt + Or-opt (même algorithme que votre version actuelle).

window.Routing = (function () {
  const OSRM_BASE = window.APP_CONFIG?.OSRM_URL || 'https://router.project-osrm.org';
  const OSRM_PROXY = window.APP_CONFIG?.OSRM_PROXY || '';
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

  // Distance à vol d'oiseau (km) entre deux objets {lat, lon}
  function pointDist(a, b) {
    return haversineKm(a.lat, a.lon, b.lat, b.lon);
  }

  // Construction d'URL avec proxy CORS si configuré
  function osrmUrl(path) {
    const url = `${OSRM_BASE}/${path}`;
    return OSRM_PROXY ? `${OSRM_PROXY}${encodeURIComponent(url)}` : url;
  }

  // ================== OSRM (temps réel) ==================

  /**
   * Matrice de distances piétonnes via OSRM.
   * @param {Object} origin - {lat, lon}
   * @param {Object[]} destinations - [{lat, lon}, ...]
   * @returns {Promise<number[][]|null>} distances en mètres, ou null si indisponible
   */
  async function fetchWalkingMatrix(origin, destinations) {
    if (!destinations.length) return null;
    const coords = `${origin.lon},${origin.lat};` + destinations.map(d => `${d.lon},${d.lat}`).join(';');
    const url = osrmUrl(`table/v1/foot/${coords}?annotations=distance`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('OSRM indisponible');
      const json = await res.json();
      return json.distances;
    } catch (e) {
      console.warn('Matrice OSRM indisponible, utilisation du vol d\'oiseau en fallback.', e.message);
      return null;
    }
  }

  /**
   * Récupère l'itinéraire détaillé (géométrie, distance, durée).
   * @param {Array} fromLatLng - [lat, lon]
   * @param {Array} toLatLng - [lat, lon]
   * @returns {Promise<Object|null>} { geometry, distance, duration, steps }
   */
  async function fetchRoute(fromLatLng, toLatLng) {
    const url = osrmUrl(`route/v1/foot/${fromLatLng[1]},${fromLatLng[0]};${toLatLng[1]},${toLatLng[0]}?overview=full&geometries=geojson&steps=true`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const json = await res.json();
      if (json.routes?.[0]) {
        return {
          geometry: json.routes[0].geometry.coordinates.map(c => [c[1], c[0]]),
          distance: json.routes[0].distance,
          duration: json.routes[0].duration,
          steps: json.routes[0].legs?.[0]?.steps || []
        };
      }
    } catch (e) {
      console.warn('Route OSRM indisponible.', e.message);
    }
    return null;
  }

  // ================== Point le plus proche intelligent ==================

  /**
   * Trouve le vrai point le plus proche par la route.
   * 1. Pré‑sélectionne les N plus proches à vol d'oiseau.
   * 2. Demande la matrice OSRM pour ces candidats.
   * 3. Retient celui qui minimise la distance piétonne réelle.
   * Fallback silencieux sur le vol d'oiseau si OSRM injoignable.
   *
   * @param {Object} userLatLng - {lat, lon}
   * @param {Object[]} candidates - [{lat, lon, ...}]
   * @param {number} maxCandidates - nombre max examiné via OSRM (défaut 8)
   * @returns {Promise<Object>} { point, distance (m), usedRoad (bool) }
   */
  async function findTrueNearest(userLatLng, candidates, maxCandidates = 8) {
    if (!candidates.length) return null;

    const withDist = candidates.map(p => ({
      point: p,
      crowDist: pointDist(userLatLng, p) // km
    }));
    withDist.sort((a, b) => a.crowDist - b.crowDist);
    const top = withDist.slice(0, maxCandidates);

    const matrix = await fetchWalkingMatrix(userLatLng, top.map(c => c.point));
    if (!matrix || !matrix[0]) {
      return {
        point: top[0].point,
        distance: top[0].crowDist * 1000,
        usedRoad: false
      };
    }

    let best = top[0].point;
    let bestDist = Infinity;
    for (let i = 0; i < top.length; i++) {
      const roadDist = matrix[0][i + 1]; // index 0 = origine vers elle‑même
      if (roadDist !== null && roadDist < bestDist) {
        bestDist = roadDist;
        best = top[i].point;
      }
    }
    return {
      point: best,
      distance: bestDist < Infinity ? bestDist : top[0].crowDist * 1000,
      usedRoad: true
    };
  }

  // ================== Tournée optimisée ==================

  // Construction gloutonne (plus proche voisin) – conservée
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

  // 2‑opt – conservé
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

  // Or‑opt – conservé
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

  // Versions des algos avec fonction de distance personnalisée
  function nearestNeighborOrderWithDist(start, points, distFunc) {
    const remaining = points.slice();
    const order = [];
    let current = start;
    while (remaining.length) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = distFunc(current, remaining[i]);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      order.push(next);
      current = next;
    }
    return order;
  }

  function twoOptWithDist(start, order, distFunc, deadline) {
    let improved = true;
    const nodes = [start, ...order];
    while (improved && Date.now() < deadline) {
      improved = false;
      for (let i = 1; i < nodes.length - 1; i++) {
        for (let k = i + 1; k < nodes.length; k++) {
          if (Date.now() > deadline) break;
          const a = nodes[i - 1], b = nodes[i];
          const c = nodes[k], d = nodes[k + 1] || null;
          const before = distFunc(a, b) + (d ? distFunc(c, d) : 0);
          const after = distFunc(a, c) + (d ? distFunc(b, d) : 0);
          if (after + 1e-9 < before) {
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

  function orOptWithDist(start, order, distFunc, deadline) {
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
          distFunc(prev, p) + (next ? distFunc(p, next) : 0) -
          (next ? distFunc(prev, next) : 0);

        let bestJ = -1, bestDelta = -1e-9;
        for (let j = 0; j < nodes.length; j++) {
          if (j === i || j === i - 1) continue;
          const A = j === 0 ? start : nodes[j - 1];
          const B = nodes[j];
          if (A === p || B === p) continue;
          const insertionCost = distFunc(A, p) + distFunc(p, B) - distFunc(A, B);
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

  /**
   * Tournée optimisée (appelée par tour.js et autres).
   * Désormais, elle accepte en priorité les distances réelles via OSRM.
   * Si OSRM répond, on exécute l'optimisation sur la matrice réelle.
   * Sinon, fallback complet en vol d'oiseau (votre algorithme actuel).
   *
   * @param {Object} startLatLng - {lat, lng} ou {lat, lon}
   * @param {Object[]} points - tableau de points avec .lat, .lon
   * @param {Object} opts - options { timeBudgetMs, maxPoints }
   * @returns {Promise<Object>} { order, legs, totalKm, etaMin, usedRoadDistance }
   */
  async function computeOptimizedTour(startLatLng, points, opts = {}) {
    const timeBudgetMs = opts.timeBudgetMs || 900;
    const maxPoints = opts.maxPoints || 25;

    if (!points.length) return { order: [], legs: [], totalKm: 0, etaMin: 0, usedRoadDistance: false };

    const start = { lat: startLatLng.lat, lon: startLatLng.lng ?? startLatLng.lon };

    // Limite le nombre de points à optimiser (comportement actuel)
    let pointsToOptimize = points;
    if (points.length > maxPoints) {
      const withDist = points.map(p => ({ point: p, dist: pointDist(start, p) }));
      withDist.sort((a, b) => a.dist - b.dist);
      pointsToOptimize = withDist.slice(0, maxPoints).map(d => d.point);
    }

    // Essaie d'obtenir la matrice réelle
    const matrix = await fetchWalkingMatrix(start, pointsToOptimize);
    let order;
    let usedRoadDistance = false;

    if (matrix && matrix[0]) {
      // Utilise les distances réelles pour l'optimisation
      const pointsCopy = pointsToOptimize.slice();
      const realDist = (a, b) => {
        const idxA = a === start ? -1 : pointsCopy.indexOf(a);
        const idxB = b === start ? -1 : pointsCopy.indexOf(b);
        if (idxA === -1 && idxB === -1) return pointDist(a, b);
        const row = idxA === -1 ? 0 : idxA + 1;
        const col = idxB === -1 ? 0 : idxB + 1;
        if (row < matrix.length && col < matrix[0].length && matrix[row][col] != null) {
          return matrix[row][col] / 1000; // m -> km
        }
        return pointDist(a, b);
      };

      order = nearestNeighborOrderWithDist(start, pointsToOptimize, realDist);
      const deadline = Date.now() + timeBudgetMs;
      order = twoOptWithDist(start, order, realDist, deadline);
      order = orOptWithDist(start, order, realDist, Date.now() + Math.min(300, Math.max(0, deadline - Date.now())));
      usedRoadDistance = true;
    } else {
      // Fallback vol d'oiseau (comportement d'origine)
      order = nearestNeighborOrder(start, pointsToOptimize);
      const deadline = Date.now() + timeBudgetMs;
      order = twoOpt(start, order, deadline);
      order = orOpt(start, order, Date.now() + Math.min(300, Math.max(0, deadline - Date.now())));
    }

    // Construction des legs
    const legs = [];
    let prev = start;
    let totalKm = 0;
    const distFunc = usedRoadDistance ? (a, b) => {
      const idxA = a === start ? -1 : pointsToOptimize.indexOf(a);
      const idxB = b === start ? -1 : pointsToOptimize.indexOf(b);
      if (idxA === -1 && idxB === -1) return pointDist(a, b);
      const row = idxA === -1 ? 0 : idxA + 1;
      const col = idxB === -1 ? 0 : idxB + 1;
      if (row < matrix.length && col < matrix[0].length && matrix[row][col] != null) {
        return matrix[row][col] / 1000;
      }
      return pointDist(a, b);
    } : pointDist;

    order.forEach(p => {
      const d = distFunc(prev, p);
      totalKm += d;
      legs.push({ point: p, distKm: d });
      prev = p;
    });
    const etaMin = Math.round((totalKm / 4.2) * 60);

    return { order, legs, totalKm, etaMin, usedRoadDistance };
  }

  // Exposition publique
  return {
    haversineKm,
    pointDist,
    tourLength,
    fetchWalkingMatrix,
    fetchRoute,
    fetchRoadLeg: fetchRoute,
    findTrueNearest,
    computeOptimizedTour
  };
})();
