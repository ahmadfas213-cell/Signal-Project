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
    connections: 18,
  })
  const [runtime, setRuntime] = useState<Record<string, Runtime>>(initialRuntime)
  const [selectedId, setSelectedId] = useState("api")
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

  return (
    <main className={`signal ${incidentMode ? "incident-mode" : ""}`}>
      <aside className="sidebar">
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
          ].map(([ico, label], index) => (
            <button className={`menu ${index === 0 ? "active" : ""}`} key={label}>
              <i>{ico}</i>
              <b>{label}</b>
            </button>
          ))}
        </div>

        <div className="menu-section">
          <span>TOPOLOGIES</span>
          {["Production", "Staging", "Singapore Cluster", "Tokyo Edge", "New York DC"].map((label, index) => (
            <button className={`menu ${index === 0 ? "topology-active" : ""}`} key={label}>
              <i>♧</i>
              <b>{label}</b>
              {index === 0 && <em />}
            </button>
          ))}
        </div>

        <div className="menu-section">
          <span>TOOLS</span>
          {["Ping", "Traceroute", "Packet Monitor", "Performance Test"].map((label) => (
            <button className="menu" key={label}>
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

        <button className="collapse">›</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>‹</span>
            <strong>Network Overview</strong>
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
            <button className="settings">⚙</button>
          </div>
        </header>

        <div className="content">
          <div className="main-row">
            <section className="network-card">
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
                      <path d={path} className="connection-shadow" />
                      <path d={path} className="connection-line" />
                      {layers.packets && (
                        <>
                          <circle r="4" className="packet packet-glow">
                            <animateMotion
                              dur={`${1.8 + (index % 4) * 0.35}s`}
                              repeatCount="indefinite"
                              path={path}
                              rotate="auto"
                            />
                          </circle>
                          <circle r="2.1" className="packet">
                            <animateMotion
                              dur={`${1.8 + (index % 4) * 0.35}s`}
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
                <button>♧</button>
              </div>
            </section>

            <aside className="details">
              <div className="details-head">
                <span>‹</span>
                <strong>{selectedNode.name}</strong>
                <em className={selected.status}>{selected.status === "online" ? "ONLINE" : selected.status.toUpperCase()}</em>
                <button>×</button>
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
                  <p>Location <b>{selectedNode.location}, ID</b></p>
                  <p>IP Address <b>10.10.1.25</b></p>
                  <p>Uptime <b>{Math.floor(selected.uptime)}d 7h 23m</b></p>
                  <p>Type <b>{selectedNode.type === "server" ? "Application Server" : selectedNode.type}</b></p>

                  <small>PERFORMANCE</small>

                  {[
                    ["CPU", "78%", "blue"],
                    ["RAM", "64%", "green"],
                    ["Latency", `${selected.latency}ms`, "green"],
                    ["Traffic", formatTraffic(network.traffic), "cyan"],
                    ["Error Rate", "2.14%", "yellow"],
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
                    <div><span>CPU</span><b>78%</b></div>
                    <div><span>RAM</span><b>64%</b></div>
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
            </aside>
          </div>

          <section className="bottom-grid">
            <div className="panel traffic-panel">
              <header>
                <strong>TRAFFIC OVER TIME</strong>
                <span>2.0k/s</span>
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
                  <span><i className="cyan-dot" />&lt; 20ms <b>35%</b></span>
                  <span><i className="green-dot" />20-50ms <b>40%</b></span>
                  <span><i className="yellow-dot" />50-100ms <b>15%</b></span>
                  <span><i className="purple-dot" />100-200ms <b>7%</b></span>
                  <span><i className="red-dot" />&gt; 200ms <b>3%</b></span>
                </div>
              </div>
            </div>

            <div className="panel event-panel">
              <header>
                <strong>EVENT LOG</strong>
                <span>View All</span>
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
                <span>12:30</span>
                <span>12:35</span>
                <span>12:40</span>
                <span>12:45</span>
              </div>

              <div className="timeline-line">
                <i /><i /><i /><i /><b />
              </div>

              <div className="timeline-events">
                <div><span className="yellow-badge">!</span><b>Database latency spike</b><small>12:40:12</small></div>
                <div><span className="purple-badge">!</span><b>Packet loss detected</b><small>12:41:07</small></div>
                <div><span className="blue-badge">i</span><b>High traffic</b><small>12:43:22</small></div>
              </div>

              <button className="export">⇩ Export Report</button>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
