import { EventEmitter } from "events"

export interface Session {
  id: string
  rtpEndpoint?: string
  wsEndpoint?: string
  lastActive: Date
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session>

  constructor() {
    super()
    this.sessions = new Map()
  }

  createSession(id: string, rtpEndpoint?: string, wsEndpoint?: string): Session {
    const session: Session = {
      id,
      rtpEndpoint,
      wsEndpoint,
      lastActive: new Date(),
    }

    this.sessions.set(id, session)
    this.emit("sessionCreated", session)
    return session
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  updateSession(id: string, updates: Partial<Session>): Session | undefined {
    const session = this.sessions.get(id)
    if (!session) return undefined

    Object.assign(session, updates, { lastActive: new Date() })
    this.sessions.set(id, session)
    this.emit("sessionUpdated", session)
    return session
  }

  removeSession(id: string): boolean {
    const session = this.sessions.get(id)
    if (session) {
      this.emit("sessionClosed", session)
      return this.sessions.delete(id)
    }
    return false
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values())
  }

  getSessionByRtpEndpoint(endpoint: string): Session | undefined {
    return Array.from(this.sessions.values()).find((s) => s.rtpEndpoint === endpoint)
  }

  getSessionByWsEndpoint(endpoint: string): Session | undefined {
    return Array.from(this.sessions.values()).find((s) => s.wsEndpoint === endpoint)
  }
}
