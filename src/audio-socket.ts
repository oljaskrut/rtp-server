import { AudioSocket } from "@fonoster/streams"
import { WebSocketServer } from "ws"

const audioSocket = new AudioSocket()
const wss = new WebSocketServer({ port: 8081 })

console.log("WebSocket server listening on port 8081")

let wsConnection: any = null
let audioConnection: any = null

// Audio configuration
const sampleRate = 8000 // 16kHz for LPCM16
const channels = 1 // Mono
const bytesPerSample = 2 // 16-bit

// Queue and playback state management
const schedule: {
  chunk: Buffer
  playTime: number
  endTime: number
  duration: number
}[] = []
let isPlaying = false

// Calculate duration for LPCM16 audio chunk
function getLpcm16Duration(buffer: Buffer): number {
  const totalSamples = buffer.length / bytesPerSample
  return totalSamples / (sampleRate * channels)
}

// Process and send audio chunks with correct timing
function processQueue(): void {
  if (schedule.length === 0) {
    isPlaying = false
    return
  }

  const item = schedule.shift()!
  const now = Date.now()
  const waitTime = Math.max(0, item.playTime - now)

  setTimeout(() => {
    // Send to Asterisk via AudioSocket
    if (audioConnection) {
      console.log(`Playing chunk with duration: ${item.duration.toFixed(2)}s, size: ${item.chunk.length} bytes`)
      audioConnection.write(item.chunk)
    }

    // Schedule next chunk after this one finishes
    setTimeout(processQueue, item.duration * 1000)
  }, waitTime)
}

wss.on("connection", (ws, req) => {
  wsConnection = ws
  console.log("WebSocket connected from:", req.socket.remoteAddress)

  ws.on("message", (data: Buffer) => {
    console.log("WebSocket message received, length:", data?.length)

    // Calculate duration of this audio chunk
    const duration = getLpcm16Duration(data)

    // Calculate when to play based on previous chunks
    const now = Date.now()
    const playTime = schedule.length > 0 ? Math.max(schedule[schedule.length - 1].endTime, now) : now

    const endTime = playTime + duration * 1000 // in milliseconds

    // Add to schedule
    schedule.push({
      chunk: data,
      playTime,
      endTime,
      duration,
    })

    console.log(`Scheduled chunk: duration=${duration.toFixed(2)}s, queue length=${schedule.length}`)

    // Start playing if not already
    if (!isPlaying) {
      isPlaying = true
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
