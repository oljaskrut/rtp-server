import dgram from "dgram"
import { WebSocketServer } from "ws"
import { AudioBufferAccumulator, convertSlin16ToPcm16000 } from "./utils"

// UDP (RTP) Server
export function startUdpServer(port: number, wsServer: WebSocketServer): dgram.Socket {
  const server = dgram.createSocket("udp4")
  const bufferAccumulator = new AudioBufferAccumulator()

  bufferAccumulator.on("data", (frame: Buffer) => {
    const pcmData = convertSlin16ToPcm16000(frame)

    wsServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(pcmData)
      }
    })
  })

  server.on("error", (err) => {
    console.error(`UDP server error:\n${err.stack}`)
    server.close()
  })

  server.on("message", (msg, rinfo) => {
    console.log(`Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`)
    bufferAccumulator.write(msg)
  })

  server.on("listening", () => {
    const address = server.address()
    console.log(`UDP server listening on ${address.address}:${address.port}`)
  })

  server.bind(port)
  return server
}
