import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { cfg } from "../config";
import { wrap } from "../utils/http";
import { handleUssd } from "../webhooks/ussd";

const r = Router();
const ussd = z.object({ sessionId: z.string().max(100), phoneNumber: z.string().max(20), serviceCode: z.string().max(20), networkCode: z.string().max(10).optional(), text: z.string().max(400).optional() });
r.post("/ussd", wrap(async (q, s) => {
  const p = ussd.safeParse(q.body);
  s.type("text/plain").send(p.success ? await handleUssd(p.data) : "END Invalid request.");
}));
r.post("/delivery", wrap(async (q, s) => {
  const p = z.object({ id: z.string(), status: z.string(), failureReason: z.string().optional() }).safeParse(q.body);
  if (p.success) await prisma.smsMessage.updateMany({ where: { providerMessageId: p.data.id }, data: p.data.status === "Success" ? { status: "DELIVERED" } : { status: "FAILED", error: p.data.failureReason ?? p.data.status } });
  s.sendStatus(200);
}));
r.post("/sms", wrap(async (q, s) => { // inbound SMS: acknowledged and logged (no auto-reply yet)
  const p = z.object({ from: z.string().max(20), text: z.string().max(500) }).safeParse(q.body);
  if (p.success) console.log("inbound sms received from", p.data.from.slice(0, 7) + "***");
  s.sendStatus(200);
}));
r.post("/voice", wrap(async (q, s) => {
  const b = q.body ?? {}, sid = String(b.sessionId ?? "").slice(0, 100), phone = String(b.callerNumber ?? "").slice(0, 20);
  const xml = (x: string) => s.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response>${x}</Response>`);
  if (!sid) return xml("<Say>Invalid request.</Say>");
  if (String(b.isActive) === "0") {
    await prisma.call.updateMany({ where: { callSessionId: sid }, data: { status: "COMPLETED", duration: Number(b.durationInSeconds) || 0 } });
    return s.sendStatus(200);
  }
  await prisma.call.upsert({ where: { callSessionId: sid }, create: { callSessionId: sid, phoneNumber: phone, status: "ACTIVE" }, update: {} });
  const d = String(b.dtmfDigits ?? "").trim();
  if (!d) return xml(`<GetDigits timeout="20" numDigits="1"><Say>Welcome to Mkononi Connect. Press 1 to report a network problem. Press 2 to check network status. Press 3 to speak to customer support. Press 4 to report suspicious activity.</Say></GetDigits>`);
  const purpose = ({ "1": "NETWORK_PROBLEM", "2": "STATUS", "3": "SUPPORT", "4": "FRAUD" } as Record<string, string>)[d];
  if (purpose) await prisma.call.updateMany({ where: { callSessionId: sid }, data: { purpose } });
  if (d === "2") {
    const n = await prisma.incident.count({ where: { isDemo: false, status: { in: ["POSSIBLE_OUTAGE", "CONFIRMED"] } } });
    return xml(`<Say>There are currently ${n} open network incidents on record. Thank you for calling.</Say>`);
  }
  if (d === "3") return xml(cfg.supportPhone ? `<Dial phoneNumbers="${cfg.supportPhone}"/>` : "<Say>Customer support calls are not available right now.</Say>");
  if (d === "1" || d === "4") return xml("<Say>Your call has been logged. To file the full report, please dial the Mkononi Connect USSD code. Thank you.</Say>");
  return xml("<Say>Invalid choice. Goodbye.</Say>");
}));
export default r;
