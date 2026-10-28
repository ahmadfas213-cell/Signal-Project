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
const targets = [
  { id: "cloudflare", name: "Cloudflare", url: "https://www.cloudflare.com/cdn-cgi/trace" },
  { id: "google", name: "Google", url: "https://www.google.com/generate_204" },
  { id: "github", name: "GitHub", url: "https://github.com/robots.txt" },
  { id: "microsoft", name: "Microsoft", url: "https://www.microsoft.com/robots.txt" },
]
const nodeState = new Map(nodes.map((node) => [node.id, {
  latency: node.baseLatency, packetLoss: node.baseLoss, uptime: 99.6, status: "online",
}]))
let traffic = 1280
let probes = targets.map((target) => ({ ...target, latency: null, status: "pending", checkedAt: null, error: null }))
let lastProbeAt = 0
let probeBusy = false

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)) }
function nextValue(current, target, amount) { return current + (target - current) * amount }

async function probeTarget(target) {
  const started = performance.now()
  try {
    const response = await fetch(target.url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(4500),
      headers: { "user-agent": "SIGNAL-Network-Monitor/1.0" },
    })
    await response.body?.cancel()
    return {
      ...target,
      latency: Math.round(performance.now() - started),
      status: response.ok || response.status < 500 ? "online" : "warning",
      httpStatus: response.status,
      checkedAt: new Date().toISOString(),
      error: null,
    }
  } catch (error) {
    return {
      ...target,
      latency: null,
      status: "offline",
      httpStatus: null,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Probe failed",
    }
  }
}

async function refreshProbes() {
  if (probeBusy) return
  probeBusy = true
  try {
    probes = await Promise.all(targets.map(probeTarget))
    lastProbeAt = Date.now()
  } finally {
    probeBusy = false
  }
}

function updateDemoNode(node) {
  const current = nodeState.get(node.id)
  const latencyTarget = node.baseLatency + Math.sin(Date.now() / 4200 + node.baseLatency) * 8 + (Math.random() - 0.5) * 18
  const lossTarget = Math.max(0, node.baseLoss + (Math.random() - 0.5) * 0.35)
  current.latency = Math.round(clamp(nextValue(current.latency, latencyTarget, 0.34), 5, 180))
  current.packetLoss = Number(clamp(nextValue(current.packetLoss, lossTarget, 0.30), 0, 5).toFixed(2))
  if (Math.random() < 0.018) current.latency += Math.floor(25 + Math.random() * 45)
  if (Math.random() < 0.01) current.packetLoss = Number(clamp(current.packetLoss + 0.7 + Math.random() * 0.9, 0, 5).toFixed(2))
  current.status = current.latency >= 100 || current.packetLoss >= 1.5 ? "critical" : current.latency >= 75 || current.packetLoss >= 0.8 ? "warning" : "online"
  current.uptime = Number(clamp(current.uptime + (Math.random() - 0.5) * 0.015, 97.8, 99.99).toFixed(2))
  return { ...node, ...current }
}

function networkData() {
  const nodeData = nodes.map(updateDemoNode)
  const successful = probes.filter((probe) => probe.status === "online" && Number.isFinite(probe.latency))
  const latency = successful.length ? Math.round(successful.reduce((sum, probe) => sum + probe.latency, 0) / successful.length) : null
  const probesReady = probes.length > 0 && probes.every((probe) => probe.status !== "pending")
  const packetLoss = probesReady ? Number(((probes.length - successful.length) / probes.length * 100).toFixed(2)) : null
  const trafficTarget = 1350 + Math.sin(Date.now() / 5500) * 420 + (Math.random() - 0.5) * 220
  traffic = Math.round(clamp(nextValue(traffic, trafficTarget, 0.24), 500, 2400))
  return {
    timestamp: new Date().toISOString(),
    latency,
    traffic,
    packetLoss,
    nodes: nodeData.length,
    connections: 11,
    nodeData,
    probes,
    source: "live-http-probes",
    topologySource: "simulated",
    probeCheckedAt: lastProbeAt ? new Date(lastProbeAt).toISOString() : null,
  }
}

let globalProbeCache = { fetchedAt: 0, results: [], count: 0, error: null }
let globalProbeBusy = false

async function refreshGlobalProbes() {
  if (globalProbeBusy || Date.now() - globalProbeCache.fetchedAt < 300000) return
  globalProbeBusy = true
  try {
    const response = await fetch("https://atlas.ripe.net/api/v2/probes/?status=1&is_public=true&limit=500", {
      headers: { accept: "application/json", "user-agent": "SIGNAL-Global-Network-Map/1.0" },
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) throw new Error(`RIPE Atlas returned HTTP ${response.status}`)
    const payload = await response.json()
    const results = (payload.results || []).map((probe) => {
      const coordinates = probe.geometry?.coordinates
      if (!Array.isArray(coordinates) || coordinates.length < 2) return null
      const longitude = Number(coordinates[0])
      const latitude = Number(coordinates[1])
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
      return {
        id: probe.id,
        country: probe.country_code || "Unknown",
        latitude,
        longitude,
        asn: probe.asn_v4 || probe.asn_v6 || null,
        status: probe.status?.name || "Connected",
        statusSince: probe.status_since || null,
      }
    }).filter(Boolean)
    globalProbeCache = { fetchedAt: Date.now(), results, count: Number(payload.count || results.length), error: null }
  } catch (error) {
    globalProbeCache = { ...globalProbeCache, error: error instanceof Error ? error.message : "Global probe data unavailable" }
  } finally {
    globalProbeBusy = false
  }
}

void refreshGlobalProbes()

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return }
  if (req.url === "/" || req.url === "/api/health") {
    res.writeHead(200)
    res.end(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString(), uptime: process.uptime(), server: "SIGNAL", websocket: "enabled", mode: "live-http-probes-plus-simulated-topology" }))
    return
  }
  if (req.url === "/api/global-probes") {\n    if (!globalProbeCache.results.length) void refreshGlobalProbes()\n    res.writeHead(globalProbeCache.results.length ? 200 : 503)\n    res.end(JSON.stringify({ source: "RIPE Atlas public probe registry", fetchedAt: globalProbeCache.fetchedAt ? new Date(globalProbeCache.fetchedAt).toISOString() : null, count: globalProbeCache.count, returned: globalProbeCache.results.length, results: globalProbeCache.results, error: globalProbeCache.error, note: "Probe locations and registry status are real; links and per-probe latency are not inferred from this endpoint." }))\n    return\n  }\n  if (req.url === "/api/network" || req.url === "/api/probes") {
    const data = networkData()
    res.writeHead(200)
    res.end(JSON.stringify(req.url === "/api/probes" ? { timestamp: data.timestamp, latency: data.latency, packetLoss: data.packetLoss, probes: data.probes, source: data.source } : data))
    return
  }
  res.writeHead(404)
  res.end(JSON.stringify({ error: "Endpoint not found" }))
})

const websocketServer = new WebSocketServer({ server })
websocketServer.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "network:update", data: networkData() }))
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString())
      if (message.type === "client:ping" && Number.isFinite(message.sentAt)) {
        socket.send(JSON.stringify({ type: "client:pong", sentAt: message.sentAt, serverTime: Date.now() }))
      }
    } catch {}
  })
})
const broadcast = () => {
  const message = JSON.stringify({ type: "network:update", data: networkData() })
  for (const socket of websocketServer.clients) if (socket.readyState === WebSocket.OPEN) socket.send(message)
}
const telemetryTimer = setInterval(broadcast, 1000)
const probeTimer = setInterval(() => { void refreshProbes() }, 10000)
void refreshProbes()
server.listen(PORT, "0.0.0.0", () => console.log(`SIGNAL server listening on port ${PORT}`))
function shutdown() {
  clearInterval(telemetryTimer)
  clearInterval(probeTimer)
  websocketServer.close()
  server.close(() => process.exit(0))
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
