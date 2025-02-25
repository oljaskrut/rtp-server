import dgram from "dgram"
import { WebSocketServer } from "ws"
import { convertPcm16000ToSlin16 } from "./utils"

// WebSocket Server
export function startWebSocketServer(
  port: number,
  udpClients: Map<string, { address: string; port: number }>,
): WebSocketServer {
  const wss = new WebSocketServer({ port })

  wss.on("connection", (ws) => {
    console.log("WebSocket client connected")

    ws.on("message", (message) => {
      // Convert PCM 16000 to SLIN16
      const slinData = convertPcm16000ToSlin16(Buffer.from(message as ArrayBuffer))

      // Send to all UDP clients
      udpClients.forEach((client, id) => {
        const udpSocket = dgram.createSocket("udp4")
        udpSocket.send(slinData, client.port, client.address, (err) => {
          if (err) console.error(`Error sending to UDP client ${id}:`, err)
          udpSocket.close()
        })
      })
    })

    ws.on("close", () => {
      console.log("WebSocket client disconnected")
    })
  })

  console.log(`WebSocket server started on port ${port}`)
  return wss
}
