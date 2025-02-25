import { AudioSocket } from "@fonoster/streams"
import { WebSocketServer } from "ws"

const audioSocket = new AudioSocket()

const wss = new WebSocketServer({ port: 8081 })

wss.on("listening", () => console.log("WebSocket server listening on port 8081"))

wss.on("connection", (ws, req) => {
  console.log("new connection from:", req.socket.remoteAddress)

  audioSocket.onConnection(async (req, res) => {
    console.log("new connection from:", req.ref)

    res.onError((e) => console.log("AudioSocket error:", e))
    res.onClose(() => console.log("AudioSocket closed"))

    res.onData((data) => {
      console.log("AudioSocket data:", data?.length, data?.slice(0,8))
      ws.send(data)
    })

    ws.on("message", (data: Buffer) => {
      res.write(data)
    })
  })
})

audioSocket.listen(9999, () => {
  console.log("server listening on port 9999")
})
