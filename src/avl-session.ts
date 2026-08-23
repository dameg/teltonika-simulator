import type net from "node:net";

import { encodeCodec8ExtendedPacket } from "./codec8-extended";
import type { AvlRecord } from "./domain";

export interface AvlPacketSendResult {
  acceptedRecordCount: number;
  packetHex: string;
}

export interface AvlPacketSendOptions {
  ackTimeoutMs?: number;
  corruptCrc?: boolean;
  signal?: AbortSignal;
}

export class AvlAcknowledgementTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Timed out waiting ${timeoutMs}ms for AVL acknowledgement.`);
    this.name = "AvlAcknowledgementTimeoutError";
  }
}

export async function sendAvlPacket(
  socket: net.Socket,
  records: readonly AvlRecord[],
  options: AvlPacketSendOptions = {},
): Promise<AvlPacketSendResult> {
  const expectedRecordCount = records.length;
  const packet = encodeCodec8ExtendedPacket(records);
  const sentPacket = options.corruptCrc ? corruptCrc(packet) : packet;

  await writePacket(socket, sentPacket);

  try {
    const acknowledgement = await readAcknowledgement(
      socket,
      4,
      "Socket closed before AVL acknowledgement was received.",
      options.ackTimeoutMs,
      options.signal,
    );
    const acceptedRecordCount = acknowledgement.readUInt32BE(0);

    if (acceptedRecordCount !== expectedRecordCount) {
      socket.destroy();
      throw new Error(
        `AVL acknowledgement count mismatch: expected ${expectedRecordCount} record(s), received ${acceptedRecordCount}.`,
      );
    }

    return { acceptedRecordCount, packetHex: sentPacket.toString("hex") };
  } catch (error) {
    if (!socket.destroyed) {
      socket.destroy();
    }
    throw error;
  }
}

async function writePacket(socket: net.Socket, packet: Buffer): Promise<void> {
  if (socket.destroyed) {
    throw new Error("Socket is not writable for AVL packet send.");
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("Socket closed while sending AVL packet."));
    };

    socket.once("error", onError);
    socket.once("close", onClose);
    socket.write(packet, (error?: Error | null) => {
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });

    function cleanup() {
      socket.off("error", onError);
      socket.off("close", onClose);
    }
  });
}

async function readAcknowledgement(
  socket: net.Socket,
  size: number,
  closeMessage: string,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined,
): Promise<Buffer> {
  if (socket.destroyed) {
    throw new Error(closeMessage);
  }
  if (signal?.aborted) {
    throw createAbortError();
  }

  return new Promise<Buffer>((resolve, reject) => {
    const buffer = Buffer.alloc(size);
    let received = 0;
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
      cleanup();
      reject(new AvlAcknowledgementTimeoutError(timeoutMs));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      const copied = Math.min(size - received, chunk.byteLength);
      chunk.copy(buffer, received, 0, copied);
      received += copied;
      if (received < size) {
        return;
      }

      cleanup();
      socket.pause();
      resolve(buffer);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onEnd = () => {
      cleanup();
      reject(new Error(closeMessage));
    };
    const onClose = () => {
      cleanup();
      reject(new Error(closeMessage));
    };
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("end", onEnd);
    socket.once("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
    socket.resume();

    function cleanup() {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("end", onEnd);
      socket.off("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    }
  });
}

function corruptCrc(packet: Buffer): Buffer {
  const corrupted = Buffer.from(packet);
  corrupted[corrupted.byteLength - 1] ^= 0x01;
  return corrupted;
}

function createAbortError(): Error {
  const error = new Error("Session aborted.");
  error.name = "AbortError";
  return error;
}
