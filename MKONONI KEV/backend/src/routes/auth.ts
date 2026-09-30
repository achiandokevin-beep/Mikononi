import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { sign } from "../middleware/auth";
import { wrap } from "../utils/http";
import { isValidKenyanPhone } from "../utils/phone";

const r = Router();
// Public registration always creates a CUSTOMER. Staff accounts come from `npm run seed`.
r.post("/register", wrap(async (q, s) => {
  const p = z.object({ email: z.string().email().max(120), password: z.string().min(8).max(72), phoneNumber: z.string().refine(isValidKenyanPhone, "Use +2547XXXXXXXX") }).safeParse(q.body);
  if (!p.success) return s.status(400).json({ error: p.error.flatten() });
  try {
    const u = await prisma.user.create({ data: { email: p.data.email.toLowerCase(), passwordHash: await bcrypt.hash(p.data.password, 10), phoneNumber: p.data.phoneNumber, role: "CUSTOMER" } });
    s.status(201).json({ token: sign(u), role: u.role });
  } catch { s.status(409).json({ error: "account already exists" }); }
}));
r.post("/login", wrap(async (q, s) => {
  const p = z.object({ email: z.string().email(), password: z.string().max(72) }).safeParse(q.body);
  const u = p.success ? await prisma.user.findUnique({ where: { email: p.data.email.toLowerCase() } }) : null;
  if (!p.success || !u || !(await bcrypt.compare(p.data.password, u.passwordHash))) return s.status(401).json({ error: "invalid credentials" });
  s.json({ token: sign(u), role: u.role });
}));
export default r;
