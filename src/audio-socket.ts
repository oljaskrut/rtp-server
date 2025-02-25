import { AudioSocket } from "@fonoster/streams"
import { WebSocketServer } from "ws"

const audioSocket = new AudioSocket()
const wss = new WebSocketServer({ port: 8081 })

console.log("WebSocket server listening on port 8081")

let wsConnection: any = null
let audioConnection: any = null

wss.on("connection", (ws, req) => {
  wsConnection = ws
  console.log("WebSocket connected from:", req.socket.remoteAddress)

  ws.on("message", (data: Buffer) => {
    console.log("WebSocket message received, forwarding to AudioSocket;", "data length:", data?.length)
    if (audioConnection) {
      audioConnection.write(data)
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
  console.log("AudioSocket connected,", "session ref:", req.ref)

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
