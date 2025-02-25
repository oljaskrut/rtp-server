import WebSocket, { WebSocketServer } from "ws"
import http from "http"
import { EventEmitter } from "events"
import { AudioConverter } from "../audio/audio-converter"
import { BufferAccumulator } from "../audio/buffer-accumulator"

export interface WsClient {
  socket: WebSocket
  sessionId: string
  accumulator: BufferAccumulator
  ip: string
}

export interface WsServerOptions {
  port: number
  bufferSize?: number
}

export class AudioWebSocketServer extends EventEmitter {
  private wss: WebSocketServer
  private httpServer: http.Server
  private clients: Map<WebSocket, WsClient>
  private bufferSize: number

  constructor(options: WsServerOptions) {
    super()
    const { port, bufferSize = 4096 } = options
    this.bufferSize = bufferSize
    this.clients = new Map()

    // Create HTTP server
    this.httpServer = http.createServer()

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.httpServer })

    // Handle new connections
    this.wss.on("connection", (socket: WebSocket, req: http.IncomingMessage) => {
      const ip = req.socket.remoteAddress || "unknown"
      console.log(`New WebSocket connection from ${ip}`)

      // Extract session ID from URL query params or headers
      const url = new URL(req.url || "", `http://${req.headers.host}`)
      const sessionId =
        url.searchParams.get("sessionId") ||
        req.headers["session-id"]?.toString() ||
        `ws-${Date.now()}-${Math.floor(Math.random() * 1000)}`

      // Create buffer accumulator for this client
      const accumulator = new BufferAccumulator(this.bufferSize, (buffer) => {
        // Convert PCM 16000 to SLIN16 for outgoing RTP
        const convertedBuffer = AudioConverter.pcm16000ToSlin16(buffer)
        this.emit("outgoing-audio", convertedBuffer, sessionId)
      })

      // Store client information
      const client: WsClient = {
        socket,
        sessionId,
        accumulator,
        ip,
      }
      this.clients.set(socket, client)

      // Emit session created event
      this.emit("session", {
        id: sessionId,
        wsEndpoint: ip,
        type: "connected",
      })

      // Handle incoming messages
      socket.on("message", (message: WebSocket.Data) => {
        if (message instanceof Buffer) {
          // Accumulate and process audio data
          client.accumulator.add(message)
        } else if (typeof message === "string") {
          try {
            // Handle JSON control messages
            const control = JSON.parse(message.toString())
            this.emit("control", control, client.sessionId)
          } catch (e) {
            console.error("Invalid JSON message:", e)
          }
        }
      })

      // Handle disconnection
      socket.on("close", () => {
        const client = this.clients.get(socket)
        if (client) {
          this.emit("session", {
            id: client.sessionId,
            wsEndpoint: client.ip,
            type: "disconnected",
          })
          this.clients.delete(socket)
        }
      })

      // Handle errors
      socket.on("error", (err) => {
        console.error(`WebSocket error: ${err.message}`)
        this.emit("error", err)
      })
    })

    // Start listening on the specified port
    this.httpServer.listen(port, () => {
      console.log(`WebSocket server running on port ${port}`)
      this.emit("listening", { port })
    })
  }

  // Send audio data to a specific session
  public sendToSession(sessionId: string, data: Buffer): void {
    for (const client of this.clients.values()) {
      if (client.sessionId === sessionId && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(data)
        return
      }
    }
  }

  // Broadcast audio to all connected clients
  public broadcast(data: Buffer, excludeSessionId?: string): void {
    for (const client of this.clients.values()) {
      if (excludeSessionId && client.sessionId === excludeSessionId) {
        continue
      }

      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(data)
      }
    }
  }

  // Get client by session ID
  public getClientBySessionId(sessionId: string): WsClient | undefined {
    for (const client of this.clients.values()) {
      if (client.sessionId === sessionId) {
        return client
      }
    }
    return undefined
  }

  // Close the server
  public close(): void {
    this.wss.close()
    this.httpServer.close()
    this.clients.clear()
  }
}
