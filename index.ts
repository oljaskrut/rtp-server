// src/index.ts
import { AudioBridge } from "./src/audio-bridge"

// Use environment variables or defaults
const WS_PORT = parseInt(process.env.WS_PORT || "8081", 10)
const UDP_LISTEN = process.env.UDP_LISTEN || "0.0.0.0:9999"
const BUFFER_SIZE = parseInt(process.env.BUFFER_SIZE || "4096", 10)

const audioBridge = new AudioBridge({
  wsPort: WS_PORT,
  udpHost: UDP_LISTEN,
  bufferSize: BUFFER_SIZE,
})

// Example of handling custom control messages
audioBridge.on("control", (control) => {
  console.log("Received control message:", control)

  // Example: handle custom commands
  if (control.type === "join-room") {
    console.log(`User ${control.sessionId} requested to join room ${control.roomId}`)
    // Implement room joining logic
  }
})

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...")
  audioBridge.close()
  process.exit(0)
})

console.log(`Audio Bridge running`)
console.log(`WebSocket server on port: ${WS_PORT}`)
console.log(`UDP RTP server listening on: ${UDP_LISTEN}`)
