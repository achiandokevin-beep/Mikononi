import { Server } from "socket.io";
import type http from "http";
let io: Server | undefined;
export const initIO = (srv: http.Server, origin: string) => (io = new Server(srv, { cors: { origin } }));
export const emit = (ev: string, data: unknown) => io?.emit(ev, data);
