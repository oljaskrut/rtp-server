// src/index.ts

import { AudioWebSocketServer } from "./src/audio-ws"

// Используйте переменные окружения или задайте значения по умолчанию
const WS_PORT: number = 8081
const UDP_LISTEN: string = "0.0.0.0:9999"
// Если хотите записывать аудио в файл, укажите путь, иначе оставьте пустой строкой
const WRITE_TO_FILE: string = "file.raw"
// Если формат аудио требует преобразования байтов, установите swap16 в true
const SWAP16 = false

const server = new AudioWebSocketServer(WS_PORT, UDP_LISTEN, WRITE_TO_FILE, SWAP16)

process.on("SIGINT", () => {
  console.log("Завершение работы...")
  server.close()
  process.exit()
})
