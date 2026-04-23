/**
 * 从后端拉取遗存列表（匿名视为 visitor；带 Token 则按 JWT 角色脱敏）。
 * 使用相对路径 /api 以便走 Vite 代理到 server。
 */
export async function loadHeritageDataset() {
  const token = localStorage.getItem("access_token");
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch("/api/heritage", { headers });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}
