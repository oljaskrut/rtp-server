import dgram from "dgram"
import { createWriteStream, WriteStream } from "fs"
import { EventEmitter } from "events"
import { BufferAccumulator } from "./buffer-accumulator"
import { AudioConverter } from "./audio-converter"

export interface RtpServerOptions {
  host: string
  bufferSize?: number
  sessionId?: string
}

export class RtpUdpServer extends EventEmitter {
  private server: dgram.Socket
  private accumulators: Map<string, BufferAccumulator>
  private defaultAccumulator: BufferAccumulator
  private bufferSize: number

  public readonly address: string
  public readonly port: number

  constructor(options: RtpServerOptions) {
    super()
    const { host, bufferSize = 4096 } = options

    const [addr, portStr] = host.split(":")
    this.address = addr
    this.port = parseInt(portStr, 10)
    this.bufferSize = bufferSize
    this.accumulators = new Map()

    // Create UDP server
    this.server = dgram.createSocket("udp4")

    // Create default buffer accumulator
    this.defaultAccumulator = new BufferAccumulator(bufferSize, (buffer) => {
      // Convert SLIN16 to PCM 16000 before emitting
      const convertedBuffer = AudioConverter.slin16ToPcm16000(buffer)
      this.emit("data", convertedBuffer)
    })

    // Setup UDP server event handlers
    this.server.on("error", (err: Error) => {
      console.error(`UDP Server error: ${err}`)
      this.server.close()
      this.emit("error", err)
    })

    this.server.on("message", (msg: Buffer, rinfo) => {
      try {
        // Extract RTP payload (skip 12-byte RTP header)
        let buf = msg.slice(12)

        // Handle byte swapping if needed
        buf.swap16()

        // Try to find a session for this endpoint
        const endpoint = `${rinfo.address}:${rinfo.port}`

        this.emit("rtp-endpoint", endpoint, buf)

        // Use default accumulator if no session-specific one exists
        this.defaultAccumulator.add(buf)
      } catch (err) {
        this.emit("error", err)
      }
    })

    this.server.on("listening", () => {
      const addressInfo = this.server.address()
      console.log(`UDP server listening on ${addressInfo.address}:${addressInfo.port}`)
      this.emit("listening", addressInfo)
    })

    // Bind server to address and port
    this.server.bind(this.port, this.address)
  }

  // Create or get session-specific accumulator
  public getSessionAccumulator(sessionId: string): BufferAccumulator {
    if (!this.accumulators.has(sessionId)) {
      const accumulator = new BufferAccumulator(this.bufferSize, (buffer) => {
        // Convert SLIN16 to PCM 16000 before emitting
        const convertedBuffer = AudioConverter.slin16ToPcm16000(buffer)
        this.emit("data", convertedBuffer, sessionId)
      })
      this.accumulators.set(sessionId, accumulator)
    }
    return this.accumulators.get(sessionId)!
  }

  public sendToEndpoint(data: Buffer, address: string, port: number): void {
    // Convert PCM 16000 to SLIN16
    const convertedBuffer = AudioConverter.pcm16000ToSlin16(data)

    // Create RTP header (simplified)
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
    const packet = Buffer.concat([rtpHeader, convertedBuffer])

    // Send packet
    this.server.send(packet, port, address)
  }

  public removeSession(sessionId: string): void {
    this.accumulators.delete(sessionId)
  }

  public close(): void {
    this.server.close()
    // Clear all accumulators
    this.accumulators.clear()
    this.defaultAccumulator.clear()
  }
}
