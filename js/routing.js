// routing.js — Moteur d'itinéraire intelligent (respect des blocs)
window.Routing = (function () {
  const OSRM_BASE = window.APP_CONFIG?.OSRM_URL || 'https://router.project-osrm.org';
  const OSRM_PROXY = window.APP_CONFIG?.OSRM_PROXY || '';
  const R = 6371; // km

  function toRad(v) { return (v * Math.PI) / 180; }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function pointDist(a, b) {
    return haversineKm(a.lat, a.lon, b.lat, b.lon);
  }

  function osrmUrl(path) {
    const url = `${OSRM_BASE}/${path}`;
    return OSRM_PROXY ? `${OSRM_PROXY}${encodeURIComponent(url)}` : url;
  }

  // ================== OSRM ==================
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
      console.warn('Matrice OSRM indisponible, fallback vol d\'oiseau.', e);
      return null;
    }
  }

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
      console.warn('Route OSRM indisponible.', e);
    }
    return null;
  }

  // ================== Point le plus proche ==================
  async function findTrueNearest(userLatLng, candidates, maxCandidates = 8) {
    if (!candidates.length) return null;
    const withDist = candidates.map(p => ({ point: p, crowDist: pointDist(userLatLng, p) }));
    withDist.sort((a, b) => a.crowDist - b.crowDist);
    const top = withDist.slice(0, maxCandidates);

    const matrix = await fetchWalkingMatrix(userLatLng, top.map(c => c.point));
    if (!matrix || !matrix[0]) {
      return { point: top[0].point, distance: top[0].crowDist * 1000, usedRoad: false };
    }
    let best = top[0].point, bestDist = Infinity;
    for (let i = 0; i < top.length; i++) {
      const d = matrix[0][i + 1];
      if (d !== null && d < bestDist) { bestDist = d; best = top[i].point; }
    }
    return { point: best, distance: bestDist < Infinity ? bestDist : top[0].crowDist * 1000, usedRoad: true };
  }

  // ================== Algorithmes d'optimisation (conservés) ==================
  function nearestNeighborOrder(start, points) {
    const remaining = points.slice();
    const order = [];
    let current = start;
    while (remaining.length) {
      let bestIdx = 0, bestDist = Infinity;
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
            while (lo < hi) { const tmp = nodes[lo]; nodes[lo] = nodes[hi]; nodes[hi] = tmp; lo++; hi--; }
            improved = true;
          }
        }
      }
    }
    return nodes.slice(1);
  }

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
        const removalGain = pointDist(prev, p) + (next ? pointDist(p, next) : 0) - (next ? pointDist(prev, next) : 0);
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

  // --- Versions avec fonction de distance personnalisée ---
  function nearestNeighborOrderWithDist(start, points, distFunc) {
    const remaining = points.slice();
    const order = [];
    let current = start;
    while (remaining.length) {
      let bestIdx = 0, bestDist = Infinity;
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
            while (lo < hi) { const tmp = nodes[lo]; nodes[lo] = nodes[hi]; nodes[hi] = tmp; lo++; hi--; }
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
        const removalGain = distFunc(prev, p) + (next ? distFunc(p, next) : 0) - (next ? distFunc(prev, next) : 0);
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

  // ================== Tournée optimisée avec respect des blocs ==================
  /**
   * Calcule une tournée optimisée en regroupant les points par bloc.
   * @param {Object} startLatLng - position de départ {lat, lng}
   * @param {Object[]} points - tableau de points avec .lat, .lon, .block
   * @param {Object} opts - options { timeBudgetMs, maxPoints, respectBlocks }
   * @returns {Promise<Object>} { order, legs, totalKm, etaMin, usedRoadDistance }
   */
  async function computeOptimizedTour(startLatLng, points, opts = {}) {
    const timeBudgetMs = opts.timeBudgetMs || 900;
    const maxPoints = opts.maxPoints || 25;
    const respectBlocks = opts.respectBlocks !== undefined ? opts.respectBlocks : true; // activé par défaut

    if (!points.length) return { order: [], legs: [], totalKm: 0, etaMin: 0, usedRoadDistance: false };

    const start = { lat: startLatLng.lat, lon: startLatLng.lng ?? startLatLng.lon };
    let pointsToOptimize = points;

    // Limite le nombre total de points (inchangé)
    if (pointsToOptimize.length > maxPoints) {
      const withDist = pointsToOptimize.map(p => ({ point: p, dist: pointDist(start, p) }));
      withDist.sort((a, b) => a.dist - b.dist);
      pointsToOptimize = withDist.slice(0, maxPoints).map(d => d.point);
    }

    // Si pas de respect des blocs ou un seul bloc, comportement classique
    const blocks = new Set(pointsToOptimize.map(p => p.block));
    if (!respectBlocks || blocks.size <= 1) {
      return await classicOptimizedTour(start, pointsToOptimize, timeBudgetMs);
    }

    // --- Regroupement par bloc ---
    const grouped = {};
    pointsToOptimize.forEach(p => {
      const b = p.block;
      if (!grouped[b]) grouped[b] = [];
      grouped[b].push(p);
    });

    // Calcul des centroïdes des blocs
    const centroids = {};
    for (const b in grouped) {
      const pts = grouped[b];
      const avgLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
      const avgLon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
      centroids[b] = { lat: avgLat, lon: avgLon, block: b };
    }

    // Ordonnancement des blocs (TSP glouton sur les centroïdes)
    const blockOrder = [];
    const remainingBlocks = Object.keys(grouped);
    let currentPos = start;
    while (remainingBlocks.length) {
      let nearestBlock = remainingBlocks[0];
      let nearestDist = Infinity;
      for (const b of remainingBlocks) {
        const d = pointDist(currentPos, centroids[b]);
        if (d < nearestDist) { nearestDist = d; nearestBlock = b; }
      }
      blockOrder.push(nearestBlock);
      currentPos = centroids[nearestBlock];
      remainingBlocks.splice(remainingBlocks.indexOf(nearestBlock), 1);
    }

    // Optimisation intra‑bloc et assemblage
    const fullOrder = [];
    let prevEndPoint = start;
    let usedRoadDistance = true; // sera mis à false si une matrice échoue

    for (const blockId of blockOrder) {
      const blockPoints = grouped[blockId];
      if (!blockPoints.length) continue;

      // Point de départ pour ce bloc : soit position de l'agent (premier bloc), soit dernier point du bloc précédent
      const blockStart = prevEndPoint;

      // Essaie d'obtenir la matrice réelle pour ce bloc (depuis blockStart vers les points du bloc)
      let orderBlock, realDistUsed = false;
      const matrix = await fetchWalkingMatrix(blockStart, blockPoints);

      if (matrix && matrix[0]) {
        const copy = blockPoints.slice();
        const realDist = (a, b) => {
          if (a === blockStart && b === blockStart) return 0;
          const idxA = a === blockStart ? -1 : copy.indexOf(a);
          const idxB = b === blockStart ? -1 : copy.indexOf(b);
          if (idxA === -1 && idxB === -1) return pointDist(a, b);
          const row = idxA === -1 ? 0 : idxA + 1;
          const col = idxB === -1 ? 0 : idxB + 1;
          if (row < matrix.length && col < matrix[0].length && matrix[row][col] != null) {
            return matrix[row][col] / 1000;
          }
          return pointDist(a, b);
        };
        orderBlock = nearestNeighborOrderWithDist(blockStart, blockPoints, realDist);
        const deadline = Date.now() + timeBudgetMs;
        orderBlock = twoOptWithDist(blockStart, orderBlock, realDist, deadline);
        orderBlock = orOptWithDist(blockStart, orderBlock, realDist, Date.now() + Math.min(300, deadline - Date.now()));
        realDistUsed = true;
      } else {
        // Fallback vol d'oiseau
        orderBlock = nearestNeighborOrder(blockStart, blockPoints);
        const deadline = Date.now() + timeBudgetMs;
        orderBlock = twoOpt(blockStart, orderBlock, deadline);
        orderBlock = orOpt(blockStart, orderBlock, Date.now() + Math.min(300, deadline - Date.now()));
        usedRoadDistance = false; // globalement on n'a pas utilisé la route pour ce bloc
      }

      // Ajoute au parcours complet
      fullOrder.push(...orderBlock);
      // Met à jour le point de départ pour le prochain bloc
      prevEndPoint = orderBlock.length ? orderBlock[orderBlock.length - 1] : blockStart;
    }

    // Construction des legs
    const legs = [];
    let prev = start;
    let totalKm = 0;
    // Pour les distances, on utilise la même logique que précédemment (on peut réutiliser la dernière matrice, mais pour simplifier on utilise pointDist)
    fullOrder.forEach(p => {
      const d = pointDist(prev, p);
      totalKm += d;
      legs.push({ point: p, distKm: d });
      prev = p;
    });
    const etaMin = Math.round((totalKm / 4.2) * 60);

    return { order: fullOrder, legs, totalKm, etaMin, usedRoadDistance };
  }

  // Tournée classique (sans blocs) – utilisée comme fallback ou si un seul bloc
  async function classicOptimizedTour(start, points, timeBudgetMs) {
    const matrix = await fetchWalkingMatrix(start, points);
    let order, usedRoadDistance = false;

    if (matrix && matrix[0]) {
      const pointsCopy = points.slice();
      const realDist = (a, b) => {
        if (a === start && b === start) return 0;
        const idxA = a === start ? -1 : pointsCopy.indexOf(a);
        const idxB = b === start ? -1 : pointsCopy.indexOf(b);
        if (idxA === -1 && idxB === -1) return pointDist(a, b);
        const row = idxA === -1 ? 0 : idxA + 1;
        const col = idxB === -1 ? 0 : idxB + 1;
        if (row < matrix.length && col < matrix[0].length && matrix[row][col] != null) {
          return matrix[row][col] / 1000;
        }
        return pointDist(a, b);
      };
      order = nearestNeighborOrderWithDist(start, points, realDist);
      const deadline = Date.now() + timeBudgetMs;
      order = twoOptWithDist(start, order, realDist, deadline);
      order = orOptWithDist(start, order, realDist, Date.now() + Math.min(300, deadline - Date.now()));
      usedRoadDistance = true;
    } else {
      order = nearestNeighborOrder(start, points);
      const deadline = Date.now() + timeBudgetMs;
      order = twoOpt(start, order, deadline);
      order = orOpt(start, order, Date.now() + Math.min(300, deadline - Date.now()));
    }

    const legs = [];
    let prev = start;
    let totalKm = 0;
    const distFunc = usedRoadDistance ? (a, b) => {
      const idxA = a === start ? -1 : points.indexOf(a);
      const idxB = b === start ? -1 : points.indexOf(b);
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
    tourLength: (start, order) => {
      let total = 0;
      let prev = start;
      for (const p of order) { total += pointDist(prev, p); prev = p; }
      return total;
    },
    fetchWalkingMatrix,
    fetchRoute,
    fetchRoadLeg: fetchRoute,
    findTrueNearest,
    computeOptimizedTour
  };
})();
