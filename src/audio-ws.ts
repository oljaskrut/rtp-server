// src/audioWebSocketServer.ts

import WebSocket, { WebSocketServer } from "ws"
import http from "http"
import { RtpUdpServer } from "./rtp-server"

export class AudioWebSocketServer {
  private wss: WebSocketServer
  private httpServer: http.Server
  private rtpServer: RtpUdpServer

  constructor(wsPort: number, udpListen: string, writeFilePath?: string, swap16 = false) {
    // Создаём HTTP-сервер для работы с WebSocket
    this.httpServer = http.createServer()
    this.wss = new WebSocketServer({ server: this.httpServer })

    // Обрабатываем новое WebSocket-соединение
    this.wss.on("connection", (socket: WebSocket, req) => {
      console.log(`Новое WS-соединение от ${req.socket.remoteAddress}`)
      // Обработка входящих сообщений от клиента
      socket.on("message", (message: WebSocket.Data) => {
        console.log("Получено сообщение от клиента:", message)
        // Например, можно эхо-отправить полученные данные обратно клиенту
        socket.send(message)
      })
    })

    this.httpServer.listen(wsPort, () => {
      console.log(`WebSocket сервер запущен на порту ${wsPort}`)
    })

    // Создаём UDP сервер для приёма RTP-аудио
    this.rtpServer = new RtpUdpServer(udpListen, swap16, writeFilePath)

    // При получении аудио-чанка по UDP – рассылаем его всем подключённым WS клиентам
    this.rtpServer.on("data", (data: Buffer) => {
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
    this.rtpServer.close()
  }
}
