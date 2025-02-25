export interface AudioBridgeOptions {
  wsPort: number
  udpHost: string
  writeFilePath?: string
  swap16?: boolean
  bufferSize?: number
}

export interface AudioData {
  buffer: Buffer
  sessionId?: string
}

export interface MessageControl {
  type: string
  sessionId?: string
  [key: string]: any
}
