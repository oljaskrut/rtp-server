import dgram from "dgram"
import { EventEmitter } from "events"
import { BufferAccumulator } from "./buffer-accumulator"
import { convert16 } from "./convert"

export class RtpUdpServer extends EventEmitter {
  private server: dgram.Socket
  public readonly address: string
  public readonly port: number
  public asteriskRtpAddress?: string
  public asteriskRtpPort?: number
  private sequenceNumber: number = 0
  private timestamp: number = 0
  private ssrc: number
  private lastSendTime: number = 0
  private packetSize: number = 320 // Default packet size (20ms of 16kHz audio)
  private packetInterval: number = 20 // Default packet interval in ms
  private statsInterval: Timer
  private packetStats = {
    received: 0,
    sent: 0,
    latePackets: 0,
  }

  constructor(host: string) {
    super()
    this.ssrc = Math.floor(Math.random() * 0xffffffff) // Random SSRC
    const [addr, portStr] = host.split(":")
    this.address = addr || "0.0.0.0"
    this.port = parseInt(portStr, 10)

    // Create buffering system for received audio
    const buffAcc = new BufferAccumulator(4096, (buffer) => {
      this.emit("audio_output", buffer)
    })

    this.server = dgram.createSocket("udp4")

    this.server.on("error", (err: Error) => {
      console.error(`UDP Server error: ${err}`)
      this.server.close()
    })

    this.server.on("message", (msg: Buffer, rinfo) => {
      this.packetStats.received++

      // Store the source address and port from Asterisk
      if (!this.asteriskRtpAddress || !this.asteriskRtpPort) {
        this.asteriskRtpAddress = rinfo.address
        this.asteriskRtpPort = rinfo.port
        console.log(`Detected Asterisk RTP endpoint: ${this.asteriskRtpAddress}:${this.asteriskRtpPort}`)
      }

      if (msg.length < 12) {
        console.warn("Received invalid RTP packet (too small)")
        return
      }

      // Process payload directly without jitter buffer
      const payload = msg.slice(12)
      const converted = convert16(payload)
      buffAcc.add(converted)
    })

    // Improved audio input handling with rate limiting and timing control
    this.on("audio_input", (data: Buffer) => {
      if (!this.asteriskRtpAddress || !this.asteriskRtpPort) return

      const now = Date.now()
      const timeSinceLastPacket = now - this.lastSendTime

      // Check if we're sending too quickly
      if (timeSinceLastPacket < this.packetInterval * 0.8 && this.lastSendTime !== 0) {
        // Skip this packet or queue it for later
        this.packetStats.latePackets++
        return
      }

      this.lastSendTime = now

      // Ensure consistent packet sizes for better audio quality
      let audioData = convert16(data)

      // Create RTP header
      const header = Buffer.alloc(12)

      // Version: 2, Padding: 0, Extension: 0, CSRC Count: 0
      header[0] = 0x80

      // Marker: 0, Payload Type: 11 (slin16)
      header[1] = 0x0b

      // Sequence number (16 bits)
      header.writeUInt16BE(this.sequenceNumber & 0xffff, 2)
      this.sequenceNumber++

      // Timestamp (32 bits) - increment by number of samples (16-bit samples)
      header.writeUInt32BE(this.timestamp, 4)
      this.timestamp += audioData.length / 2

      // SSRC (32 bits)
      header.writeUInt32BE(this.ssrc, 8)

      // Combine header and payload
      const packet = Buffer.concat([header, audioData])

      // Send packet
      this.server.send(packet, this.asteriskRtpPort, this.asteriskRtpAddress, (err) => {
        if (err) {
          console.error("Error sending RTP packet:", err)
        } else {
          this.packetStats.sent++
        }
      })
    })

    this.server.on("listening", () => {
      const addressInfo = this.server.address()
      console.log(`UDP server listening on ${addressInfo.address}:${addressInfo.port}`)
    })

    // Bind to specified address and port
    this.server.bind(this.port, this.address)

    // Log stats periodically
    const interval = setInterval(() => {
      console.log(
        `RTP Stats: received=${this.packetStats.received}, sent=${this.packetStats.sent}, ` +
          `dropped=${this.packetStats.latePackets}`,
      )
    }, 10000)

    this.statsInterval = interval
  }

  /**
   * Configure audio parameters for better quality
   */
  public configureAudio(options: {
    packetInterval?: number // ms between packets
    sampleRate?: number // audio sample rate
  }): void {
    if (options.packetInterval) {
      this.packetInterval = options.packetInterval
      console.log(`Set packet interval to ${this.packetInterval}ms`)
    }

    if (options.sampleRate) {
      // Calculate packet size based on sample rate and interval
      // For 16-bit audio: bytes = (sampleRate * packetInterval/1000 * 2)
      this.packetSize = Math.floor((options.sampleRate * this.packetInterval * 2) / 1000)
      console.log(`Set packet size to ${this.packetSize} bytes based on ${options.sampleRate}Hz sample rate`)
    }
  }

  public close(): void {
    clearInterval(this.statsInterval)
    this.server.close()
    console.log("RTP UDP server closed")
  }
}
