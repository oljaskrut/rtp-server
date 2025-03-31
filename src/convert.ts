export function convert16(slin16Buffer: Buffer) {
  return slin16Buffer

  const pcm16Buffer = Buffer.from(slin16Buffer)

  // Swap the byte order of each 16-bit word
  return pcm16Buffer.swap16()
}
