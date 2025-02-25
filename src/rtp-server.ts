import dgram from "dgram"
import { EventEmitter } from "events"
import { BufferAccumulator } from "./buffer-accumulator"
import { convert16 } from "./convert"

export class RtpUdpServer extends EventEmitter {
  private server: dgram.Socket
  public readonly address: string
  public readonly port: number

  constructor(host: string) {
    super()
    const [addr, portStr] = host.split(":")
    this.address = addr
    this.port = parseInt(portStr, 10)

    const buffAcc = new BufferAccumulator(4096, (buffer) => {
      this.emit("data", buffer)
    })

    this.server = dgram.createSocket("udp4")

    this.server.on("error", (err: Error) => {
      console.error(`UDP Server ошибка: ${err}`)
      this.server.close()
    })

    this.server.on("message", (msg: Buffer) => {
      const converted = convert16(msg.slice(12))
      buffAcc.add(converted)
    })

    this.on("data", (data: Buffer) => {
      console.log("Получено сообщение от клиента:", data.byteLength)
      const converted = convert16(data)
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
      const packet = Buffer.concat([rtpHeader, converted])
      // Send packet
      this.server.send(packet, this.port, this.address)
      console.log("sent back to udp:", packet.byteLength)
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
