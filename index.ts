import { main } from "./src/main"

import { AudioWebSocketServer } from "./src/audio-ws"

// Используйте переменные окружения или задайте значения по умолчанию
const WS_PORT: number = 8081
const UDP_LISTEN: string = "0.0.0.0:9999"

const server = new AudioWebSocketServer(WS_PORT, UDP_LISTEN)

process.on("SIGINT", () => {
  console.log("Завершение работы...")
  server.close()
  process.exit()
})
