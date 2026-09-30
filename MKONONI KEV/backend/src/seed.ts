import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
(async () => {
  const email = process.env.SEED_ADMIN_EMAIL, pw = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !pw || pw.length < 8) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (8+ chars) in .env");
  await prisma.user.upsert({ where: { email: email.toLowerCase() }, update: {}, create: { email: email.toLowerCase(), passwordHash: await bcrypt.hash(pw, 10), role: "SUPER_ADMIN" } });
  console.log("Super admin ready:", email);
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
