import { AudioSocket } from "@fonoster/streams"
import { WebSocketServer, WebSocket } from "ws"

// Configuration constants
const WEBSOCKET_PORT = 8081
const AUDIO_SOCKET_PORT = 9999
const LOG_INTERVAL = 5000 // Log stats every 10 seconds

// Create servers
const audioSocket = new AudioSocket()
const wss = new WebSocketServer({ port: WEBSOCKET_PORT })

console.log(`WebSocket server listening on port ${WEBSOCKET_PORT}`)

let wsConnection: WebSocket | null = null
let audioConnection: any = null

let wsToAudioPacketCount = 0
let audioToWsPacketCount = 0

let started = false

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
  wsConnection = ws
  console.log(`WebSocket connected`)

  ws.on("message", (data: Buffer) => {
    if (audioConnection) {
      if (!started) {
        console.log("Started")
        started = true
      }
      wsToAudioPacketCount++
      audioConnection.write(data)
    }
  })

  ws.on("close", () => {
    console.log("WebSocket closed")
    wsConnection = null
  })
})

// Handle AudioSocket connections
audioSocket.onConnection(async (req, res) => {
  audioConnection = res
  console.log(`AudioSocket connected, session ref: ${req.ref}`)

  res.onError((err) => console.error("AudioSocket error:", err))

  res.onClose(() => {
    console.log("AudioSocket closed")
    audioConnection = null
  })

  res.onData((data: Buffer) => {
    if (wsConnection && wsConnection.readyState === wsConnection.OPEN) {
      wsConnection.send(data)
      audioToWsPacketCount++
    }
  })
})

audioSocket.listen(AUDIO_SOCKET_PORT, () => {
  console.log(`AudioSocket server listening on port ${AUDIO_SOCKET_PORT}`)
})

// Periodic logging of packet counts
setInterval(() => {
  if (audioConnection) {
    console.log(`Packet Stats: to AS ${wsToAudioPacketCount}, from AS: ${audioToWsPacketCount}`)
  }

  if (wsToAudioPacketCount === 0) {
    started = false
  }
  wsToAudioPacketCount = 0
  audioToWsPacketCount = 0
}, LOG_INTERVAL)
