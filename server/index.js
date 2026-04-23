import "./load-env.js";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import heritageRoutes from "./routes/heritage.js";
import adminRoutes from "./routes/admin.js";
import transportRoutes from "./routes/transport.js";
import routingRoutes from "./routes/routing.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "tangzha-heritage-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/heritage", heritageRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/transport", transportRoutes);
app.use("/api/routing", routingRoutes);

// 将磁盘上的 3D Tiles 数据目录暴露为静态资源。
// 实际数据位于项目根目录 `3DTiles/Data`，前端可通过 `/3d-tiles/tileset.json` 访问。
const tilesRootCandidates = [
  path.join(__dirname, "..", "3DTiles", "Data"),
  path.join(__dirname, "..", "Export"),
  path.join(__dirname, ".."),
];
const tilesRoot = tilesRootCandidates.find((p) => {
  if (!(fs.existsSync(p) && fs.statSync(p).isDirectory())) return false;
  return fs.existsSync(path.join(p, "tileset.json"));
}) ?? path.join(__dirname, "..", "Export");
let userTilesRoot = null;

function toSafeAbsPath(rootDir, relPath) {
  const rel = relPath.replace(/^\/+/, "");
  const abs = path.resolve(rootDir, rel);
  const rootResolved = path.resolve(rootDir);
  const prefix = rootResolved.endsWith(path.sep) ? rootResolved : `${rootResolved}${path.sep}`;
  if (!(abs === rootResolved || abs.startsWith(prefix))) return null;
  return abs;
}

function sendTileFromRoot(rootDir, relPath, res) {
  const abs = toSafeAbsPath(rootDir, relPath);
  if (!abs) return res.status(400).json({ error: "非法路径" });
  if (!fs.existsSync(abs)) return res.status(404).json({ error: "文件不存在" });
  return res.sendFile(abs);
}

app.get("/api/tiles/source", (_req, res) => {
  res.json({ directory: userTilesRoot });
});

app.post("/api/tiles/source", (req, res) => {
  const directory = String(req.body?.directory ?? "").trim();
  if (!directory) return res.status(400).json({ error: "目录不能为空" });
  const resolved = path.resolve(directory);
  if (!fs.existsSync(resolved)) return res.status(400).json({ error: "目录不存在" });
  if (!fs.statSync(resolved).isDirectory()) return res.status(400).json({ error: "不是有效目录" });
  const tilesetPath = path.join(resolved, "tileset.json");
  if (!fs.existsSync(tilesetPath)) return res.status(400).json({ error: "目录下缺少 tileset.json" });
  userTilesRoot = resolved;
  return res.json({ ok: true, directory: userTilesRoot });
});

app.use("/user-tiles", (req, res) => {
  if (!userTilesRoot) return res.status(400).json({ error: "请先设置本地 3D Tiles 目录" });
  const rel = decodeURIComponent(req.path).replace(/^\/+/, "");
  return sendTileFromRoot(userTilesRoot, rel, res);
});

app.use("/3d-tiles", express.static(tilesRoot));
app.use("/tiles", express.static(tilesRoot));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "服务器内部错误" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
