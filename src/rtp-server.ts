import dgram from "dgram"
import { EventEmitter } from "events"

export class RtpUdpServer extends EventEmitter {
  private server: dgram.Socket
  public readonly address: string
  public readonly port: number

  constructor(host: string) {
    super()
    const [addr, portStr] = host.split(":")
    this.address = addr
    this.port = parseInt(portStr, 10)

    this.server = dgram.createSocket("udp4")

    this.server.on("error", (err: Error) => {
      console.error(`UDP Server ошибка: ${err}`)
      this.server.close()
    })

    this.server.on("message", (msg: Buffer) => {
      let buf = msg.slice(12)
      // Генерируем событие 'data' с полученным чанком
      this.emit("data", buf)
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
