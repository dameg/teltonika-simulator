import { EventEmitter, once } from "node:events";
import net from "node:net";

export interface RecordedImeiFrame {
  rawFrame: Buffer;
  imei: string;
  connectionId: number;
}

export interface RecordedAvlFrame {
  rawFrame: Buffer;
  connectionId: number;
  imei: string | null;
}

export interface TeltonikaParserFixtureOptions {
  imeiResponseByte?: number;
  sendImeiResponse?: boolean;
  avlAcknowledgementCount?: number;
  avlAcknowledgementChunkSizes?: readonly number[];
  host?: string;
}

export interface TeltonikaParserFixture {
  readonly host: string;
  readonly port: number;
  readonly imeiFrames: readonly RecordedImeiFrame[];
  readonly avlFrames: readonly Buffer[];
  readonly avlFrameRecords: readonly RecordedAvlFrame[];
  readonly clientSockets: readonly net.Socket[];
  setImeiResponseByte(responseByte: number): void;
  setSendImeiResponse(enabled: boolean): void;
  sendImeiResponse(connectionId: number, responseByte: number): void;
  setAvlAcknowledgementCount(count: number): void;
  setAvlAcknowledgementChunkSizes(chunkSizes: readonly number[]): void;
  waitForConnection(count?: number): Promise<net.Socket>;
  waitForImeiFrame(count?: number): Promise<RecordedImeiFrame>;
  waitForAvlFrame(count?: number): Promise<Buffer>;
  closeClientSocket(index?: number): Promise<void>;
  close(): Promise<void>;
}

export async function startTeltonikaParserFixture(
  options: TeltonikaParserFixtureOptions = {}
): Promise<TeltonikaParserFixture> {
  const host = options.host ?? "127.0.0.1";
  const events = new EventEmitter();
  const clientSockets: net.Socket[] = [];
  const imeiFrames: RecordedImeiFrame[] = [];
  const avlFrames: Buffer[] = [];
  const avlFrameRecords: RecordedAvlFrame[] = [];
  const socketBuffers = new Map<net.Socket, Buffer>();
  const socketConnectionIds = new Map<net.Socket, number>();
  const socketsByConnectionId = new Map<number, net.Socket>();
  const socketImeis = new Map<net.Socket, string>();
  let imeiResponseByte = options.imeiResponseByte ?? 0x01;
  let nextConnectionId = 1;
  assertByte(imeiResponseByte, "IMEI response byte");
  let sendImeiResponse = options.sendImeiResponse ?? true;
  let avlAcknowledgementCount = options.avlAcknowledgementCount ?? 1;
  let avlAcknowledgementChunkSizes = normalizeChunkSizes(options.avlAcknowledgementChunkSizes);

  const server = net.createServer((socket) => {
    const connectionId = nextConnectionId;
    nextConnectionId += 1;

    clientSockets.push(socket);
    socketBuffers.set(socket, Buffer.alloc(0));
    socketConnectionIds.set(socket, connectionId);
    socketsByConnectionId.set(connectionId, socket);
    events.emit("connection", socket);

    socket.on("data", (chunk) => {
      const buffered = Buffer.concat([socketBuffers.get(socket) ?? Buffer.alloc(0), chunk]);
      socketBuffers.set(socket, parseBufferedFrames(socket, buffered));
    });

    socket.on("close", () => {
      socketBuffers.delete(socket);
      socketImeis.delete(socket);
      const closedConnectionId = socketConnectionIds.get(socket);
      socketConnectionIds.delete(socket);
      if (closedConnectionId !== undefined) {
        socketsByConnectionId.delete(closedConnectionId);
      }
      const index = clientSockets.indexOf(socket);
      if (index >= 0) {
        clientSockets.splice(index, 1);
      }
      events.emit("socketClose", socket);
    });

    socket.on("error", () => {
      // Ignore socket errors in the fixture; tests observe the socket boundary.
    });
  });

  server.on("error", (error) => {
    events.emit("serverError", error);
  });

  server.listen(0, host);
  await once(server, "listening");

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fixture failed to bind to a TCP port");
  }

  return {
    host,
    port: address.port,
    imeiFrames,
    avlFrames,
    avlFrameRecords,
    clientSockets,
    setImeiResponseByte(responseByte) {
      assertByte(responseByte, "IMEI response byte");
      imeiResponseByte = responseByte;
    },
    setSendImeiResponse(enabled) {
      sendImeiResponse = enabled;
    },
    sendImeiResponse(connectionId, responseByte) {
      assertByte(responseByte, "IMEI response byte");
      const socket = socketsByConnectionId.get(connectionId);
      if (!socket) {
        throw new Error(`Unknown connection id: ${connectionId}`);
      }

      socket.write(Buffer.from([responseByte]));
    },
    setAvlAcknowledgementCount(count) {
      assertAckCount(count);
      avlAcknowledgementCount = count;
    },
    setAvlAcknowledgementChunkSizes(chunkSizes) {
      avlAcknowledgementChunkSizes = normalizeChunkSizes(chunkSizes);
    },
    waitForConnection(count = 1) {
      return waitForCount(clientSockets, count, "connection");
    },
    waitForImeiFrame(count = 1) {
      return waitForCount(imeiFrames, count, "imeiFrame");
    },
    waitForAvlFrame(count = 1) {
      return waitForCount(avlFrames, count, "avlFrame");
    },
    async closeClientSocket(index = 0) {
      const socket = clientSockets[index];
      if (!socket) {
        throw new Error(`no client socket at index ${index}`);
      }
      socket.end();
      if (!socket.destroyed) {
        await once(socket, "close");
      }
    },
    async close() {
      for (const socket of [...clientSockets]) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };

  function parseBufferedFrames(socket: net.Socket, buffer: Buffer): Buffer {
    let offset = 0;

    while (buffer.length - offset >= 2) {
      const length = buffer.readUInt16BE(offset);
      if (length > 0) {
        const frameLength = length + 2;
        if (buffer.length - offset < frameLength) {
          break;
        }

        const rawFrame = Buffer.from(buffer.subarray(offset, offset + frameLength));
        const imei = rawFrame.subarray(2).toString("ascii");
        const connectionId = socketConnectionIds.get(socket);
        if (connectionId === undefined) {
          throw new Error("Missing connection id for IMEI frame.");
        }

        socketImeis.set(socket, imei);
        imeiFrames.push({ rawFrame, imei, connectionId });
        if (sendImeiResponse) {
          socket.write(Buffer.from([imeiResponseByte]));
        }
        events.emit("imeiFrame", imeiFrames[imeiFrames.length - 1]);
        offset += frameLength;
        continue;
      }

      if (buffer.length - offset < 8) {
        break;
      }

      if (buffer.readUInt32BE(offset) !== 0) {
        throw new Error("malformed AVL frame: expected zero preamble");
      }

      const dataLength = buffer.readUInt32BE(offset + 4);
      const frameLength = dataLength + 12;
      if (dataLength === 0) {
        throw new Error("malformed AVL frame: data length must be positive");
      }
      if (buffer.length - offset < frameLength) {
        break;
      }

      const rawFrame = Buffer.from(buffer.subarray(offset, offset + frameLength));
      avlFrames.push(rawFrame);
      const connectionId = socketConnectionIds.get(socket);
      if (connectionId === undefined) {
        throw new Error("Missing connection id for AVL frame.");
      }

      avlFrameRecords.push({
        rawFrame,
        connectionId,
        imei: socketImeis.get(socket) ?? null
      });
      void writeChunks(socket, avlAckBuffer(avlAcknowledgementCount), avlAcknowledgementChunkSizes);
      events.emit("avlFrame", rawFrame);
      offset += frameLength;
    }

    return Buffer.from(buffer.subarray(offset));
  }

  async function waitForCount<T>(items: readonly T[], count: number, eventName: string): Promise<T> {
    if (count < 1) {
      throw new RangeError("wait count must be at least 1");
    }
    while (items.length < count) {
      const [error] = await Promise.race([
        once(events, eventName).then(() => [null] as const),
        once(events, "serverError").then(([serverError]) => [serverError] as const)
      ]);
      if (error) {
        throw error;
      }
    }
    return items[count - 1] as T;
  }
}

async function writeChunks(socket: net.Socket, buffer: Buffer, chunkSizes: readonly number[]): Promise<void> {
  let offset = 0;

  for (const chunkSize of chunkSizes) {
    if (offset >= buffer.length) {
      return;
    }

    const nextOffset = Math.min(offset + chunkSize, buffer.length);
    socket.write(buffer.subarray(offset, nextOffset));
    offset = nextOffset;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  if (offset < buffer.length) {
    socket.write(buffer.subarray(offset));
  }
}

function avlAckBuffer(count: number): Buffer {
  assertAckCount(count);
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(count);
  return buffer;
}

function assertAckCount(count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > 0xffffffff) {
    throw new RangeError("AVL acknowledgement count must be an unsigned 32-bit integer");
  }
}

function assertByte(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${label} must be an unsigned 8-bit integer`);
  }
}

function normalizeChunkSizes(chunkSizes: readonly number[] | undefined): number[] {
  if (!chunkSizes || chunkSizes.length === 0) {
    return [4];
  }

  for (const chunkSize of chunkSizes) {
    if (!Number.isInteger(chunkSize) || chunkSize < 1) {
      throw new RangeError("AVL acknowledgement chunk sizes must be positive integers");
    }
  }

  return [...chunkSizes];
}
