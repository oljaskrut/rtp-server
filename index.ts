import { AudioSocket } from "@fonoster/streams"
import { WebSocketServer, WebSocket } from "ws"

// Configuration constants
const WEBSOCKET_PORT = 8081
const AUDIO_SOCKET_PORT = 9999
const LOG_INTERVAL = 5000 // Log stats every 5 seconds

// Session management
interface Session {
  sessionId: string
  wsConnection: WebSocket | null
  audioConnection: any
  wsToAudioPacketCount: number
  audioToWsPacketCount: number
  started: boolean
  lastActivity: number
}

// Create servers
const audioSocket = new AudioSocket()
const wss = new WebSocketServer({ port: WEBSOCKET_PORT })
const sessions = new Map<string, Session>()

console.log(`WebSocket server listening on port ${WEBSOCKET_PORT}`)

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
  // Extract session ID from URL query parameters
  const url = new URL(req.url || "", `http://${req.headers.host}`)
  const sessionId = url.searchParams.get("sessionId")

  if (!sessionId) {
    console.error("WebSocket connection attempt without sessionId")
    ws.close(1008, "Missing sessionId parameter")
    return
  }

  // Create or update session
  let session = sessions.get(sessionId)
  if (!session) {
    session = {
      sessionId,
      wsConnection: ws,
      audioConnection: null,
      wsToAudioPacketCount: 0,
      audioToWsPacketCount: 0,
      started: false,
      lastActivity: Date.now(),
    }
    sessions.set(sessionId, session)
    console.log(`New session created: ${sessionId}`)
  } else {
    session.wsConnection = ws
    session.lastActivity = Date.now()
    console.log(`WebSocket reconnected for session: ${sessionId}`)
  }

  console.log(`WebSocket connected for session: ${sessionId}`)

  ws.on("message", (data: Buffer) => {
    const session = sessions.get(sessionId)
    if (!session) return

    session.lastActivity = Date.now()

    if (session.audioConnection) {
      if (!session.started) {
        console.log(`Session ${sessionId} started streaming`)
        session.started = true
      }
      session.wsToAudioPacketCount++
      session.audioConnection.write(data)
    }
  })

  ws.on("close", () => {
    console.log(`WebSocket closed for session: ${sessionId}`)
    const session = sessions.get(sessionId)
    if (session) {
      session.wsConnection = null
      // Keep the session alive for a while in case WebSocket reconnects
      setTimeout(() => {
        const currentSession = sessions.get(sessionId)
        if (currentSession && !currentSession.wsConnection) {
          cleanupSession(sessionId)
        }
      }, 30000) // 30 seconds grace period
    }
  })
})

// Handle AudioSocket connections
audioSocket.onConnection(async (req, res) => {
  const sessionId = req.ref // Using the ref from AudioSocket as the session ID
  console.log(`AudioSocket connected, session ref: ${sessionId}`)

  // Create or update session
  let session = sessions.get(sessionId)
  if (!session) {
    session = {
      sessionId,
      wsConnection: null,
      audioConnection: res,
      wsToAudioPacketCount: 0,
      audioToWsPacketCount: 0,
      started: false,
      lastActivity: Date.now(),
    }
    sessions.set(sessionId, session)
    console.log(`New session created from AudioSocket: ${sessionId}`)
  } else {
    session.audioConnection = res
    session.lastActivity = Date.now()
    console.log(`AudioSocket connected for existing session: ${sessionId}`)
  }

  res.onError((err) => {
    console.error(`AudioSocket error for session ${sessionId}:`, err)
  })

  res.onClose(() => {
    console.log(`AudioSocket closed for session: ${sessionId}`)
    const session = sessions.get(sessionId)
    if (session) {
      session.audioConnection = null
      // Cleanup if WebSocket is also closed
      if (!session.wsConnection) {
        cleanupSession(sessionId)
      }
    }
  })

  res.onData((data: Buffer) => {
    const session = sessions.get(sessionId)
    if (!session) return

    session.lastActivity = Date.now()

    if (session.wsConnection && session.wsConnection.readyState === WebSocket.OPEN) {
      session.wsConnection.send(data)
      session.audioToWsPacketCount++
    }
  })
})

// Start AudioSocket server
audioSocket.listen(AUDIO_SOCKET_PORT, () => {
  console.log(`AudioSocket server listening on port ${AUDIO_SOCKET_PORT}`)
})

// Clean up a session and its resources
function cleanupSession(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return

  console.log(`Cleaning up session: ${sessionId}`)

  if (session.wsConnection) {
    try {
      session.wsConnection.close()
    } catch (err) {
      console.error(`Error closing WebSocket for session ${sessionId}:`, err)
    }
  }

  // AudioSocket connections are closed by Asterisk

  sessions.delete(sessionId)
  console.log(`Session removed: ${sessionId}`)
}

// Periodic logging of packet counts and session cleanup
setInterval(() => {
  // Log stats for active sessions
  console.log(`Active sessions: ${sessions.size}`)

  for (const [sessionId, session] of sessions.entries()) {
    // Only log active sessions
    if (session.started || session.wsToAudioPacketCount > 0 || session.audioToWsPacketCount > 0) {
      console.log(
        `Session ${sessionId} stats: to AS: ${session.wsToAudioPacketCount}, from AS: ${session.audioToWsPacketCount}`,
      )
    }

    // Reset counters
    if (session.wsToAudioPacketCount === 0 && session.started) {
      session.started = false
    }
    session.wsToAudioPacketCount = 0
    session.audioToWsPacketCount = 0

    // Check for inactive sessions (5 minutes without activity)
    const inactiveThreshold = 5 * 60 * 1000 // 5 minutes
    if (Date.now() - session.lastActivity > inactiveThreshold) {
      console.log(`Session ${sessionId} inactive for more than 5 minutes, cleaning up`)
      cleanupSession(sessionId)
    }
  }
}, LOG_INTERVAL)
