import { AudioSocket } from "@fonoster/streams"
import { WebSocketServer } from "ws"

const audioSocket = new AudioSocket()
const wss = new WebSocketServer({ port: 8081 })

console.log("WebSocket server listening on port 8081")

let wsConnection: any = null
let audioConnection: any = null

// Audio format parameters for 8000 Hz audio (16-bit PCM, mono).
const sampleRate = 8000 // samples per second
const bytesPerSample = 2 // 16-bit PCM = 2 bytes per sample
const channels = 1 // mono audio

// Set the duration for each smaller chunk that will be sent to AudioSocket.
const chunkDurationMs = 20 // 20 ms per chunk

// Calculate bytes per chunk based on the audio format and duration.
const bytesPerChunk = (sampleRate * bytesPerSample * channels * chunkDurationMs) / 1000 // 320 bytes

wss.on("connection", (ws, req) => {
  wsConnection = ws
  console.log("WebSocket connected from:", req.socket.remoteAddress)

  ws.on("message", (data: Buffer) => {
    console.log("Received synthesized audio packet from WS, length:", data.length)

    // Instead of forwarding the entire packet immediately,
    // we split it into smaller timed chunks.
    let offset = 0
    let chunkIndex = 0

    while (offset < data.length) {
      const end = Math.min(offset + bytesPerChunk, data.length)
      const chunk = data.slice(offset, end)

      // Schedule writes to the AudioSocket spaced out by chunkDurationMs.
      setTimeout(() => {
        if (audioConnection) {
          audioConnection.write(chunk)
          console.log(`Wrote chunk ${chunkIndex + 1} (offset: ${offset} to ${end})`)
        }
      }, chunkIndex * chunkDurationMs)

      offset = end
      chunkIndex++
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

audioSocket.onConnection((req, res) => {
  audioConnection = res
  console.log("AudioSocket connected, session ref:", req.ref)

  res.onError((err) => console.error("AudioSocket error:", err))

  res.onClose(() => {
    console.log("AudioSocket closed")
    if (wsConnection) {
      wsConnection.close()
    }
    wsConnection = null
    audioConnection = null
  })

  // Optional: Forward any audio received from AudioSocket to the WebSocket.
  res.onData((data: Buffer) => {
    console.log("AudioSocket data received, length:", data?.length)
    if (wsConnection && wsConnection.readyState === wsConnection.OPEN) {
      wsConnection.send(data, { binary: true })
    }
  })
})

audioSocket.listen(9999, () => {
  console.log("AudioSocket server listening on port 9999")
})
