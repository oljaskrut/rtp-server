import { AudioSocket } from "@fonoster/streams"
import { WebSocketServer } from "ws"

const audioSocket = new AudioSocket()
const wss = new WebSocketServer({ port: 8081 })

console.log("WebSocket server listening on port 8081")

let wsConnection: any = null
let audioConnection: any = null

// Audio configuration
const sampleRate = 8000 // 8kHz PCM
const channels = 1 // Mono
const bytesPerSample = 2 // 16-bit

// Queue for audio chunks
const audioQueue: Buffer[] = []
let isProcessing = false

// Process audio chunks in order
function processQueue() {
  if (audioQueue.length === 0) {
    isProcessing = false
    return
  }

  isProcessing = true
  const chunk = audioQueue.shift()!

  // Calculate approximate duration
  const duration = chunk.length / (bytesPerSample * sampleRate * channels)
  console.log(`Playing chunk: size=${chunk.length} bytes, approx duration=${duration.toFixed(3)}s`)

  if (audioConnection) {
    audioConnection.write(chunk)

    // Wait slightly longer than the calculated duration before playing next chunk
    // This adds a small buffer to ensure chunks don't overlap
    const waitTime = duration * 1000 * 1.1 // 10% buffer

    setTimeout(() => {
      processQueue()
    }, waitTime)
  } else {
    isProcessing = false
  }
}

wss.on("connection", (ws, req) => {
  wsConnection = ws
  console.log("WebSocket connected from:", req.socket.remoteAddress)

  ws.on("message", (data: Buffer) => {
    console.log("WebSocket message received, length:", data?.length)

    // Add to queue
    audioQueue.push(data)

    // Start processing if not already doing so
    if (!isProcessing) {
      processQueue()
    }
  })

  ws.on("close", () => {
    console.log("WebSocket closed")
    if (audioConnection) {
      audioConnection.close()
    }
    wsConnection = null
    audioConnection = null
    // Clear queue
    audioQueue.length = 0
    isProcessing = false
  })
})

audioSocket.onConnection(async (req, res) => {
  audioConnection = res
  console.log("AudioSocket connected,", "session ref:", req.ref)

  res.onError((err) => console.error("AudioSocket error:", err))

  res.onClose(() => {
    console.log("AudioSocket closed")
    if (wsConnection) {
      wsConnection.close()
    }
    wsConnection = null
    audioConnection = null
    // Clear queue
    audioQueue.length = 0
    isProcessing = false
  })

  res.onData((data: Buffer) => {
    if (wsConnection && wsConnection.readyState === wsConnection.OPEN) {
      wsConnection.send(data)
    }
  })
})

audioSocket.listen(9999, () => {
  console.log("AudioSocket server listening on port 9999")
})
