export class BufferAccumulator {
  private accumulator: Buffer
  private maxSize: number
  private callback: (buffer: Buffer) => void

  constructor(maxSize: number, callback: (buffer: Buffer) => void) {
    this.accumulator = Buffer.alloc(0)
    this.maxSize = maxSize
    this.callback = callback
  }

  add(buffer: Buffer): void {
    this.accumulator = Buffer.concat([this.accumulator, buffer])

    while (this.accumulator.length >= this.maxSize) {
      const sendBuffer = this.accumulator.slice(0, this.maxSize)
      this.callback(sendBuffer)
      this.accumulator = this.accumulator.slice(this.maxSize)
    }
  }

  flush(): void {
    if (this.accumulator.length > 0) {
      this.callback(this.accumulator)
      this.accumulator = Buffer.alloc(0)
    }
  }

  clear(): void {
    this.accumulator = Buffer.alloc(0)
  }
}
