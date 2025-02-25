import { Transform } from "stream"

// Buffer accumulation and conversion utilities
export class AudioBufferAccumulator extends Transform {
  private buffer: Buffer = Buffer.alloc(0)
  private frameSize: number

  constructor(frameSize: number = 320) {
    // 320 bytes is 160 samples at 16-bit which is 20ms at 8kHz
    super()
    this.frameSize = frameSize
  }

  _transform(chunk: Buffer, encoding: string, callback: (error?: Error, data?: any) => void) {
    // Accumulate incoming data
    this.buffer = Buffer.concat([this.buffer, chunk])

    // Process complete frames
    while (this.buffer.length >= this.frameSize) {
      const frame = this.buffer.subarray(0, this.frameSize)
      this.buffer = this.buffer.subarray(this.frameSize)
      this.push(frame)
    }

    callback()
  }
}

// Audio conversion utilities
export function convertSlin16ToPcm16000(buffer: Buffer): Buffer {
  // In a real implementation, you would use a library like 'node-libsamplerate'
  // or similar to handle proper sample rate conversion from SLIN16 (which is typically 8kHz)
  // to PCM 16000Hz

  // This is a placeholder for actual conversion logic
  // For true implementation, you'd need to resample from 8kHz to 16kHz
  // which would require an actual DSP library

  // Simple placeholder that duplicates samples (crude upsampling)
  const result = Buffer.alloc(buffer.length * 2)
  for (let i = 0; i < buffer.length; i += 2) {
    const sample = buffer.readInt16LE(i)
    result.writeInt16LE(sample, i * 2)
    result.writeInt16LE(sample, i * 2 + 2)
  }
  return result
}

export function convertPcm16000ToSlin16(buffer: Buffer): Buffer {
  // Downsampling from 16kHz to 8kHz (simplified)
  // In a real implementation, use a proper resampling library

  // Simple placeholder that takes every other sample (crude downsampling)
  const result = Buffer.alloc(buffer.length / 2)
  for (let i = 0; i < buffer.length; i += 4) {
    const sample = buffer.readInt16LE(i)
    result.writeInt16LE(sample, i / 2)
  }
  return result
}
