import net from "net"
import { EventEmitter } from "events"
import { BufferAccumulator } from "./buffer-accumulator"
import { convert16 } from "./convert"

export class RtpTcpServer extends EventEmitter {
  private server: net.Server
  private client?: net.Socket
  public readonly address: string
  public readonly port: number
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

    this.server = net.createServer((socket) => {
      console.log(`New connection from ${socket.remoteAddress}:${socket.remotePort}`)

      // Store the connected client
      this.client = socket

      // Handle data chunks - may need to buffer for RTP packet boundaries
      let dataBuffer = Buffer.alloc(0)

      socket.on("data", (data) => {
        // Append incoming data to our buffer
        dataBuffer = Buffer.concat([dataBuffer, data])

        // Process complete RTP packets (minimum 12 bytes for header)
        while (dataBuffer.length >= 12) {
          // Get payload size from data we have
          const payloadLength = dataBuffer.length - 12

          // Extract and process the packet
          const packet = dataBuffer.slice(0, 12 + payloadLength)
          const converted = convert16(packet.slice(12))
          buffAcc.add(converted)

          // Remove the processed packet from buffer
          dataBuffer = dataBuffer.slice(12 + payloadLength)
        }
      })

      socket.on("error", (err) => {
        console.error(`TCP Socket error: ${err}`)
      })

      socket.on("close", () => {
        console.log(`Connection from ${socket.remoteAddress}:${socket.remotePort} closed`)
        this.client = undefined
      })
    })

    this.server.on("error", (err) => {
      console.error(`TCP Server error: ${err}`)
      this.server.close()
    })

    this.on("audio_input", (data: Buffer) => {
      if (!this.client || this.client.destroyed) return

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

      // Send packet
      this.client.write(packet, (err) => {
        if (err) {
          console.error("Error sending RTP packet:", err)
        }
      })
    })

    this.server.on("listening", () => {
      const addressInfo = this.server.address() as net.AddressInfo
      console.log(`TCP server listening at ${addressInfo.address}:${addressInfo.port}`)
    })

    this.server.listen(this.port, this.address)
  }

  public close(): void {
    if (this.client && !this.client.destroyed) {
      this.client.destroy()
    }
    this.server.close()
  }
}
