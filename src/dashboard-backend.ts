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
import type {
  FrameDecodeFailureInput,
  FrameIngestInput,
  FrameIngestStore,
} from "./frame-ingest-store";

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
  close(): Promise<void>;
}

interface ConnectionState {
  sessionId: string;
  buffer: Buffer;
  imei: string | null;
  failed: boolean;
  processing: Promise<void>;
}

export async function startDashboardBackend(
  config: DashboardConfig,
  frameStore: FrameIngestStore = missingFrameIngestStore,
): Promise<DashboardBackend> {
  let connectionSequence = 0;
  const states = new Map<Socket, ConnectionState>();

  const tcpServer = createNetServer((socket) => {
    connectionSequence += 1;
    const state: ConnectionState = {
      sessionId: `session-${connectionSequence}`,
      buffer: Buffer.alloc(0),
      imei: null,
      failed: false,
      processing: Promise.resolve(),
    };
    states.set(socket, state);

    socket.on("data", (chunk) => {
      if (state.failed) {
        return;
      }

      state.buffer = Buffer.concat([state.buffer, chunk]);
      state.processing = state.processing
        .then(() => processSocketBuffer(socket, state, frameStore, config.acceptImei))
        .catch(() => {
          state.failed = true;
          void closeSocket(socket);
        });
    });

    socket.on("close", () => {
      states.delete(socket);
    });

    socket.on("error", () => {
      states.delete(socket);
    });
  });

  const webServer = createHttpServer((request, response) => {
    handleHttpRequest(request, response);
  });

  const listenResults = await Promise.allSettled([
    listenTcpServer(tcpServer, config.host, config.port),
    listenHttpServer(webServer, config.webHost, config.webPort)
  ]);
  const listenFailure = listenResults.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (listenFailure) {
    await Promise.allSettled([
      closeServer(tcpServer),
      closeServer(webServer),
      ...Array.from(states.keys(), (socket) => closeSocket(socket))
    ]);
    throw listenFailure.reason;
  }

  return {
    tcpAddress: tcpServer.address() as AddressInfo,
    webAddress: webServer.address() as AddressInfo,
    async close() {
      const pendingProcessing = [...states.values()].map((state) => state.processing);
      await Promise.allSettled([
        closeServer(tcpServer),
        closeServer(webServer),
        ...Array.from(states.keys(), (socket) => closeSocket(socket))
      ]);
      await Promise.allSettled(pendingProcessing);
    }
  };
}

async function processSocketBuffer(
  socket: Socket,
  state: ConnectionState,
  frameStore: FrameIngestStore,
  acceptImei: boolean
): Promise<void> {
  while (!state.failed && !socket.destroyed) {
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

      const accepted = acceptImei && /^[0-9]{15}$/.test(imei);
      socket.write(Buffer.from([accepted ? 0x01 : 0x00]));
      if (!accepted) {
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
    const receivedAt = new Date();

    const decoded = decodeCodec8ExtendedPacket(frame);
    if (decoded.ok) {
      const input: FrameIngestInput = {
        sessionId: state.sessionId,
        imei: state.imei,
        receivedAt,
        rawFrame: Buffer.from(frame),
        decoded: decoded.packet,
      };
      const persisted = await frameStore.persistFrame(input);

      const ack = Buffer.alloc(4);
      ack.writeUInt32BE(decoded.packet.recordCount, 0);
      await writeSocket(socket, ack);
      if (persisted && frameStore.markAcknowledged) {
        await frameStore.markAcknowledged(persisted.receptionId, decoded.packet.recordCount);
      }
      continue;
    }

    const failure: FrameDecodeFailureInput = {
      sessionId: state.sessionId,
      imei: state.imei,
      receivedAt,
      rawFrame: Buffer.from(frame),
      error: decoded.error,
    };
    await frameStore.auditDecodeFailure(failure);
  }
}

function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if (request.method === "GET" && request.url === "/") {
    const body = JSON.stringify({ status: "ok" });
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body)
    });
    response.end(body);
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found\n");
}

const missingFrameIngestStore: FrameIngestStore = {
  async persistFrame(): Promise<void> {
    throw new Error("FrameIngestStore is required before AVL frames can be acknowledged.");
  },
  async auditDecodeFailure(): Promise<void> {
    throw new Error("FrameIngestStore is required before decoder failures can be audited.");
  },
};

async function writeSocket(socket: Socket, data: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.write(data, (error?: Error | null) => error ? reject(error) : resolve());
  });
}

function renderDashboardPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Teltonika Raw And Decoded Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        background: #f4efe6;
        color: #1f1b16;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top, rgba(214, 111, 43, 0.18), transparent 36%),
          linear-gradient(180deg, #f7f2ea 0%, #efe6d8 100%);
      }

      main {
        width: min(1200px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }

      header {
        margin-bottom: 24px;
      }

      h1 {
        margin: 0;
        font-size: clamp(2rem, 5vw, 3.5rem);
        line-height: 0.95;
        letter-spacing: -0.05em;
      }

      p {
        margin: 12px 0 0;
        max-width: 56rem;
        color: #554537;
      }

      #status {
        margin-top: 16px;
        font-size: 0.95rem;
        color: #6d5845;
      }

      #empty-state {
        padding: 20px;
        border: 1px dashed #cda87d;
        border-radius: 18px;
        background: rgba(255, 250, 244, 0.88);
        color: #6b4f33;
      }

      #message-list {
        display: grid;
        gap: 16px;
      }

      .message-card {
        padding: 18px;
        border: 1px solid rgba(104, 70, 38, 0.18);
        border-radius: 20px;
        background: rgba(255, 251, 247, 0.92);
        box-shadow: 0 18px 40px rgba(82, 55, 24, 0.08);
      }

      .message-card[data-type="error"] {
        border-color: rgba(162, 43, 24, 0.28);
        background: rgba(255, 241, 238, 0.96);
      }

      .message-card[data-type="imei"] {
        border-color: rgba(24, 91, 73, 0.22);
      }

      .message-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 14px;
      }

      .message-meta span {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 10px;
        border-radius: 999px;
        background: #eadfce;
        font-size: 0.85rem;
      }

      .message-body {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .panel {
        min-width: 0;
      }

      .panel h2 {
        margin: 0 0 8px;
        font-size: 0.95rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #7d6248;
      }

      pre {
        margin: 0;
        padding: 14px;
        overflow-x: auto;
        border-radius: 14px;
        background: #1c1815;
        color: #f3ede6;
        font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
        font-size: 0.85rem;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
      }

      @media (max-width: 760px) {
        .message-body {
          grid-template-columns: 1fr;
        }

        main {
          width: min(100% - 24px, 1200px);
          padding-top: 24px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Teltonika Raw And Decoded Dashboard</h1>
        <p>Live local view of retained IMEI and AVL parser events. Raw lowercase hex stays next to decoded JSON or structured decoder errors.</p>
        <div id="status">Loading messages...</div>
      </header>
      <section id="empty-state">Waiting for IMEI or AVL packets.</section>
      <section id="message-list" aria-live="polite"></section>
    </main>
    <script>
      const statusNode = document.getElementById("status");
      const emptyStateNode = document.getElementById("empty-state");
      const messageListNode = document.getElementById("message-list");

      function formatPayload(message) {
        if (message.type === "avl") {
          return JSON.stringify(message.decoded, null, 2);
        }

        if (message.type === "error") {
          return JSON.stringify(message.error, null, 2);
        }

        return JSON.stringify({ accepted: message.accepted }, null, 2);
      }

      function createMetaPill(label, value) {
        const pill = document.createElement("span");
        pill.textContent = label + ": " + value;
        return pill;
      }

      function createPanel(title, content) {
        const panel = document.createElement("div");
        panel.className = "panel";

        const heading = document.createElement("h2");
        heading.textContent = title;

        const pre = document.createElement("pre");
        pre.textContent = content;

        panel.append(heading, pre);
        return panel;
      }

      function renderMessages(messages) {
        messageListNode.textContent = "";
        emptyStateNode.hidden = messages.length > 0;

        for (const message of messages) {
          const card = document.createElement("article");
          card.className = "message-card";
          card.dataset.type = message.type;

          const meta = document.createElement("div");
          meta.className = "message-meta";
          meta.append(
            createMetaPill("type", message.type),
            createMetaPill("session", message.sessionId),
            createMetaPill("imei", message.imei ?? "pending"),
            createMetaPill("timestamp", message.timestamp)
          );

          const body = document.createElement("div");
          body.className = "message-body";
          body.append(
            createPanel("Raw Hex", message.rawHex),
            createPanel(message.type === "error" ? "Decode Error" : "Decoded", formatPayload(message))
          );

          card.append(meta, body);
          messageListNode.append(card);
        }
      }

      async function refreshMessages() {
        try {
          const response = await fetch("/messages", { cache: "no-store" });
          if (!response.ok) {
            throw new Error("Request failed with status " + response.status);
          }

          const payload = await response.json();
          const messages = Array.isArray(payload.messages) ? payload.messages : [];
          renderMessages(messages);
          statusNode.textContent = "Showing " + messages.length + " retained message" + (messages.length === 1 ? "" : "s") + ".";
        } catch (error) {
          statusNode.textContent = "Failed to refresh messages: " + (error instanceof Error ? error.message : String(error));
        }
      }

      refreshMessages();
      setInterval(refreshMessages, 1000);
    </script>
  </body>
</html>`;
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
