import "dotenv/config";
import { z } from "zod";
const s = z.object({
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  AFRICASTALKING_USERNAME: z.string().min(1),
  AFRICASTALKING_API_KEY: z.string().min(1),
  AFRICASTALKING_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  AFRICASTALKING_SENDER_ID: z.string().optional(),
  DATA_PRODUCT_NAME: z.string().optional(),
  SUPPORT_PHONE: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-sonnet-4-6"),
  OUTAGE_REPORT_THRESHOLD: z.coerce.number().default(5),
  OUTAGE_TIME_WINDOW_MINUTES: z.coerce.number().default(30),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
}).parse(process.env);
// Sandbox mode must use the sandbox username, so production keys are never used by accident.
if (s.AFRICASTALKING_ENVIRONMENT === "sandbox" && s.AFRICASTALKING_USERNAME !== "sandbox")
  throw new Error("Sandbox mode requires AFRICASTALKING_USERNAME=sandbox");
export const cfg = {
  port: s.PORT, jwtSecret: s.JWT_SECRET, frontendUrl: s.FRONTEND_URL,
  atUser: s.AFRICASTALKING_USERNAME, atKey: s.AFRICASTALKING_API_KEY, atEnv: s.AFRICASTALKING_ENVIRONMENT,
  senderId: s.AFRICASTALKING_SENDER_ID || undefined, dataProduct: s.DATA_PRODUCT_NAME || undefined,
  supportPhone: s.SUPPORT_PHONE || undefined, aiKey: s.AI_API_KEY || undefined, aiModel: s.AI_MODEL,
  threshold: s.OUTAGE_REPORT_THRESHOLD, windowMin: s.OUTAGE_TIME_WINDOW_MINUTES,
};
