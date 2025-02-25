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

// Maximum message size for AudioSocket (slightly under the actual limit)
const MAX_MESSAGE_SIZE = 60000 // Adjust based on the error message

// Queue for audio chunks
const audioQueue: Buffer[] = []
let isProcessing = false

// Split large buffers into smaller chunks
function splitBuffer(buffer: Buffer, maxSize: number): Buffer[] {
  const chunks: Buffer[] = []
  let offset = 0

  while (offset < buffer.length) {
    // Calculate size for this chunk (ensure it's a multiple of bytesPerSample)
    const chunkSize = Math.min(maxSize, buffer.length - offset)
    // Ensure we're not splitting in the middle of a sample
    const adjustedSize = chunkSize - (chunkSize % bytesPerSample)

    chunks.push(buffer.slice(offset, offset + adjustedSize))
    offset += adjustedSize
  }

  return chunks
}

// Process audio chunks in order
function processQueue() {
  if (audioQueue.length === 0) {
    isProcessing = false
    return
  }

  isProcessing = true
  const chunk = audioQueue.shift()!

  try {
    // Calculate approximate duration
    const duration = chunk.length / (bytesPerSample * sampleRate * channels)
    console.log(`Playing chunk: size=${chunk.length} bytes, approx duration=${duration.toFixed(3)}s`)

    if (audioConnection) {
      audioConnection.write(chunk)

      // Wait for the duration to finish before playing next chunk
      // Add a small buffer (50ms) to ensure chunks don't overlap
      const waitTime = Math.max(duration * 1000, 50)

      setTimeout(() => {
        processQueue()
      }, waitTime)
    } else {
      isProcessing = false
    }
  } catch (error) {
    console.error("Error processing chunk:", error)
    // Continue with next chunk
    setTimeout(processQueue, 50)
  }
}

wss.on("connection", (ws, req) => {
  wsConnection = ws
  console.log("WebSocket connected from:", req.socket.remoteAddress)

  ws.on("message", (data: Buffer) => {
    console.log("WebSocket message received, length:", data?.length)

    // Split large chunks
    if (data.length > MAX_MESSAGE_SIZE) {
      console.log(`Splitting large chunk of ${data.length} bytes`)
      const smallerChunks = splitBuffer(data, MAX_MESSAGE_SIZE)
      console.log(`Split into ${smallerChunks.length} smaller chunks`)

      // Add all smaller chunks to the queue
      smallerChunks.forEach((chunk) => audioQueue.push(chunk))
    } else {
      // Add to queue as is
      audioQueue.push(data)
    }

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
