export function parseRTPHeader(incomingBuffer: Buffer) {
  if (incomingBuffer.length < 12) {
    return
  }

  // Slice out the RTP header (first 12 bytes)
  const headerBytes = incomingBuffer.slice(0, 12)

  // Create a DataView for fine-grained access to the header bytes.
  // This works for both browser Uint8Arrays and Node.js Buffers.
  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength)

  // Read the first byte (byte 0)
  const byte0 = view.getUint8(0)
  const version = byte0 >> 6 // Upper 2 bits
  const padding = (byte0 >> 5) & 0x01 // Next bit
  const extension = (byte0 >> 4) & 0x01 // Next bit
  const csrcCount = byte0 & 0x0f // Lower 4 bits

  // Read the second byte (byte 1)
  const byte1 = view.getUint8(1)
  const marker = byte1 >> 7 // Upper bit
  const payloadType = byte1 & 0x7f // Lower 7 bits

  // Read the sequence number (bytes 2-3).
  // The third parameter 'false' indicates big-endian (network order).
  const sequenceNumber = view.getUint16(2, false)

  // Read the timestamp (bytes 4-7) and SSRC (bytes 8-11)
  const timestamp = view.getUint32(4, false)
  const ssrc = view.getUint32(8, false)

  return {
    version,
    padding,
    extension,
    csrcCount,
    marker,
    payloadType,
    sequenceNumber,
    timestamp,
    ssrc,
  }
}
