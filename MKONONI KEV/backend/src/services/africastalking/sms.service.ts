import { at } from "./client";
import { cfg } from "../../config";
import { prisma } from "../../db";
import { isValidKenyanPhone } from "../../utils/phone";
export { isValidKenyanPhone };

/** Sends a real SMS via Africa's Talking. Status is SENT only if the provider confirms acceptance. */
export async function sendSMS(phoneNumber: string, message: string, incidentId?: string) {
  if (!isValidKenyanPhone(phoneNumber)) throw new Error("Invalid phone number");
  const rec = await prisma.smsMessage.create({ data: { phoneNumber, message, incidentId, status: "PENDING" } });
  let lastErr = "unknown error";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await at.SMS.send({ to: [phoneNumber], message, ...(cfg.senderId ? { from: cfg.senderId } : {}) });
      const r = res?.SMSMessageData?.Recipients?.[0];
      if (r && (r.statusCode === 101 || r.status === "Success")) {
        return prisma.smsMessage.update({ where: { id: rec.id }, data: { status: "SENT", providerMessageId: r.messageId } });
      }
      lastErr = r?.status ?? res?.SMSMessageData?.Message ?? "provider rejected message";
      break; // provider rejected: retrying will not help
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "request failed"; // network/timeout: retry once
    }
  }
  return prisma.smsMessage.update({ where: { id: rec.id }, data: { status: "FAILED", error: lastErr.slice(0, 200) } });
}
