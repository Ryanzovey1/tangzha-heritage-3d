import express from "express";
import { query } from "../db.js";

const router = express.Router();

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// POST /api/transport/accessibility
// body: { radius:number (m), k:number, weights: {type:weight} }
router.post("/accessibility", async (req, res, next) => {
  try {
    const { radius = 500, k = 5, weights = {} } = req.body || {};

    // load heritage sites (use published ones)
    const hs = await query(`SELECT id, name, lon_public AS lon, lat_public AS lat FROM heritage_sites WHERE is_published = true`);
    const heritage = hs.rows || [];

    // load transport pois
    const tp = await query(`SELECT id, name, type, lon, lat, description FROM transport_pois`);
    const pois = tp.rows || [];

    // compute per-site metrics
    const sitesOut = heritage.map((s) => {
      const withDist = pois.map((p) => ({ ...p, distance_m: haversine(s.lat, s.lon, p.lat, p.lon) }));
      withDist.sort((a, b) => a.distance_m - b.distance_m);
      const nearest = withDist.slice(0, k).map((p) => ({ id: p.id, name: p.name, type: p.type, distance_m: Math.round(p.distance_m) }));
      const within = withDist.filter((p) => p.distance_m <= radius);
      const weightedSum = within.reduce((acc, p) => acc + (Number(weights[p.type] ?? 1) || 0), 0);
      return { id: s.id, name: s.name, weightedSum: Number(weightedSum.toFixed(2)), withinCount: within.length, nearest };
    });

    // build a simple grid heatmap over bounding box of pois+sites
    const allLons = [...heritage.map((s) => s.lon), ...pois.map((p) => p.lon)];
    const allLats = [...heritage.map((s) => s.lat), ...pois.map((p) => p.lat)];
    if (allLons.length === 0 || allLats.length === 0) {
      return res.json({ sites: sitesOut, grid: { type: "FeatureCollection", features: [] } });
    }
    const minLon = Math.min(...allLons);
    const maxLon = Math.max(...allLons);
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);

    // cell size (m) choose radius/4 with bounds
    const cellM = Math.max(50, Math.min(1000, Math.round(radius / 4)));
    // convert meters to degrees (approx)
    const metersPerDegLat = 111320;
    const centerLat = (minLat + maxLat) / 2;
    const metersPerDegLon = Math.abs(Math.cos((centerLat * Math.PI) / 180) * metersPerDegLat) || metersPerDegLat;
    const cellDegLat = cellM / metersPerDegLat;
    const cellDegLon = cellM / metersPerDegLon;

    const cols = Math.ceil((maxLon - minLon) / cellDegLon) + 1;
    const rows = Math.ceil((maxLat - minLat) / cellDegLat) + 1;

    // initialize grid scores
    const grid = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lon0 = minLon + c * cellDegLon;
        const lat0 = minLat + r * cellDegLat;
        grid.push({ c, r, lon0, lat0, score: 0 });
      }
    }

    // assign POIs to cells and accumulate weighted score
    for (const p of pois) {
      const ci = Math.floor((p.lon - minLon) / cellDegLon);
      const ri = Math.floor((p.lat - minLat) / cellDegLat);
      if (ci < 0 || ri < 0 || ci >= cols || ri >= rows) continue;
      const idx = ri * cols + ci;
      const w = Number(weights[p.type] ?? 1) || 0;
      grid[idx].score += w;
    }

    // create GeoJSON features
    const features = grid.map((cell) => {
      const lon = cell.lon0;
      const lat = cell.lat0;
      const coords = [
        [lon, lat],
        [lon + cellDegLon, lat],
        [lon + cellDegLon, lat + cellDegLat],
        [lon, lat + cellDegLat],
        [lon, lat],
      ];
      return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coords] },
        properties: { score: Number(cell.score.toFixed(2)), c: cell.c, r: cell.r },
      };
    });

    res.json({ sites: sitesOut, grid: { type: "FeatureCollection", features } });
  } catch (e) {
    next(e);
  }
});

export default router;
