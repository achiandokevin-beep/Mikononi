import { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
export const wrap = (fn: (q: Request, s: Response) => Promise<unknown>) => (q: Request, s: Response, n: NextFunction) => fn(q, s).catch(n);
export const audit = (userId: string | undefined, action: string, target?: string) =>
  prisma.auditLog.create({ data: { userId, action, target } }).catch(() => undefined);
