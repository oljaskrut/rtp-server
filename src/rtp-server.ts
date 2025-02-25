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

  constructor(host: string) {
    super()
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
      // Create RTP header (simplified)
      const packet = createRTP(converted)
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
