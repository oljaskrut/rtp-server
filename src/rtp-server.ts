import dgram from "dgram"
import { EventEmitter } from "events"
import { BufferAccumulator } from "./buffer-accumulator"
import { convert16 } from "./convert"
import { createRTP } from "./rtp-header"

export class RtpUdpServer extends EventEmitter {
  private server: dgram.Socket
  public readonly address: string
  public readonly port: number
  public asteriskRtpAddress?: string
  public asteriskRtpPort?: number
  private sequenceNumber: number = 0
  private timestamp: number = 0
  private ssrc: number

  constructor(host: string) {
    super()
    this.ssrc = Math.floor(Math.random() * 0xffffffff) // Random SSRC
    const [addr, portStr] = host.split(":")
    this.address = addr
    this.port = parseInt(portStr, 10)

    const buffAcc = new BufferAccumulator(4096, (buffer) => {
      this.emit("audio_output", buffer)
    })

    this.server = dgram.createSocket("udp4")

    this.server.on("error", (err: Error) => {
      console.error(`UDP Server ошибка: ${err}`)
      this.server.close()
    })

    this.server.on("message", (msg: Buffer, rinfo) => {
      // Store the source address and port from Asterisk
      if (!this.asteriskRtpAddress || !this.asteriskRtpPort) {
        this.asteriskRtpAddress = rinfo.address
        this.asteriskRtpPort = rinfo.port
        console.log(`Detected Asterisk RTP endpoint: ${this.asteriskRtpAddress}:${this.asteriskRtpPort}`)
      }
      const converted = convert16(msg.slice(12))
      buffAcc.add(converted)
    })

    this.on("audio_input", (data: Buffer) => {
      if (!this.asteriskRtpAddress || !this.asteriskRtpPort) return
      const converted = convert16(data)
      const header = Buffer.alloc(12)
      // Version: 2, Padding: 0, Extension: 0, CSRC Count: 0
      header[0] = 0x80
      // Marker: 0, Payload Type: 11 (slin16)
      header[1] = 0x0b
      // Sequence number (16 bits)
      header.writeUInt16BE(this.sequenceNumber & 0xffff, 2)
      this.sequenceNumber++
      // Timestamp (32 bits)
      header.writeUInt32BE(this.timestamp, 4)
      this.timestamp += converted.length / 2 // Increment by number of samples
      // SSRC (32 bits)
      header.writeUInt32BE(this.ssrc, 8)
      // Combine header and payload
      const packet = Buffer.concat([header, converted])
      // const packet = createRTP(converted)
      // Send packet
      this.server.send(packet, this.asteriskRtpPort, this.asteriskRtpAddress, (err) => {
        if (err) {
          console.error("Error sending RTP packet:", err)
        }
      })
    })

    this.server.on("listening", () => {
      const addressInfo = this.server.address()
      console.log(`UDP сервер прослушивает ${addressInfo.address}:${addressInfo.port}`)
    })

    this.server.bind(this.port, this.address)
  }

  public close(): void {
    this.server.close()
  }
}
