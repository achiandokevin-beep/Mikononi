import { at } from "./client";
import { cfg } from "../../config";
import { prisma } from "../../db";
import { isValidKenyanPhone } from "../../utils/phone";

/** DEMO price list: not real operator pricing. */
export const DEMO_PACKAGES = [
  { code: "100MB", quantity: 100, unit: "MB", priceKes: 10 },
  { code: "500MB", quantity: 500, unit: "MB", priceKes: 25 },
  { code: "1GB", quantity: 1024, unit: "MB", priceKes: 50 },
  { code: "2GB", quantity: 2048, unit: "MB", priceKes: 100 },
];

/** Requires a mobile-data product created in your AT dashboard (DATA_PRODUCT_NAME). "QUEUED" means accepted, not delivered. */
export async function purchaseData(phoneNumber: string, packageCode: string) {
  if (!isValidKenyanPhone(phoneNumber)) throw new Error("Invalid phone number");
  const pkg = DEMO_PACKAGES.find((p) => p.code === packageCode);
  if (!pkg) throw new Error("Unknown package");
  if (!cfg.dataProduct) throw new Error("Mobile data is not configured (set DATA_PRODUCT_NAME)");
  const rec = await prisma.dataTransaction.create({ data: { phoneNumber, packageCode, status: "PENDING" } });
  try {
    const res = await at.MOBILE_DATA.send({ productName: cfg.dataProduct, recipients: [{ phoneNumber, quantity: pkg.quantity, unit: pkg.unit, validity: "Day", metadata: {} }] });
    const e = res?.entries?.[0];
    const ok = ["queued", "sent"].includes(String(e?.status ?? "").toLowerCase());
    return prisma.dataTransaction.update({ where: { id: rec.id }, data: { status: ok ? "QUEUED" : "FAILED", transactionId: e?.transactionId, error: ok ? null : String(e?.status || "provider rejected").slice(0, 200) } });
  } catch (err) {
    return prisma.dataTransaction.update({ where: { id: rec.id }, data: { status: "FAILED", error: (err instanceof Error ? err.message : "request failed").slice(0, 200) } });
  }
}
