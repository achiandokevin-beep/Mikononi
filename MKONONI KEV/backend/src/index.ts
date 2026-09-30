import express, { NextFunction, Request, Response } from "express";
import http from "http";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { cfg } from "./config";
import { initIO } from "./realtime";
import webhooks from "./routes/webhooks";
import authRoutes from "./routes/auth";
import ops from "./routes/ops";
import services from "./routes/services";

const app = express();
const server = http.createServer(app);
initIO(server, cfg.frontendUrl);
app.use(helmet(), cors({ origin: cfg.frontendUrl }), express.json({ limit: "20kb" }), express.urlencoded({ extended: false, limit: "20kb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 120, skip: (q) => q.path.startsWith("/webhooks") }));
app.use("/api/auth", rateLimit({ windowMs: 60_000, limit: 10 }), authRoutes);
app.use("/api/webhooks/africastalking", webhooks);
app.use("/api", ops, services);
app.use((e: unknown, _q: Request, s: Response, _n: NextFunction) => {
  console.error("error:", e instanceof Error ? e.message : "unknown"); // never log keys or bodies
  s.status(500).json({ error: "internal error" });
});
server.listen(cfg.port, () => console.log(`Mkononi backend on :${cfg.port} | Africa's Talking: ${cfg.atEnv.toUpperCase()} | AI: ${cfg.aiKey ? "on" : "off"}`));
