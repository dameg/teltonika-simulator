import { once } from "node:events";
import type net from "node:net";

import { encodeCodec8ExtendedPacket } from "./codec8-extended";
import type { AvlRecord } from "./domain";

export interface AvlPacketSendResult {
  acceptedRecordCount: number;
}

export async function sendAvlPacket(
  socket: net.Socket,
  records: readonly AvlRecord[]
): Promise<AvlPacketSendResult> {
  const expectedRecordCount = records.length;
  const packet = encodeCodec8ExtendedPacket(records);

  await writePacket(socket, packet);

  try {
    const acknowledgement = await readAcknowledgement(socket, 4, "Socket closed before AVL acknowledgement was received.");
    const acceptedRecordCount = acknowledgement.readUInt32BE(0);

    if (acceptedRecordCount !== expectedRecordCount) {
      socket.destroy();
      throw new Error(
        `AVL acknowledgement count mismatch: expected ${expectedRecordCount} record(s), received ${acceptedRecordCount}.`
      );
    }

    return { acceptedRecordCount };
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

async function readAcknowledgement(socket: net.Socket, size: number, closeMessage: string): Promise<Buffer> {
  if (socket.destroyed) {
    throw new Error(closeMessage);
  }

  return new Promise<Buffer>((resolve, reject) => {
    let buffer = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < size) {
        return;
      }

      cleanup();
      socket.pause();
      resolve(buffer.subarray(0, size));
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

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("end", onEnd);
    socket.once("close", onClose);
    socket.resume();

    function cleanup() {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("end", onEnd);
      socket.off("close", onClose);
    }
  });
}
