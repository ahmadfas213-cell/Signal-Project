import http from "http"
import { WebSocketServer, WebSocket } from "ws"

const PORT = Number(process.env.PORT || 3000)

const nodes = [
  { id: "client", name: "Client", type: "client", baseLatency: 24, baseLoss: 0.08 },
  { id: "router", name: "Router", type: "router", baseLatency: 18, baseLoss: 0.04 },
  { id: "cdn", name: "CDN", type: "cdn", baseLatency: 31, baseLoss: 0.06 },
  { id: "api", name: "API Server", type: "server", baseLatency: 42, baseLoss: 0.10 },
  { id: "database", name: "Database", type: "database", baseLatency: 48, baseLoss: 0.12 },
  { id: "cache", name: "Cache", type: "cache", baseLatency: 20, baseLoss: 0.04 },
  { id: "backup", name: "Backup DB", type: "backup", baseLatency: 72, baseLoss: 0.18 },
  { id: "monitor", name: "Monitoring", type: "monitor", baseLatency: 27, baseLoss: 0.05 },
  { id: "mobile", name: "User Mobile", type: "mobile", baseLatency: 55, baseLoss: 0.20 },
]

const state = new Map(
  nodes.map((node) => [
    node.id,
    {
      latency: node.baseLatency,
      packetLoss: node.baseLoss,
      uptime: 99.6,
      status: "online",
    },
  ]),
)

let traffic = 1280

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function nextValue(current, target, amount) {
  return current + (target - current) * amount
}

function updateNode(node) {
  const current = state.get(node.id)
  const latencyTarget =
    node.baseLatency +
    Math.sin(Date.now() / 4200 + node.baseLatency) * 8 +
    (Math.random() - 0.5) * 18
  const lossTarget = Math.max(0, node.baseLoss + (Math.random() - 0.5) * 0.35)

  current.latency = Math.round(clamp(nextValue(current.latency, latencyTarget, 0.34), 5, 180))
  current.packetLoss = Number(clamp(nextValue(current.packetLoss, lossTarget, 0.30), 0, 5).toFixed(2))

  if (Math.random() < 0.018) current.latency += Math.floor(25 + Math.random() * 45)

  if (Math.random() < 0.01) {
    current.packetLoss = Number(clamp(current.packetLoss + 0.7 + Math.random() * 0.9, 0, 5).toFixed(2))
  }

  if (current.latency >= 100 || current.packetLoss >= 1.5) {
    current.status = "critical"
  } else if (current.latency >= 75 || current.packetLoss >= 0.8) {
    current.status = "warning"
  } else {
    current.status = "online"
  }

  current.uptime = Number(clamp(current.uptime + (Math.random() - 0.5) * 0.015, 97.8, 99.99).toFixed(2))

  return {
    ...node,
    latency: current.latency,
    packetLoss: current.packetLoss,
    status: current.status,
    uptime: current.uptime,
  }
}

function networkData() {
  const nodeData = nodes.map(updateNode)
  const avgLatency = Math.round(nodeData.reduce((sum, node) => sum + node.latency, 0) / nodeData.length)
  const avgPacketLoss = Number((nodeData.reduce((sum, node) => sum + node.packetLoss, 0) / nodeData.length).toFixed(2))
  const trafficTarget = 1350 + Math.sin(Date.now() / 5500) * 420 + (Math.random() - 0.5) * 220

  traffic = Math.round(clamp(nextValue(traffic, trafficTarget, 0.24), 500, 2400))

  return {
    timestamp: new Date().toISOString(),
    latency: avgLatency,
    traffic,
    packetLoss: avgPacketLoss,
    nodes: nodeData.length,
    connections: 11,
    nodeData,
  }
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Content-Type", "application/json; charset=utf-8")

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === "/" || req.url === "/api/health") {
    res.writeHead(200)
    res.end(JSON.stringify({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      server: "SIGNAL",
      websocket: "enabled",
      mode: "simulated-telemetry",
    }))
    return
  }

  if (req.url === "/api/network") {
    res.writeHead(200)
    res.end(JSON.stringify(networkData()))
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: "Endpoint not found" }))
})

const websocketServer = new WebSocketServer({ server })

websocketServer.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "network:update", data: networkData() }))
})

const broadcast = () => {
  const message = JSON.stringify({ type: "network:update", data: networkData() })
  for (const socket of websocketServer.clients) {
    if (socket.readyState === WebSocket.OPEN) socket.send(message)
  }
}

const telemetryTimer = setInterval(broadcast, 1000)

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SIGNAL server listening on port ${PORT}`)
})

function shutdown() {
  clearInterval(telemetryTimer)
  websocketServer.close()
  server.close(() => process.exit(0))
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
