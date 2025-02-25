export class AudioConverter {
  /**
   * Converts SLIN16 (8kHz) to PCM 16000 (16kHz)
   * Simple linear interpolation for upsampling
   */
  static slin16ToPcm16000(buffer: Buffer): Buffer {
    const inputSamples = buffer.length / 2 // Each sample is 2 bytes
    const outputBuffer = Buffer.alloc(inputSamples * 4) // 2x samples (16kHz vs 8kHz)

    for (let i = 0; i < inputSamples; i++) {
      const sample = buffer.readInt16LE(i * 2)

      // Simple linear interpolation
      outputBuffer.writeInt16LE(sample, i * 4)
      outputBuffer.writeInt16LE(sample, i * 4 + 2)
    }

    return outputBuffer
  }

  /**
   * Converts PCM 16000 (16kHz) to SLIN16 (8kHz)
   * Simple decimation for downsampling
   */
  static pcm16000ToSlin16(buffer: Buffer): Buffer {
    const inputSamples = buffer.length / 2
    const outputSamples = Math.floor(inputSamples / 2)
    const outputBuffer = Buffer.alloc(outputSamples * 2)

    for (let i = 0; i < outputSamples; i++) {
      // Take every other sample
      const sample = buffer.readInt16LE(i * 4)
      outputBuffer.writeInt16LE(sample, i * 2)
    }

    return outputBuffer
  }
}
