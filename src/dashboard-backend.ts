import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createServer as createNetServer,
  type AddressInfo,
  type Server as NetServer,
  type Socket
} from "node:net";

import type {
  Codec8ExtendedDecodeError,
  DecodedCodec8ExtendedPacket
} from "./codec8-extended-decoder";
import { decodeCodec8ExtendedPacket } from "./codec8-extended-decoder";
import type { DashboardConfig } from "./config";

export interface DashboardMessageBase {
  sessionId: string;
  timestamp: string;
  imei: string | null;
  rawHex: string;
}

export interface DashboardImeiMessage extends DashboardMessageBase {
  type: "imei";
  accepted: boolean;
}

export interface DashboardAvlMessage extends DashboardMessageBase {
  type: "avl";
  decoded: DecodedCodec8ExtendedPacket;
}

export interface DashboardErrorMessage extends DashboardMessageBase {
  type: "error";
  error: Codec8ExtendedDecodeError;
}

export type DashboardMessage = DashboardImeiMessage | DashboardAvlMessage | DashboardErrorMessage;

export interface DashboardBackend {
  tcpAddress: AddressInfo;
  webAddress: AddressInfo;
  getMessages(): DashboardMessage[];
  close(): Promise<void>;
}

interface ConnectionState {
  sessionId: string;
  buffer: Buffer;
  imei: string | null;
}

export async function startDashboardBackend(config: DashboardConfig): Promise<DashboardBackend> {
  const messages: DashboardMessage[] = [];
  let connectionSequence = 0;
  const states = new Map<Socket, ConnectionState>();

  const tcpServer = createNetServer((socket) => {
    connectionSequence += 1;
    const state: ConnectionState = {
      sessionId: `session-${connectionSequence}`,
      buffer: Buffer.alloc(0),
      imei: null
    };
    states.set(socket, state);

    socket.on("data", (chunk) => {
      state.buffer = Buffer.concat([state.buffer, chunk]);
      processSocketBuffer(socket, state, messages, config.acceptImei);
    });

    socket.on("close", () => {
      states.delete(socket);
    });
  });

  const webServer = createHttpServer((request, response) => {
    handleHttpRequest(request, response, messages);
  });

  await Promise.all([
    listenTcpServer(tcpServer, config.host, config.port),
    listenHttpServer(webServer, config.webHost, config.webPort)
  ]);

  return {
    tcpAddress: tcpServer.address() as AddressInfo,
    webAddress: webServer.address() as AddressInfo,
    getMessages() {
      return messages.slice();
    },
    async close() {
      await Promise.allSettled([
        closeServer(tcpServer),
        closeServer(webServer),
        ...Array.from(states.keys(), (socket) => closeSocket(socket))
      ]);
    }
  };
}

function processSocketBuffer(
  socket: Socket,
  state: ConnectionState,
  messages: DashboardMessage[],
  acceptImei: boolean
): void {
  while (true) {
    if (state.imei === null) {
      if (state.buffer.length < 2) {
        return;
      }

      const imeiLength = state.buffer.readUInt16BE(0);
      const frameLength = 2 + imeiLength;
      if (state.buffer.length < frameLength) {
        return;
      }

      const frame = state.buffer.subarray(0, frameLength);
      const imei = frame.subarray(2).toString("ascii");
      state.buffer = state.buffer.subarray(frameLength);
      state.imei = imei;

      messages.push({
        type: "imei",
        sessionId: state.sessionId,
        timestamp: new Date().toISOString(),
        imei,
        rawHex: frame.toString("hex"),
        accepted: acceptImei
      });

      socket.write(Buffer.from([acceptImei ? 0x01 : 0x00]));
      if (!acceptImei) {
        void closeSocket(socket);
        return;
      }

      continue;
    }

    if (state.buffer.length < 8) {
      return;
    }

    const dataLength = state.buffer.readUInt32BE(4);
    const frameLength = 8 + dataLength + 4;
    if (state.buffer.length < frameLength) {
      return;
    }

    const frame = state.buffer.subarray(0, frameLength);
    state.buffer = state.buffer.subarray(frameLength);

    const decoded = decodeCodec8ExtendedPacket(frame);
    if (decoded.ok) {
      messages.push({
        type: "avl",
        sessionId: state.sessionId,
        timestamp: new Date().toISOString(),
        imei: state.imei,
        rawHex: frame.toString("hex"),
        decoded: decoded.packet
      });

      const ack = Buffer.alloc(4);
      ack.writeUInt32BE(decoded.packet.recordCount, 0);
      socket.write(ack);
      continue;
    }

    messages.push({
      type: "error",
      sessionId: state.sessionId,
      timestamp: new Date().toISOString(),
      imei: state.imei,
      rawHex: frame.toString("hex"),
      error: decoded.error
    });
  }
}

function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  messages: DashboardMessage[]
): void {
  if (request.method === "GET" && request.url === "/messages") {
    const body = JSON.stringify({ messages });
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body)
    });
    response.end(body);
    return;
  }

  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("Teltonika dashboard backend is running.\n");
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found\n");
}

function listenTcpServer(server: NetServer, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function listenHttpServer(
  server: ReturnType<typeof createHttpServer>,
  host: string,
  port: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: { close(callback: (error?: Error | undefined) => void): void }): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function closeSocket(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.destroyed) {
      resolve();
      return;
    }

    socket.once("close", () => resolve());
    socket.end();
    socket.destroySoon();
  });
}
