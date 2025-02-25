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

  // Stats for diagnostics
  private packetStats = {
    received: 0,
    sent: 0,
    lost: 0,
    dropped: 0,
  }

  private statsInterval: Timer

  constructor(host: string) {
    super()
    this.ssrc = Math.floor(Math.random() * 0xffffffff) // Random SSRC
    const [addr, portStr] = host.split(":")
    this.address = addr || "0.0.0.0"
    this.port = parseInt(portStr, 10)

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

      if (!this.asteriskRtpAddress || !this.asteriskRtpPort) {
        this.asteriskRtpAddress = rinfo.address
        this.asteriskRtpPort = rinfo.port
        console.log(`Detected Asterisk RTP endpoint: ${this.asteriskRtpAddress}:${this.asteriskRtpPort}`)
      }

      if (msg.length < 12) {
        console.warn("Received invalid RTP packet (too small)")
        return
      }

      // Loss detection / concealment can remain if desired
      const sequenceNumber = msg.readUInt16BE(2)
      // (Loss detection logic could go here)

      // Process payload directly, converting to 16-bit format
      const payload = msg.slice(12)
      const converted = convert16(payload)
      buffAcc.add(converted)
    })

    // Remove rate limiting from the outgoing audio
    this.on("audio_input", (data: Buffer) => {
      if (!this.asteriskRtpAddress || !this.asteriskRtpPort) {
        return
      }

      // Convert incoming data directly
      const audioData = convert16(data)

      // Create RTP header (12 bytes)
      const header = Buffer.alloc(12)
      header[0] = 0x80 // Version: 2, no padding/extensions, no CSRC
      header[1] = 0x0b // Payload type: 11 (slin16)
      header.writeUInt16BE(this.sequenceNumber & 0xffff, 2)
      this.sequenceNumber++
      header.writeUInt32BE(this.timestamp, 4)
      this.timestamp += audioData.length / 2 // Increment by number of 16-bit samples
      header.writeUInt32BE(this.ssrc, 8)

      // Combine header and payload into an RTP packet
      const packet = Buffer.concat([header, audioData])

      // Send the packet immediately
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

    // Bind the server to the specified address and port
    this.server.bind(this.port, this.address)

    // Periodically log statistics
    this.statsInterval = setInterval(() => {
      console.log(
        `RTP Stats: received=${this.packetStats.received}, sent=${this.packetStats.sent}, lost=${this.packetStats.lost}, dropped=${this.packetStats.dropped}`,
      )
    }, 10000)
  }

  public close(): void {
    clearInterval(this.statsInterval)
    this.server.close()
    console.log("RTP UDP server closed")
  }
}
