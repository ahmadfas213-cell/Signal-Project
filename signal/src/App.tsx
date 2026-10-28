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

type NetworkData = {
  timestamp: string
  latency: number
  traffic: number
  packetLoss: number
  nodes: number
  connections: number
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
    latency: 42,
    traffic: 1284,
    packetLoss: 0.24,
    nodes: 9,
    connections: 11,
  })
  const [runtime, setRuntime] = useState<Record<string, Runtime>>(initialRuntime)
  const [selectedId, setSelectedId] = useState("api")
  const [activePage, setActivePage] = useState<"Overview" | "Nodes" | "Map" | "Incidents" | "History" | "Reports">("Overview")
  const [selectedTopology, setSelectedTopology] = useState("Production")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [diagnostic, setDiagnostic] = useState("No diagnostic running")
  const [tab, setTab] = useState<"Overview" | "Metrics" | "Logs" | "Alerts">("Overview")
  const [serverOnline, setServerOnline] = useState(false)
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
  const [alerts, setAlerts] = useState<Array<{ tone: string; text: string; time: string }>>([])

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(clock)
  }, [])

  const previousRuntime = useRef<Record<string, Runtime>>(initialRuntime)

  useEffect(() => {
    const configuredUrl = import.meta.env.VITE_SIGNAL_WS_URL
    const socketUrl = configuredUrl || (import.meta.env.DEV ? "ws://localhost:3000" : "")

    if (!socketUrl) {
      setServerOnline(false)
      return
    }

    let socket: WebSocket | null = null
    let reconnectTimer = 0
    let disposed = false

    const connect = () => {
      if (disposed) return

      socket = new WebSocket(socketUrl)

      socket.onopen = () => {
        setServerOnline(true)
      }

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          if (message.type !== "network:update" || paused) return

          const data: NetworkData = message.data
          setNetwork(data)

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
        setServerOnline(false)
        if (!disposed) reconnectTimer = window.setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      disposed = true
      window.clearTimeout(reconnectTimer)
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
    const values = Object.values(runtime)
    const total = Math.max(1, values.length)
    const buckets = [
      values.filter((item) => item.latency < 20).length,
      values.filter((item) => item.latency >= 20 && item.latency < 50).length,
      values.filter((item) => item.latency >= 50 && item.latency < 100).length,
      values.filter((item) => item.latency >= 100 && item.latency <= 200).length,
      values.filter((item) => item.latency > 200).length,
    ]
    return buckets.map((count) => Math.round((count / total) * 100))
  }, [runtime])

  const runDiagnostic = (tool: "Ping" | "Traceroute" | "Packet Monitor" | "Performance Test") => {
    const timestamp = new Date().toLocaleTimeString("en-GB")
    const result = tool === "Ping"
      ? `Demo ping to ${selectedNode.name}: ${selected.latency}ms, simulated loss 0%`
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
      ["Average latency (ms)", String(network.latency)],
      ["Traffic per second", String(network.traffic)],
      ["Packet loss (%)", String(network.packetLoss)],
      ["Nodes", String(network.nodes)],
      ["Connections", String(network.connections)],
      [],
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
          ].map(([ico, label]) => (
            <button className={`menu ${activePage === label ? "active" : ""}`} key={label} onClick={() => setActivePage(label as typeof activePage)}>
              <i>{ico}</i>
              <b>{label}</b>
            </button>
          ))}
        </div>

        <div className="menu-section">
          <span>TOPOLOGIES</span>
          {["Production", "Staging", "Singapore Cluster", "Tokyo Edge", "New York DC"].map((label, index) => (
            <button className={`menu ${selectedTopology === label ? "topology-active" : ""}`} key={label} onClick={() => { setSelectedTopology(label); setActivePage("Overview"); setEventLog((current) => [{ time: new Date().toLocaleTimeString("en-GB"), tone: "green", text: `Topology switched to ${label}` }, ...current].slice(0, 40)) }}>
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
            <strong className="yellow">{network.packetLoss.toFixed(2)}%</strong>
            <em className="yellow">●</em>
          </p>
          <p>
            <span>Avg Latency</span>
            <strong className="green">{network.latency}ms</strong>
            <em className="green">●</em>
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
            <section className={`network-card ${layers.geographical ? "geographical" : ""}`}>
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

              <svg
                className="network-svg"
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

                {visibleConnections.map(([fromId, toId], index) => {
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

              {layers.nodes && (
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

            {detailsOpen ? <aside className="details">
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
                    <button>Ping</button>
                    <button>Traceroute</button>
                    <button>More⌄</button>
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
                <strong>LATENCY DISTRIBUTION</strong>
              </header>

              <div className="donut-wrap">
                <div className="donut">
                  <strong>{network.latency}<small>ms</small></strong>
                </div>

                <div className="legend">
                  <span><i className="cyan-dot" />&lt; 20ms <b>{latencyDistribution[0]}%</b></span>
                  <span><i className="green-dot" />20-50ms <b>{latencyDistribution[1]}%</b></span>
                  <span><i className="yellow-dot" />50-100ms <b>{latencyDistribution[2]}%</b></span>
                  <span><i className="purple-dot" />100-200ms <b>{latencyDistribution[3]}%</b></span>
                  <span><i className="red-dot" />&gt; 200ms <b>{latencyDistribution[4]}%</b></span>
                </div>
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
              {activePage === "Nodes" && <>
                <div className="page-heading"><div><span className="eyebrow">TOPOLOGY INVENTORY</span><h1>Network nodes</h1><p>Node status and performance for {selectedTopology}.</p></div><span className="page-count">{nodes.length} nodes</span></div>
                <div className="page-table"><div className="table-row table-header"><span>Node</span><span>Location</span><span>Status</span><span>Latency</span><span>Packet loss</span><span>Uptime</span></div>{nodes.map((node) => { const item = runtime[node.id] ?? initialRuntime[node.id]; return <button className="table-row" key={node.id} onClick={() => { setSelectedId(node.id); setActivePage("Overview"); setDetailsOpen(true) }}><span><i className={`legend-dot ${item.status === "online" ? "" : item.status}`} />{node.name}</span><span>{node.location}</span><span className={item.status}>{item.status.toUpperCase()}</span><span>{item.latency} ms</span><span>{item.packetLoss.toFixed(2)}%</span><span>{item.uptime.toFixed(2)}%</span></button>})}</div>
              </>}
              {activePage === "Incidents" && <>
                <div className="page-heading"><div><span className="eyebrow">INCIDENT CENTER</span><h1>Incidents and alerts</h1><p>Alerts are recorded when a node changes status.</p></div><span className="page-count">{alerts.length} alerts</span></div>
                <div className="incident-list">{alerts.length ? alerts.map((item, index) => <article className={`incident-card ${item.tone}`} key={`${item.time}-${item.text}-${index}`}><i className={`legend-dot ${item.tone === "yellow" ? "warning" : item.tone}`} /><div><strong>{item.text}</strong><small>{item.time}</small></div></article>) : <div className="empty-state">No incidents recorded yet. Status changes will appear here.</div>}</div>
              </>}
              {activePage === "History" && <>
                <div className="page-heading"><div><span className="eyebrow">TELEMETRY HISTORY</span><h1>Network history</h1><p>Recent traffic samples and status events in this session.</p></div><span className="page-count">{trafficHistory.length} samples</span></div>
                <div className="history-summary"><article><span>Current traffic</span><strong>{formatTraffic(network.traffic)}</strong></article><article><span>Average latency</span><strong>{network.latency} ms</strong></article><article><span>Packet loss</span><strong>{network.packetLoss.toFixed(2)}%</strong></article></div>
                <div className="page-table"><div className="table-row table-header"><span>Time</span><span>Event</span></div>{eventLog.length ? eventLog.map((item, index) => <div className="table-row history-row" key={`${item.time}-${item.text}-${index}`}><span>{item.time}</span><span>{item.text}</span></div>) : <div className="empty-state">No events recorded yet.</div>}</div>
              </>}
              {activePage === "Reports" && <>
                <div className="page-heading"><div><span className="eyebrow">EXPORT CENTER</span><h1>Reports</h1><p>Export telemetry, node metrics, alerts, and event history.</p></div></div>
                <div className="report-card"><div><span className="eyebrow">SIGNAL NETWORK REPORT</span><h2>{selectedTopology} snapshot</h2><p>Generated from the data currently available in this dashboard.</p><div className="history-summary"><article><span>Nodes</span><strong>{network.nodes}</strong></article><article><span>Connections</span><strong>{network.connections}</strong></article><article><span>Events</span><strong>{eventLog.length}</strong></article></div></div><button className="export" onClick={exportReport}>⇩ Export CSV report</button></div>
                <div className="diagnostic-card"><strong>Latest diagnostic</strong><p>{diagnostic}</p><small>Diagnostics are simulated and do not send packets over the public internet.</small></div>
              </>}
            </section>
          )}
          {settingsOpen && <div className="settings-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}><header><div><span className="eyebrow">PREFERENCES</span><h2 id="settings-title">Signal settings</h2></div><button onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></header><div className="settings-row"><span>Telemetry connection</span><strong className={serverOnline ? "green" : "yellow"}>{serverOnline ? "Connected" : "Disconnected"}</strong></div><div className="settings-row"><span>WebSocket endpoint</span><code>{import.meta.env.VITE_SIGNAL_WS_URL || (import.meta.env.DEV ? "ws://localhost:3000" : "Not configured")}</code></div><div className="settings-row"><span>Packet animation speed</span><button onClick={() => setSpeed((value) => value === 1 ? 2 : 1)}>{speed}x · Change</button></div><div className="settings-row"><span>Incident highlighting</span><button onClick={() => setIncidentMode((value) => !value)}>{incidentMode ? "Enabled" : "Disabled"}</button></div><p className="settings-note">The backend currently generates simulated telemetry. A public WebSocket endpoint is required for live data on the deployed site.</p></section></div>}
        </div>
      </section>
    </main>
  )
}

export default App
