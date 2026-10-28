import { useEffect, useMemo, useRef, useState } from "react"
import "./App.css"

type NodeType =
  | "client"
  | "router"
  | "cdn"
  | "server"
  | "database"
  | "cache"
  | "backup"
  | "monitor"
  | "mobile"

type NodeStatus = "online" | "warning" | "critical"

type NetworkNode = {
  id: string
  name: string
  location: string
  type: NodeType
  x: number
  y: number
}

type Runtime = {
  latency: number
  packetLoss: number
  uptime: number
  status: NodeStatus
}

type DeviceNetworkInfo = { effectiveType?: string; downlink?: number; rtt?: number; type?: string; saveData?: boolean }
type GlobalProbe = { id: number; country: string; latitude: number; longitude: number; asn: number | null; status: string }
type GlobalProbeResponse = { source: string; fetchedAt: string | null; count: number; returned: number; results: GlobalProbe[]; error: string | null; note: string }
type CustomEndpoint = { id: string; name: string; url: string; enabled: boolean; status: "pending" | "online" | "failed" | "blocked"; latency: number | null; checkedAt: string | null; error: string | null }
type HistorySample = { timestamp: string; latency: number | null; packetLoss: number | null; traffic: number; healthScore: number | null }

type NetworkData = {
  timestamp: string
  latency: number | null
  traffic: number
  packetLoss: number | null
  nodes: number
  connections: number
  probes?: Array<{ id: string; name: string; url: string; latency: number | null; status: string; checkedAt: string | null; error: string | null; httpStatus?: number | null }>
  source?: string
  topologySource?: string
  nodeData?: Array<{
    id: string
    latency: number
    packetLoss: number
    status: NodeStatus
    uptime: number
  }>
}

const nodes: NetworkNode[] = [
  { id: "client", name: "Client", location: "Jakarta", type: "client", x: 14, y: 47 },
  { id: "router", name: "Router", location: "ISP Jakarta", type: "router", x: 40, y: 44 },
  { id: "cdn", name: "CDN", location: "Cloudflare", type: "cdn", x: 35, y: 14 },
  { id: "api", name: "API Server", location: "Jakarta", type: "server", x: 67, y: 27 },
  { id: "database", name: "Database", location: "Jakarta", type: "database", x: 82, y: 52 },
  { id: "cache", name: "Cache", location: "Redis", type: "cache", x: 60, y: 64 },
  { id: "backup", name: "Backup DB", location: "Singapore", type: "backup", x: 71, y: 89 },
  { id: "monitor", name: "Monitoring", location: "Server", type: "monitor", x: 45, y: 82 },
  { id: "mobile", name: "User Mobile", location: "Jakarta", type: "mobile", x: 26, y: 82 },
]

const connections: [string, string][] = [
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

const initialRuntime: Record<string, Runtime> = {
  client: { latency: 32, packetLoss: 0.12, uptime: 99.98, status: "online" },
  router: { latency: 18, packetLoss: 0.08, uptime: 99.99, status: "online" },
  cdn: { latency: 32, packetLoss: 0.1, uptime: 99.97, status: "online" },
  api: { latency: 42, packetLoss: 0.24, uptime: 99.91, status: "online" },
  database: { latency: 98, packetLoss: 0.61, uptime: 99.72, status: "warning" },
  cache: { latency: 26, packetLoss: 0.1, uptime: 99.96, status: "online" },
  backup: { latency: 68, packetLoss: 0.32, uptime: 99.82, status: "warning" },
  monitor: { latency: 12, packetLoss: 0.03, uptime: 99.99, status: "online" },
  mobile: { latency: 45, packetLoss: 0.2, uptime: 99.9, status: "online" },
}

function icon(type: NodeType) {
  const icons: Record<NodeType, string> = {
    client: "▣",
    router: "◉",
    cdn: "☁",
    server: "▤",
    database: "◉",
    cache: "◆",
    backup: "◉",
    monitor: "⌁",
    mobile: "▯",
  }
  return icons[type]
}

function App() {
  const [network, setNetwork] = useState<NetworkData>({
    timestamp: new Date().toISOString(),
    latency: null,
    traffic: 1284,
    packetLoss: null,
    nodes: 9,
    connections: 11,
  })
  const [runtime, setRuntime] = useState<Record<string, Runtime>>(initialRuntime)
  const [selectedId, setSelectedId] = useState("api")
  const [activePage, setActivePage] = useState<"Overview" | "Nodes" | "Map" | "Incidents" | "History" | "Reports" | "Endpoints">("Overview")
  const [selectedTopology, setSelectedTopology] = useState("Production")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [diagnostic, setDiagnostic] = useState("No diagnostic running")
  const [tab, setTab] = useState<"Overview" | "Metrics" | "Logs" | "Alerts">("Overview")
  const [serverOnline, setServerOnline] = useState(false)
  const [clientRtt, setClientRtt] = useState<number | null>(null)
  const [deviceNetwork, setDeviceNetwork] = useState<DeviceNetworkInfo | null>(null)
  const [globalProbeData, setGlobalProbeData] = useState<GlobalProbeResponse | null>(null)
  const [globalProbeError, setGlobalProbeError] = useState<string | null>(null)
  const [globalCountryFilter, setGlobalCountryFilter] = useState("ALL")
  const [selectedGlobalProbe, setSelectedGlobalProbe] = useState<GlobalProbe | null>(null)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [incidentMode, setIncidentMode] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [layers, setLayers] = useState({
    nodes: true,
    connections: true,
    packets: true,
    traffic: true,
    geographical: false,
  })
  const [now, setNow] = useState(new Date())
  const [trafficHistory, setTrafficHistory] = useState<number[]>([1284])
  const [eventLog, setEventLog] = useState<Array<{ time: string; tone: string; text: string }>>([])
  const [alerts, setAlerts] = useState<Array<{ tone: string; text: string; time: string }>>(() => {
    try { return JSON.parse(localStorage.getItem("signal-alerts-v1") || "[]") } catch { return [] }
  })
  const [customEndpoints, setCustomEndpoints] = useState<CustomEndpoint[]>(() => {
    try { return JSON.parse(localStorage.getItem("signal-endpoints-v1") || "[]") } catch { return [] }
  })
  const [endpointName, setEndpointName] = useState("")
  const [endpointUrl, setEndpointUrl] = useState("")
  const [latencyThreshold, setLatencyThreshold] = useState(() => Number(localStorage.getItem("signal-latency-threshold") || 150))
  const [lossThreshold, setLossThreshold] = useState(() => Number(localStorage.getItem("signal-loss-threshold") || 5))
  const [historySamples, setHistorySamples] = useState<HistorySample[]>(() => {
    try { return JSON.parse(localStorage.getItem("signal-history-v1") || "[]") } catch { return [] }
  })
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const lastHistorySaved = useRef(0)
  const thresholdState = useRef({ latency: false, loss: false })

  const globalCountries = useMemo(() => [...new Set((globalProbeData?.results ?? []).map((probe) => probe.country))].filter((country) => country !== "Unknown").sort(), [globalProbeData])
  const globalVisibleProbes = useMemo(() => (globalProbeData?.results ?? []).filter((probe) => globalCountryFilter === "ALL" || probe.country === globalCountryFilter), [globalProbeData, globalCountryFilter])

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(clock)
  }, [])

  useEffect(() => {
    const configuredUrl = import.meta.env.VITE_SIGNAL_WS_URL
    const socketUrl = configuredUrl || (import.meta.env.DEV ? "ws://localhost:3000" : "")
    const apiBase = socketUrl ? socketUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "") : ""
    if (!apiBase) { setGlobalProbeError("Configure the public SIGNAL backend to load global probe data"); return }
    let disposed = false
    const load = async () => {
      try {
        const response = await fetch(`${apiBase}/api/global-probes`, { cache: "no-store" })
        const data = await response.json() as GlobalProbeResponse
        if (!response.ok) throw new Error(data.error || `Global probe API returned HTTP ${response.status}`)
        if (!disposed) { setGlobalProbeData(data); setGlobalProbeError(null) }
      } catch (error) {
        if (!disposed) setGlobalProbeError(error instanceof Error ? error.message : "Unable to load global probes")
      }
    }
    void load()
    const refresh = window.setInterval(load, 300000)
    return () => { disposed = true; window.clearInterval(refresh) }
  }, [])

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: DeviceNetworkInfo & { addEventListener?: (type: string, listener: () => void) => void; removeEventListener?: (type: string, listener: () => void) => void } }).connection
    if (!connection) {
      setDeviceNetwork(null)
      return
    }
    const update = () => setDeviceNetwork({ effectiveType: connection.effectiveType, downlink: connection.downlink, rtt: connection.rtt, type: connection.type, saveData: connection.saveData })
    update()
    connection.addEventListener?.("change", update)
    return () => connection.removeEventListener?.("change", update)
  }, [])

  const previousRuntime = useRef<Record<string, Runtime>>(initialRuntime)

  useEffect(() => { localStorage.setItem("signal-alerts-v1", JSON.stringify(alerts.slice(0, 100))) }, [alerts])
  useEffect(() => { localStorage.setItem("signal-endpoints-v1", JSON.stringify(customEndpoints)) }, [customEndpoints])
  useEffect(() => { localStorage.setItem("signal-latency-threshold", String(latencyThreshold)) }, [latencyThreshold])
  useEffect(() => { localStorage.setItem("signal-loss-threshold", String(lossThreshold)) }, [lossThreshold])
  useEffect(() => { localStorage.setItem("signal-history-v1", JSON.stringify(historySamples.slice(-500))) }, [historySamples])

  useEffect(() => {
    if (!customEndpoints.some((endpoint) => endpoint.enabled)) return
    let disposed = false
    const check = async (endpoint: CustomEndpoint) => {
      const started = performance.now()
      try {
        const response = await fetch(endpoint.url, { method: "GET", mode: "cors", cache: "no-store", signal: AbortSignal.timeout(8000) })
        await response.body?.cancel()
        const checkedAt = new Date().toISOString()
        if (!disposed) setCustomEndpoints((current) => current.map((item) => item.id === endpoint.id ? { ...item, status: response.ok || response.status < 500 ? "online" : "failed", latency: Math.round(performance.now() - started), checkedAt, error: response.ok || response.status < 500 ? null : `HTTP ${response.status}` } : item))
      } catch (error) {
        const message = error instanceof Error ? error.message : "Request failed"
        const blocked = /cors|failed to fetch|networkerror/i.test(message)
        if (!disposed) setCustomEndpoints((current) => current.map((item) => item.id === endpoint.id ? { ...item, status: blocked ? "blocked" : "failed", latency: null, checkedAt: new Date().toISOString(), error: blocked ? "Request blocked or CORS unavailable" : message } : item))
      }
    }
    const run = () => customEndpoints.filter((endpoint) => endpoint.enabled).forEach((endpoint) => { void check(endpoint) })
    run()
    const timer = window.setInterval(run, 30000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [customEndpoints.filter((endpoint) => endpoint.enabled).map((endpoint) => endpoint.id + endpoint.url).join("|")])

  useEffect(() => {
    const latencyHigh = network.latency !== null && network.latency > latencyThreshold
    const lossHigh = network.packetLoss !== null && network.packetLoss > lossThreshold
    const fired: string[] = []
    if (latencyHigh && !thresholdState.current.latency) fired.push(`Average endpoint latency exceeded ${latencyThreshold} ms (${network.latency} ms)`)
    if (lossHigh && !thresholdState.current.loss) fired.push(`Probe failure rate exceeded ${lossThreshold}% (${network.packetLoss}%)`)
    thresholdState.current = { latency: latencyHigh, loss: lossHigh }
    if (fired.length) {
      const timestamp = new Date().toLocaleTimeString("en-GB")
      setAlerts((current) => [...fired.map((text) => ({ tone: "red", text, time: timestamp })), ...current].slice(0, 100))
      setEventLog((current) => [...fired.map((text) => ({ tone: "red", text: `ALERT: ${text}`, time: timestamp })), ...current].slice(0, 100))
      if (notificationsEnabled && "Notification" in window && Notification.permission === "granted") fired.forEach((text) => new Notification("SIGNAL threshold alert", { body: text }))
    }
  }, [network.latency, network.packetLoss, latencyThreshold, lossThreshold, notificationsEnabled])

  useEffect(() => {
    if (!serverOnline) return
    const stamp = Date.now()
    if (stamp - lastHistorySaved.current < 10000) return
    lastHistorySaved.current = stamp
    const healthy = network.probes ?? []
    const online = healthy.filter((probe) => probe.status === "online").length
    const score = healthy.length ? Math.round((online / healthy.length) * 75 + (clientRtt === null ? 0 : Math.max(0, 25 * (1 - Math.min(clientRtt, 500) / 500)))) : null
    setHistorySamples((current) => [...current, { timestamp: new Date().toISOString(), latency: network.latency, packetLoss: network.packetLoss, traffic: network.traffic, healthScore: score }].slice(-500))
  }, [network.timestamp, network.latency, network.packetLoss, network.traffic, network.probes, clientRtt, serverOnline])

  useEffect(() => {
    const configuredUrl = import.meta.env.VITE_SIGNAL_WS_URL
    const socketUrl = configuredUrl || (import.meta.env.DEV ? "ws://localhost:3000" : "")

    if (!socketUrl) {
      setServerOnline(false)
      return
    }

    let socket: WebSocket | null = null
    let reconnectTimer = 0
    let pingTimer = 0
    let disposed = false

    const connect = () => {
      if (disposed) return

      socket = new WebSocket(socketUrl)

      socket.onopen = () => {
        setServerOnline(true)
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "client:ping", sentAt: performance.now() }))
        }, 2000)
      }

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          if (message.type === "client:pong") {
            setClientRtt(Math.max(0, Math.round(performance.now() - message.sentAt)))
            return
          }
          if (message.type !== "network:update" || paused) return

          const data: NetworkData = message.data
          setNetwork((current) => ({ ...data, latency: data.latency ?? current.latency, packetLoss: data.packetLoss ?? current.packetLoss }))

          if (data.nodeData?.length) {
            const next: Record<string, Runtime> = { ...initialRuntime }

            data.nodeData.forEach((item) => {
              next[item.id] = {
                latency: item.latency,
                packetLoss: item.packetLoss,
                uptime: item.uptime,
                status: item.status,
              }
            })

            setRuntime(next)

            const timestamp = new Date(data.timestamp).toLocaleTimeString("en-GB")
            const changes = data.nodeData.filter(
              (item) => previousRuntime.current[item.id]?.status !== item.status,
            )

            if (changes.length) {
              setEventLog((current) => [
                ...changes.map((item) => ({
                  time: timestamp,
                  tone: item.status === "critical" ? "red" : item.status === "warning" ? "yellow" : "green",
                  text: `${nodes.find((node) => node.id === item.id)?.name ?? item.id} status changed to ${item.status.toUpperCase()}`,
                })),
                ...current,
              ].slice(0, 40))
            }

            const incidents = data.nodeData.filter((item) => item.status !== "online")
            const newlyAffected = incidents.filter(
              (item) => previousRuntime.current[item.id]?.status !== item.status,
            )

            if (newlyAffected.length) {
              setAlerts((current) => [
                ...newlyAffected.map((item) => ({
                  tone: item.status === "critical" ? "red" : "yellow",
                  text: `${nodes.find((node) => node.id === item.id)?.name ?? item.id}: ${item.latency}ms latency / ${item.packetLoss.toFixed(2)}% loss`,
                  time: timestamp,
                })),
                ...current,
              ].slice(0, 40))
            }

            previousRuntime.current = next
          }

          setTrafficHistory((current) => [...current, data.traffic].slice(-30))
        } catch (error) {
          console.error("SIGNAL WebSocket:", error)
        }
      }

      socket.onerror = () => {
        setServerOnline(false)
      }

      socket.onclose = () => {
        window.clearInterval(pingTimer)
        setClientRtt(null)
        setServerOnline(false)
        if (!disposed) reconnectTimer = window.setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      disposed = true
      window.clearTimeout(reconnectTimer)
      window.clearInterval(pingTimer)
      socket?.close()
    }
  }, [paused])

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? nodes[3]
  const selected = runtime[selectedId] ?? initialRuntime.api

  const formatTraffic = (value: number) =>
    value >= 1000 ? `${(value / 1000).toFixed(2)}k/s` : `${value}/s`

  const visibleConnections = layers.connections ? connections : []

  const chartPoints = useMemo(() => {
    const values = trafficHistory.length ? trafficHistory : [network.traffic]
    const min = Math.min(...values)
    const max = Math.max(...values, min + 1)
    return values.map((value) =>
      Math.max(12, Math.min(88, 18 + ((value - min) / (max - min)) * 68)),
    )
  }, [trafficHistory, network.traffic])

  const time = now.toLocaleTimeString("en-GB")
  const simulatedCpu = Math.min(99, Math.max(8, Math.round(selected.latency * 0.55 + network.traffic / 100)))
  const simulatedRam = Math.min(96, Math.max(24, Math.round(40 + selected.packetLoss * 7)))
  const simulatedErrorRate = Number((selected.packetLoss * 1.8).toFixed(2))
  const latencyDistribution = useMemo(() => {
    const values = (network.probes ?? []).filter((probe) => probe.status === "online" && probe.latency !== null).map((probe) => probe.latency as number)
    const total = Math.max(1, values.length)
    const buckets = [
      values.filter((value) => value < 20).length,
      values.filter((value) => value >= 20 && value < 50).length,
      values.filter((value) => value >= 50 && value < 100).length,
      values.filter((value) => value >= 100 && value <= 200).length,
      values.filter((value) => value > 200).length,
    ]
    return buckets.map((count) => Math.round((count / total) * 100))
  }, [network.probes])

  const liveProbes = network.probes ?? []
  const onlineProbeCount = liveProbes.filter((probe) => probe.status === "online").length
  const failedProbeCount = liveProbes.filter((probe) => probe.status !== "online" && probe.status !== "pending").length
  const healthScore = liveProbes.length
    ? Math.round((onlineProbeCount / liveProbes.length) * 75 + (clientRtt === null ? 0 : Math.max(0, 25 * (1 - Math.min(clientRtt, 500) / 500))))
    : null
  const healthLabel = healthScore === null ? "WAITING FOR DATA" : healthScore >= 90 ? "HEALTHY" : healthScore >= 70 ? "DEGRADED" : "NEEDS ATTENTION"
  const healthAdvice = healthScore === null
    ? "Waiting for live endpoint probes from the backend."
    : failedProbeCount > 0
      ? `${failedProbeCount} endpoint probe(s) are failing. Check the endpoint status and retry after a short interval.`
      : clientRtt !== null && clientRtt >= 150
        ? "Browser-to-server latency is elevated. Check the hosting region and your current connection."
        : "Live endpoint probes are responding. Keep monitoring latency for sudden changes."

  const runDiagnostic = (tool: "Ping" | "Traceroute" | "Packet Monitor" | "Performance Test") => {
    const timestamp = new Date().toLocaleTimeString("en-GB")
    const result = tool === "Ping"
      ? `Live client-to-server RTT: ${clientRtt === null ? "measuring…" : `${clientRtt}ms`}; external endpoint latency: ${network.latency ?? "measuring…"}ms`
      : tool === "Traceroute"
        ? `Demo route: Client → Router → ${selectedNode.name}`
        : tool === "Packet Monitor"
          ? `Packet monitor started for ${selectedNode.name}`
          : `Demo performance test: ${formatTraffic(network.traffic)}, ${selected.latency}ms latency`
    setDiagnostic(result)
    setEventLog((current) => [{ time: timestamp, tone: "green", text: result }, ...current].slice(0, 40))
    setTab("Logs")
  }

  const exportReport = () => {
    const rows = [
      ["Generated at", new Date().toISOString()],
      ["Topology", selectedTopology],
      ["Measurement note", "External endpoint latency and browser RTT are live measurements; topology node telemetry and traffic are simulated"],
      ["Average external endpoint latency (ms)", String(network.latency ?? "unavailable")],
      ["Browser-to-SIGNAL RTT (ms)", String(clientRtt ?? "unavailable")],
      ["Simulated traffic counter", String(network.traffic)],
      ["Probe failure rate (%)", String(network.packetLoss ?? "unavailable")],
      ["Nodes", String(network.nodes)],
      ["Connections (topology model)", String(network.connections)],
      [],
      ["Live endpoint probes"],
      ["Endpoint", "URL", "Status", "HTTP status", "Latency (ms)", "Checked at", "Error"],
      ...(network.probes ?? []).map((probe) => [probe.name, probe.url, probe.status, String(probe.httpStatus ?? ""), String(probe.latency ?? ""), String(probe.checkedAt ?? ""), String(probe.error ?? "")]),
      [],
      ["Simulated topology nodes"],
      ["Node", "Location", "Status", "Latency (ms)", "Packet loss (%)", "Uptime (%)"],
      ...nodes.map((node) => { const item = runtime[node.id] ?? initialRuntime[node.id]; return [node.name, node.location, item.status, String(item.latency), String(item.packetLoss), String(item.uptime)] }),
      [],
      ["Events"],
      ...eventLog.map((item) => [item.time, item.text]),
      [],
      ["Alerts"],
      ...alerts.map((item) => [item.time, item.tone, item.text]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `signal-report-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className={`signal ${incidentMode ? "incident-mode" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="logo">
          <span className="logo-wave">〰</span>
          <strong>SIGNAL</strong>
        </div>

        <div className="menu-section">
          <span>MAIN</span>
          {[
            ["▣", "Overview"],
            ["♧", "Nodes"],
            ["♡", "Map"],
            ["△", "Incidents"],
            ["□", "History"],
            ["▤", "Reports"],
            ["⌁", "Endpoints"],
          ].map(([ico, label]) => (
            <button className={`menu ${activePage === label ? "active" : ""}`} key={label} onClick={() => setActivePage(label as typeof activePage)}>
              <i>{ico}</i>
              <b>{label}</b>
            </button>
          ))}
        </div>

        <div className="menu-section">
          <span>TOPOLOGIES</span>
          {["Global Internet", "Production", "Staging", "Singapore Cluster", "Tokyo Edge", "New York DC"].map((label, index) => (
            <button className={`menu ${selectedTopology === label ? "active" : ""}`} key={label} onClick={() => { setSelectedTopology(label); setActivePage("Overview"); setEventLog((current) => [{ time: new Date().toLocaleTimeString("en-GB"), tone: "green", text: `Topology switched to ${label}` }, ...current].slice(0, 40)) }}>
              <i>♧</i>
              <b>{label}</b>
              {index === 0 && <em />}
            </button>
          ))}
        </div>

        <div className="menu-section">
          <span>TOOLS</span>
          {["Ping", "Traceroute", "Packet Monitor", "Performance Test"].map((label) => (
            <button className="menu" key={label} onClick={() => runDiagnostic(label as "Ping" | "Traceroute" | "Packet Monitor" | "Performance Test")}>
              <i>⌁</i>
              <b>{label}</b>
            </button>
          ))}
        </div>

        <div className="global-status">
          <small>GLOBAL STATUS</small>

          <p>
            <span>Nodes</span>
            <strong>{network.nodes}</strong>
            <em className="green">●</em>
          </p>
          <p>
            <span>Connections</span>
            <strong>{network.connections}</strong>
            <em className="green">●</em>
          </p>
          <p>
            <span>Traffic</span>
            <strong className="cyan">{formatTraffic(network.traffic)}</strong>
            <em className="cyan">●</em>
          </p>
          <p>
            <span>Packet Loss</span>
            <strong className="yellow">{network.packetLoss === null ? "—" : `${network.packetLoss.toFixed(2)}%`}</strong>
            <em className="yellow">●</em>
          </p>
          <p>
            <span>Avg Latency</span>
            <strong className="green">{network.latency === null ? "—" : `${network.latency}ms`}</strong>
            <em className="green">●</em>
          </p>
          <p>
            <span>Client RTT</span>
            <strong className={clientRtt !== null && clientRtt < 100 ? "green" : "yellow"}>{clientRtt === null ? "—" : `${clientRtt}ms`}</strong>
            <em className="cyan">●</em>
          </p>
        </div>

        <button className="collapse" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>{sidebarCollapsed ? "›" : "‹"}</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>‹</span>
            <strong>{activePage === "Map" ? "Network Map" : activePage === "Overview" ? "Network Overview" : activePage}</strong>
            <span>⌄</span>
          </div>

          <div className="top-controls">
            <button onClick={() => setPaused((v) => !v)}>{paused ? "▶" : "Ⅱ"}</button>
            <button onClick={() => setSpeed((v) => (v === 1 ? 2 : 1))}>{speed}x⌄</button>
            <button className="realtime">
              <span className={`status-dot ${serverOnline ? "" : "offline"}`} />
              Realtime⌄
            </button>
            <time>{time}</time>
          </div>

          <div className="top-right">
            <button
              className={`incident ${incidentMode ? "active" : ""}`}
              onClick={() => setIncidentMode((v) => !v)}
            >
              ◉ Incident Mode
            </button>
            <button className="settings" onClick={() => setSettingsOpen(true)} aria-label="Open settings">⚙</button>
          </div>
        </header>

        <div className="content">
          {activePage === "Overview" || activePage === "Map" ? (
          <>
          <div className="main-row">
            <section className={`network-card ${layers.geographical ? "geographical" : ""} ${selectedTopology === "Global Internet" ? "global-network-card" : ""}`}>
              {selectedTopology === "Global Internet" && <div className="global-map-status"><span className={`status-dot ${globalProbeData ? "" : "offline"}`} /><strong>GLOBAL INTERNET PROBES</strong><span>{globalProbeData ? `${globalVisibleProbes.length.toLocaleString()} mapped probes` : globalProbeError || "Loading global probe registry…"}</span><select className="global-country-filter" value={globalCountryFilter} onChange={(event) => setGlobalCountryFilter(event.target.value)} aria-label="Filter probes by country"><option value="ALL">All countries</option>{globalCountries.map((country) => <option key={country} value={country}>{country}</option>)}</select><small>Source: RIPE Atlas public probe registry · sampled active public probes · no invented links{globalProbeData?.error ? ` · Partial coverage: ${globalProbeData.error}` : ""}</small></div>}
              <div className="layers">
                <span>LAYERS</span>

                {[
                  ["nodes", "Nodes"],
                  ["connections", "Connections"],
                  ["packets", "Packets"],
                  ["traffic", "Traffic Flow"],
                  ["geographical", "Geographical"],
                ].map(([key, label]) => {
                  const layerKey = key as keyof typeof layers
                  return (
                    <button
                      key={key}
                      onClick={() => setLayers((current) => ({ ...current, [layerKey]: !current[layerKey] }))}
                    >
                      {label}
                      <i className={`toggle ${layers[layerKey] ? "on" : ""}`} />
                    </button>
                  )
                })}
              </div>

              {selectedTopology === "Global Internet" && <svg className="global-world-map" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
                <g className="world-grid">
                  <path d="M0 103H1000 M0 207H1000 M0 310H1000 M0 413H1000 M0 517H1000 M166 0V620 M333 0V620 M500 0V620 M666 0V620 M833 0V620" />
                </g>
                <g className="world-land">
                  <path d="M38 118 L65 87 111 72 157 80 186 97 226 105 254 137 270 158 252 180 226 190 216 221 195 231 182 207 163 188 145 172 123 160 98 145 70 143 Z" />
                  <path d="M253 270 L283 257 315 275 342 301 355 334 346 367 329 399 318 438 299 478 286 448 276 412 265 378 257 341 Z" />
                  <path d="M321 70 L348 51 378 58 398 78 386 101 365 112 340 100 Z" />
                  <path d="M447 143 L466 124 488 128 502 144 490 160 469 162 Z" />
                  <path d="M457 176 L481 165 506 180 520 213 511 246 493 281 477 315 458 300 446 270 438 235 442 204 Z" />
                  <path d="M497 132 L527 108 570 98 608 107 640 96 687 106 724 125 766 132 806 155 845 177 830 196 790 193 763 213 727 207 699 230 667 222 646 202 615 208 588 190 562 194 538 173 514 166 Z" />
                  <path d="M526 205 L550 202 568 222 565 246 548 258 534 238 Z" />
                  <path d="M754 304 L790 294 828 306 849 326 835 348 802 353 775 336 Z" />
                  <path d="M849 375 L880 366 914 382 925 406 903 426 870 420 850 401 Z" />
                  <path d="M901 238 L920 228 935 242 927 262 909 265 Z" />
                </g>
              </svg>}
              <svg
                className="network-svg"
                style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
                viewBox="0 0 1000 620"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="2.8" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {selectedTopology !== "Global Internet" && visibleConnections.map(([fromId, toId], index) => {
                  const from = nodes.find((n) => n.id === fromId)!
                  const to = nodes.find((n) => n.id === toId)!
                  const x1 = from.x * 10
                  const y1 = from.y * 6.2
                  const x2 = to.x * 10
                  const y2 = to.y * 6.2
                  const dx = x2 - x1
                  const dy = y2 - y1
                  const bend = Math.min(65, Math.max(20, Math.abs(dx + dy) * 0.1))
                  const cx = (x1 + x2) / 2 + (dy > 0 ? -bend : bend)
                  const cy = (y1 + y2) / 2 - (dx > 0 ? bend * 0.35 : -bend * 0.35)
                  const path = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
                  const warning = fromId === "database" || toId === "database" || index >= 8
                  const purple = fromId === "cache" || toId === "backup"

                  return (
                    <g key={`${fromId}-${toId}`} className={warning ? "connection warning" : purple ? "connection purple" : "connection"}>
                      {layers.traffic && <path d={path} className="connection-shadow" />}
                      <path d={path} className="connection-line" />
                      {layers.packets && (
                        <>
                          <circle r="4" className="packet packet-glow">
                            <animateMotion
                              dur={`${(1.8 + (index % 4) * 0.35) / speed}s`}
                              repeatCount="indefinite"
                              path={path}
                              rotate="auto"
                            />
                          </circle>
                          <circle r="2.1" className="packet">
                            <animateMotion
                              dur={`${(1.8 + (index % 4) * 0.35) / speed}s`}
                              repeatCount="indefinite"
                              path={path}
                              rotate="auto"
                            />
                          </circle>
                        </>
                      )}
                    </g>
                  )
                })}
              </svg>

              {selectedTopology === "Global Internet" && layers.nodes && <div className="global-probe-layer" style={{ transform: `scale(${zoom})` }}>{globalVisibleProbes.map((probe) => <button key={probe.id} type="button" className={`global-probe-dot ${selectedGlobalProbe?.id === probe.id ? "selected" : ""}`} style={{ left: `${((probe.longitude + 180) / 360) * 100}%`, top: `${((90 - probe.latitude) / 180) * 100}%` }} onClick={() => setSelectedGlobalProbe(probe)} aria-label={`Show RIPE Atlas probe ${probe.id} in ${probe.country}`} title={`RIPE Atlas probe #${probe.id} · ${probe.country} · ${probe.asn ? `AS${probe.asn}` : "ASN unavailable"}`}><i /></button>)}</div>}
              {selectedTopology === "Global Internet" && selectedGlobalProbe && <div className="global-probe-detail"><div><span className="eyebrow">RIPE ATLAS PROBE</span><button type="button" onClick={() => setSelectedGlobalProbe(null)} aria-label="Close probe details">×</button></div><strong>Probe #{selectedGlobalProbe.id}</strong><dl><dt>Country</dt><dd>{selectedGlobalProbe.country}</dd><dt>ASN</dt><dd>{selectedGlobalProbe.asn ? `AS${selectedGlobalProbe.asn}` : "Not reported"}</dd><dt>Latitude</dt><dd>{selectedGlobalProbe.latitude.toFixed(4)}°</dd><dt>Longitude</dt><dd>{selectedGlobalProbe.longitude.toFixed(4)}°</dd><dt>Registry status</dt><dd>{selectedGlobalProbe.status}</dd></dl><small>Registry metadata only. This view has no latency measurement for this probe.</small></div>}
              {selectedTopology !== "Global Internet" && layers.nodes && (
                <div className="node-layer" style={{ transform: `scale(${zoom})` }}>
                  {nodes.map((node) => {
                    const data = runtime[node.id] ?? initialRuntime.api
                    const selectedNodeClass = selectedId === node.id ? "selected" : ""

                    return (
                      <button
                        key={node.id}
                        className={`node node-${node.type} ${data.status} ${selectedNodeClass}`}
                        style={{ left: `${node.x}%`, top: `${node.y}%` }}
                        onClick={() => {
                          setSelectedId(node.id)
                          setTab("Overview")
                        }}
                      >
                        <span className="node-ring" />
                        <span className="node-circle">
                          <span>{icon(node.type)}</span>
                        </span>
                        <span className="node-info">
                          <strong>{node.name}</strong>
                          <small>{node.location}</small>
                          <em>{data.latency}ms</em>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="zoom">
                <button onClick={() => setZoom(1)}>⌗</button>
                <button onClick={() => setZoom((v) => Math.min(1.18, v + 0.08))}>＋</button>
                <button onClick={() => setZoom((v) => Math.max(0.88, v - 0.08))}>−</button>
                <button onClick={() => setZoom(1)} aria-label="Reset map zoom">♧</button>
              </div>
            </section>

            {selectedTopology === "Global Internet" ? <aside className="details global-details"><div className="details-head"><strong>Global coverage</strong><em className={globalProbeData ? "online" : "warning"}>{globalProbeData ? "LIVE REGISTRY" : "WAITING"}</em></div><div className="global-stat"><span>Returned probes</span><strong>{globalProbeData?.returned.toLocaleString() ?? "—"}</strong></div><div className="global-stat"><span>Registry total</span><strong>{globalProbeData?.count.toLocaleString() ?? "—"}</strong></div><div className="global-stat"><span>Countries represented</span><strong>{globalProbeData ? new Set(globalProbeData.results.map((probe) => probe.country)).size : "—"}</strong></div><p className="settings-note">Each dot is a real RIPE Atlas public probe location. This is a multi-page registry sample, not a guarantee that every country is represented. The registry does not provide pairwise latency or routes here, so links are not invented. Results refresh every five minutes.</p>{globalProbeData?.fetchedAt && <small className="global-updated">Last refreshed {new Date(globalProbeData.fetchedAt).toLocaleString()}</small>}</aside> : detailsOpen ? <aside className="details">
              <div className="details-head">
                <span>‹</span>
                <strong>{selectedNode.name}</strong>
                <em className={selected.status}>{selected.status === "online" ? "ONLINE" : selected.status.toUpperCase()}</em>
                <button onClick={() => setDetailsOpen(false)} aria-label="Close node details">×</button>
              </div>

              <div className="tabs">
                {(["Overview", "Metrics", "Logs", "Alerts"] as const).map((item) => (
                  <button
                    key={item}
                    className={tab === item ? "selected" : ""}
                    onClick={() => setTab(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>

              {tab === "Overview" && (
                <div className="info">
                  <small>INFORMATION</small>
                  <p>Name <b>{selectedNode.name}</b></p>
                  <p>Location <b>{selectedNode.location}</b></p>
                  <p>Node ID <b>{selectedNode.id}</b></p>
                  <p>Uptime <b>{selected.uptime.toFixed(2)}%</b></p>
                  <p>Type <b>{selectedNode.type === "server" ? "Application Server" : selectedNode.type}</b></p>

                  <small>PERFORMANCE</small>

                  {[
                    ["Simulated CPU", `${simulatedCpu}%`, "blue"],
                    ["Simulated RAM", `${simulatedRam}%`, "green"],
                    ["Latency", `${selected.latency}ms`, "green"],
                    ["Traffic", formatTraffic(network.traffic), "cyan"],
                    ["Simulated Error Rate", `${simulatedErrorRate}%`, "yellow"],
                    ["Packet Loss", `${selected.packetLoss.toFixed(2)}%`, "purple"],
                  ].map(([label, value, tone], index) => (
                    <div className="metric" key={label}>
                      <span className={`metric-label ${tone}`}>{label}</span>
                      <div className="spark">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <i key={i} style={{ height: `${18 + ((i * 17 + index * 11) % 55)}%` }} />
                        ))}
                      </div>
                      <strong className={tone}>{value}</strong>
                    </div>
                  ))}

                  <small>ACTIONS</small>
                  <div className="actions">
                    <button onClick={() => runDiagnostic("Ping")}>Ping</button>
                    <button onClick={() => runDiagnostic("Traceroute")}>Traceroute</button>
                    <button onClick={() => setSettingsOpen(true)}>More⌄</button>
                  </div>
                </div>
              )}

              {tab === "Metrics" && (
                <div className="tab-body">
                  <div className="big-metric">
                    <span>LATENCY</span>
                    <strong>{selected.latency}<small>ms</small></strong>
                  </div>
                  <div className="metric-grid">
                    <div><span>SIM CPU</span><b>{simulatedCpu}%</b></div>
                    <div><span>SIM RAM</span><b>{simulatedRam}%</b></div>
                    <div><span>TRAFFIC</span><b>{formatTraffic(network.traffic)}</b></div>
                    <div><span>LOSS</span><b>{selected.packetLoss.toFixed(2)}%</b></div>
                  </div>
                  <div className="metric-chart">
                    {chartPoints.map((point, i) => <i key={i} style={{ height: `${point}%` }} />)}
                  </div>
                </div>
              )}

              {tab === "Logs" && (
                <div className="tab-body logs">
                  {(eventLog.length ? eventLog : [
                    { time: time, tone: "green", text: "Waiting for realtime events..." },
                  ]).map((item, i) => (
                    <p key={`${item.time}-${item.text}-${i}`}><time>{item.time}</time><span>{item.text}</span></p>
                  ))}
                </div>
              )}

              {tab === "Alerts" && (
                <div className="tab-body alerts">
                  {(alerts.length ? alerts : [
                    { tone: "green", text: "No active alerts", time },
                  ]).map((item, i) => (
                    <div className={`alert ${item.tone}`} key={`${item.time}-${item.text}-${i}`}>
                      ● {item.text} <small>{item.time}</small>
                    </div>
                  ))}
                </div>
              )}
            </aside> : <button className="show-details" onClick={() => setDetailsOpen(true)}>Show node details</button>}
          </div>

          <section className="insights-grid" aria-label="Smart network insights">
            <article className="panel health-insight">
              <header>
                <div><span className="eyebrow">LIVE TELEMETRY</span><strong>NETWORK HEALTH</strong></div>
                <span className={healthScore === null ? "insight-status pending" : healthScore >= 90 ? "insight-status good" : healthScore >= 70 ? "insight-status warn" : "insight-status bad"}>{healthLabel}</span>
              </header>
              <div className="health-score-row">
                <div className="health-score">{healthScore === null ? "—" : healthScore}<small>{healthScore === null ? "" : "/100"}</small></div>
                <div className="health-meter"><i style={{ width: `${healthScore ?? 0}%` }} /></div>
              </div>
              <p>{healthAdvice}</p>
              <div className="insight-stats">
                <div><span>Endpoints online</span><strong>{liveProbes.length ? `${onlineProbeCount}/${liveProbes.length}` : "—"}</strong></div>
                <div><span>Browser RTT</span><strong>{clientRtt === null ? "—" : `${clientRtt} ms`}</strong></div>
                <div><span>Last probe cycle</span><strong>{network.probes?.find((probe) => probe.checkedAt)?.checkedAt ? new Date(network.probes.find((probe) => probe.checkedAt)!.checkedAt!).toLocaleTimeString("en-GB") : "Waiting"}</strong></div>
              </div>
            </article>
            <article className="panel quick-actions">
              <header><div><span className="eyebrow">ONE-CLICK TOOLS</span><strong>QUICK DIAGNOSTICS</strong></div><span className="quick-icon">⌁</span></header>
              <p>Run a quick check or export the current telemetry snapshot without digging through menus.</p>
              <div className="quick-action-buttons">
                <button onClick={() => runDiagnostic("Ping")}>Run RTT check</button>
                <button onClick={() => runDiagnostic("Packet Monitor")}>Inspect node</button>
                <button onClick={exportReport}>Export CSV</button>
              </div>
              <small>RTT is measured from this browser. Topology node metrics remain demo data.</small>
            </article>
          </section>

          <section className="bottom-grid">
            <div className="panel traffic-panel">
              <header>
                <strong>TRAFFIC OVER TIME</strong>
                <span>{formatTraffic(network.traffic)}</span>
              </header>

              <div className="chart">
                <svg viewBox="0 0 500 150" preserveAspectRatio="none">
                  <path className="chart-grid" d="M0 30H500 M0 65H500 M0 100H500 M0 135H500" />
                  <polyline className="chart-green" points={chartPoints.map((p, i) => `${i * 17.25},${125 - p}`).join(" ")} />
                  <polyline className="chart-blue" points={chartPoints.map((p, i) => `${i * 17.25},${135 - p * 0.55}`).join(" ")} />
                </svg>
              </div>

              <footer>
                <span><i className="green-dot" />Inbound</span>
                <span><i className="blue-dot" />Outbound</span>
              </footer>
            </div>

            <div className="panel latency-panel">
              <header>
                <strong>LIVE ENDPOINT LATENCY</strong>
              </header>

              <div className="donut-wrap">
                <div className="donut" style={{ background: `conic-gradient(#21d8ff 0 ${latencyDistribution[0]}%, #2bdc91 ${latencyDistribution[0]}% ${latencyDistribution[0] + latencyDistribution[1]}%, #ffd21f ${latencyDistribution[0] + latencyDistribution[1]}% ${latencyDistribution[0] + latencyDistribution[1] + latencyDistribution[2]}%, #a96cff ${latencyDistribution[0] + latencyDistribution[1] + latencyDistribution[2]}% ${latencyDistribution[0] + latencyDistribution[1] + latencyDistribution[2] + latencyDistribution[3]}%, #ff3d59 ${latencyDistribution[0] + latencyDistribution[1] + latencyDistribution[2] + latencyDistribution[3]}% 100%)` }}>
                  <strong>{network.latency === null ? "—" : network.latency}<small>ms</small></strong>
                </div>

                <div className="legend">
                  <span><i className="cyan-dot" />&lt; 20ms <b>{latencyDistribution[0]}%</b></span>
                  <span><i className="green-dot" />20-50ms <b>{latencyDistribution[1]}%</b></span>
                  <span><i className="yellow-dot" />50-100ms <b>{latencyDistribution[2]}%</b></span>
                  <span><i className="purple-dot" />100-200ms <b>{latencyDistribution[3]}%</b></span>
                  <span><i className="red-dot" />&gt; 200ms <b>{latencyDistribution[4]}%</b></span>
                </div>
                <div className="probe-list">{(network.probes ?? []).map((probe) => <div className="probe-row" key={probe.id}><span className={`status-dot ${probe.status === "online" ? "" : "offline"}`} /><span>{probe.name}</span><strong>{probe.latency === null ? "Timeout" : `${probe.latency} ms`}</strong><small>{probe.httpStatus ? `HTTP ${probe.httpStatus}` : probe.status}</small></div>)}</div><div className="browser-link"><div><span className="eyebrow">BROWSER NETWORK ESTIMATE</span><strong>{deviceNetwork?.effectiveType ?? deviceNetwork?.type ?? "Not exposed by browser"}</strong></div><div><span>Downlink estimate</span><b>{deviceNetwork?.downlink === undefined ? "—" : `${deviceNetwork.downlink} Mbps`}</b></div><div><span>Browser RTT estimate</span><b>{deviceNetwork?.rtt === undefined ? "—" : `${deviceNetwork.rtt} ms`}</b></div><small>Browser-reported estimate only, not radio signal strength in dBm.</small></div>
              </div>
            </div>

            <div className="panel event-panel">
              <header>
                <strong>EVENT LOG</strong>
                <button className="view-all" onClick={() => setActivePage("History")}>View All</button>
              </header>

              <div className="event-list">
                {(eventLog.length ? eventLog : [
                  { time, tone: "green", text: "Realtime telemetry connected" },
                  { time, tone: "green", text: "SIGNAL WebSocket channel active" },
                ]).map((item, i) => (
                  <p key={`${item.time}-${item.text}-${i}`}>
                    <time>{item.time}</time>
                    <i className={`${item.tone === "yellow" ? "yellow-dot" : item.tone === "red" ? "red-dot" : "green-dot"}`} />
                    {item.text}
                  </p>
                ))}
              </div>
            </div>

            <div className="panel timeline-panel">
              <header>
                <strong>TIMELINE</strong>
              </header>

              <div className="timeline-times">
                {[15, 10, 5, 0].map((minutes) => <span key={minutes}>{new Date(now.getTime() - minutes * 60000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>)}
              </div>

              <div className="timeline-line">
                <i /><i /><i /><i /><b />
              </div>

              <div className="timeline-events">
                {alerts.slice(0, 3).map((item, index) => <div key={`${item.time}-${item.text}-${index}`}><span className={item.tone === "red" ? "yellow-badge" : "purple-badge"}>!</span><b>{item.text}</b><small>{item.time}</small></div>)}
                {!alerts.length && <div><span className="blue-badge">i</span><b>No active incidents</b><small>{time}</small></div>}
              </div>

              <button className="export" onClick={exportReport}>⇩ Export Report</button>
            </div>
          </section>
          </>
          ) : (
            <section className="page-view">
              {activePage === "Endpoints" && <>
                <div className="page-heading"><div><span className="eyebrow">CUSTOM MONITORING</span><h1>Endpoint monitor</h1><p>Monitor public HTTP(S) endpoints from this browser. Checks repeat every 30 seconds while this page is open.</p></div><span className="page-count">{customEndpoints.length} endpoints</span></div>
                <form className="endpoint-form" onSubmit={(event) => {
                  event.preventDefault()
                  let parsed: URL
                  try { parsed = new URL(endpointUrl.trim()) } catch { setDiagnostic("Enter a valid endpoint URL"); return }
                  if (!["http:", "https:"].includes(parsed.protocol)) { setDiagnostic("Only HTTP and HTTPS endpoints are supported"); return }
                  if (customEndpoints.some((item) => item.url === parsed.href)) { setDiagnostic("That endpoint is already being monitored"); return }
                  const name = endpointName.trim() || parsed.hostname
                  setCustomEndpoints((current) => [...current, { id: crypto.randomUUID(), name, url: parsed.href, enabled: true, status: "pending", latency: null, checkedAt: null, error: null }])
                  setEndpointName(""); setEndpointUrl(""); setDiagnostic("Endpoint added. First check is starting.")
                }}>
                  <label><span>Endpoint name</span><input value={endpointName} onChange={(event) => setEndpointName(event.target.value)} placeholder="My API" maxLength={50} /></label>
                  <label><span>Public URL</span><input value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} placeholder="https://example.com/health" type="url" required /></label>
                  <button type="submit" className="export">+ Add endpoint</button>
                </form>
                <p className="endpoint-note">Checks run in your browser. Some websites block cross-origin requests, so “Blocked / CORS” does not necessarily mean the service is down. Endpoints are saved only in this browser.</p>
                <div className="endpoint-grid">{customEndpoints.map((endpoint) => <article className="endpoint-card" key={endpoint.id}>
                  <header><span className={`status-dot ${endpoint.status === "online" ? "" : endpoint.status === "pending" ? "pending" : "offline"}`} /><strong>{endpoint.name}</strong><span className={`endpoint-status ${endpoint.status}`}>{endpoint.status.toUpperCase()}</span></header>
                  <p className="endpoint-url">{endpoint.url}</p>
                  <div className="endpoint-metrics"><div><span>Latency</span><strong>{endpoint.latency === null ? "—" : `${endpoint.latency} ms`}</strong></div><div><span>Last check</span><strong>{endpoint.checkedAt ? new Date(endpoint.checkedAt).toLocaleTimeString("en-GB") : "Waiting"}</strong></div></div>
                  {endpoint.error && <small className="endpoint-error">{endpoint.error}</small>}
                  <footer><button onClick={() => setCustomEndpoints((current) => current.map((item) => item.id === endpoint.id ? { ...item, enabled: !item.enabled } : item))}>{endpoint.enabled ? "Pause checks" : "Resume checks"}</button><button onClick={() => setCustomEndpoints((current) => current.filter((item) => item.id !== endpoint.id))}>Remove</button></footer>
                </article>)}
                {!customEndpoints.length && <div className="empty-state">No custom endpoints yet. Add an HTTP or HTTPS health URL above to start monitoring.</div>}</div>
                <div className="diagnostic-card"><strong>Current diagnostic</strong><p>{diagnostic}</p></div>
              </>}
              {activePage === "Nodes" && <>
                <div className="page-heading"><div><span className="eyebrow">TOPOLOGY INVENTORY</span><h1>Network nodes</h1><p>Node status and performance for {selectedTopology}.</p></div><span className="page-count">{nodes.length} nodes</span></div>
                <div className="page-table"><div className="table-row table-header"><span>Node</span><span>Location</span><span>Status</span><span>Latency</span><span>Packet loss</span><span>Uptime</span></div>{nodes.map((node) => { const item = runtime[node.id] ?? initialRuntime[node.id]; return <button className="table-row" key={node.id} onClick={() => { setSelectedId(node.id); setActivePage("Overview"); setDetailsOpen(true) }}><span><i className={`legend-dot ${item.status === "online" ? "" : item.status}`} />{node.name}</span><span>{node.location}</span><span className={item.status}>{item.status.toUpperCase()}</span><span>{item.latency} ms</span><span>{item.packetLoss.toFixed(2)}%</span><span>{item.uptime.toFixed(2)}%</span></button>})}</div>
              </>}
              {activePage === "Incidents" && <>
                <div className="page-heading"><div><span className="eyebrow">INCIDENT CENTER</span><h1>Incidents and alerts</h1><p>Alerts are recorded when a node changes status.</p></div><span className="page-count">{alerts.length} alerts</span></div>
                <div className="incident-list">{alerts.length ? alerts.map((item, index) => <article className={`incident-card ${item.tone}`} key={`${item.time}-${item.text}-${index}`}><i className={`legend-dot ${item.tone === "yellow" ? "warning" : item.tone}`} /><div><strong>{item.text}</strong><small>{item.time}</small></div></article>) : <div className="empty-state">No incidents recorded yet. Status changes will appear here.</div>}</div>
              </>}
              {activePage === "History" && <>
                <div className="page-heading"><div><span className="eyebrow">TELEMETRY HISTORY</span><h1>Network history</h1><p>Persistent local samples are stored in this browser, up to 500 points.</p></div><span className="page-count">{historySamples.length} samples</span></div><div className="history-summary"><article><span>Average latency</span><strong>{historySamples.filter((sample) => sample.latency !== null).length ? Math.round(historySamples.filter((sample) => sample.latency !== null).reduce((sum, sample) => sum + (sample.latency ?? 0), 0) / historySamples.filter((sample) => sample.latency !== null).length) + " ms" : "—"}</strong></article><article><span>Latest health score</span><strong>{historySamples.at(-1)?.healthScore === null || historySamples.length === 0 ? "—" : historySamples.at(-1)?.healthScore + "/100"}</strong></article><article><span>Stored locally</span><strong>{historySamples.length} points</strong></article></div><div className="history-chart">{historySamples.slice(-60).map((sample, index) => <div key={sample.timestamp} title={new Date(sample.timestamp).toLocaleString() + " · " + (sample.latency === null ? "No latency" : sample.latency + " ms")} style={{ height: Math.max(4, Math.min(100, sample.healthScore ?? 4)) + "%" }}><span>{index % 10 === 0 ? new Date(sample.timestamp).toLocaleTimeString("en-GB", {hour:"2-digit",minute:"2-digit"}) : ""}</span></div>)}</div>
                <div className="history-summary"><article><span>Current traffic</span><strong>{formatTraffic(network.traffic)}</strong></article><article><span>Live endpoint latency</span><strong>{network.latency === null ? "Measuring…" : `${network.latency} ms`}</strong></article><article><span>Probe failure rate</span><strong>{network.packetLoss === null ? "Measuring…" : `${network.packetLoss.toFixed(2)}%`}</strong></article></div>
                <div className="page-table"><div className="table-row table-header"><span>Time</span><span>Event</span></div>{eventLog.length ? eventLog.map((item, index) => <div className="table-row history-row" key={`${item.time}-${item.text}-${index}`}><span>{item.time}</span><span>{item.text}</span></div>) : <div className="empty-state">No events recorded yet.</div>}</div>
              </>}
              {activePage === "Reports" && <>
                <div className="page-heading"><div><span className="eyebrow">EXPORT CENTER</span><h1>Reports</h1><p>Export telemetry, node metrics, alerts, and event history.</p></div></div>
                <div className="report-card"><div><span className="eyebrow">SIGNAL NETWORK REPORT</span><h2>{selectedTopology} snapshot</h2><p>Generated from the data currently available in this dashboard.</p><div className="history-summary"><article><span>Nodes</span><strong>{network.nodes}</strong></article><article><span>Connections</span><strong>{network.connections}</strong></article><article><span>Events</span><strong>{eventLog.length}</strong></article></div></div><button className="export" onClick={exportReport}>⇩ Export CSV report</button></div>
                <div className="diagnostic-card"><strong>Latest diagnostic</strong><p>{diagnostic}</p><small>Diagnostics are simulated and do not send packets over the public internet.</small></div>
              </>}
            </section>
          )}
          {settingsOpen && <div className="settings-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}><header><div><span className="eyebrow">PREFERENCES</span><h2 id="settings-title">Signal settings</h2></div><button onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></header><div className="settings-row"><span>Telemetry connection</span><strong className={serverOnline ? "green" : "yellow"}>{serverOnline ? "Connected" : "Disconnected"}</strong></div><div className="settings-row"><span>WebSocket endpoint</span><code>{import.meta.env.VITE_SIGNAL_WS_URL || (import.meta.env.DEV ? "ws://localhost:3000" : "Not configured")}</code></div><div className="settings-row"><span>Latency alert threshold (ms)</span><input className="settings-number" type="number" min={1} max={5000} value={latencyThreshold} onChange={(event) => setLatencyThreshold(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))} /></div><div className="settings-row"><span>Probe failure threshold (%)</span><input className="settings-number" type="number" min={0} max={100} step={0.5} value={lossThreshold} onChange={(event) => setLossThreshold(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} /></div><div className="settings-row"><span>Desktop notifications</span><button onClick={async () => { if (!("Notification" in window)) { setDiagnostic("This browser does not support desktop notifications"); return } const permission = await Notification.requestPermission(); setNotificationsEnabled(permission === "granted"); setDiagnostic(permission === "granted" ? "Desktop alerts enabled" : "Desktop notification permission not granted") }}>{notificationsEnabled ? "Enabled" : "Enable alerts"}</button></div><div className="settings-row"><span>Persistent history</span><button onClick={() => { setHistorySamples([]); localStorage.removeItem("signal-history-v1"); setDiagnostic("Local history cleared") }}>Clear history</button></div><div className="settings-row"><span>Packet animation speed</span><button onClick={() => setSpeed((value) => value === 1 ? 2 : 1)}>{speed}x · Change</button></div><div className="settings-row"><span>Incident highlighting</span><button onClick={() => setIncidentMode((value) => !value)}>{incidentMode ? "Enabled" : "Disabled"}</button></div><p className="settings-note">Custom endpoint checks run in this browser and may be blocked by CORS. Threshold alerts are generated when live measurements cross your configured limits. History and endpoint settings are stored locally in this browser. External endpoint latency and probe loss are measured live by HTTP requests from the backend. Client RTT is measured from this browser to the SIGNAL server. Traffic and per-node topology telemetry remain simulated. Browsers cannot expose Wi-Fi/cellular signal strength in dBm, so this dashboard does not invent a signal-strength reading.</p></section></div>}
        </div>
      </section>
    </main>
  )
}

export default App
