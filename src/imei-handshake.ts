import net from "node:net";

export interface ImeiHandshakeOptions {
  host: string;
  port: number;
  imei: string;
}

export interface AcceptedImeiHandshake {
  kind: "accepted";
  socket: net.Socket;
}

export interface RejectedImeiHandshake {
  kind: "rejected";
}

export type ImeiHandshakeResult = AcceptedImeiHandshake | RejectedImeiHandshake;

export async function performImeiHandshake(options: ImeiHandshakeOptions): Promise<ImeiHandshakeResult> {
  const socket = net.createConnection({ host: options.host, port: options.port });
  const frame = encodeImeiHandshakeFrame(options.imei);

  return new Promise<ImeiHandshakeResult>((resolve, reject) => {
    let settled = false;
    let acknowledged = false;
    let ackBuffer = Buffer.alloc(0);

    socket.once("connect", () => {
      socket.write(frame);
    });

    socket.on("data", (chunk) => {
      if (settled || acknowledged) {
        return;
      }

      ackBuffer = Buffer.concat([ackBuffer, chunk]);
      if (ackBuffer.length < 1) {
        return;
      }

      acknowledged = true;
      const ack = ackBuffer[0];

      if (ack === 0x01) {
        settled = true;
        cleanup();
        resolve({ kind: "accepted", socket });
        return;
      }

      if (ack === 0x00) {
        settled = true;
        cleanup();
        socket.end(() => {
          socket.destroy();
          resolve({ kind: "rejected" });
        });
        return;
      }

      settled = true;
      cleanup();
      socket.destroy();
      reject(new Error(`Unexpected IMEI acknowledgement byte: 0x${ack.toString(16).padStart(2, "0")}.`));
    });

    socket.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    });

    socket.once("close", () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("Socket closed before IMEI acknowledgement was received."));
    });

    function cleanup() {
      socket.removeAllListeners("connect");
      socket.removeAllListeners("data");
      socket.removeAllListeners("error");
      socket.removeAllListeners("close");
    }
  });
}

export function encodeImeiHandshakeFrame(imei: string): Buffer {
  const payload = Buffer.from(imei, "ascii");
  const frame = Buffer.alloc(payload.length + 2);
  frame.writeUInt16BE(payload.length, 0);
  payload.copy(frame, 2);
  return frame;
}
