import "dotenv/config";
import readline from "readline/promises";
import { randomUUID } from "crypto";
import { io } from "socket.io-client";

const BASE = process.env.BACKEND_URL || "http://localhost:4000";
async function api(path: string, opts: { method?: string; body?: unknown } = {}, token?: string) {
  const r = await fetch(BASE + path, { method: opts.method, body: opts.body ? JSON.stringify(opts.body) : undefined,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  const t = await r.text(); let j: any; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function login() {
  const email = process.env.CLI_EMAIL || process.env.SEED_ADMIN_EMAIL, password = process.env.CLI_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set CLI_EMAIL/CLI_PASSWORD (or SEED_ADMIN_*) in .env");
  return (await api("/api/auth/login", { method: "POST", body: { email, password } })).token as string;
}
const rl = () => readline.createInterface({ input: process.stdin, output: process.stdout });

async function ussd(phone: string) {
  // Talks to the SAME webhook Africa's Talking calls, using its form-encoded format.
  const sessionId = "cli-" + randomUUID(), i = rl(); let text = "";
  while (true) {
    const res = await fetch(BASE + "/api/webhooks/africastalking/ussd", { method: "POST",
      body: new URLSearchParams({ sessionId, phoneNumber: phone, serviceCode: "*384#", networkCode: "63902", text }) });
    const out = await res.text();
    console.log("\n" + out.replace(/^(CON|END) /, ""));
    if (out.startsWith("END")) break;
    const ans = (await i.question("> ")).replace(/\*/g, "").trim();
    text = text ? `${text}*${ans}` : ans;
  }
  i.close();
}
async function chatCmd() {
  const t = await login(), i = rl(); let conversationId: string | undefined;
  console.log("Support chat (empty line to quit)");
  while (true) {
    const m = (await i.question("you> ")).trim(); if (!m) break;
    const r = await api("/api/support/chat", { method: "POST", body: { message: m, conversationId } }, t);
    conversationId = r.conversationId; console.log(`bot> ${r.reply}${r.escalated ? "  [escalated]" : ""}`);
  }
  i.close();
}
async function find(t: string, ref: string) {
  const inc = (await api("/api/incidents", {}, t)).find((x: any) => x.incidentNumber === ref || x.id === ref);
  if (!inc) throw new Error(`No incident ${ref}`); return inc;
}
const HELP = `Mkononi CLI
  health                     backend + Africa's Talking mode
  ussd <+2547XXXXXXXX>       interactive USSD simulator (real webhook)
  demo                       simulate demo reports (fake numbers, no SMS)
  reports | incidents        list
  confirm <INC-1002>         confirm incident and SMS reporters (real AT call)
  resolve <INC-1002>         resolve incident and SMS reporters
  sms | sessions | calls     message log, USSD sessions, calls
  fraud                      customer-reported fraud indicators
  analytics                  dashboard numbers
  chat                       support assistant
  watch                      live events (Socket.IO)
  airtime <phone> <amount>   send airtime (sandbox)`;

(async () => {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "health") return console.log(await api("/api/health"));
  if (cmd === "ussd") return a ? ussd(a) : console.log("Usage: ussd +2547XXXXXXXX");
  if (cmd === "chat") return chatCmd();
  if (cmd === "watch") {
    const s = io(BASE); ["report:new", "incident:updated", "fraud:new", "fraud:alert"].forEach((ev) => s.on(ev, (d) => console.log(new Date().toLocaleTimeString(), ev, JSON.stringify(d))));
    return console.log("Watching " + BASE + " (Ctrl+C to stop)");
  }
  const t = await login();
  const table = async (p: string) => console.table(await api(p, {}, t));
  switch (cmd) {
    case "demo": console.log(await api("/api/demo/simulate", { method: "POST" }, t)); break;
    case "reports": await table("/api/reports"); break;
    case "incidents": await table("/api/incidents"); break;
    case "sms": await table("/api/sms"); break;
    case "sessions": await table("/api/ussd/sessions"); break;
    case "calls": await table("/api/calls"); break;
    case "fraud": await table("/api/fraud"); break;
    case "analytics": console.log(JSON.stringify(await api("/api/analytics", {}, t), null, 2)); break;
    case "confirm": case "resolve": {
      if (!a) throw new Error("Give an incident number"); const inc = await find(t, a);
      console.log(await api(`/api/incidents/${inc.id}/${cmd}`, { method: "POST" }, t)); break;
    }
    case "airtime": console.log(await api("/api/airtime/send", { method: "POST", body: { phoneNumber: a, amount: Number(b) } }, t)); break;
    default: console.log(HELP);
  }
})().catch((e) => { console.error("Error:", e.message); process.exit(1); });
