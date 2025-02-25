import { AudioSocket } from "@fonoster/streams"
import { WebSocketServer } from "ws"

const audioSocket = new AudioSocket()
const wss = new WebSocketServer({ port: 8081 })

console.log("WebSocket server listening on port 8081")

let wsConnection: any = null
let audioConnection: any = null

// Maximum message size (based on your error)
const MAX_CHUNK_SIZE = 30000

// Debug flag - set to true to see more details
const DEBUG = true

// Splits buffer into smaller chunks
function splitBuffer(buffer: Buffer): Buffer[] {
  const chunks: Buffer[] = []
  let offset = 0
  
  while (offset < buffer.length) {
    const chunkSize = Math.min(MAX_CHUNK_SIZE, buffer.length - offset)
    chunks.push(buffer.slice(offset, offset + chunkSize))
    offset += chunkSize
  }
  
  return chunks
}

wss.on("connection", (ws, req) => {
  wsConnection = ws
  console.log("WebSocket connected from:", req.socket.remoteAddress)

  ws.on("message", (data: Buffer) => {
    if (DEBUG) console.log(`WebSocket message received: ${data.length} bytes`)
    
    if (!audioConnection) {
      console.warn("No AudioSocket connection available")
      return
    }
    
    try {
      // For large chunks, split them
      if (data.length > MAX_CHUNK_SIZE) {
        const chunks = splitBuffer(data)
        if (DEBUG) console.log(`Split large chunk into ${chunks.length} pieces`)
        
        // Send each chunk with a small delay
        chunks.forEach((chunk, index) => {
          setTimeout(() => {
            try {
              if (audioConnection) {
                if (DEBUG) console.log(`Sending chunk ${index+1}/${chunks.length}: ${chunk.length} bytes`)
                audioConnection.write(chunk)
              }
            } catch (err) {
              console.error(`Error sending chunk ${index+1}:`, err)
            }
          }, index * 50) // 50ms between chunks
        })
      } else {
        // Send small chunk directly
        if (DEBUG) console.log(`Sending chunk directly: ${data.length} bytes`)
        audioConnection.write(data)
      }
    } catch (err) {
      console.error("Error processing audio chunk:", err)
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

  res.onData((data: Buffer) => {
    if (wsConnection && wsConnection.readyState === wsConnection.OPEN) {
      wsConnection.send(data)
    }
  })
})

audioSocket.listen(9999, () => {
  console.log("AudioSocket server listening on port 9999")
})