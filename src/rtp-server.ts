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
  private lastReceivedSequence?: number // Track last received RTP sequence number

  // For statistics
  private packetStats = {
    received: 0,
    sent: 0,
    lost: 0,
    latePackets: 0,
  }

  // For outgoing (audio_input) rate/timing control
  private lastSendTime: number = 0
  private packetSize: number = 320 // Default packet size (in bytes)
  private packetInterval: number = 20 // in milliseconds
  private statsInterval: Timer

  constructor(host: string) {
    super()
    this.ssrc = Math.floor(Math.random() * 0xffffffff) // Random SSRC
    const [addr, portStr] = host.split(":")
    this.address = addr || "0.0.0.0"
    this.port = parseInt(portStr, 10)

    // BufferAccumulator collects audio frames before emitting output
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

      // Store Asterisk RTP endpoint details if not known
      if (!this.asteriskRtpAddress || !this.asteriskRtpPort) {
        this.asteriskRtpAddress = rinfo.address
        this.asteriskRtpPort = rinfo.port
        console.log(`Detected Asterisk RTP endpoint: ${this.asteriskRtpAddress}:${this.asteriskRtpPort}`)
      }

      if (msg.length < 12) {
        console.warn("Received invalid RTP packet (too small)")
        return
      }

      // Read sequence number (16-bit) from RTP header
      const sequenceNumber = msg.readUInt16BE(2)

      // Detect packet loss (if we have a previous sequence number)
      if (this.lastReceivedSequence !== undefined) {
        const expectedSeq = (this.lastReceivedSequence + 1) & 0xffff
        if (sequenceNumber !== expectedSeq) {
          // Determine how many packets are missing (modulo 16 bits)
          const gap = (sequenceNumber - expectedSeq) & 0xffff
          console.warn(`Packet loss detected: expected ${expectedSeq}, got ${sequenceNumber}. Lost ${gap} packet(s).`)
          this.packetStats.lost += gap

          // Inject silence for each lost packet.
          // Use the current packet’s payload length as a guide.
          const silenceLength = msg.length - 12 > 0 ? msg.length - 12 : this.packetSize
          for (let i = 0; i < gap; i++) {
            const silence = Buffer.alloc(silenceLength) // zero-filled buffer
            buffAcc.add(silence)
          }
        }
      }

      // Update lastReceivedSequence before processing the actual packet
      this.lastReceivedSequence = sequenceNumber

      // Extract and convert payload (starting after the 12-byte RTP header)
      const payload = msg.slice(12)
      const converted = convert16(payload)
      buffAcc.add(converted)
    })

    // Handle outgoing RTP audio (from local audio input)
    this.on("audio_input", (data: Buffer) => {
      if (!this.asteriskRtpAddress || !this.asteriskRtpPort) {
        return
      }

      const now = Date.now()
      const timeSinceLastPacket = now - this.lastSendTime

      // Ensure we are not sending too fast
      if (this.lastSendTime && timeSinceLastPacket < this.packetInterval * 0.8) {
        this.packetStats.latePackets++
        return
      }
      this.lastSendTime = now

      let audioData = convert16(data)

      // Create RTP header (12 bytes)
      const header = Buffer.alloc(12)
      // Version: 2, Padding: 0, Extension: 0, CSRC Count: 0
      header[0] = 0x80
      // Marker: 0, Payload Type: 11 (slin16)
      header[1] = 0x0b
      // Sequence number (16 bits)
      header.writeUInt16BE(this.sequenceNumber & 0xffff, 2)
      this.sequenceNumber++
      // Timestamp (32 bits) - increment based on number of samples (16-bit samples)
      header.writeUInt32BE(this.timestamp, 4)
      this.timestamp += audioData.length / 2
      // SSRC (32 bits)
      header.writeUInt32BE(this.ssrc, 8)

      // Combine header and payload into one RTP packet
      const packet = Buffer.concat([header, audioData])

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

    // Bind the UDP server to the specified address and port
    this.server.bind(this.port, this.address)

    // Log statistics periodically
    this.statsInterval = setInterval(() => {
      console.log(
        `RTP Stats: received=${this.packetStats.received}, sent=${this.packetStats.sent}, lost=${this.packetStats.lost}, dropped=${this.packetStats.latePackets}`,
      )
    }, 10000)
  }

  /**
   * Configure audio parameters for better quality.
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
      // For 16-bit audio: packetSize = sampleRate * (packetInterval/1000) * 2 bytes
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
