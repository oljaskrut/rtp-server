import { startUdpServer } from "./udp"
import { startWebSocketServer } from "./ws"

export function main() {
  const udpClients = new Map<string, { address: string; port: number }>()

  // Start WebSocket server
  const wss = startWebSocketServer(8081, udpClients)

  // Start UDP server (for RTP packets)
  const udpServer = startUdpServer(9999, wss)

  console.log("Audio bridge server started")

  // When receiving a UDP packet, track the client for responses
  udpServer.on("message", (msg, rinfo) => {
    const clientId = `${rinfo.address}:${rinfo.port}`
    if (!udpClients.has(clientId)) {
      udpClients.set(clientId, { address: rinfo.address, port: rinfo.port })
      console.log(`Tracking new UDP client: ${clientId}`)
    }
  })

  // Clean up on application exit
  process.on("SIGINT", () => {
    console.log("Shutting down audio bridge server...")
    wss.close()
    udpServer.close()
    process.exit(0)
  })
}
