import { randomInt } from "crypto";
import { prisma } from "../db";
import { cfg } from "../config";
import { emit } from "../realtime";

export const ISSUES = ["No Network", "Slow Internet", "Calls Dropping", "Cannot Make Calls", "Cannot Receive Calls", "Other"];

export async function createReport(d: { phoneNumber: string; issueType: string; location: string; description?: string; isDemo?: boolean }) {
  const isDemo = !!d.isDemo;
  const area = d.location.trim().toLowerCase();
  const report = await prisma.networkReport.create({ data: {
    reportNumber: `NET-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`,
    phoneNumber: d.phoneNumber, issueType: d.issueType, description: d.description,
    location: d.location.trim(), area, isDemo } });
  emit("report:new", report);

  // Demo and real data are never mixed: detection is scoped by isDemo.
  let inc = await prisma.incident.findFirst({ where: { area, issueType: d.issueType, isDemo, status: { in: ["POSSIBLE_OUTAGE", "CONFIRMED"] } } });
  if (!inc) {
    const since = new Date(Date.now() - cfg.windowMin * 60_000);
    const pending = await prisma.networkReport.findMany({ where: { area, issueType: d.issueType, isDemo, incidentId: null, createdAt: { gte: since } } });
    if (new Set(pending.map((r) => r.phoneNumber)).size >= cfg.threshold) {
      const n = await prisma.incident.count();
      inc = await prisma.incident.create({ data: {
        incidentNumber: `INC-${1001 + n}`, title: `Possible ${d.issueType} outage in ${d.location.trim()}`,
        issueType: d.issueType, area, isDemo } });
      await prisma.networkReport.updateMany({ where: { id: { in: pending.map((r) => r.id) } }, data: { incidentId: inc.id } });
    }
  } else {
    await prisma.networkReport.update({ where: { id: report.id }, data: { incidentId: inc.id } });
  }
  if (inc) {
    const users = await prisma.networkReport.findMany({ where: { incidentId: inc.id }, distinct: ["phoneNumber"], select: { phoneNumber: true } });
    inc = await prisma.incident.update({ where: { id: inc.id }, data: { affectedUsers: users.length } });
    emit("incident:updated", inc);
  }
  return { report, incident: inc };
}
