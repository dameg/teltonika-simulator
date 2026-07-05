const reflectedPolynomial = 0xa001;

export function crc16Ibm(data: Buffer): number {
  let crc = 0x0000;

  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ reflectedPolynomial : crc >>> 1;
    }
  }

  return crc & 0xffff;
}

export function crc16IbmProtocolField(data: Buffer): Buffer {
  const field = Buffer.alloc(4);
  field.writeUInt32BE(crc16Ibm(data));
  return field;
}
