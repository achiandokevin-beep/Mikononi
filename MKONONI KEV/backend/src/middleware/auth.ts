import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { cfg } from "../config";
declare global { namespace Express { interface Request { user?: { id: string; role: string; phone?: string } } } }
export const sign = (u: { id: string; role: string; phoneNumber?: string | null }) =>
  jwt.sign({ sub: u.id, role: u.role, phone: u.phoneNumber ?? undefined }, cfg.jwtSecret, { expiresIn: "12h" });
/** auth() = any logged-in user. auth("A","B") = those roles (SUPER_ADMIN always allowed). */
export const auth = (...roles: string[]) => (q: Request, s: Response, n: NextFunction) => {
  try {
    const p = jwt.verify((q.headers.authorization ?? "").replace("Bearer ", ""), cfg.jwtSecret) as jwt.JwtPayload;
    if (roles.length && p.role !== "SUPER_ADMIN" && !roles.includes(p.role)) return s.status(403).json({ error: "forbidden" });
    q.user = { id: String(p.sub), role: p.role, phone: p.phone };
    n();
  } catch { s.status(401).json({ error: "unauthorized" }); }
};
