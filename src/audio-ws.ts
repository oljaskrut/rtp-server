// src/audioWebSocketServer.ts

import WebSocket, { WebSocketServer } from "ws"
import http from "http"
import { RtpTcpServer } from "./rtp-server"

export class AudioWebSocketServer {
  private wss: WebSocketServer
  private httpServer: http.Server
  private tcpServer: RtpTcpServer

  constructor(wsPort: number, udpListen: string) {
    // Создаём HTTP-сервер для работы с WebSocket
    this.httpServer = http.createServer()
    this.wss = new WebSocketServer({ server: this.httpServer })

    // Обрабатываем новое WebSocket-соединение
    this.wss.on("connection", (socket: WebSocket, req) => {
      console.log(`Новое WS-соединение от ${req.socket.remoteAddress}`)
      // Обработка входящих сообщений от клиента
      socket.on("message", (message: WebSocket.Data) => {
        this.tcpServer.emit("audio_input", message)
      })
    })

    this.httpServer.listen(wsPort, () => {
      console.log(`WebSocket сервер запущен на порту ${wsPort}`)
    })

    // Создаём UDP сервер для приёма RTP-аудио
    this.tcpServer = new RtpTcpServer(udpListen)

    // При получении аудио-чанка по UDP – рассылаем его всем подключённым WS клиентам
    this.tcpServer.on("audio_output", (data: Buffer) => {
      this.broadcast(data)
    })
  }

  // Рассылка данных всем активным WebSocket-клиентам
  private broadcast(data: Buffer): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    })
  }

  public close(): void {
    this.wss.close()
    this.httpServer.close()
    this.tcpServer.close()
  }
}
