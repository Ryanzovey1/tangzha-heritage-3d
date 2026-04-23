import * as Cesium from "cesium";
import proj4 from "proj4";
import "./style.css";
import * as staticSites from "./data/sites.js";

const {
  initialCamera,
  heritageCategories,
  eraFilterOptions,
  categoryPointColors,
} = staticSites;

let heritageSites;

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".svg"];
const IMAGE_DIRS = ["/src/assets", "/assets", "/src/assets/demo", "/assets/demo", "/src/assets/sites", "/assets/sites"];
const IMAGE_CACHE = new Map();
const SITE_IMAGE_OVERRIDES = {
  "dada-steamship": "/src/assets/大达内河轮船公司旧址.jpg",
  "dasheng-wharf": "/src/assets/大生码头.jpg",
  "clock-tower": "/src/assets/大生钟楼.jpeg",
};
const SITE_IMAGE_OVERRIDES_BY_NAME = {
  "大达内河轮船公司旧址": "/src/assets/大达内河轮船公司旧址.jpg",
  "大生码头": "/src/assets/大生码头.jpg",
  "大生钟楼": "/src/assets/大生钟楼.jpeg",
};
const CRS_EPSG4549 = "CGCS2000_GK_CM120";
proj4.defs(CRS_EPSG4549, "+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs");
const GCJ_A = 6378245.0;
const GCJ_EE = 0.00669342162296594323;

function transformLat(x, y) {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  ret += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return ret;
}

function transformLon(x, y) {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  ret += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return ret;
}

function outOfChina(lat, lon) {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function gcjToWgs84(lon, lat) {
  if (outOfChina(lat, lon)) return [lon, lat];
  let dLat = transformLat(lon - 105, lat - 35);
  let dLon = transformLon(lon - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * Math.PI);
  dLon = (dLon * 180) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  const mgLat = lat + dLat;
  const mgLon = lon + dLon;
  return [lon * 2 - mgLon, lat * 2 - mgLat];
}

function bd09ToGcj02(lon, lat) {
  const x = lon - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI * 3000.0 / 180.0);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI * 3000.0 / 180.0);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

function normalizeSiteCoordinateToWgs84(site) {
  const lon = Number(site?.lon);
  const lat = Number(site?.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
  const crsRaw = String(site?.coord_crs || site?.crs || "WGS84").toUpperCase();

  let outLon = lon;
  let outLat = lat;
  if (crsRaw.includes("4549") || (Math.abs(lon) > 100000 && Math.abs(lat) > 1000000)) {
    [outLon, outLat] = proj4(CRS_EPSG4549, "WGS84", [lon, lat]);
  } else if (crsRaw.includes("BD09")) {
    const [gcjLon, gcjLat] = bd09ToGcj02(lon, lat);
    [outLon, outLat] = gcjToWgs84(gcjLon, gcjLat);
  } else if (crsRaw.includes("GCJ")) {
    [outLon, outLat] = gcjToWgs84(lon, lat);
  }

  if (!Number.isFinite(outLon) || !Number.isFinite(outLat)) return;
  site.lon = outLon;
  site.lat = outLat;
  site.coord_crs = "WGS84";
}

async function probeImage(url) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

async function resolveSiteImage(name) {
  if (!name) return "";
  if (IMAGE_CACHE.has(name)) return IMAGE_CACHE.get(name);
  const encoded = encodeURIComponent(name);
  for (const dir of IMAGE_DIRS) {
    for (const ext of IMAGE_EXTS) {
      const url = `${dir}/${encoded}${ext}`;
      // eslint-disable-next-line no-await-in-loop
      if (await probeImage(url)) {
        IMAGE_CACHE.set(name, url);
        return url;
      }
    }
  }
  IMAGE_CACHE.set(name, "");
  return "";
}

async function initHeritageData() {
  heritageSites = [...staticSites.heritageSites];
  try {
    const { loadHeritageDataset } = await import("./data/loadHeritage.js");
    heritageSites = await loadHeritageDataset();
    console.info(`[heritage] 已从 API 加载 ${heritageSites.length} 条`);
  } catch (e) {
    console.warn("[heritage] 使用静态数据:", e?.message ?? e);
  }
  for (const site of heritageSites) {
    normalizeSiteCoordinateToWgs84(site);
  }
  for (const site of heritageSites) {
    if (!site?.name) continue;
    const overrideById = SITE_IMAGE_OVERRIDES[String(site.id || "")];
    const overrideByName = SITE_IMAGE_OVERRIDES_BY_NAME[String(site.name || "")];
    if (overrideById || overrideByName) {
      site.image = overrideById || overrideByName;
      continue;
    }
    if (site.image) continue;
    // eslint-disable-next-line no-await-in-loop
    const matched = await resolveSiteImage(site.name);
    if (matched) site.image = matched;
  }
}

/**
 * 全屏门闸：须已登录（有效 JWT）或表单登录成功后才显示主界面并继续初始化 Cesium。
 */
async function ensureAuthenticated() {
  const loginShell = document.getElementById("login-shell");
  const appRoot = document.getElementById("app");
  const gateErr = document.getElementById("gate-auth-error");
  const form = document.getElementById("gate-login-form");
  if (!loginShell || !appRoot || !form) {
    console.warn("[auth] 未找到登录门闸节点，跳过门闸");
    return;
  }

  loginShell.classList.remove("hidden");
  appRoot.classList.add("hidden");
  if (gateErr) gateErr.textContent = "";

  const token0 = localStorage.getItem("access_token");
  if (token0) {
    try {
      const r = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token0}` } });
      if (r.ok) {
        const user = await r.json();
        loginShell.classList.add("hidden");
        appRoot.classList.remove("hidden");
        return user;
      }
    } catch {
      /* 网络错误时走登录表单 */
    }
    localStorage.removeItem("access_token");
  }

  await new Promise((resolve) => {
    const onSubmit = async (e) => {
      e.preventDefault();
      if (gateErr) gateErr.textContent = "验证中…";
      const u = document.getElementById("gate-auth-user")?.value?.trim();
      const p = document.getElementById("gate-auth-pass")?.value ?? "";
      try {
        const r = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u, password: p }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (gateErr) gateErr.textContent = data.error || `登录失败（${r.status}）`;
          return;
        }
        localStorage.setItem("access_token", data.access_token);
        // 如果登录响应中包含 role（后端会返回），优先使用它以决定是否显示管理面板
        const maybeUser = data && data.role ? { role: data.role, username: data.username } : null;
        // 隐藏门闸并继续（仍然异步尝试获取更完整的 /me）
        form.removeEventListener("submit", onSubmit);
        loginShell.classList.add("hidden");
        appRoot.classList.remove("hidden");
        // 尝试异步刷新用户信息，但不要阻塞界面显示
        (async () => {
          try {
            const me = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${data.access_token}` } });
            if (me.ok) {
              // 如果 /me 返回，覆盖 maybeUser（包含 sub 等更完整字段）
              const full = await me.json();
              // 将可能返回的更完整用户信息存储到 window（仅供调试/后续扩展）
              window.__currentUser = full;
            }
          } catch (e) {
            /* 忽略 /me 错误，不影响界面 */
          }
        })();
        resolve(maybeUser);
      } catch (err) {
        if (gateErr) gateErr.textContent = "无法连接服务，请确认已运行 npm run server";
        console.error(err);
      }
    };
    form.addEventListener("submit", onSubmit);
  });
}

let currentUser = await ensureAuthenticated();
if (!currentUser?.role) {
  const token = localStorage.getItem("access_token");
  if (token) {
    try {
      const meResp = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      if (meResp.ok) currentUser = await meResp.json();
    } catch {
      /* ignore */
    }
  }
}
await initHeritageData();

// 如果是管理员，动态加载管理面板
if (String(currentUser?.role || "").toLowerCase() === "admin") {
  try {
    const mod = await import("./admin.js");
    mod.initAdmin(currentUser);
  } catch (e) {
    console.error("无法加载管理面板:", e);
  }
}

const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (ionToken) {
  Cesium.Ion.defaultAccessToken = ionToken;
}

const viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  fullscreenButton: true,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  infoBox: false,
  selectionIndicator: false,
  shouldAnimate: true,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
});

requestAnimationFrame(() => {
  try {
    viewer.resize();
  } catch {
    /* ignore */
  }
});

viewer.scene.globe.depthTestAgainstTerrain = true;

function addOsmImagery() {
  return viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      credit: "© OpenStreetMap contributors",
    }),
  );
}

function addCartoImagery() {
  return viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      credit: "© Carto / OSM",
    }),
  );
}

function addAmapImagery() {
  // 高德地图瓷砖（演示用途）。注意：某些环境下可能需要 API Key 或 Referer 白名单。
  // URL 模板基于常见高德瓦片服务，若不可用可改为其它供应商。
  return viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: "https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
      subdomains: ["1", "2", "3", "4"],
      credit: "© 高德地图",
    }),
  );
}

viewer.imageryLayers.removeAll();
addOsmImagery();

const dataSource = new Cesium.CustomDataSource("tangzha-heritage");
viewer.dataSources.add(dataSource);

const entityBySiteId = new Map();
const pointEntityBySiteId = new Map();
const labelEntities = [];
const pointEntities = [];
let zoneEntity;
let userGeoJsonDataSource = null;
let pointCloudEntities = [];
let currentShownSite = null;

const layerCategoryColorEl = document.getElementById("layer-category-color");
const layerTransportPoisEl = document.getElementById("layer-transport-pois");
const transportKEl = document.getElementById("transport-k");
const transportRadiusEl = document.getElementById("transport-radius");
const transportWeightsContainer = document.getElementById("transport-weights");

// load transport POIs data
let transportPOIs = [];
try {
  const mod = await import("./data/transport_pois.js");
  transportPOIs = mod.transportPOIs || [];
} catch (e) {
  console.warn('无法加载交通 POI 数据', e);
}

// 初始化类型权重（可由用户在侧栏修改）
const STORAGE_KEY_TRANSPORT_WEIGHTS = "transport_weights_v1";
let transportWeights = {};
function saveTransportWeights() {
  try { localStorage.setItem(STORAGE_KEY_TRANSPORT_WEIGHTS, JSON.stringify(transportWeights)); } catch {}
}
function loadTransportWeights(types) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRANSPORT_WEIGHTS);
    const parsed = raw ? JSON.parse(raw) : null;
    for (const t of types) {
      if (parsed && typeof parsed[t] === "number") transportWeights[t] = parsed[t];
      else transportWeights[t] = DEFAULT_WEIGHT_FOR_TYPE(t);
    }
  } catch (e) {
    for (const t of types) transportWeights[t] = DEFAULT_WEIGHT_FOR_TYPE(t);
  }
}
function DEFAULT_WEIGHT_FOR_TYPE(type) {
  // 给出一些合理的默认权重，可按需调整
  const map = {
    "公交站": 1.0,
    "渡口": 0.9,
    "火车站": 1.2,
    "停车场": 0.6,
  };
  return map[type] ?? 1.0;
}

// 在侧栏中渲染权重输入控件
function renderTransportWeightControls() {
  if (!transportWeightsContainer) return;
  transportWeightsContainer.innerHTML = "";
  const types = [...new Set(transportPOIs.map((p) => p.type))];
  for (const t of types) {
    const val = transportWeights[t] ?? DEFAULT_WEIGHT_FOR_TYPE(t);
    const row = document.createElement("div");
    row.className = "transport-weight-item";
    const label = document.createElement("label");
    label.textContent = t;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "0.1";
    input.value = String(val);
    input.addEventListener("change", () => {
      const v = parseFloat(input.value) || 0;
      transportWeights[t] = v;
      saveTransportWeights();
      if (currentShownSite) renderTransportForSite(currentShownSite, Number(transportKEl?.value || 5));
    });
    row.appendChild(label);
    row.appendChild(input);
    transportWeightsContainer.appendChild(row);
  }
}

// 在首次加载时准备权重与侧栏控件
{
  const types = [...new Set(transportPOIs.map((p) => p.type))];
  loadTransportWeights(types);
  renderTransportWeightControls();
}

// 恢复 / 监听 transport-k 与 transport-radius（支持本地存储）
try {
  const storedK = parseInt(localStorage.getItem("transport_k"), 10);
  if (transportKEl && Number.isFinite(storedK)) transportKEl.value = String(storedK);
  const storedR = parseInt(localStorage.getItem("transport_radius"), 10);
  if (transportRadiusEl && Number.isFinite(storedR)) transportRadiusEl.value = String(storedR);
} catch {}
if (transportKEl) transportKEl.addEventListener("change", () => { localStorage.setItem("transport_k", String(transportKEl.value)); if (currentShownSite) renderTransportForSite(currentShownSite, Number(transportKEl.value)); });
if (transportRadiusEl) transportRadiusEl.addEventListener("change", () => { localStorage.setItem("transport_radius", String(transportRadiusEl.value)); if (currentShownSite) renderTransportForSite(currentShownSite, Number(transportKEl?.value || 5)); });

// --- 热力图支持（从后端获取网格 GeoJSON 并渲染） ---
let gridEntities = [];
function removeGridEntities() {
  for (const e of gridEntities) viewer.entities.remove(e);
  gridEntities = [];
}

function colorForScore(score) {
  // simple ramp: 0 gray, (0,1] orange, (1,2] green, >2 deep green
  if (score === 0) return Cesium.Color.fromCssColorString("#9CA3AF").withAlpha(0.65);
  if (score > 0 && score <= 1) return Cesium.Color.fromCssColorString("#F59E0B").withAlpha(0.65);
  if (score > 1 && score <= 2) return Cesium.Color.fromCssColorString("#10B981").withAlpha(0.65);
  return Cesium.Color.fromCssColorString("#065F46").withAlpha(0.7);
}

async function fetchAccessibilityAndRender() {
  try {
    if (!layerTransportPoisEl?.checked) {
      removeGridEntities();
      return;
    }
    const body = {
      radius: Number(transportRadiusEl?.value ?? 500),
      k: Number(transportKEl?.value ?? 5),
      weights: transportWeights,
    };
    const r = await fetch('/api/transport/accessibility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      console.warn('accessibility API 返回错误', r.status);
      return;
    }
    const data = await r.json();
    // data.grid is GeoJSON FeatureCollection of polygons with properties.score
    removeGridEntities();
    const feats = data.grid?.features || [];
    for (const f of feats) {
      if (!f.geometry || f.geometry.type !== 'Polygon') continue;
      const coords = f.geometry.coordinates[0];
      // coords: array of [lon,lat]
      const flat = coords.flat();
      const hierarchy = Cesium.Cartesian3.fromDegreesArray(flat);
      const ent = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(hierarchy),
          material: colorForScore(f.properties?.score ?? 0),
          outline: false,
          perPositionHeight: false,
          height: 0,
          classificationType: Cesium.ClassificationType.BOTH,
        },
        properties: { score: f.properties?.score ?? 0 },
      });
      gridEntities.push(ent);
    }
  } catch (e) {
    console.error('fetchAccessibilityAndRender error', e);
  }
}

// 当图层或设置变化时触发热力刷新
layerTransportPoisEl?.addEventListener('change', () => {
  if (layerTransportPoisEl.checked) {
    addTransportPoiEntities();
    fetchAccessibilityAndRender();
  } else {
    removeTransportPoiEntities();
    removeGridEntities();
  }
});

// 初始尝试渲染热力图（如果图层开启）
fetchAccessibilityAndRender();

const transportPoiEntities = new Map();

function addTransportPoiEntities() {
  for (const p of transportPOIs) {
    const pos = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0);
    const ent = viewer.entities.add({
      id: p.id,
      name: p.name,
      position: pos,
      billboard: {
        image: undefined,
      },
      point: { pixelSize: 8, color: Cesium.Color.DEEPSKYBLUE, outlineColor: Cesium.Color.WHITE, outlineWidth: 1, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND },
      properties: { type: p.type, description: p.description },
    });
    transportPoiEntities.set(p.id, ent);
  }
}

function removeTransportPoiEntities() {
  for (const ent of transportPoiEntities.values()) viewer.entities.remove(ent);
  transportPoiEntities.clear();
}

// initialize transport layer based on checkbox
if (layerTransportPoisEl) {
  if (layerTransportPoisEl.checked) addTransportPoiEntities();
  layerTransportPoisEl.addEventListener('change', () => {
    if (layerTransportPoisEl.checked) addTransportPoiEntities(); else removeTransportPoiEntities();
  });
}

function pointColorForSite(site) {
  if (!layerCategoryColorEl?.checked) {
    return Cesium.Color.fromCssColorString("#ef4444");
  }
  const hex = categoryPointColors[site.category] ?? "#ef4444";
  return Cesium.Color.fromCssColorString(hex);
}

function addHeritageEntities() {
  for (const site of heritageSites) {
    const position = Cesium.Cartesian3.fromDegrees(site.lon, site.lat, site.height ?? 0);
    const entity = dataSource.entities.add({
      id: site.id,
      name: site.name,
      position,
      point: {
        pixelSize: 12,
        color: pointColorForSite(site),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: {
        era: site.era,
        category: site.category,
        summary: site.summary,
        address: site.address ?? "",
        protection: site.protection ?? "",
        siteId: site.id,
      },
    });
    pointEntities.push(entity);
    pointEntityBySiteId.set(site.id, entity);
    const label = dataSource.entities.add({
      id: `${site.id}-label`,
      position,
      label: {
        text: site.name,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: {
        era: site.era,
        category: site.category,
        summary: site.summary,
        address: site.address ?? "",
        protection: site.protection ?? "",
        siteId: site.id,
      },
    });
    labelEntities.push(label);
    entityBySiteId.set(site.id, entity);
  }

}

addHeritageEntities();

function estimateInitialCameraFromHeritageSites() {
  if (!Array.isArray(heritageSites) || heritageSites.length === 0) return null;
  const lons = heritageSites.map((s) => Number(s.lon)).filter(Number.isFinite);
  const lats = heritageSites.map((s) => Number(s.lat)).filter(Number.isFinite);
  if (!lons.length || !lats.length) return null;

  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;

  const spanLonKm = Math.abs(maxLon - minLon) * 111.32 * Math.max(0.25, Math.cos((centerLat * Math.PI) / 180));
  const spanLatKm = Math.abs(maxLat - minLat) * 110.574;
  const spanKm = Math.max(spanLonKm, spanLatKm, 0.8);
  const height = Math.max(1400, Math.min(5200, spanKm * 1150));

  return {
    longitude: centerLon,
    latitude: centerLat,
    height,
    heading: 0,
    pitch: -Math.PI / 4,
    roll: 0,
  };
}

const adaptiveInitialCamera = estimateInitialCameraFromHeritageSites();
if (adaptiveInitialCamera) {
  initialCamera.longitude = adaptiveInitialCamera.longitude;
  initialCamera.latitude = adaptiveInitialCamera.latitude;
  initialCamera.height = adaptiveInitialCamera.height;
  initialCamera.heading = adaptiveInitialCamera.heading;
  initialCamera.pitch = adaptiveInitialCamera.pitch;
  initialCamera.roll = adaptiveInitialCamera.roll;
}

layerCategoryColorEl?.addEventListener("change", () => {
  for (const site of heritageSites) {
    const ent = pointEntityBySiteId.get(site.id);
    if (ent?.point) {
      ent.point.color = pointColorForSite(site);
    }
  }
});

viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(
    initialCamera.longitude,
    initialCamera.latitude,
    initialCamera.height,
  ),
  orientation: {
    heading: initialCamera.heading,
    pitch: initialCamera.pitch,
    roll: initialCamera.roll,
  },
});

const siteListEl = document.getElementById("site-list");
const searchEl = document.getElementById("search");
const infoPanel = document.getElementById("info-panel");
const infoTitle = document.getElementById("info-title");
const infoAddress = document.getElementById("info-address");
const infoProtection = document.getElementById("info-protection");
const infoEra = document.getElementById("info-era");
const infoCategory = document.getElementById("info-category");
const infoBody = document.getElementById("info-body");
const infoNotes = document.getElementById("info-notes");
const infoClose = document.getElementById("info-close");
const infoImage = document.getElementById("info-image");
const infoTransportContainer = document.getElementById("info-transport");
const infoTransportListEl = document.getElementById("info-transport-list");
const infoTransportScoreEl = document.getElementById("info-transport-score");
const layerPoints = document.getElementById("layer-points");
const layerLabels = document.getElementById("layer-labels");
const layerZone = document.getElementById("layer-zone");
const layerTerrain = document.getElementById("layer-terrain");
const btnReset = document.getElementById("btn-reset-view");
const btnPrevView = document.getElementById("btn-prev-view");
const btnNextView = document.getElementById("btn-next-view");
const btnMeasure = document.getElementById("btn-measure");
const btnClearMeasure = document.getElementById("btn-clear-measure");
const btnMeasureArea = document.getElementById("btn-measure-area");
const btnMeasureAreaDone = document.getElementById("btn-measure-area-done");
const measureHint = document.getElementById("measure-hint");
const basemapEl = document.getElementById("basemap");
const filterEraEl = document.getElementById("filter-era");
const filterCategoryEl = document.getElementById("filter-category");
const statSitesEl = document.getElementById("stat-sites");
const statByEraEl = document.getElementById("stat-by-era");
const btnTour = document.getElementById("btn-tour");
const btnStopTour = document.getElementById("btn-stop-tour");
// geojsonFileEl and pointcloudFileEl removed — 3D Tiles loading will be used instead
const btnLoadTiles = document.getElementById("btn-load-tiles");
const btnSetTilesDir = document.getElementById("btn-set-tiles-dir");
const btnFlyTiles = document.getElementById("btn-fly-tiles");
const tilesDirInputEl = document.getElementById("tiles-dir-input");
const tilesSourceStatusEl = document.getElementById("tiles-source-status");
const topSearchEl = document.getElementById("map-search-top");
const historyYearEl = document.getElementById("history-year");
const historyYearLabelEl = document.getElementById("history-year-label");
const btnTopLogout = document.getElementById("btn-top-logout");
const btnBatchRouteTiles = document.getElementById("btn-batch-route-tiles");
const batchRouteStatusEl = document.getElementById("batch-route-status");
const batchRouteResultsEl = document.getElementById("batch-route-results");
const timespaceRadiusKmEl = document.getElementById("timespace-radius-km");
const timespaceCellMEl = document.getElementById("timespace-cell-m");
const btnGenerateTimespaceRing = document.getElementById("btn-generate-timespace-ring");
const btnClearTimespaceRing = document.getElementById("btn-clear-timespace-ring");
const timespaceRingStatusEl = document.getElementById("timespace-ring-status");
const commercialRadiusKmEl = document.getElementById("commercial-radius-km");
const btnSearchCommercial = document.getElementById("btn-search-commercial");
const commercialStatusEl = document.getElementById("commercial-status");
const commercialResultsEl = document.getElementById("commercial-results");
const statusCoordsEl = document.getElementById("status-coords");

for (const e of eraFilterOptions) {
  const opt = document.createElement("option");
  opt.value = e;
  opt.textContent = e;
  filterEraEl.appendChild(opt);
}
{
  const all = document.createElement("option");
  all.value = "全部";
  all.textContent = "全部";
  filterCategoryEl.appendChild(all);
}
for (const c of heritageCategories) {
  const opt = document.createElement("option");
  opt.value = c;
  opt.textContent = c;
  filterCategoryEl.appendChild(opt);
}

function updateStats() {
  if (statSitesEl) statSitesEl.textContent = String(heritageSites.length);
  const byEra = new Map();
  for (const s of heritageSites) {
    byEra.set(s.era, (byEra.get(s.era) ?? 0) + 1);
  }
  if (statByEraEl) {
    statByEraEl.innerHTML = "";
    for (const [era, n] of byEra) {
      const span = document.createElement("span");
      span.className = "stat-chip";
      span.innerHTML = `${era}<span>${n}</span>`;
      statByEraEl.appendChild(span);
    }
  }
}
updateStats();

function showToast(text) {
  measureHint.textContent = text;
  measureHint.classList.remove("hidden");
}

function hideToast() {
  measureHint.classList.add("hidden");
}

function showSiteInfo(site) {
  infoTitle.textContent = site.name;
  infoAddress.textContent = site.address ? `地址：${site.address}` : "";
  infoProtection.textContent = site.protection ? `保护等级 / 状况：${site.protection}` : "";
  // 前端界面不展示内部备注
  infoNotes.textContent = "";
  infoNotes.classList.add("hidden");
  infoEra.textContent = site.era ? `年代 / 时期：${site.era}` : "";
  infoCategory.textContent = site.category ? `类型：${site.category}` : "";
  infoCategory.classList.toggle("hidden", !site.category);
  infoBody.textContent = site.summary;
  // 图片支持：如果有 image 字段则显示，否则隐藏
  if (infoImage) {
    if (site.image) {
      infoImage.src = site.image;
      infoImage.onerror = () => {
        infoImage.src = "";
        infoImage.classList.add("hidden");
      };
      infoImage.classList.remove("hidden");
    } else {
      infoImage.src = "";
      infoImage.classList.add("hidden");
    }
  }
  infoPanel.classList.remove("hidden");
}

function showZoneInfo() {
  hideInfo();
}

function hideInfo() {
  infoPanel.classList.add("hidden");
}

// --- 交通 POI 辅助方法 ---
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000; // 地球半径，米
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getNearestTransportPOIs(site, k = 5) {
  if (!transportPOIs || transportPOIs.length === 0) return [];
  const arr = transportPOIs.map((p) => {
    const d = haversineDistanceMeters(site.lat, site.lon, p.lat, p.lon);
    return { ...p, distance_m: d };
  });
  arr.sort((a, b) => a.distance_m - b.distance_m);
  return arr.slice(0, k);
}

function renderTransportForSite(site, k = 5) {
  if (!infoTransportListEl || !infoTransportScoreEl) return;
  infoTransportListEl.innerHTML = "";
  const nearest = getNearestTransportPOIs(site, k);
  if (nearest.length === 0) {
    infoTransportScoreEl.textContent = "无交通 POI 数据";
    return;
  }
  // 从侧栏读取用户设置
  const radius = Number(transportRadiusEl?.value ?? 500);
  const weights = transportWeights || {};
  // 计算加权分数：把所有在 radius 内的 POI 加权求和
  const allWithDist = transportPOIs.map((p) => ({ ...p, distance_m: haversineDistanceMeters(site.lat, site.lon, p.lat, p.lon) }));
  const within = allWithDist.filter((p) => p.distance_m <= radius);
  const weightedSum = within.reduce((s, p) => s + (Number(weights[p.type] ?? 1) || 0), 0);
  // 根据 weightedSum 映射颜色（阈值可调整）
  let badgeColor = "#9CA3AF"; // 灰
  if (weightedSum === 0) badgeColor = "#9CA3AF"; // 无
  else if (weightedSum > 0 && weightedSum <= 1) badgeColor = "#F59E0B"; // 橙
  else if (weightedSum > 1 && weightedSum <= 2) badgeColor = "#10B981"; // 绿
  else badgeColor = "#065F46"; // 深绿
  infoTransportScoreEl.innerHTML = "";
  const badge = document.createElement("span");
  badge.className = "transport-badge";
  badge.style.background = badgeColor;
  badge.textContent = `${weightedSum.toFixed(1)}`;
  infoTransportScoreEl.appendChild(badge);
  const txt = document.createElement("span");
  txt.style.marginLeft = "8px";
  txt.textContent = `半径 ${radius}m 内加权 POI: ${within.length}，显示最近 ${k} 个`;
  infoTransportScoreEl.appendChild(txt);
  // 列表显示最近 k 个 POI（并显示距离和类型）
  for (const p of nearest) {
    const li = document.createElement("li");
    li.className = "transport-item";
    const name = document.createElement("div");
    name.className = "transport-name";
    name.textContent = p.name;
    const meta = document.createElement("div");
    meta.className = "transport-meta";
    const distm = p.distance_m < 1000 ? `${Math.round(p.distance_m)} m` : `${(p.distance_m / 1000).toFixed(2)} km`;
    meta.textContent = `${p.type} · ${distm}`;
    li.appendChild(name);
    li.appendChild(meta);
    // 点击跳转到 POI（若图层开启则飞到该实体）
    li.addEventListener("click", () => {
      const ent = transportPoiEntities.get(p.id);
      if (ent) {
        rememberCameraForHistory();
        viewer.flyTo(ent, { duration: 1.2, offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-40), 300) });
      }
    });
    infoTransportListEl.appendChild(li);
  }
}

function flyToSite(site) {
  rememberCameraForHistory();
  viewer.flyTo(entityBySiteId.get(site.id), {
    duration: 1.6,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 650),
  });
  showSiteInfo(site);
  setActiveListItem(site.id);
}

function setActiveListItem(id) {
  siteListEl.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.id === id);
  });
}

function getListFilters() {
  const q = searchEl.value.trim().toLowerCase();
  const era = filterEraEl.value;
  const cat = filterCategoryEl.value;
  const year = Number(historyYearEl?.value || 1930);
  return { q, era, cat, year };
}

function getEraYearRange(eraText) {
  const text = String(eraText || "");
  if (text.includes("清末—民国") || text.includes("清末-民国")) return [1895, 1949];
  if (text.includes("清末")) return [1895, 1911];
  if (text.includes("民国")) return [1912, 1949];
  if (text.includes("近代—当代") || text.includes("近代-当代")) return [1900, 2025];
  if (text.includes("当代")) return [1949, 2025];
  if (text.includes("近代")) return [1900, 1949];
  return [1900, 2025];
}

function siteMatchesFilters(site, filters) {
  const { q, era, cat, year } = filters;
  if (era !== "全部" && site.era !== era) return false;
  if (cat !== "全部" && site.category !== cat) return false;
  const [startYear, endYear] = getEraYearRange(site.era);
  if (Number.isFinite(year) && (year < startYear || year > endYear)) return false;
  if (!q) return true;
  const blob = `${site.name} ${site.summary} ${site.era} ${site.category} ${site.address ?? ""} ${site.protection ?? ""}`.toLowerCase();
  return blob.includes(q);
}

function applyFilteredEntityVisibility() {
  const filters = getListFilters();
  const showPoints = layerPoints.checked;
  const showLabels = layerLabels.checked;
  for (const site of heritageSites) {
    const matched = siteMatchesFilters(site, filters);
    const point = pointEntityBySiteId.get(site.id);
    const label = dataSource.entities.getById(`${site.id}-label`);
    if (point) point.show = showPoints && matched;
    if (label) label.show = showLabels && matched;
  }
}

function renderList() {
  const filters = getListFilters();
  siteListEl.innerHTML = "";
  const items = heritageSites.filter((s) => siteMatchesFilters(s, filters));
  for (const site of items) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = site.id;
    btn.innerHTML = `${site.name}<span class="meta">${site.category} · ${site.era}</span>`;
    btn.addEventListener("click", () => flyToSite(site));
    li.appendChild(btn);
    siteListEl.appendChild(li);
  }
  applyFilteredEntityVisibility();
}

renderList();

searchEl.addEventListener("input", renderList);
topSearchEl?.addEventListener("input", () => {
  searchEl.value = topSearchEl.value;
  renderList();
});
searchEl.addEventListener("input", () => {
  if (topSearchEl && topSearchEl.value !== searchEl.value) topSearchEl.value = searchEl.value;
});
filterEraEl.addEventListener("change", renderList);
filterCategoryEl.addEventListener("change", renderList);
historyYearEl?.addEventListener("input", () => {
  if (historyYearLabelEl) historyYearLabelEl.textContent = `历史时间（${historyYearEl.value}）`;
  renderList();
});
if (historyYearEl && historyYearLabelEl) {
  historyYearLabelEl.textContent = `历史时间（${historyYearEl.value}）`;
}

infoClose.addEventListener("click", hideInfo);

const MAX_VIEW_HISTORY = 32;
const viewStates = [];
let viewPtr = -1;
let historySuspended = false;

function serializeCamera() {
  return {
    position: viewer.camera.position.clone(),
    direction: viewer.camera.direction.clone(),
    up: viewer.camera.up.clone(),
  };
}

function restoreCameraSnapshot(s) {
  historySuspended = true;
  viewer.camera.setView({
    destination: s.position,
    orientation: {
      direction: s.direction,
      up: s.up,
    },
  });
  setTimeout(() => {
    historySuspended = false;
  }, 400);
}

function viewsClose(a, b) {
  if (!a || !b) return false;
  return Cesium.Cartesian3.distance(a.position, b.position) < 1.5;
}

function rememberCameraForHistory() {
  if (historySuspended) return;
  const snap = serializeCamera();
  if (viewPtr >= 0 && viewsClose(snap, viewStates[viewPtr])) return;
  viewStates.splice(viewPtr + 1);
  viewStates.push(snap);
  viewPtr = viewStates.length - 1;
  while (viewStates.length > MAX_VIEW_HISTORY) {
    viewStates.shift();
    viewPtr--;
  }
}

function commitIdleCamera() {
  if (historySuspended || tourRunning) return;
  const snap = serializeCamera();
  if (viewPtr >= 0 && viewsClose(snap, viewStates[viewPtr])) return;
  viewStates.splice(viewPtr + 1);
  viewStates.push(snap);
  viewPtr = viewStates.length - 1;
  while (viewStates.length > MAX_VIEW_HISTORY) {
    viewStates.shift();
    viewPtr--;
  }
}

let historyDebounce;
viewer.camera.moveEnd.addEventListener(() => {
  clearTimeout(historyDebounce);
  historyDebounce = setTimeout(commitIdleCamera, 1100);
});

viewStates.push(serializeCamera());
viewPtr = 0;

btnPrevView?.addEventListener("click", () => {
  if (viewPtr <= 0) return;
  viewPtr--;
  restoreCameraSnapshot(viewStates[viewPtr]);
});

btnNextView?.addEventListener("click", () => {
  if (viewPtr >= viewStates.length - 1) return;
  viewPtr++;
  restoreCameraSnapshot(viewStates[viewPtr]);
});

btnReset.addEventListener("click", () => {
  rememberCameraForHistory();
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      initialCamera.longitude,
      initialCamera.latitude,
      initialCamera.height,
    ),
    orientation: {
      heading: initialCamera.heading,
      pitch: initialCamera.pitch,
      roll: initialCamera.roll,
    },
    duration: 1.4,
  });
  hideInfo();
});

basemapEl.addEventListener("change", () => {
  const v = basemapEl.value;
  viewer.imageryLayers.removeAll();
  if (v === "osm") {
    addOsmImagery();
  } else if (v === "gaode") {
    addAmapImagery();
  }
  // 确保球体基色为黑色（影像图时更易阅读）
  viewer.scene.globe.baseColor = Cesium.Color.BLACK;
});

layerPoints.addEventListener("change", () => {
  applyFilteredEntityVisibility();
});

layerLabels.addEventListener("change", () => {
  applyFilteredEntityVisibility();
});

layerZone?.addEventListener("change", () => {
  if (zoneEntity) {
    zoneEntity.show = layerZone.checked;
  }
});

if (layerTerrain) {
  layerTerrain.addEventListener("change", async () => {
    if (!layerTerrain.checked) {
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      return;
    }
    if (!ionToken) {
      layerTerrain.checked = false;
      window.alert("请在项目根目录创建 .env 并设置 VITE_CESIUM_ION_TOKEN 后重新启动开发服务器。");
      return;
    }
    try {
      viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
    } catch (e) {
      layerTerrain.checked = false;
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      window.alert("地形加载失败，请检查 Ion Token 是否有效。");
      console.error(e);
    }
  });
}

function waitFlight(promiseOrUndefined, fallbackSeconds) {
  if (promiseOrUndefined && typeof promiseOrUndefined.then === "function") {
    return promiseOrUndefined;
  }
  const ms = Math.round((fallbackSeconds ?? 2) * 1000) + 300;
  return new Promise((r) => setTimeout(r, ms));
}

let tourRunning = false;

btnTour.addEventListener("click", async () => {
  if (tourRunning) return;
  tourRunning = true;
  rememberCameraForHistory();
  btnTour.classList.add("hidden");
  btnStopTour.classList.remove("hidden");
  try {
    const p0 = viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        initialCamera.longitude,
        initialCamera.latitude,
        initialCamera.height,
      ),
      orientation: {
        heading: initialCamera.heading,
        pitch: initialCamera.pitch,
        roll: initialCamera.roll,
      },
      duration: 1.2,
    });
    await waitFlight(p0, 1.2);
    await new Promise((r) => setTimeout(r, 400));
    for (const site of heritageSites) {
      if (!tourRunning) break;
      rememberCameraForHistory();
      const ent = entityBySiteId.get(site.id);
      const p = viewer.flyTo(ent, {
        duration: 2.1,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-38), 520),
      });
      await waitFlight(p, 2.1);
      // 展开该遗存信息并高亮列表项
      try {
        showSiteInfo(site);
        setActiveListItem(site.id);
      } catch (e) {
        console.error('展示站点信息失败', e);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    tourRunning = false;
    btnTour.classList.remove("hidden");
    btnStopTour.classList.add("hidden");
  }
});

btnStopTour.addEventListener("click", () => {
  tourRunning = false;
  viewer.camera.cancelFlight();
});

// 3D Tiles 加载（支持本地目录、坐标纠偏、批量算路与交通时空圈）
let tileset3d = null;
let tileset3dVisible = false;
let currentTilesetUrl = "/3d-tiles/tileset.json";
let timespaceEntities = [];
let commercialEntities = [];

function setTilesSourceStatus(text, isError = false) {
  if (!tilesSourceStatusEl) return;
  tilesSourceStatusEl.textContent = text;
  tilesSourceStatusEl.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function setBatchRouteStatus(text, isError = false) {
  if (!batchRouteStatusEl) return;
  batchRouteStatusEl.textContent = text;
  batchRouteStatusEl.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function setTimespaceRingStatus(text, isError = false) {
  if (!timespaceRingStatusEl) return;
  timespaceRingStatusEl.textContent = text;
  timespaceRingStatusEl.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function setCommercialStatus(text, isError = false) {
  if (!commercialStatusEl) return;
  commercialStatusEl.textContent = text;
  commercialStatusEl.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function clearBatchRouteResults() {
  if (batchRouteResultsEl) batchRouteResultsEl.innerHTML = "";
}

function clearCommercialResults() {
  if (commercialResultsEl) commercialResultsEl.innerHTML = "";
}

function renderBatchRouteResults(rows) {
  if (!batchRouteResultsEl) return;
  batchRouteResultsEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  rows.slice(0, 10).forEach((r, i) => {
    const el = document.createElement("div");
    const km = (Number(r.distance_m || 0) / 1000).toFixed(2);
    const min = (Number(r.duration_s || 0) / 60).toFixed(1);
    el.textContent = `${i + 1}. ${r.origin_name || r.origin_id}：${km} km / ${min} min`;
    frag.appendChild(el);
  });
  batchRouteResultsEl.appendChild(frag);
}

async function postJsonWithFallback(paths, body) {
  let lastErr = null;
  for (const url of paths) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      return data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("请求失败");
}

function parseRootTransformTranslation(tilesetJson) {
  const transform = tilesetJson?.root?.transform;
  if (!Array.isArray(transform) || transform.length !== 16) return null;
  const tx = Number(transform[12]);
  const ty = Number(transform[13]);
  const tz = Number(transform[14]);
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return null;
  return { x: tx, y: ty, z: tz };
}

function isLikelyProjectedMeters(translation) {
  if (!translation) return false;
  const { x, y } = translation;
  // 经验范围：高斯投影坐标（华东区域）通常 x≈500000, y≈3000000~4000000
  return Math.abs(x) > 100000 && Math.abs(x) < 1000000 && Math.abs(y) > 1000000 && Math.abs(y) < 10000000;
}

function buildProjectedTilesModelMatrix(translation) {
  if (!translation) return null;
  if (!isLikelyProjectedMeters(translation)) return null;
  const [lon, lat] = proj4(CRS_EPSG4549, "WGS84", [translation.x, translation.y]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const destination = Cesium.Cartesian3.fromDegrees(lon, lat, translation.z || 0);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(destination);
  const inverseOriginalTranslation = Cesium.Matrix4.fromTranslation(
    new Cesium.Cartesian3(-translation.x, -translation.y, -(translation.z || 0)),
  );
  return Cesium.Matrix4.multiply(enu, inverseOriginalTranslation, new Cesium.Matrix4());
}

async function fetchTilesetJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function createTilesetWithFallback(url, tilesetJson) {
  const projectedMatrix = buildProjectedTilesModelMatrix(parseRootTransformTranslation(tilesetJson));
  const candidateMatrices = projectedMatrix ? [projectedMatrix, Cesium.Matrix4.IDENTITY] : [Cesium.Matrix4.IDENTITY];
  let lastError = null;

  for (const modelMatrix of candidateMatrices) {
    const ts = new Cesium.Cesium3DTileset({
      url,
      modelMatrix,
    });
    viewer.scene.primitives.add(ts);
    try {
      await ts.readyPromise;
      return ts;
    } catch (e) {
      lastError = e;
      try { viewer.scene.primitives.remove(ts); } catch {}
      try { if (ts.destroy) ts.destroy(); } catch {}
    }
  }

  throw lastError || new Error("3D Tiles 初始化失败");
}

function estimateDefaultViewFromTilesetJson(tilesetJson) {
  const t = parseRootTransformTranslation(tilesetJson);
  if (!t) return null;
  if (!isLikelyProjectedMeters(t)) return null;
  const [lon, lat] = proj4(CRS_EPSG4549, "WGS84", [t.x, t.y]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat, height: 1800 };
}

function getTilesetCenterLonLat() {
  if (!tileset3d) return null;
  const center = tileset3d.boundingSphere?.center;
  if (!center) return null;
  const cartographic = Cesium.Cartographic.fromCartesian(center);
  return {
    lon: Cesium.Math.toDegrees(cartographic.longitude),
    lat: Cesium.Math.toDegrees(cartographic.latitude),
  };
}

function alignHeritageSitesAroundTiles() {
  // 保留函数占位：当前按真实坐标显示遗存，不再做“围绕 3D Tiles 重定位”。
}

function kmToLonDelta(km, latDeg) {
  const cosv = Math.max(0.1, Math.cos((latDeg * Math.PI) / 180));
  return km / (111.32 * cosv);
}

function buildCircleGridPoints(center, radiusKm, cellM) {
  const points = [];
  const stepKm = Math.max(0.1, cellM / 1000);
  const latStepDeg = stepKm / 110.574;
  const latRadiusDeg = radiusKm / 110.574;
  const rowCount = Math.max(1, Math.ceil((latRadiusDeg * 2) / latStepDeg));
  let idx = 0;

  for (let row = 0; row <= rowCount; row++) {
    const lat = center.lat - latRadiusDeg + row * latStepDeg;
    const dLatKm = Math.abs(lat - center.lat) * 110.574;
    if (dLatKm > radiusKm) continue;
    const lonRadiusKm = Math.sqrt(Math.max(0, radiusKm * radiusKm - dLatKm * dLatKm));
    const lonStepDeg = kmToLonDelta(stepKm, lat);
    const lonRadiusDeg = kmToLonDelta(lonRadiusKm, lat);
    const colCount = Math.max(1, Math.ceil((lonRadiusDeg * 2) / lonStepDeg));
    for (let col = 0; col <= colCount; col++) {
      const lon = center.lon - lonRadiusDeg + col * lonStepDeg;
      points.push({ id: `g-${idx++}`, lon, lat, row, col });
    }
  }
  return points;
}

function colorForTravelDuration(durationS, minDurationS, maxDurationS) {
  const minSafe = Number.isFinite(minDurationS) ? minDurationS : 0;
  const maxSafe = Math.max(minSafe + 1, Number(maxDurationS || 1));
  const t = Math.max(0, Math.min(1, (Number(durationS || 0) - minSafe) / (maxSafe - minSafe)));
  // 细化分级：深蓝 -> 蓝 -> 青 -> 黄 -> 橙 -> 红
  if (t <= 0.08) return Cesium.Color.fromCssColorString("#0b5ea8").withAlpha(0.58);
  if (t <= 0.2) return Cesium.Color.fromCssColorString("#1e81cf").withAlpha(0.57);
  if (t <= 0.34) return Cesium.Color.fromCssColorString("#49a6dd").withAlpha(0.56);
  if (t <= 0.5) return Cesium.Color.fromCssColorString("#83c7d9").withAlpha(0.55);
  if (t <= 0.66) return Cesium.Color.fromCssColorString("#f2dc7b").withAlpha(0.54);
  if (t <= 0.8) return Cesium.Color.fromCssColorString("#f4bb61").withAlpha(0.53);
  if (t <= 0.92) return Cesium.Color.fromCssColorString("#ef9442").withAlpha(0.52);
  return Cesium.Color.fromCssColorString("#e56a33").withAlpha(0.5);
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function fetchMatrixRoutesByBatches(destination, origins, onProgress) {
  const batches = chunkArray(origins, 100);
  const routes = [];
  for (let i = 0; i < batches.length; i++) {
    const part = batches[i];
    if (onProgress) onProgress(i + 1, batches.length, part.length);
    const data = await postJsonWithFallback(
      ["/api/routing/baidu/matrix", "http://localhost:3001/api/routing/baidu/matrix"],
      { mode: "driving", coord_type: "wgs84", destination, origins: part },
    );
    const rows = Array.isArray(data?.routes) ? data.routes : [];
    routes.push(...rows);
  }
  return routes;
}

function clearTimespaceRingEntities() {
  for (const e of timespaceEntities) viewer.entities.remove(e);
  timespaceEntities = [];
}

function clearCommercialEntities() {
  for (const e of commercialEntities) viewer.entities.remove(e);
  commercialEntities = [];
}

function renderCommercialResults(rows) {
  clearCommercialEntities();
  clearCommercialResults();
  if (!commercialResultsEl) return;

  const frag = document.createDocumentFragment();
  rows.slice(0, 30).forEach((r, i) => {
    const lon = Number(r?.lon);
    const lat = Number(r?.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

    const pos = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    const ent = viewer.entities.add({
      position: pos,
      point: {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString("#f59e0b"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1.5,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: r.name || `POI-${i + 1}`,
        font: "12px sans-serif",
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#3a2b1f").withAlpha(0.72),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2400),
      },
      properties: {
        type: String(r?.tag || ""),
        address: String(r?.address || ""),
        distance_m: Number(r?.distance_m || 0),
      },
    });
    commercialEntities.push(ent);

    const line = document.createElement("div");
    const distanceM = Number(r?.distance_m || 0);
    const distText = distanceM < 1000 ? `${Math.round(distanceM)} m` : `${(distanceM / 1000).toFixed(2)} km`;
    line.textContent = `${i + 1}. ${r.name || "未命名"} · ${distText}`;
    line.style.cursor = "pointer";
    line.addEventListener("click", () => {
      rememberCameraForHistory();
      viewer.flyTo(ent, {
        duration: 1.1,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-40), 280),
      });
    });
    frag.appendChild(line);
  });

  commercialResultsEl.appendChild(frag);
}

async function runSearchCommercialNearby() {
  const center = getTilesetCenterLonLat();
  if (!center || !tileset3dVisible) {
    setCommercialStatus("请先加载 3D Tiles，再执行商业检索", true);
    return;
  }

  const radiusKm = Math.min(30, Math.max(0.1, Number(commercialRadiusKmEl?.value || 2)));
  setCommercialStatus("商业设施检索中...");
  clearCommercialResults();
  clearCommercialEntities();

  try {
    const data = await postJsonWithFallback(
      ["/api/routing/baidu/commercial-nearby", "http://localhost:3001/api/routing/baidu/commercial-nearby"],
      { center, radius_km: radiusKm, query: "商业设施", page_size: 20 },
    );
    const facilities = Array.isArray(data?.facilities) ? data.facilities : [];
    renderCommercialResults(facilities);
    setCommercialStatus(`检索完成：${facilities.length} 个设施（半径 ${radiusKm}km）`);
  } catch (e) {
    setCommercialStatus(`商业检索失败：${e?.message || e}`, true);
  }
}

function renderTimespaceHeatAndRings(center, routes, cellM) {
  clearTimespaceRingEntities();
  const valid = routes.filter((r) =>
    Number.isFinite(Number(r?.origin_lon)) &&
    Number.isFinite(Number(r?.origin_lat)) &&
    Number.isFinite(Number(r?.duration_s)),
  );
  if (!valid.length) return;

  const minDurationS = valid.reduce((m, r) => Math.min(m, Number(r.duration_s || m)), Number.POSITIVE_INFINITY);
  const maxDurationS = valid.reduce((m, r) => Math.max(m, Number(r.duration_s || 0)), 1);

  // 1) 真实数据网格：每个网格中心点都来自百度算路结果，不再插值推算。
  const halfLat = (cellM / 2000) / 110.574;
  for (const r of valid) {
    const lon = Number(r.origin_lon);
    const lat = Number(r.origin_lat);
    const durationS = Number(r.duration_s || 0);
    const color = colorForTravelDuration(durationS, minDurationS, maxDurationS);
    const halfLon = kmToLonDelta(cellM / 2000, lat);
    const polygon = Cesium.Cartesian3.fromDegreesArray([
      lon - halfLon, lat - halfLat,
      lon + halfLon, lat - halfLat,
      lon + halfLon, lat + halfLat,
      lon - halfLon, lat + halfLat,
    ]);
    timespaceEntities.push(viewer.entities.add({
      polygon: {
        hierarchy: polygon,
        material: color,
        outline: true,
        outlineWidth: 0.8,
        outlineColor: Cesium.Color.fromCssColorString("#1b3d4d").withAlpha(0.15),
      },
      properties: {
        duration_s: durationS,
        duration_min: Number((durationS / 60).toFixed(1)),
      },
    }));
  }

  // 2) 同心等时圈：按样本半径估算，增强可读性
  [15, 30, 45, 60].forEach((min, idx) => {
    const thresholdS = min * 60;
    const bucket = valid.filter((r) => Number(r.duration_s || 0) <= thresholdS);
    const radiusM = bucket.length
      ? Math.max(
          300,
          ...bucket.map((r) => haversineDistanceMeters(center.lat, center.lon, Number(r.origin_lat), Number(r.origin_lon))),
        )
      : min * 700;
    timespaceEntities.push(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, 0),
      ellipse: {
        semiMajorAxis: radiusM,
        semiMinorAxis: radiusM,
        material: Cesium.Color.TRANSPARENT,
        outline: true,
        outlineWidth: 2,
        outlineColor: Cesium.Color.fromCssColorString("#2a8f96").withAlpha(0.7),
      },
    }));
    const labelLat = center.lat + radiusM / 110574;
    timespaceEntities.push(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(center.lon, labelLat, 0),
      label: {
        text: `${min} 分钟`,
        font: "12px sans-serif",
        fillColor: Cesium.Color.fromCssColorString("#f3dfc2"),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#3a2b1f").withAlpha(0.7),
        pixelOffset: new Cesium.Cartesian2(0, -10 - idx * 2),
      },
    }));
  });

  // 左上角标题标注，风格与示例图接近
  const titleLon = center.lon - kmToLonDelta(2.8, center.lat);
  const titleLat = center.lat + 2.2 / 110.574;
  timespaceEntities.push(viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(titleLon, titleLat, 0),
    label: {
      text: "交通时空圈",
      font: "bold 22px \"KaiTi\", serif",
      fillColor: Cesium.Color.fromCssColorString("#e2ad63"),
      outlineColor: Cesium.Color.fromCssColorString("#3a2b1f"),
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      showBackground: false,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }));
}

async function runBatchRouteToTilesCenter() {
  const center = getTilesetCenterLonLat();
  if (!center) {
    setBatchRouteStatus("请先加载 3D Tiles", true);
    return;
  }
  setBatchRouteStatus("批量算路中...");
  clearBatchRouteResults();
  try {
    const origins = heritageSites.map((s) => ({ id: s.id, name: s.name, lon: s.lon, lat: s.lat }));
    const data = await postJsonWithFallback(
      ["/api/routing/baidu/matrix", "http://localhost:3001/api/routing/baidu/matrix"],
      { mode: "driving", coord_type: "wgs84", destination: center, origins },
    );
    const routes = Array.isArray(data?.routes) ? data.routes : [];
    setBatchRouteStatus(`完成：共 ${routes.length} 条`);
    renderBatchRouteResults(routes);
  } catch (e) {
    setBatchRouteStatus(`批量算路失败：${e?.message || e}`, true);
  }
}

async function runGenerateTimespaceRing() {
  const center = getTilesetCenterLonLat();
  if (!center) {
    setTimespaceRingStatus("请先加载 3D Tiles", true);
    return;
  }
  const radiusKm = Math.max(1, Number(timespaceRadiusKmEl?.value || 40));
  const cellM = Math.max(100, Number(timespaceCellMEl?.value || 1000));
  setTimespaceRingStatus("交通时空圈生成中...");
  try {
    let effectiveCellM = cellM;
    let points = buildCircleGridPoints(center, radiusKm, effectiveCellM);
    if (points.length > 600) {
      const scale = Math.sqrt(points.length / 600);
      effectiveCellM = Math.max(100, Math.round(cellM * scale));
      points = buildCircleGridPoints(center, radiusKm, effectiveCellM);
    }
    const routes = await fetchMatrixRoutesByBatches(
      center,
      points.map((p) => ({ id: p.id, name: `网格-${p.row}-${p.col}`, lon: p.lon, lat: p.lat })),
      (current, total, count) => {
        setTimespaceRingStatus(`交通时空圈生成中...第 ${current}/${total} 批（${count} 个网格）`);
      },
    );
    if (!routes.length) {
      clearTimespaceRingEntities();
      setTimespaceRingStatus("未检索到有效算路结果，请调大半径或稍后重试", true);
      return;
    }
    renderTimespaceHeatAndRings(center, routes, effectiveCellM);
    setTimespaceRingStatus(`已生成：${routes.length} 个真实网格（网格 ${effectiveCellM}m，百度算路数据）`);
  } catch (e) {
    setTimespaceRingStatus(`生成失败：${e?.message || e}`, true);
  }
}

async function syncTilesSourceFromServer() {
  if (!tilesDirInputEl) return;
  try {
    const r = await fetch("/api/tiles/source");
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    const dir = String(data?.directory || "");
    if (dir) {
      tilesDirInputEl.value = dir;
      currentTilesetUrl = "/user-tiles/tileset.json";
      setTilesSourceStatus(`已设置目录：${dir}`);
    } else {
      currentTilesetUrl = "/3d-tiles/tileset.json";
      setTilesSourceStatus("默认目录：/3d-tiles/tileset.json");
    }
  } catch {
    currentTilesetUrl = "/3d-tiles/tileset.json";
    setTilesSourceStatus("默认目录：/3d-tiles/tileset.json");
  }
}

async function setTilesSourceDirectory() {
  const directory = String(tilesDirInputEl?.value || "").trim();
  if (!directory) {
    setTilesSourceStatus("请输入本地目录", true);
    return;
  }
  try {
    if (btnSetTilesDir) btnSetTilesDir.disabled = true;
    const r = await fetch("/api/tiles/source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directory }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    currentTilesetUrl = "/user-tiles/tileset.json";
    setTilesSourceStatus(`目录设置成功：${directory}`);
    if (tileset3dVisible) {
      tileset3d.show = false;
      tileset3dVisible = false;
      btnLoadTiles.textContent = "加载 3D Tiles";
      clearCommercialEntities();
      clearCommercialResults();
      setCommercialStatus("未检索");
    }
    if (tileset3d) {
      try { viewer.scene.primitives.remove(tileset3d); } catch {}
      try { if (tileset3d.destroy) tileset3d.destroy(); } catch {}
      tileset3d = null;
    }
  } catch (e) {
    setTilesSourceStatus(`设置失败：${e?.message || e}`, true);
  } finally {
    if (btnSetTilesDir) btnSetTilesDir.disabled = false;
  }
}
async function toggleLoadTileset() {
  if (!btnLoadTiles) return;
  try {
    if (tileset3d && tileset3dVisible) {
      // Cesium 在 zoomTo 后仍可能短暂持有 tileset 作为内部目标。
      // 这里改为隐藏并复用，避免 render loop 访问已销毁 tileset。
      viewer.camera.cancelFlight();
      viewer.trackedEntity = undefined;
      tileset3d.show = false;
      tileset3dVisible = false;
      btnLoadTiles.textContent = "加载 3D Tiles";
      clearCommercialEntities();
      clearCommercialResults();
      setCommercialStatus("未检索");
      return;
    }
    btnLoadTiles.disabled = true;
    btnLoadTiles.textContent = "加载中...";

    if (!tileset3d) {
      const json = await fetchTilesetJson(currentTilesetUrl);
      const ts = await createTilesetWithFallback(currentTilesetUrl, json);
      tileset3d = ts;
    }

    tileset3d.show = true;
    tileset3dVisible = true;
    btnLoadTiles.textContent = "卸载 3D Tiles";

    let zoomed = false;
    try {
      await viewer.zoomTo(tileset3d);
      zoomed = true;
    } catch {
      zoomed = false;
    }
    if (!zoomed) {
      const estimated = estimateDefaultViewFromTilesetJson(await fetchTilesetJson(currentTilesetUrl));
      if (estimated) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(estimated.lon, estimated.lat, estimated.height),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 },
          duration: 1.4,
        });
      }
    }
  } catch (e) {
    console.error('加载 3D Tiles 失败', e);
    window.alert('加载 3D Tiles 失败：' + (e?.message || e));
    if (tileset3d && !tileset3dVisible) {
      try { viewer.scene.primitives.remove(tileset3d); } catch {}
      try { if (tileset3d.destroy) tileset3d.destroy(); } catch {}
      tileset3d = null;
    }
    btnLoadTiles.textContent = "加载 3D Tiles";
  } finally {
    btnLoadTiles.disabled = false;
  }
}

if (btnLoadTiles) {
  btnLoadTiles.addEventListener('click', () => toggleLoadTileset());
}
btnSetTilesDir?.addEventListener("click", () => {
  setTilesSourceDirectory();
});
btnFlyTiles?.addEventListener("click", async () => {
  if (!tileset3d || !tileset3dVisible) return;
  try {
    await viewer.zoomTo(tileset3d);
  } catch {
    /* ignore */
  }
});
btnBatchRouteTiles?.addEventListener("click", runBatchRouteToTilesCenter);
btnGenerateTimespaceRing?.addEventListener("click", runGenerateTimespaceRing);
btnClearTimespaceRing?.addEventListener("click", () => {
  clearTimespaceRingEntities();
  setTimespaceRingStatus("已清除");
});
btnSearchCommercial?.addEventListener("click", runSearchCommercialNearby);
syncTilesSourceFromServer();

const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
let measureMode = "idle";
let measurePoints = [];
let measureEntities = [];
let areaPoints = [];
let areaTempEntities = [];
let areaResultEntities = [];

function clearDistanceMeasure() {
  measurePoints = [];
  for (const e of measureEntities) {
    viewer.entities.remove(e);
  }
  measureEntities = [];
}

function clearAreaDraft() {
  areaPoints = [];
  for (const e of areaTempEntities) {
    viewer.entities.remove(e);
  }
  areaTempEntities = [];
}

function clearAreaResult() {
  for (const e of areaResultEntities) {
    viewer.entities.remove(e);
  }
  areaResultEntities = [];
}

function exitMeasureModes() {
  measureMode = "idle";
  clearDistanceMeasure();
  clearAreaDraft();
  hideToast();
  btnMeasureAreaDone.disabled = true;
}

function planarPolygonAreaM2(positions) {
  if (positions.length < 3) return 0;
  const bs = Cesium.BoundingSphere.fromPoints(positions, new Cesium.BoundingSphere());
  const center = bs.center;
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
  const flat = positions.map((p) => {
    const q = Cesium.Matrix4.multiplyByPoint(inv, p, new Cesium.Cartesian3());
    return [q.x, q.y];
  });
  let sum = 0;
  for (let i = 0, j = flat.length - 1; i < flat.length; j = i++) {
    sum += flat[j][0] * flat[i][1] - flat[i][0] * flat[j][1];
  }
  return Math.abs(sum) * 0.5;
}

btnMeasure.addEventListener("click", () => {
  clearAreaDraft();
  clearAreaResult();
  clearDistanceMeasure();
  measureMode = "distance";
  showToast("测距：请在地图上依次点击两个点");
  btnMeasureAreaDone.disabled = true;
});

btnClearMeasure.addEventListener("click", () => {
  clearDistanceMeasure();
  clearAreaDraft();
  clearAreaResult();
  exitMeasureModes();
});

btnMeasureArea.addEventListener("click", () => {
  clearDistanceMeasure();
  clearAreaDraft();
  clearAreaResult();
  measureMode = "area";
  showToast("测面积：依次点击至少 3 个角点，然后点「完成面积」");
  btnMeasureAreaDone.disabled = false;
});

btnMeasureAreaDone.addEventListener("click", () => {
  if (measureMode !== "area") return;
  if (areaPoints.length < 3) {
    window.alert("至少需要 3 个点构成多边形。");
    return;
  }
  const m2 = planarPolygonAreaM2(areaPoints);
  const km2 = m2 / 1_000_000;
  clearAreaResult();
  areaResultEntities.push(
    viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(areaPoints),
        material: Cesium.Color.LIME.withAlpha(0.22),
        outline: true,
        outlineColor: Cesium.Color.LIME,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    }),
  );
  const mid = Cesium.BoundingSphere.fromPoints(areaPoints, new Cesium.BoundingSphere()).center;
  areaResultEntities.push(
    viewer.entities.add({
      position: mid,
      label: {
        text: `${m2.toFixed(0)} m²（≈ ${km2.toFixed(4)} km²）`,
        font: "13px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }),
  );
  clearAreaDraft();
  measureMode = "idle";
  btnMeasureAreaDone.disabled = true;
  hideToast();
});

function finishDistanceMeasure() {
  if (measurePoints.length !== 2) return;
  const [a, b] = measurePoints;
  const dist = Cesium.Cartesian3.distance(a, b);
  const labelPos = Cesium.Cartesian3.midpoint(a, b, new Cesium.Cartesian3());
  measureEntities.push(
    viewer.entities.add({
      polyline: {
        positions: [a, b],
        width: 2,
        material: Cesium.Color.CYAN,
        clampToGround: true,
      },
    }),
  );
  measureEntities.push(
    viewer.entities.add({
      position: labelPos,
      label: {
        text: `${(dist / 1000).toFixed(3)} km（直线）`,
        font: "13px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -24),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }),
  );
  measurePoints = [];
  measureMode = "idle";
  hideToast();
}

handler.setInputAction((click) => {
  if (measureMode === "distance") {
    const ray = viewer.camera.getPickRay(click.position);
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) return;
    measurePoints.push(cartesian);
    measureEntities.push(
      viewer.entities.add({
        position: cartesian,
        point: { pixelSize: 10, color: Cesium.Color.YELLOW },
      }),
    );
    if (measurePoints.length === 2) finishDistanceMeasure();
    return;
  }
  if (measureMode === "area") {
    const ray = viewer.camera.getPickRay(click.position);
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) return;
    areaPoints.push(cartesian);
    areaTempEntities.push(
      viewer.entities.add({
        position: cartesian,
        point: { pixelSize: 9, color: Cesium.Color.LIME },
      }),
    );
    if (areaPoints.length >= 2) {
      const a = areaPoints[areaPoints.length - 2];
      const b = areaPoints[areaPoints.length - 1];
      areaTempEntities.push(
        viewer.entities.add({
          polyline: {
            positions: [a, b],
            width: 2,
            material: Cesium.Color.LIME.withAlpha(0.85),
            clampToGround: true,
          },
        }),
      );
    }
    return;
  }

  const picked = viewer.scene.pick(click.position);
  if (!picked || !picked.id) return;
  const entity = picked.id;
  const props = entity.properties;
  if (!props) return;
  const siteId = props.siteId?.getValue?.(Cesium.JulianDate.now()) ?? props.siteId?.getValue?.() ?? props.siteId;
  if (siteId) {
    const site = heritageSites.find((s) => s.id === siteId);
    if (site) {
      showSiteInfo(site);
      setActiveListItem(site.id);
    }
    return;
  }
  const summary = props.summary?.getValue?.(Cesium.JulianDate.now()) ?? props.summary?.getValue?.() ?? props.summary;
  if (summary == null) return;
  const era = props.era?.getValue?.(Cesium.JulianDate.now()) ?? props.era?.getValue?.() ?? props.era;
  const category = props.category?.getValue?.(Cesium.JulianDate.now()) ?? props.category?.getValue?.() ?? props.category;
  const sid = String(entity.id).replace(/-label$/, "");
  const site = heritageSites.find((s) => s.id === sid);
  if (site) {
    showSiteInfo(site);
    setActiveListItem(site.id);
  } else {
    infoTitle.textContent = entity.name ?? "要素";
    infoAddress.textContent = props.address?.getValue?.() ? `地址：${props.address.getValue()}` : "";
    infoProtection.textContent = "";
    infoNotes.textContent = "";
    infoNotes.classList.add("hidden");
    infoEra.textContent = era ? `年代 / 时期：${era}` : "";
    infoCategory.textContent = category ? `类型：${category}` : "";
    infoCategory.classList.toggle("hidden", !category);
    infoBody.textContent = summary ?? "";
    infoPanel.classList.remove("hidden");
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

handler.setInputAction((movement) => {
  const picked = viewer.scene.pick(movement.endPosition);
  if (picked && picked.id && picked.id.id) {
    document.body.style.cursor = "pointer";
  } else {
    document.body.style.cursor = "";
  }
  const ray = viewer.camera.getPickRay(movement.endPosition);
  const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
  if (cartesian && statusCoordsEl) {
    const c = Cesium.Cartographic.fromCartesian(cartesian);
    const lon = Cesium.Math.toDegrees(c.longitude).toFixed(5);
    const lat = Cesium.Math.toDegrees(c.latitude).toFixed(5);
    const h = c.height?.toFixed(1) ?? "0";
    statusCoordsEl.textContent = `经度 ${lon}°　纬度 ${lat}°`;
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

document.getElementById("auth-logout-sidebar")?.addEventListener("click", () => {
  localStorage.removeItem("access_token");
  window.location.reload();
});
btnTopLogout?.addEventListener("click", () => {
  localStorage.removeItem("access_token");
  window.location.reload();
});
