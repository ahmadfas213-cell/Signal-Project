import express from "express"
import http from "http"
import cors from "cors"
import { WebSocketServer } from "ws"

const PORT = 3000

const app = express()
const server = http.createServer(app)

app.use(cors())
app.use(express.json())

const nodeSeed = [
  {
    id: "client",
    name: "Client",
    type: "client",
    baseLatency: 32,
    baseLoss: 0.12,
    uptime: 99.98,
  },
  {
    id: "router",
    name: "Router",
    type: "router",
    baseLatency: 18,
    baseLoss: 0.08,
    uptime: 99.99,
  },
  {
    id: "cdn",
    name: "CDN",
    type: "cdn",
    baseLatency: 32,
    baseLoss: 0.1,
    uptime: 99.97,
  },
  {
    id: "api",
    name: "API Server",
    type: "server",
    baseLatency: 42,
    baseLoss: 0.24,
    uptime: 99.91,
  },
  {
    id: "database",
    name: "Database",
    type: "database",
    baseLatency: 68,
    baseLoss: 0.35,
    uptime: 99.72,
  },
  {
    id: "cache",
    name: "Cache",
    type: "cache",
    baseLatency: 26,
    baseLoss: 0.1,
    uptime: 99.96,
  },
  {
    id: "backup",
    name: "Backup DB",
    type: "backup",
    baseLatency: 68,
    baseLoss: 0.32,
    uptime: 99.82,
  },
  {
    id: "monitor",
    name: "Monitoring",
    type: "monitor",
    baseLatency: 12,
    baseLoss: 0.03,
    uptime: 99.99,
  },
  {
    id: "mobile",
    name: "User Mobile",
    type: "mobile",
    baseLatency: 45,
    baseLoss: 0.2,
    uptime: 99.9,
  },
]

const runtime = new Map(
  nodeSeed.map((node) => [
    node.id,
    {
      latency: node.baseLatency,
      packetLoss: node.baseLoss,
      uptime: node.uptime,
      status: "online",
    },
  ]),
)

let traffic = 1284

const connections = [
  ["client", "router"],
  ["client", "cdn"],
  ["client", "mobile"],
  ["router", "cdn"],
  ["router", "api"],
  ["router", "mobile"],
  ["router", "monitor"],
  ["api", "database"],
  ["api", "cache"],
  ["database", "backup"],
  ["cache", "backup"],
]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function updateNode(node, now) {
  const current = runtime.get(node.id)

  const wave =
    Math.sin(now / 4200 + node.baseLatency) * 5

  const jitter =
    (Math.random() - 0.5) * 10

  const targetLatency =
    node.baseLatency + wave + jitter

  const targetLoss = Math.max(
    0,
    node.baseLoss +
      Math.sin(now / 5000 + node.baseLoss) * 0.05 +
      (Math.random() - 0.5) * 0.08,
  )

  current.latency = Math.round(
    clamp(
      current.latency +
        (targetLatency - current.latency) * 0.35,
      5,
      180,
    ),
  )

  current.packetLoss = Number(
    clamp(
      current.packetLoss +
        (targetLoss - current.packetLoss) * 0.3,
      0,
      5,
    ).toFixed(2),
  )

  if (Math.random() < 0.012) {
    current.latency += Math.floor(
      25 + Math.random() * 45,
    )
  }

  if (Math.random() < 0.006) {
    current.packetLoss = Number(
      clamp(
        current.packetLoss +
          0.6 +
          Math.random() * 0.8,
        0,
        5,
      ).toFixed(2),
    )
  }

  if (
    current.latency >= 100 ||
    current.packetLoss >= 1.5
  ) {
    current.status = "critical"
  } else if (
    current.latency >= 75 ||
    current.packetLoss >= 0.8
  ) {
    current.status = "warning"
  } else {
    current.status = "online"
  }

  current.uptime = Number(
    clamp(
      current.uptime +
        (Math.random() - 0.5) * 0.006,
      97.5,
      99.99,
    ).toFixed(2),
  )

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    latency: current.latency,
    packetLoss: current.packetLoss,
    status: current.status,
    uptime: current.uptime,
  }
}

function buildNetworkState() {
  const now = Date.now()

  const nodeData = nodeSeed.map((node) =>
    updateNode(node, now),
  )

  const latency = Math.round(
    nodeData.reduce(
      (sum, node) => sum + node.latency,
      0,
    ) / nodeData.length,
  )

  const packetLoss = Number(
    (
      nodeData.reduce(
        (sum, node) => sum + node.packetLoss,
        0,
      ) / nodeData.length
    ).toFixed(2),
  )

  const trafficTarget =
    1350 +
    Math.sin(now / 5500) * 420 +
    Math.sin(now / 1800) * 110

  traffic = Math.round(
    clamp(
      traffic +
        (trafficTarget - traffic) * 0.24 +
        (Math.random() - 0.5) * 45,
      500,
      2400,
    ),
  )

  return {
    timestamp: new Date().toISOString(),
    latency,
    traffic,
    packetLoss,
    nodes: nodeData.length,
    connections: connections.length,
    nodeData,
  }
}

let networkState = buildNetworkState()

app.get("/", (req, res) => {
  res.json({
    service: "SIGNAL",
    status: "online",
    websocket: `ws://localhost:${PORT}`,
    endpoints: [
      "/api/health",
      "/api/network",
    ],
  })
})

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    server: "SIGNAL",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

app.get("/api/network", (req, res) => {
  res.json(networkState)
})

const wss = new WebSocketServer({
  server,
})

wss.on("connection", (socket) => {
  console.log("SIGNAL client connected")

  socket.send(
    JSON.stringify({
      type: "network:update",
      data: networkState,
    }),
  )

  socket.on("close", () => {
    console.log("SIGNAL client disconnected")
  })

  socket.on("error", (error) => {
    console.error(
      "SIGNAL WebSocket error:",
      error.message,
    )
  })
})

setInterval(() => {
  networkState = buildNetworkState()

  const message = JSON.stringify({
    type: "network:update",
    data: networkState,
  })

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message)
    }
  })
}, 1000)

server.listen(PORT, () => {
  console.log(
    `SIGNAL backend running on http://localhost:${PORT}`,
  )

  console.log(
    `WebSocket running on ws://localhost:${PORT}`,
  )
})