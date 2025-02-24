import dgram from "dgram"
import { createWriteStream, WriteStream } from "fs"
import { EventEmitter } from "events"

export class RtpUdpServer extends EventEmitter {
  private server: dgram.Socket
  private swap16: boolean
  private fileStream?: WriteStream
  public readonly address: string
  public readonly port: number

  constructor(host: string, swap16: boolean = false, writeFilePath?: string) {
    super()
    const [addr, portStr] = host.split(":")
    this.address = addr
    this.port = parseInt(portStr, 10)
    this.swap16 = swap16

    this.server = dgram.createSocket("udp4")

    if (writeFilePath) {
      this.fileStream = createWriteStream(writeFilePath, { autoClose: true })
    }

    this.server.on("error", (err: Error) => {
      console.error(`UDP Server ошибка: ${err}`)
      this.server.close()
      if (this.fileStream) {
        this.fileStream.close()
      }
    })

    this.server.on("message", (msg: Buffer) => {
      // Отбрасываем первые 12 байт RTP-заголовка
      let buf = msg.slice(12)
      buf.swap16()
      if (this.swap16) {
        buf.swap16()
      }
      if (this.fileStream) {
        this.fileStream.write(buf)
      }
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
    if (this.fileStream) {
      this.fileStream.close()
    }
  }
}
