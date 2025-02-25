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

// Minimum size for audio chunks (to filter out control messages)
// Adjust this value as needed - e.g., 1000 bytes
const MIN_AUDIO_CHUNK_SIZE = 1000

// Queue and playback state management
let lastChunkEndTime = 0
let processingChunk = false

function getLpcm16Duration(buffer: Buffer): number {
  const totalSamples = buffer.length / bytesPerSample
  return totalSamples / (sampleRate * channels)
}

function processAudioChunk(chunk: Buffer): void {
  if (!audioConnection) return

  const duration = getLpcm16Duration(chunk)
  const now = Date.now()

  // Calculate when this chunk should play
  const playTime = Math.max(lastChunkEndTime, now)
  const waitTime = Math.max(0, playTime - now)

  console.log(
    `Processing audio chunk: size=${chunk.length} bytes, duration=${duration.toFixed(3)}s, wait=${waitTime}ms`,
  )

  setTimeout(() => {
    if (audioConnection) {
      console.log(`Playing audio chunk: duration=${duration.toFixed(3)}s`)
      audioConnection.write(chunk)

      // Update the time when this chunk will finish playing
      lastChunkEndTime = Date.now() + duration * 1000
      processingChunk = false
    }
  }, waitTime)
}

wss.on("connection", (ws, req) => {
  wsConnection = ws
  console.log("WebSocket connected from:", req.socket.remoteAddress)

  ws.on("message", (data: Buffer) => {
    console.log("WebSocket message received, length:", data?.length)

    if (data.length < MIN_AUDIO_CHUNK_SIZE) {
      // This is likely a control message, send it immediately
      console.log("Forwarding control message immediately")
      // if (audioConnection) {
      console.log("mini", data.toString("utf8"))
      // }
    } else {
      // This is an audio chunk, process with timing
      if (!processingChunk) {
        processingChunk = true
        processAudioChunk(data)
      } else {
        // Queue is busy, wait a bit and try again
        setTimeout(() => {
          if (!processingChunk) {
            processingChunk = true
            processAudioChunk(data)
          } else {
            console.log("Dropping chunk - system busy")
          }
        }, 100)
      }
    }
  })

  ws.on("close", () => {
    console.log("WebSocket closed")
    if (audioConnection) {
      audioConnection.close()
    }
    wsConnection = null
    audioConnection = null
  })
})

audioSocket.onConnection(async (req, res) => {
  audioConnection = res
  console.log("AudioSocket connected,", "session ref:", req.ref)
  lastChunkEndTime = 0
  processingChunk = false

  res.onError((err) => console.error("AudioSocket error:", err))

  res.onClose(() => {
    console.log("AudioSocket closed")
    if (wsConnection) {
      wsConnection.close()
    }
    wsConnection = null
    audioConnection = null
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
