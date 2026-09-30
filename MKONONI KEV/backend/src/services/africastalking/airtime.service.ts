import { at } from "./client";
import { prisma } from "../../db";
import { isValidKenyanPhone } from "../../utils/phone";

/** Real AT airtime call. Status is SENT only when the provider says "Sent"; otherwise FAILED with the provider's reason. */
export async function sendAirtime(phoneNumber: string, amount: number) {
  if (!isValidKenyanPhone(phoneNumber)) throw new Error("Invalid phone number");
  if (!Number.isInteger(amount) || amount < 10 || amount > 10000) throw new Error("Amount must be a whole number between 10 and 10000");
  const rec = await prisma.airtimeTransaction.create({ data: { phoneNumber, amount, status: "PENDING" } });
  try {
    const res = await at.AIRTIME.send({ recipients: [{ phoneNumber, currencyCode: "KES", amount }] });
    const r = res?.responses?.[0];
    const ok = String(r?.status ?? "").toLowerCase() === "sent";
    return prisma.airtimeTransaction.update({ where: { id: rec.id }, data: { status: ok ? "SENT" : "FAILED", transactionId: r?.requestId, error: ok ? null : String(r?.errorMessage || res?.errorMessage || "provider rejected").slice(0, 200) } });
  } catch (e) {
    return prisma.airtimeTransaction.update({ where: { id: rec.id }, data: { status: "FAILED", error: (e instanceof Error ? e.message : "request failed").slice(0, 200) } });
  }
}
