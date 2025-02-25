export const createRTP = (buffer: Buffer) => {
  const rtpHeader = Buffer.alloc(12)
  // Set RTP version to 2
  rtpHeader[0] = 0x80
  // Set payload type (can be adjusted as needed)
  rtpHeader[1] = 0x00
  // Generate random sequence number and timestamp for simplicity
  const seqNum = Math.floor(Math.random() * 65535)
  rtpHeader.writeUInt16BE(seqNum, 2)
  const timestamp = Math.floor(Date.now() / 1000)
  rtpHeader.writeUInt32BE(timestamp, 4)
  // Add SSRC (synchronization source identifier) - can be random
  const ssrc = Math.floor(Math.random() * 0xffffffff)
  rtpHeader.writeUInt32BE(ssrc, 8)
  // Combine header and payload

  const packet = Buffer.concat([rtpHeader, buffer])
  return packet
}
