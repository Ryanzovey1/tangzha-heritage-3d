import express from "express";

const router = express.Router();

const BAIDU_ROUTEMATRIX_BASE = "https://api.map.baidu.com/routematrix/v2";
const BAIDU_PLACE_SEARCH_URL = "https://api.map.baidu.com/place/v2/search";

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validatePoint(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lon = asNumber(raw.lon);
  const lat = asNumber(raw.lat);
  if (lon == null || lat == null) return null;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  return { lon, lat };
}

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

router.post("/baidu/matrix", async (req, res) => {
  const ak = String(process.env.BAIDU_MAP_AK ?? "").trim();
  if (!ak) {
    return res.status(500).json({ error: "服务端缺少 BAIDU_MAP_AK，无法调用百度地图批量算路。" });
  }

  const mode = String(req.body?.mode ?? "driving").trim().toLowerCase();
  if (!["driving", "walking", "riding"].includes(mode)) {
    return res.status(400).json({ error: "mode 仅支持 driving / walking / riding" });
  }

  const coordType = String(req.body?.coord_type ?? "wgs84").trim();
  const tactics = String(req.body?.tactics ?? "11").trim();
  const destination = validatePoint(req.body?.destination);
  const originsRaw = Array.isArray(req.body?.origins) ? req.body.origins : [];
  if (!destination) return res.status(400).json({ error: "destination 坐标非法" });
  if (originsRaw.length === 0) return res.status(400).json({ error: "origins 不能为空" });
  if (originsRaw.length > 100) return res.status(400).json({ error: "origins 超过 100，超出批量算路上限" });

  const origins = [];
  for (const row of originsRaw) {
    const point = validatePoint(row);
    if (!point) continue;
    origins.push({
      id: row?.id ?? "",
      name: row?.name ?? "",
      lon: point.lon,
      lat: point.lat,
    });
  }
  if (origins.length === 0) return res.status(400).json({ error: "origins 无有效坐标" });

  const originsParam = origins.map((o) => `${o.lat},${o.lon}`).join("|");
  const destinationParam = `${destination.lat},${destination.lon}`;

  try {
    const params = new URLSearchParams({
      ak,
      output: "json",
      coord_type: coordType,
      origins: originsParam,
      destinations: destinationParam,
    });
    if (mode === "driving" && tactics) {
      params.set("tactics", tactics);
    }
    const url = `${BAIDU_ROUTEMATRIX_BASE}/${mode}?${params.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: `百度地图接口请求失败（HTTP ${resp.status}）`,
        provider: data,
      });
    }
    if (Number(data?.status) !== 0) {
      return res.status(400).json({
        error: `百度地图批量算路失败：${data?.message || `status=${data?.status}`}`,
        provider: data,
      });
    }

    const rows = Array.isArray(data?.result) ? data.result : [];
    const routes = origins.map((o, idx) => {
      const r = rows[idx] ?? {};
      const distanceValue = Number(r?.distance?.value ?? 0);
      const durationValue = Number(r?.duration?.value ?? 0);
      return {
        origin_id: String(o.id ?? ""),
        origin_name: String(o.name ?? ""),
        origin_lon: o.lon,
        origin_lat: o.lat,
        destination_lon: destination.lon,
        destination_lat: destination.lat,
        distance_m: Number.isFinite(distanceValue) ? distanceValue : 0,
        duration_s: Number.isFinite(durationValue) ? durationValue : 0,
        distance_text: String(r?.distance?.text ?? ""),
        duration_text: String(r?.duration?.text ?? ""),
      };
    });

    routes.sort((a, b) => a.duration_s - b.duration_s);
    return res.json({
      ok: true,
      mode,
      coord_type: coordType,
      tactics: mode === "driving" ? tactics : "",
      destination,
      routes,
      provider_message: data?.message ?? "",
    });
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    return res.status(502).json({
      error: isAbort ? "百度地图批量算路超时，请稍后重试。" : `百度地图批量算路异常：${err?.message || err}`,
    });
  }
});

router.post("/baidu/commercial-nearby", async (req, res) => {
  const ak = String(process.env.BAIDU_MAP_AK ?? "").trim();
  if (!ak) {
    return res.status(500).json({ error: "服务端缺少 BAIDU_MAP_AK，无法调用百度地点检索。" });
  }

  const center = validatePoint(req.body?.center);
  if (!center) return res.status(400).json({ error: "center 坐标非法" });

  const radiusKmRaw = Number(req.body?.radius_km ?? 1);
  const radiusKm = Number.isFinite(radiusKmRaw) ? Math.min(30, Math.max(0.1, radiusKmRaw)) : 1;
  const radiusM = Math.round(radiusKm * 1000);
  const pageSizeRaw = Number(req.body?.page_size ?? 20);
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(20, Math.max(1, Math.round(pageSizeRaw))) : 20;
  const queryText = String(req.body?.query ?? "商业设施").trim() || "商业设施";

  try {
    const params = new URLSearchParams({
      ak,
      output: "json",
      query: queryText,
      location: `${center.lat},${center.lon}`,
      radius: String(radiusM),
      scope: "2",
      page_size: String(pageSize),
      page_num: "0",
    });
    const url = `${BAIDU_PLACE_SEARCH_URL}?${params.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: `百度地点检索请求失败（HTTP ${resp.status}）`,
        provider: data,
      });
    }
    if (Number(data?.status) !== 0) {
      return res.status(400).json({
        error: `百度地点检索失败：${data?.message || `status=${data?.status}`}`,
        provider: data,
      });
    }

    const rows = Array.isArray(data?.results) ? data.results : [];
    const facilities = rows
      .map((r) => {
        const lon = Number(r?.location?.lng);
        const lat = Number(r?.location?.lat);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
        const distanceM = Math.round(haversine(center.lat, center.lon, lat, lon));
        return {
          name: String(r?.name ?? ""),
          address: String(r?.address ?? ""),
          province: String(r?.province ?? ""),
          city: String(r?.city ?? ""),
          area: String(r?.area ?? ""),
          uid: String(r?.uid ?? ""),
          tag: String(r?.detail_info?.tag ?? ""),
          distance_m: distanceM,
          lon,
          lat,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance_m - b.distance_m);

    return res.json({
      ok: true,
      query: queryText,
      center,
      radius_km: radiusKm,
      facilities,
      provider_message: data?.message ?? "",
    });
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    return res.status(502).json({
      error: isAbort ? "百度地点检索超时，请稍后重试。" : `百度地点检索异常：${err?.message || err}`,
    });
  }
});

export default router;
