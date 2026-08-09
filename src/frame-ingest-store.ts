import type {
  Codec8ExtendedDecodeError,
  DecodedCodec8ExtendedPacket,
} from "./codec8-extended-decoder";

interface FrameIngestBase {
  sessionId: string;
  imei: string;
  receivedAt: Date;
  rawFrame: Buffer;
}

export interface FrameIngestInput extends FrameIngestBase {
  decoded: DecodedCodec8ExtendedPacket;
}

export interface FrameDecodeFailureInput extends FrameIngestBase {
  error: Codec8ExtendedDecodeError;
}

export interface FrameIngestStore {
  persistFrame(input: FrameIngestInput): Promise<void | { receptionId: string }>;
  auditDecodeFailure(input: FrameDecodeFailureInput): Promise<void>;
  markAcknowledged?(receptionId: string, recordCount: number): Promise<void>;
}
