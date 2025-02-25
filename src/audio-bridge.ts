// src/audio-bridge.ts
import { EventEmitter } from "events"
import { RtpUdpServer } from "./audio/rtp-server"
import { AudioWebSocketServer } from "./websocket/ws-server"
import { SessionManager } from "./session/session-manager"
import type { AudioBridgeOptions } from "./types"

export class AudioBridge extends EventEmitter {
  private rtpServer: RtpUdpServer
  private wsServer: AudioWebSocketServer
  private sessionManager: SessionManager

  constructor(options: AudioBridgeOptions) {
    super()
    const { wsPort, udpHost, bufferSize = 4096 } = options

    // Create session manager
    this.sessionManager = new SessionManager()

    // Create RTP UDP server
    this.rtpServer = new RtpUdpServer({
      host: udpHost,
      bufferSize,
    })

    // Create WebSocket server
    this.wsServer = new AudioWebSocketServer({
      port: wsPort,
      bufferSize,
    })

    // Handle RTP endpoint detection
    this.rtpServer.on("rtp-endpoint", (endpoint: string, buffer: Buffer) => {
      // Look for existing session with this endpoint
      let session = this.sessionManager.getSessionByRtpEndpoint(endpoint)

      // Create new session if none exists
      if (!session) {
        const sessionId = `rtp-default`
        session = this.sessionManager.createSession(sessionId, endpoint)
        console.log(`Created new session ${sessionId} for RTP endpoint ${endpoint}`)
      }

      // Get the session accumulator
      const accumulator = this.rtpServer.getSessionAccumulator(session.id)
      accumulator.add(buffer)
    })

    // Handle incoming audio from RTP server (already converted to PCM 16000)
    this.rtpServer.on("data", (data: Buffer, sessionId?: string) => {
      if (sessionId) {
        // Get session info
        const session = this.sessionManager.getSession(sessionId)
        if (session) {
          // Send to corresponding WebSocket client if exists
          if (session.wsEndpoint) {
            this.wsServer.sendToSession(sessionId, data)
          } else {
            // No WebSocket client, broadcast to all
            this.wsServer.broadcast(data, sessionId)
          }
        }
      } else {
        // No session, broadcast to all WebSocket clients
        this.wsServer.broadcast(data)
      }
    })

    // Handle session events from WebSocket server
    this.wsServer.on("session", (event: any) => {
      if (event.type === "connected") {
        // Find or create session
        let session = this.sessionManager.getSession(event.id)
        if (!session) {
          session = this.sessionManager.createSession(event.id, undefined, event.wsEndpoint)
        } else {
          this.sessionManager.updateSession(event.id, { wsEndpoint: event.wsEndpoint })
        }
      } else if (event.type === "disconnected") {
        // Update session or remove if no RTP endpoint
        const session = this.sessionManager.getSession(event.id)
        if (session) {
          if (!session.rtpEndpoint) {
            this.sessionManager.removeSession(event.id)
          } else {
            this.sessionManager.updateSession(event.id, { wsEndpoint: undefined })
          }
        }
      }
    })

    // Handle outgoing audio from WebSocket clients to RTP
    this.wsServer.on("outgoing-audio", (data: Buffer, sessionId: string) => {
      const session = this.sessionManager.getSession(sessionId)
      if (session && session.rtpEndpoint) {
        const [address, portStr] = session.rtpEndpoint.split(":")
        const port = parseInt(portStr, 10)
        this.rtpServer.sendToEndpoint(data, address, port)
      }
    })

    // Handle control messages
    this.wsServer.on("control", (control: any, sessionId: string) => {
      this.emit("control", { ...control, sessionId })
    })
  }

  // Get all active sessions
  public getSessions() {
    return this.sessionManager.getAllSessions()
  }

  // Close all servers and resources
  public close(): void {
    this.rtpServer.close()
    this.wsServer.close()
  }
}
