import jwt from "jsonwebtoken";

/**
 * 无 Token 时视为 visitor；有 Token 则校验并挂载 user
 */
export function authOptional(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) {
    req.user = { role: "visitor", sub: null };
    return next();
  }
  const token = h.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { sub: payload.sub, role: payload.role, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: "无效或过期的登录状态" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "未登录" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "权限不足" });
    }
    next();
  };
}

export function requireLogin(req, res, next) {
  if (!req.user?.sub) {
    return res.status(401).json({ error: "请先登录" });
  }
  next();
}
