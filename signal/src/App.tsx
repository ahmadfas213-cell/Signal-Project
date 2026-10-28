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
type EndpointSample = { endpointId: string; name: string; timestamp: string; status: "online" | "failed" | "blocked"; latency: number | null; error: string | null }
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

const topologyConnections: Array<[string, string]> = [
  ["client", "router"],
  ["mobile", "router"],
  ["router", "cdn"],
  ["router", "api"],
  ["api", "database"],
  ["api", "cache"],
  ["cache", "database"],
  ["cache", "backup"],
  ["monitor", "router"],
  ["monitor", "api"],
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
  const [activePage, setActivePage] = useState<"Overview" | "Nodes" | "Map" | "Incidents" | "History" | "Reports" | "Endpoints" | "Compare" | "SLA Lab" | "Ops Center" | "Reliability" | "Status Page" | "Correlations" | "Playbooks" | "Intelligence" | "Outage Radar">("Overview")
  const [selectedTopology, setSelectedTopology] = useState("Production")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState("")
  const [slaTarget, setSlaTarget] = useState(99.9)
  const [slaPeriod, setSlaPeriod] = useState(30)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [diagnostic, setDiagnostic] = useState("No diagnostic running")
  const [traceTarget, setTraceTarget] = useState("cloudflare.com")
  const [tab, setTab] = useState<"Overview" | "Metrics" | "Logs" | "Alerts">("Overview")
  const [serverOnline, setServerOnline] = useState(false)
  const [clientRtt, setClientRtt] = useState<number | null>(null)
  const [deviceNetwork, setDeviceNetwork] = useState<DeviceNetworkInfo | null>(null)
  const [globalProbeData, setGlobalProbeData] = useState<GlobalProbeResponse | null>(null)
  const globalMapElement = useRef<HTMLDivElement | null>(null)
  const globalMapInstance = useRef<any>(null)
  const globalMapMarkers = useRef<any>(null)
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
  const [endpointHistory, setEndpointHistory] = useState<EndpointSample[]>(() => { try { return JSON.parse(localStorage.getItem("signal-endpoint-history-v1") || "[]") } catch { return [] } })
  const [reliabilityWindow, setReliabilityWindow] = useState("all")
  const [endpointName, setEndpointName] = useState("")
  const [endpointUrl, setEndpointUrl] = useState("")
  const [latencyThreshold, setLatencyThreshold] = useState(() => Number(localStorage.getItem("signal-latency-threshold") || 150))
  const [lossThreshold, setLossThreshold] = useState(() => Number(localStorage.getItem("signal-loss-threshold") || 5))
  const [historySamples, setHistorySamples] = useState<HistorySample[]>(() => {
    try { return JSON.parse(localStorage.getItem("signal-history-v1") || "[]") } catch { return [] }
  })
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [incidentSearch, setIncidentSearch] = useState("")
  const [incidentFilter, setIncidentFilter] = useState("all")
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("signal-acknowledged-v1") || "[]") } catch { return [] }
  })
  const [alertsMuted, setAlertsMuted] = useState(() => localStorage.getItem("signal-alerts-muted-v1") === "true")
  const [importStatus, setImportStatus] = useState("")
  const lastHistorySaved = useRef(0)
  const thresholdState = useRef({ latency: false, loss: false })

  const globalCountries = useMemo(() => [...new Set((globalProbeData?.results ?? []).map((probe) => probe.country))].filter((country) => country !== "Unknown").sort(), [globalProbeData])
  const globalVisibleProbes = useMemo(() => (globalProbeData?.results ?? []).filter((probe) => globalCountryFilter === "ALL" || probe.country === globalCountryFilter), [globalProbeData, globalCountryFilter])

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(clock)
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandPaletteOpen((open) => !open)
        setCommandQuery("")
      }
      if (event.key === "Escape") {
        setCommandPaletteOpen(false)
        setCommandQuery("")
      }
    }
    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [])

  useEffect(() => {
    if (selectedTopology !== "Global Internet" || !globalMapElement.current) return
    let disposed = false
    const loadLeaflet = async () => {
      const leafletWindow = window as Window & { L?: any }
      if (!document.querySelector('link[data-signal-leaflet="true"]')) {
        const link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        link.dataset.signalLeaflet = "true"
        document.head.appendChild(link)
      }
      if (!leafletWindow.L) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>('script[data-signal-leaflet="true"]')
          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true })
            existing.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true })
            if (leafletWindow.L) resolve()
            return
          }
          const script = document.createElement("script")
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          script.dataset.signalLeaflet = "true"
          script.onload = () => resolve()
          script.onerror = () => reject(new Error("Leaflet failed to load"))
          document.body.appendChild(script)
        })
      }
      if (disposed || !globalMapElement.current || !leafletWindow.L) return
      const L = leafletWindow.L
      if (globalMapInstance.current && globalMapInstance.current.getContainer() !== globalMapElement.current) {
        globalMapInstance.current.remove()
        globalMapInstance.current = null
        globalMapMarkers.current = null
      }
      if (!globalMapInstance.current) {
        const map = L.map(globalMapElement.current, {
          center: [20, 0],
          zoom: 2,
          minZoom: 2,
          maxZoom: 8,
          worldCopyJump: true,
          zoomControl: false,
          preferCanvas: true,
        })
        L.control.zoom({ position: "bottomright" }).addTo(map)
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map)
        globalMapInstance.current = map
        globalMapMarkers.current = L.layerGroup().addTo(map)
        window.setTimeout(() => map.invalidateSize(), 100)
      }
      const map = globalMapInstance.current
      const markerLayer = globalMapMarkers.current
      markerLayer.clearLayers()

      if (layers.connections && globalVisibleProbes.length > 1) {
        const candidates = globalVisibleProbes
          .filter((probe) => Number.isFinite(probe.latitude) && Number.isFinite(probe.longitude))
          .sort((a, b) => a.id - b.id)
        const routePairs: Array<[number, number]> = [
          [0, Math.floor(candidates.length * 0.22)],
          [Math.floor(candidates.length * 0.08), Math.floor(candidates.length * 0.48)],
          [Math.floor(candidates.length * 0.18), Math.floor(candidates.length * 0.72)],
          [Math.floor(candidates.length * 0.28), Math.floor(candidates.length * 0.88)],
          [Math.floor(candidates.length * 0.38), Math.floor(candidates.length * 0.64)],
          [Math.floor(candidates.length * 0.50), Math.floor(candidates.length * 0.94)],
          [Math.floor(candidates.length * 0.12), Math.floor(candidates.length * 0.82)],
          [Math.floor(candidates.length * 0.32), Math.floor(candidates.length * 0.76)],
          [Math.floor(candidates.length * 0.04), Math.floor(candidates.length * 0.60)],
          [Math.floor(candidates.length * 0.58), Math.floor(candidates.length * 0.90)],
          [Math.floor(candidates.length * 0.16), Math.floor(candidates.length * 0.42)],
          [Math.floor(candidates.length * 0.44), Math.floor(candidates.length * 0.80)],
        ]
        for (const [fromIndex, toIndex] of routePairs) {
          const from = candidates[fromIndex]
          const to = candidates[toIndex]
          if (!from || !to || from.id === to.id) continue
          const longitudeDelta = ((to.longitude - from.longitude + 540) % 360) - 180
          const latLngs: Array<[number, number]> = []
          for (let step = 0; step <= 32; step++) {
            const t = step / 32
            const bend = Math.sin(Math.PI * t) * Math.min(18, Math.abs(longitudeDelta) * 0.12 + 4) * (from.latitude > to.latitude ? 1 : -1)
            latLngs.push([
              from.latitude + (to.latitude - from.latitude) * t + bend,
              from.longitude + longitudeDelta * t,
            ])
          }
          L.polyline(latLngs, {
            color: "#38e8b2",
            weight: 1.6,
            opacity: 0.72,
            dashArray: "5 13",
            className: "signal-animated-route",
            interactive: false,
          }).addTo(markerLayer)
        }
      }

      if (layers.nodes) {
        for (const probe of globalVisibleProbes) {
          const marker = L.circleMarker([probe.latitude, probe.longitude], {
            radius: 4,
            color: "#b7ffe7",
            weight: 1,
            fillColor: "#35e6a5",
            fillOpacity: 0.95,
          })
          marker.bindPopup(
            `<div class="signal-map-popup"><strong>RIPE Atlas probe #${probe.id}</strong><br>${probe.country}<br>${probe.asn ? `AS${probe.asn}` : "ASN unavailable"}<br><small>Registry location only; no live latency reported.</small></div>`
          )
          marker.on("click", () => setSelectedGlobalProbe(probe))
          markerLayer.addLayer(marker)
        }
      }
      window.setTimeout(() => map.invalidateSize(), 80)
    }
    void loadLeaflet().catch(() => {
      if (!disposed) setGlobalProbeError("Interactive map failed to load. Check the map library connection.")
    })
    return () => { disposed = true }
  }, [selectedTopology, activePage, globalVisibleProbes, layers.nodes])

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
  const previousProbeStatuses = useRef<Record<string, string>>({})
  const lastProbeSummaryAt = useRef(0)

  useEffect(() => { localStorage.setItem("signal-alerts-v1", JSON.stringify(alerts.slice(0, 100))) }, [alerts])
  useEffect(() => { localStorage.setItem("signal-acknowledged-v1", JSON.stringify(acknowledgedAlerts)) }, [acknowledgedAlerts])
  useEffect(() => { localStorage.setItem("signal-alerts-muted-v1", String(alertsMuted)) }, [alertsMuted])
  useEffect(() => { localStorage.setItem("signal-endpoints-v1", JSON.stringify(customEndpoints)) }, [customEndpoints])
  useEffect(() => { localStorage.setItem("signal-endpoint-history-v1", JSON.stringify(endpointHistory.slice(-3000))) }, [endpointHistory])
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
        const status: EndpointSample["status"] = response.ok || response.status < 500 ? "online" : "failed"
        const latency = Math.round(performance.now() - started)
        const errorText = status === "online" ? null : `HTTP ${response.status}`
        if (!disposed) {
          setCustomEndpoints((current) => current.map((item) => item.id === endpoint.id ? { ...item, status, latency, checkedAt, error: errorText } : item))
          setEndpointHistory((current) => [...current, { endpointId: endpoint.id, name: endpoint.name, timestamp: checkedAt, status, latency, error: errorText }].slice(-3000))
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Request failed"
        const blocked = /cors|failed to fetch|networkerror/i.test(message)
        const checkedAt = new Date().toISOString()
        const status: EndpointSample["status"] = blocked ? "blocked" : "failed"
        const errorText = blocked ? "Request blocked or CORS unavailable" : message
        if (!disposed) {
          setCustomEndpoints((current) => current.map((item) => item.id === endpoint.id ? { ...item, status, latency: null, checkedAt, error: errorText } : item))
          setEndpointHistory((current) => [...current, { endpointId: endpoint.id, name: endpoint.name, timestamp: checkedAt, status, latency: null, error: errorText }].slice(-3000))
        }
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
      if (!alertsMuted && notificationsEnabled && "Notification" in window && Notification.permission === "granted") fired.forEach((text) => new Notification("SIGNAL threshold alert", { body: text }))
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

          const probes = data.probes
          if (probes?.length) {
            const timestamp = new Date(data.timestamp).toLocaleTimeString("en-GB")
            const probeEvents = probes.flatMap((probe) => {
              const previous = previousProbeStatuses.current[probe.id]
              if (previous === undefined || previous === probe.status) return []
              const tone = probe.status === "online" ? "green" : probe.status === "warning" ? "yellow" : "red"
              return [{
                time: timestamp,
                tone,
                text: `HTTP probe ${probe.name}: ${previous.toUpperCase()} → ${probe.status.toUpperCase()}`,
              }]
            })
            if (probeEvents.length) setEventLog((current) => [...probeEvents, ...current].slice(0, 40))
            previousProbeStatuses.current = Object.fromEntries(probes.map((probe) => [probe.id, probe.status]))

            const nowMs = Date.now()
            if (nowMs - lastProbeSummaryAt.current >= 30000) {
              const online = probes.filter((probe) => probe.status === "online").length
              const checked = probes.filter((probe) => probe.status !== "pending").length
              const tone = checked > 0 && online === checked ? "green" : online === 0 ? "red" : "yellow"
              setEventLog((current) => [{
                time: timestamp,
                tone,
                text: `HTTP probe sweep: ${online}/${checked || probes.length} targets responding`,
              }, ...current].slice(0, 40))
              lastProbeSummaryAt.current = nowMs
            }
          }

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

  const runDiagnostic = async (tool: "Ping" | "Traceroute" | "Packet Monitor" | "Performance Test", targetHost = traceTarget) => {
    const timestamp = new Date().toLocaleTimeString("en-GB")
    if (tool === "Traceroute") {
      const configuredUrl = import.meta.env.VITE_SIGNAL_WS_URL
      const socketUrl = configuredUrl || (import.meta.env.DEV ? "ws://localhost:3000" : "")
      const apiBase = socketUrl ? socketUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "") : ""
      if (!apiBase) {
        const message = "Real traceroute requires the public SIGNAL backend to be configured."
        setDiagnostic(message)
        setEventLog((current) => [{ time: timestamp, tone: "yellow", text: message }, ...current].slice(0, 100))
        setTab("Logs")
        return
      }
      setDiagnostic("Running real system traceroute to cloudflare.com…")
      try {
        const response = await fetch(`${apiBase}/api/diagnostics/traceroute?host=${encodeURIComponent(targetHost)}`, { cache: "no-store" })
        const data = await response.json() as { host?: string; command?: string; output?: string; error?: string; note?: string }
        const result = response.ok ? `Traceroute to ${data.host} via ${data.command}:\n${data.output}\n${data.note ?? ""}` : `Traceroute unavailable: ${data.error ?? "Request failed"}\n${data.note ?? ""}`
        setDiagnostic(result)
        setEventLog((current) => [{ time: new Date().toLocaleTimeString("en-GB"), tone: response.ok ? "green" : "yellow", text: result.slice(0, 500) }, ...current].slice(0, 100))
      } catch (error) {
        setDiagnostic(error instanceof Error ? error.message : "Traceroute request failed")
      }
      setTab("Logs")
      return
    }
    const result = tool === "Ping"
      ? `Live client-to-server RTT: ${clientRtt === null ? "measuring…" : `${clientRtt}ms`}; external endpoint latency: ${network.latency ?? "measuring…"}ms`
      : tool === "Packet Monitor"
        ? `Packet monitor started for ${selectedNode.name}`
        : `Demo performance test: ${formatTraffic(network.traffic)}, ${selected.latency}ms latency`
    setDiagnostic(result)
    setEventLog((current) => [{ time: timestamp, tone: "green", text: result }, ...current].slice(0, 100))
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


  const commandItems = [
    ...(["Overview", "Nodes", "Map", "Incidents", "History", "Reports", "Endpoints", "Compare", "SLA Lab", "Ops Center", "Reliability", "Status Page", "Correlations", "Playbooks", "Intelligence", "Outage Radar"] as const).map((page) => ({
      label: `Open ${page}`,
      detail: "Navigate",
      keywords: page.toLowerCase(),
      run: () => setActivePage(page),
    })),
    { label: "Run RTT check", detail: "Diagnostics", keywords: "ping latency rtt", run: () => { void runDiagnostic("Ping") } },
    { label: "Run traceroute", detail: "Diagnostics", keywords: "trace route hops", run: () => { void runDiagnostic("Traceroute") } },
    { label: "Run packet monitor", detail: "Diagnostics", keywords: "packet inspect node", run: () => { void runDiagnostic("Packet Monitor") } },
    { label: "Run performance test", detail: "Diagnostics", keywords: "benchmark speed performance", run: () => { void runDiagnostic("Performance Test") } },
    { label: "Export CSV report", detail: "Reports", keywords: "download export csv", run: exportReport },
    { label: "Open settings", detail: "Preferences", keywords: "settings thresholds notifications", run: () => setSettingsOpen(true) },
    { label: "Toggle incident mode", detail: "View", keywords: "incident highlight focus", run: () => setIncidentMode((value) => !value) },
    { label: "Pause / resume telemetry", detail: "Realtime", keywords: "pause play stream", run: () => setPaused((value) => !value) },
  ]
  const filteredCommands = commandItems.filter((command) => `${command.label} ${command.detail} ${command.keywords}`.toLowerCase().includes(commandQuery.trim().toLowerCase()))

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
            ["⇄", "Compare"],
            ["◷", "SLA Lab"],
            ["⌘", "Ops Center"],
            ["◴", "Reliability"],
            ["◫", "Status Page"],
            ["⌁", "Correlations"],
            ["⚙", "Playbooks"],
            ["✦", "Intelligence"],
            ["⌁", "Outage Radar"],
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

              {selectedTopology === "Global Internet" && <div className="global-leaflet-map" ref={globalMapElement} aria-label="Interactive geographic map of RIPE Atlas probes" />}
              {selectedTopology === "Global Internet" && selectedGlobalProbe && <div className="global-probe-detail"><div><span className="eyebrow">RIPE ATLAS PROBE</span><button type="button" onClick={() => setSelectedGlobalProbe(null)} aria-label="Close probe details">×</button></div><strong>Probe #{selectedGlobalProbe.id}</strong><dl><dt>Country</dt><dd>{selectedGlobalProbe.country}</dd><dt>ASN</dt><dd>{selectedGlobalProbe.asn ? `AS${selectedGlobalProbe.asn}` : "Not reported"}</dd><dt>Latitude</dt><dd>{selectedGlobalProbe.latitude.toFixed(4)}°</dd><dt>Longitude</dt><dd>{selectedGlobalProbe.longitude.toFixed(4)}°</dd><dt>Registry status</dt><dd>{selectedGlobalProbe.status}</dd></dl><small>Registry metadata only. This view has no latency measurement for this probe.</small></div>}
              {selectedTopology !== "Global Internet" && (layers.connections || layers.packets) && (
                <svg className="connection-layer" viewBox="0 0 166.67 100" preserveAspectRatio="none" aria-hidden="true">
                  {topologyConnections.map(([fromId, toId], index) => {
                    const from = nodes.find((node) => node.id === fromId)
                    const to = nodes.find((node) => node.id === toId)
                    if (!from || !to) return null
                    const x1 = from.x * 1.6667
                    const x2 = to.x * 1.6667
                    const bend = ((index % 3) - 1) * 4
                    const path = `M ${x1} ${from.y} Q ${(x1 + x2) / 2} ${(from.y + to.y) / 2 + bend} ${x2} ${to.y}`
                    const status = (runtime[toId] ?? initialRuntime[toId]).status
                    return (
                      <g className={`connection-group ${status === "warning" ? "warning" : status === "critical" ? "critical" : ""}`} key={fromId + "-" + toId}>
                        {layers.connections && <path d={path} className="connection-line" />}
                        {layers.packets && layers.traffic && !paused && <circle r="0.34" className="packet">
                          <animateMotion path={path} dur={`${(5.8 + (index % 4) * 1.1) / speed}s`} repeatCount="indefinite" begin={`${index * -1.1}s`} />
                        </circle>}
                      </g>
                    )
                  })}
                </svg>
              )}
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

              {activePage === "Compare" && <>
                <div className="page-heading"><div><span className="eyebrow">LIVE ENDPOINT BENCHMARK</span><h1>Endpoint comparison</h1><p>Compare the latest response times for endpoints monitored in this browser. Values update when the endpoint monitor performs its next check.</p></div><span className="page-count">{customEndpoints.length} endpoints</span></div>
                <div className="compare-summary">
                  <article><span>Fastest response</span><strong>{customEndpoints.filter((item) => item.status === "online" && item.latency !== null).length ? Math.min(...customEndpoints.filter((item) => item.status === "online" && item.latency !== null).map((item) => item.latency as number)) + " ms" : "—"}</strong><small>{customEndpoints.filter((item) => item.status === "online" && item.latency !== null).sort((a, b) => (a.latency ?? Infinity) - (b.latency ?? Infinity))[0]?.name ?? "No live samples yet"}</small></article>
                  <article><span>Responding</span><strong>{customEndpoints.filter((item) => item.status === "online").length} / {customEndpoints.length}</strong><small>Browser-reachable endpoints</small></article>
                  <article><span>Blocked by CORS</span><strong>{customEndpoints.filter((item) => item.status === "blocked").length}</strong><small>Reachability cannot be confirmed</small></article>
                </div>
                <div className="compare-list">
                  {customEndpoints.length ? [...customEndpoints].sort((a, b) => {
                    const rank = (status: CustomEndpoint["status"]) => status === "online" ? 0 : status === "pending" ? 1 : status === "blocked" ? 2 : 3
                    return rank(a.status) - rank(b.status) || (a.latency ?? Infinity) - (b.latency ?? Infinity)
                  }).map((endpoint, index, sorted) => {
                    const maxLatency = Math.max(1, ...sorted.map((item) => item.latency ?? 0))
                    const width = endpoint.latency === null ? 0 : Math.max(3, Math.min(100, endpoint.latency / maxLatency * 100))
                    return <article className="compare-row" key={endpoint.id}>
                      <div className="compare-rank">{endpoint.status === "online" && endpoint.latency !== null ? String(index + 1).padStart(2, "0") : "—"}</div>
                      <div className="compare-main"><div className="compare-title"><strong>{endpoint.name}</strong><span className={`endpoint-status ${endpoint.status}`}>{endpoint.status.toUpperCase()}</span></div><small>{endpoint.url}</small><div className="compare-track"><span style={{ width: `${width}%` }} /></div></div>
                      <div className="compare-latency"><strong>{endpoint.latency === null ? "—" : `${endpoint.latency} ms`}</strong><small>{endpoint.checkedAt ? new Date(endpoint.checkedAt).toLocaleTimeString("en-GB") : "Not checked"}</small></div>
                    </article>
                  }) : <div className="empty-state">Add endpoints on the Endpoints page to compare their response times.</div>}
                </div>
                <p className="endpoint-note">This ranks only the latest browser-side fetch timings, not a long-term benchmark. Browser location, network conditions, caching, and CORS affect results. A blocked request is not proof that a server is offline.</p>
                <div className="page-actions"><button className="export" onClick={() => {
                  const rows = [["Endpoint", "URL", "Status", "Latency (ms)", "Last checked", "Error"], ...[...customEndpoints].sort((a, b) => (a.latency ?? Infinity) - (b.latency ?? Infinity)).map((item) => [item.name, item.url, item.status, String(item.latency ?? ""), item.checkedAt ?? "", item.error ?? ""])]
                  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\\r\\n")
                  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
                  const link = document.createElement("a"); link.href = url; link.download = "signal-endpoint-comparison.csv"; link.click(); URL.revokeObjectURL(url)
                }}>⇩ Export comparison CSV</button><button className="export" onClick={() => setActivePage("Endpoints")}>Manage endpoints</button></div>
              </>}
              {activePage === "SLA Lab" && <>
                <div className="page-heading"><div><span className="eyebrow">RELIABILITY PLANNING</span><h1>SLA budget calculator</h1><p>Calculate the maximum downtime allowed by a target availability agreement. This is a planning calculator, not a claim about observed uptime.</p></div></div>
                <div className="sla-controls">
                  <label><span>Availability target</span><select value={slaTarget} onChange={(event) => setSlaTarget(Number(event.target.value))}><option value={99}>99%</option><option value={99.5}>99.5%</option><option value={99.9}>99.9%</option><option value={99.95}>99.95%</option><option value={99.99}>99.99%</option><option value={99.999}>99.999%</option></select></label>
                  <label><span>Measurement period</span><select value={slaPeriod} onChange={(event) => setSlaPeriod(Number(event.target.value))}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>365 days</option></select></label>
                </div>
                <div className="sla-hero"><span>Permitted downtime</span><strong>{(() => { const minutes = slaPeriod * 24 * 60 * (1 - slaTarget / 100); if (minutes < 1) return `${Math.round(minutes * 60)} seconds`; if (minutes < 60) return `${minutes.toFixed(1)} minutes`; if (minutes < 1440) return `${(minutes / 60).toFixed(2)} hours`; return `${(minutes / 1440).toFixed(2)} days` })()}</strong><small>At {slaTarget}% availability across {slaPeriod} {slaPeriod === 1 ? "day" : "days"}</small></div>
                <div className="sla-grid">
                  {[99, 99.5, 99.9, 99.95, 99.99, 99.999].map((target) => {
                    const minutes = slaPeriod * 1440 * (1 - target / 100)
                    const formatted = minutes < 1 ? `${Math.round(minutes * 60)} sec` : minutes < 60 ? `${minutes.toFixed(1)} min` : minutes < 1440 ? `${(minutes / 60).toFixed(2)} hr` : `${(minutes / 1440).toFixed(2)} days`
                    return <button className={slaTarget === target ? "sla-option selected" : "sla-option"} key={target} onClick={() => setSlaTarget(target)}><span>{target}%</span><strong>{formatted}</strong><small>downtime budget</small></button>
                  })}
                </div>
                <div className="diagnostic-card"><strong>How this is calculated</strong><p>Allowed downtime = period duration × (1 − availability target). For example, 99.9% over 30 days permits 43.2 minutes of downtime. Actual SLA measurement depends on the contract's definition of downtime, exclusions, and monitoring method.</p></div>
              </>}
              {activePage === "Ops Center" && <>
                <div className="page-heading"><div><span className="eyebrow">OPERATIONS TOOLKIT</span><h1>Ops Center</h1><p>Ten practical controls for alerts, endpoints, and portable diagnostics. Local settings stay in this browser.</p></div><span className="page-count">10 tools</span></div>
                <div className="ops-grid">
                  <article className="ops-card"><span className="eyebrow">01 · INCIDENT SEARCH</span><h3>Find an alert</h3><input value={incidentSearch} onChange={(event) => setIncidentSearch(event.target.value)} placeholder="Search alert text or time" aria-label="Search alerts" /><small>Filters incident records as you type.</small></article>
                  <article className="ops-card"><span className="eyebrow">02 · SEVERITY FILTER</span><h3>Filter by severity</h3><select value={incidentFilter} onChange={(event) => setIncidentFilter(event.target.value)} aria-label="Filter alert severity"><option value="all">All severities</option><option value="red">Critical</option><option value="yellow">Warning</option><option value="green">Healthy / recovery</option></select><small>{alerts.filter((item) => incidentFilter === "all" || item.tone === incidentFilter).length} matching alerts.</small></article>
                  <article className="ops-card"><span className="eyebrow">03 · ACKNOWLEDGEMENTS</span><h3>Review alerts</h3><strong className="ops-number">{acknowledgedAlerts.length}</strong><small>Alert signatures acknowledged on this browser.</small><button className="export" onClick={() => { const pending = alerts.filter((item) => !acknowledgedAlerts.includes(item.time + "|" + item.text)); setAcknowledgedAlerts((current) => [...new Set([...current, ...pending.map((item) => item.time + "|" + item.text)])]); setDiagnostic(`Acknowledged ${pending.length} visible alerts`) }}>Acknowledge all</button></article>
                  <article className="ops-card"><span className="eyebrow">04 · ALERT SILENCE</span><h3>Notification silence</h3><strong className="ops-number">{alertsMuted ? "SILENCED" : "ACTIVE"}</strong><small>Controls browser desktop notifications, not telemetry collection.</small><button className="export" onClick={() => setAlertsMuted((value) => !value)}>{alertsMuted ? "Resume notifications" : "Silence notifications"}</button></article>
                  <article className="ops-card"><span className="eyebrow">05 · SNAPSHOT EXPORT</span><h3>Export JSON snapshot</h3><p>Download current measurements, node runtime, alerts, event log, and history.</p><button className="export" onClick={() => { const snapshot = { exportedAt: new Date().toISOString(), topology: selectedTopology, source: { probes: "live HTTP checks", nodeTelemetry: "simulated", clientRtt: "browser-to-SIGNAL server" }, network, runtime, alerts, eventLog, historySamples }; const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "signal-snapshot.json"; link.click(); URL.revokeObjectURL(url); setDiagnostic("JSON snapshot exported") }}>⇩ Download snapshot</button></article>
                  <article className="ops-card"><span className="eyebrow">06 · ENDPOINT BACKUP</span><h3>Export endpoint config</h3><p>Save custom endpoint names, URLs, and enabled state for backup or migration.</p><button className="export" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(customEndpoints.map(({id,name,url,enabled}) => ({id,name,url,enabled})), null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "signal-endpoints.json"; link.click(); URL.revokeObjectURL(url); setDiagnostic("Endpoint configuration exported") }}>⇩ Export endpoints</button></article>
                  <article className="ops-card"><span className="eyebrow">07 · ENDPOINT RESTORE</span><h3>Import endpoint config</h3><p>Choose a JSON file previously exported by SIGNAL. Existing endpoint IDs are replaced safely.</p><label className="ops-file">Choose JSON file<input type="file" accept="application/json,.json" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const parsed = JSON.parse(await file.text()); if (!Array.isArray(parsed) || parsed.some((item) => typeof item.name !== "string" || typeof item.url !== "string" || !/^https?:\/\//i.test(item.url))) throw new Error("Expected an array of HTTP(S) endpoints"); const imported: CustomEndpoint[] = parsed.slice(0, 100).map((item) => ({ id: typeof item.id === "string" ? item.id : crypto.randomUUID(), name: item.name.slice(0, 80), url: item.url, enabled: item.enabled !== false, status: "pending", latency: null, checkedAt: null, error: null })); setCustomEndpoints((current) => [...imported, ...current.filter((item) => !imported.some((incoming) => incoming.id === item.id))].slice(0, 100)); setImportStatus(`Imported ${imported.length} endpoints`) } catch (error) { setImportStatus(error instanceof Error ? error.message : "Could not import JSON") } event.target.value = "" }} /></label><small>{importStatus || "Maximum 100 imported endpoints."}</small></article>
                  <article className="ops-card"><span className="eyebrow">08 · BULK ENABLE</span><h3>Enable all endpoints</h3><p>Turn on monitoring for every saved endpoint.</p><button className="export" onClick={() => setCustomEndpoints((current) => current.map((item) => ({ ...item, enabled: true })))}>Enable monitoring</button></article>
                  <article className="ops-card"><span className="eyebrow">09 · BULK PAUSE</span><h3>Pause all endpoints</h3><p>Stop browser-side endpoint checks without deleting the configuration.</p><button className="export" onClick={() => setCustomEndpoints((current) => current.map((item) => ({ ...item, enabled: false })))}>Pause monitoring</button></article>
                  <article className="ops-card"><span className="eyebrow">10 · ALERT CLEANUP</span><h3>Clear alert feed</h3><p>Remove local alert records. This does not change network measurements.</p><button className="export danger" onClick={() => { setAlerts([]); setAcknowledgedAlerts([]); localStorage.removeItem("signal-alerts-v1"); setDiagnostic("Local alert feed cleared") }}>Clear all alerts</button></article>
                </div>
                <div className="page-heading ops-subheading"><div><span className="eyebrow">FILTERED INCIDENT FEED</span><h2>Recent alerts</h2><p>Mark individual alerts acknowledged; acknowledged state persists locally.</p></div><span className="page-count">{alerts.filter((item) => (incidentFilter === "all" || item.tone === incidentFilter) && (item.text + " " + item.time).toLowerCase().includes(incidentSearch.toLowerCase())).length} results</span></div>
                <div className="incident-list">{alerts.filter((item) => (incidentFilter === "all" || item.tone === incidentFilter) && (item.text + " " + item.time).toLowerCase().includes(incidentSearch.toLowerCase())).map((item, index) => { const key = item.time + "|" + item.text; const acknowledged = acknowledgedAlerts.includes(key); return <article className={`incident-card ${item.tone}`} key={key + index}><i className={`legend-dot ${item.tone === "yellow" ? "warning" : item.tone}`} /><div><strong>{item.text}</strong><small>{item.time} · {acknowledged ? "ACKNOWLEDGED" : "UNACKNOWLEDGED"}</small></div><button className="export" onClick={() => setAcknowledgedAlerts((current) => acknowledged ? current.filter((entry) => entry !== key) : [...current, key])}>{acknowledged ? "Undo ACK" : "Acknowledge"}</button></article>})}{!alerts.length && <div className="empty-state">No alerts to display yet.</div>}</div>
              </>}
              {activePage === "Status Page" && <>
                <div className="page-heading"><div><span className="eyebrow">PORTABLE SERVICE OVERVIEW</span><h1>Status page</h1><p>A lightweight service-status snapshot built from current browser checks. Export it as standalone HTML or JSON. This is a snapshot, not a hosted public status URL.</p></div><span className="page-count">{customEndpoints.length} services</span></div>
                <div className="status-overview-grid">
                  <article className="status-overview-card"><span>Configured services</span><strong>{customEndpoints.length}</strong></article>
                  <article className="status-overview-card"><span>Online</span><strong>{customEndpoints.filter((item) => item.enabled && item.status === "online").length}</strong></article>
                  <article className="status-overview-card"><span>Needs attention</span><strong>{customEndpoints.filter((item) => item.enabled && (item.status === "failed" || item.status === "blocked")).length}</strong></article>
                  <article className="status-overview-card"><span>Last network update</span><strong>{network.timestamp ? new Date(network.timestamp).toLocaleTimeString() : "—"}</strong></article>
                </div>
                <div className="status-service-list">{customEndpoints.map((endpoint) => <article className="status-service-row" key={endpoint.id}><span className={"status-light " + (endpoint.status === "online" ? "online" : endpoint.status === "failed" || endpoint.status === "blocked" ? "failed" : "")} /><div><strong>{endpoint.name}</strong><small>{endpoint.url}</small></div><span className="status-service-state">{endpoint.enabled ? endpoint.status.toUpperCase() : "PAUSED"}</span><span>{endpoint.latency === null ? "—" : endpoint.latency + " ms"}</span></article>)}{!customEndpoints.length && <div className="empty-state">Add endpoints first. A status page without services is mostly decorative.</div>}</div>
                <div className="reliability-toolbar">
                  <button className="export" onClick={() => { const payload = { generatedAt: new Date().toISOString(), source: "SIGNAL browser snapshot", services: customEndpoints.map(({ name, url, enabled, status, latency, checkedAt, error }) => ({ name, url, enabled, status, latency, checkedAt, error })) }; const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "signal-status-snapshot.json"; link.click(); URL.revokeObjectURL(url) }}>⇩ Export JSON</button>
                  <button className="export" onClick={() => { const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char)); const rows = customEndpoints.map((item) => "<tr><td>" + esc(item.name) + "</td><td>" + esc(item.url) + "</td><td>" + esc(item.enabled ? item.status.toUpperCase() : "PAUSED") + "</td><td>" + esc(item.latency === null ? "—" : item.latency + " ms") + "</td></tr>").join(""); const html = "<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>SIGNAL Status</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:0 18px;background:#0b1118;color:#edf5f3}h1{color:#53f6bb}p{color:#91a0a8}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px;border-bottom:1px solid #26333d;overflow-wrap:anywhere}th{color:#53f6bb}</style><h1>SIGNAL · Service Status</h1><p>Snapshot generated " + esc(new Date().toLocaleString()) + ". This file does not update automatically.</p><table><thead><tr><th>Service</th><th>Endpoint</th><th>Status</th><th>Latency</th></tr></thead><tbody>" + (rows || "<tr><td colspan='4'>No services configured</td></tr>") + "</tbody></table></html>"; const blob = new Blob([html], { type: "text/html;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "signal-status-page.html"; link.click(); URL.revokeObjectURL(url) }}>⇩ Export standalone HTML</button>
                </div>
              </>}
              {activePage === "Correlations" && <>
                <div className="page-heading"><div><span className="eyebrow">CROSS-SIGNAL TIMELINE</span><h1>Incident correlations</h1><p>Combines saved network samples and endpoint checks into one timeline. Nearby failures and latency spikes are flagged, but correlation is not proof of cause.</p></div><span className="page-count">{Math.min(100, endpointHistory.length + historySamples.length)} events shown</span></div>
                {(() => { const timeline = [...endpointHistory.map((sample) => ({ timestamp: sample.timestamp, source: sample.name, kind: sample.status === "failed" ? "Endpoint failure" : sample.status === "blocked" ? "Check blocked" : "Endpoint check", detail: sample.latency === null ? sample.error || "No latency available" : sample.latency + " ms", severity: sample.status === "failed" ? "critical" : sample.status === "blocked" ? "warning" : "normal" })), ...historySamples.map((sample) => ({ timestamp: sample.timestamp, source: "Network telemetry", kind: sample.latency !== null && sample.latency > latencyThreshold ? "Latency threshold exceeded" : sample.packetLoss !== null && sample.packetLoss > lossThreshold ? "Packet loss threshold exceeded" : "Network sample", detail: "Latency " + (sample.latency === null ? "—" : sample.latency + " ms") + " · Loss " + (sample.packetLoss === null ? "—" : sample.packetLoss.toFixed(2) + "%"), severity: (sample.latency !== null && sample.latency > latencyThreshold) || (sample.packetLoss !== null && sample.packetLoss > lossThreshold) ? "warning" : "normal" }))].sort((x,y) => new Date(y.timestamp).getTime() - new Date(x.timestamp).getTime()).slice(0,100); return <><div className="status-overview-grid"><article className="status-overview-card"><span>Timeline events</span><strong>{timeline.length}</strong></article><article className="status-overview-card"><span>Failures</span><strong>{timeline.filter((item) => item.severity === "critical").length}</strong></article><article className="status-overview-card"><span>Threshold warnings</span><strong>{timeline.filter((item) => item.severity === "warning").length}</strong></article><article className="status-overview-card"><span>Data sources</span><strong>2</strong></article></div><div className="correlation-list">{timeline.map((item,index) => <article className="correlation-row" key={item.timestamp + item.source + index}><span className={"correlation-mark " + item.severity} /><div><header><strong>{item.kind}</strong><span>{new Date(item.timestamp).toLocaleString()}</span></header><p>{item.source} · {item.detail}</p></div></article>)}{!timeline.length && <div className="empty-state">No saved events yet. Keep SIGNAL open while checks run to build the timeline.</div>}</div></> })()}
              </>}
              {activePage === "Playbooks" && <>
                <div className="page-heading"><div><span className="eyebrow">LIGHTWEIGHT OPERATIONS</span><h1>Playbooks</h1><p>Portable incident bundles and maintenance utilities. Everything runs locally without a background worker.</p></div><span className="page-count">4 utilities</span></div>
                <div className="ops-grid">
                  <article className="ops-card"><span className="eyebrow">01 · INCIDENT BUNDLE</span><h3>Export diagnostic bundle</h3><p>Package current metrics, node states, endpoint configuration, recent samples, and alerts into one JSON file.</p><button className="export" onClick={() => { const payload = { generatedAt: new Date().toISOString(), network, runtime, endpoints: customEndpoints, endpointHistory: endpointHistory.slice(-250), history: historySamples.slice(-250), alerts: alerts.slice(-100), thresholds: { latencyMs: latencyThreshold, packetLossPercent: lossThreshold }, note: "Local browser snapshot; includes configured endpoint URLs." }; const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "signal-diagnostic-bundle.json"; link.click(); URL.revokeObjectURL(url) }}>⇩ Export diagnostic bundle</button></article>
                  <article className="ops-card"><span className="eyebrow">02 · CLEANUP</span><h3>Trim local telemetry</h3><p>Clear historical samples from this browser. Endpoint configuration and incident alerts remain intact.</p><button className="export danger" onClick={() => { setHistorySamples([]); setEndpointHistory([]); localStorage.removeItem("signal-history-v1"); localStorage.removeItem("signal-endpoint-history-v1") }}>Clear telemetry history</button></article>
                  <article className="ops-card"><span className="eyebrow">03 · ALERT THRESHOLDS</span><h3>Current alert limits</h3><p>Latency warning: <strong>{latencyThreshold} ms</strong>. Packet loss warning: <strong>{lossThreshold}%</strong>.</p><button className="export" onClick={() => setSettingsOpen(true)}>Open settings</button></article>
                  <article className="ops-card"><span className="eyebrow">04 · RETENTION</span><h3>Local data footprint</h3><p>{endpointHistory.length} endpoint samples and {historySamples.length} network samples currently loaded. History is capped to avoid growing forever on mobile storage.</p><small>Diagnostic bundles include endpoint URLs. Review the file before sharing it publicly.</small></article>
                </div>
              </>}
              {activePage === "Reliability" && <>
                <div className="page-heading"><div><span className="eyebrow">OBSERVED AVAILABILITY</span><h1>Reliability lab</h1><p>Availability and latency statistics calculated from actual endpoint checks recorded by this browser. Blocked/CORS checks are excluded from the availability denominator.</p></div><span className="page-count">{endpointHistory.length} samples</span></div>
                <div className="reliability-toolbar"><label>Analysis window<select value={reliabilityWindow} onChange={(event) => setReliabilityWindow(event.target.value)}><option value="all">All retained history</option><option value="24">Last 24 hours</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option></select></label><button className="export" onClick={() => { const rows = [["Endpoint","URL","Samples","Successful","Failed","Blocked","Observed availability %","Average latency ms","P95 latency ms","Window"]]; customEndpoints.forEach((endpoint) => { const cutoff = reliabilityWindow === "all" ? 0 : Date.now() - Number(reliabilityWindow) * 3600000; const samples = endpointHistory.filter((sample) => sample.endpointId === endpoint.id && new Date(sample.timestamp).getTime() >= cutoff); const conclusive = samples.filter((sample) => sample.status !== "blocked"); const latencies = samples.filter((sample) => sample.latency !== null).map((sample) => sample.latency as number).sort((x,y) => x-y); const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * .95) - 1)] : ""; rows.push([endpoint.name,endpoint.url,samples.length,samples.filter((sample) => sample.status === "online").length,samples.filter((sample) => sample.status === "failed").length,samples.filter((sample) => sample.status === "blocked").length,conclusive.length ? (conclusive.filter((sample) => sample.status === "online").length / conclusive.length * 100).toFixed(3) : "",latencies.length ? (latencies.reduce((sum,value) => sum + value,0) / latencies.length).toFixed(1) : "",p95,reliabilityWindow].map(String)) }); const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(",")).join("\\r\\n"); const url = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); const link = document.createElement("a"); link.href=url; link.download="signal-reliability.csv"; link.click(); URL.revokeObjectURL(url) }}>⇩ Export reliability CSV</button><button className="export" onClick={() => { setEndpointHistory([]); localStorage.removeItem("signal-endpoint-history-v1") }}>Clear samples</button></div>
                <div className="reliability-grid">{customEndpoints.map((endpoint) => { const cutoff = reliabilityWindow === "all" ? 0 : Date.now() - Number(reliabilityWindow) * 3600000; const samples = endpointHistory.filter((sample) => sample.endpointId === endpoint.id && new Date(sample.timestamp).getTime() >= cutoff); const conclusive = samples.filter((sample) => sample.status !== "blocked"); const success = conclusive.filter((sample) => sample.status === "online").length; const failures = conclusive.filter((sample) => sample.status === "failed").length; const latencies = samples.filter((sample) => sample.latency !== null).map((sample) => sample.latency as number).sort((x,y) => x-y); const avg = latencies.length ? Math.round(latencies.reduce((sum,value) => sum + value,0) / latencies.length) : null; const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * .95) - 1)] : null; const availability = conclusive.length ? success / conclusive.length * 100 : null; return <article className="reliability-card" key={endpoint.id}><header><div><strong>{endpoint.name}</strong><small>{endpoint.url}</small></div><span className={endpoint.status}>{endpoint.status.toUpperCase()}</span></header><div className="reliability-main"><strong>{availability === null ? "—" : availability.toFixed(2) + "%"}</strong><span>Observed availability</span></div><div className="reliability-metrics"><div><span>Samples</span><strong>{samples.length}</strong></div><div><span>Failures</span><strong>{failures}</strong></div><div><span>Blocked</span><strong>{samples.filter((sample) => sample.status === "blocked").length}</strong></div><div><span>Avg latency</span><strong>{avg === null ? "—" : avg + " ms"}</strong></div><div><span>P95 latency</span><strong>{p95 === null ? "—" : p95 + " ms"}</strong></div></div><div className="reliability-strip">{samples.slice(-48).map((sample,index) => <span key={sample.timestamp + index} title={new Date(sample.timestamp).toLocaleString() + " · " + sample.status + (sample.latency === null ? "" : " · " + sample.latency + " ms")} className={sample.status} />)}</div><small>First sample: {samples[0] ? new Date(samples[0].timestamp).toLocaleString() : "No samples yet"} · Last sample: {samples.at(-1) ? new Date(samples.at(-1)!.timestamp).toLocaleString() : "No samples yet"}</small></article> })}{!customEndpoints.length && <div className="empty-state">Add endpoints in Endpoint Monitor to build reliability history.</div>}</div>
                <div className="diagnostic-card"><strong>How to read these numbers</strong><p>Availability = successful checks ÷ (successful + failed checks). Blocked/CORS requests are excluded because the browser cannot confirm whether the remote service is up. P95 is the response time at or below which 95% of measured latencies fall. History is stored locally, capped at 3,000 total samples, and only accumulates while this dashboard is open. It is not a contractual uptime SLA.</p></div>
              </>}
              {activePage === "Intelligence" && <>
  <div className="page-heading"><div><span className="eyebrow">SIGNAL INTELLIGENCE</span><h1>Network intelligence</h1><p>Rule-based anomaly detection from current measurements and retained browser history. Findings are indicators, not proof of root cause.</p></div><span className="page-count">{historySamples.length} history samples</span></div>
  <div className="status-overview-grid"><article className="status-overview-card"><span>Current latency</span><strong>{network.latency === null ? "—" : network.latency + " ms"}</strong></article><article className="status-overview-card"><span>Browser RTT</span><strong>{clientRtt === null ? "—" : clientRtt + " ms"}</strong></article><article className="status-overview-card"><span>Packet loss</span><strong>{network.packetLoss === null ? "—" : network.packetLoss.toFixed(2) + "%"}</strong></article><article className="status-overview-card"><span>Failed endpoints</span><strong>{customEndpoints.filter(e => e.enabled && e.status === "failed").length}</strong></article></div>
  <div className="correlation-list">{(() => { const vals = historySamples.map(s => s.latency).filter((v): v is number => v !== null); const baseline = vals.length ? vals.reduce((a,b) => a+b,0) / vals.length : null; const findings = [{ title: "Latency anomaly", bad: network.latency !== null && network.latency > latencyThreshold, detail: network.latency === null ? "Waiting for live measurements." : network.latency > latencyThreshold ? "Latency exceeds the configured " + latencyThreshold + " ms threshold." : baseline !== null && baseline > 0 && network.latency > baseline * 1.75 ? "Latency is over 75% above retained average (" + Math.round(baseline) + " ms)." : "No configured latency threshold breach." }, { title: "Packet-loss anomaly", bad: network.packetLoss !== null && network.packetLoss > lossThreshold, detail: network.packetLoss === null ? "Packet-loss metric unavailable." : network.packetLoss > lossThreshold ? "Failure rate exceeds " + lossThreshold + "%." : "No configured packet-loss threshold breach." }, { title: "Endpoint availability", bad: customEndpoints.some(e => e.enabled && e.status === "failed"), detail: customEndpoints.filter(e => e.enabled && e.status === "failed").length + " failed, " + customEndpoints.filter(e => e.enabled && e.status === "blocked").length + " blocked. CORS blocks do not prove an outage." }, { title: "Historical baseline", bad: vals.length < 5, detail: vals.length < 5 ? "Only " + vals.length + " samples retained. Keep SIGNAL open to build a baseline." : "Retained average: " + Math.round(baseline ?? 0) + " ms across " + vals.length + " samples." }]; return findings.map(f => <article className="correlation-row" key={f.title}><span className={"correlation-mark " + (f.bad ? "critical" : "normal")} /><div><header><strong>{f.title}</strong><span>{f.bad ? "REVIEW" : "NORMAL"}</span></header><p>{f.detail}</p></div></article>) })()}</div>
  <div className="page-heading ops-subheading"><div><span className="eyebrow">ROUTE DIAGNOSTICS</span><h2>Live network route visualizer</h2><p>Real system traceroute from the Enzonic hosting server. This is not the route from your laptop; browser security prevents direct OS traceroute access.</p></div><div className="route-controls"><select aria-label="Traceroute destination" value={traceTarget} onChange={(event) => setTraceTarget(event.target.value)}><option value="cloudflare.com">Cloudflare</option><option value="google.com">Google</option><option value="github.com">GitHub</option><option value="microsoft.com">Microsoft</option></select><button className="export" onClick={() => { void runDiagnostic("Traceroute", traceTarget) }}>Run traceroute</button></div></div>
  <div className="diagnostic-card route-result"><div className="route-result-heading"><strong>Route output</strong><span>{diagnostic.toLowerCase().includes("traceroute to") ? "SYSTEM TRACE" : "WAITING / UNAVAILABLE"}</span></div><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{diagnostic.toLowerCase().includes("traceroute") ? diagnostic : "No traceroute run yet. Choose a destination and run the diagnostic."}</pre><small>Some hops may be hidden by firewalls or hosting-provider restrictions. Missing hops do not automatically mean an outage.</small></div>
  <div className="diagnostic-card"><strong>Data integrity</strong><p>This panel uses local rules, not paid AI. Browser RTT and endpoint checks are measured where available; topology counters may be simulated.</p></div>
</>}
{activePage === "Outage Radar" && <>
  <div className="page-heading"><div><span className="eyebrow">SERVICE HEALTH RADAR</span><h1>Internet outage radar</h1><p>Correlates real HTTP checks, browser-side endpoint results, and recent alerts. Geographic probe dots show registry locations, not confirmed outage locations.</p></div><button className="export" onClick={() => { setSelectedTopology("Global Internet"); setActivePage("Map") }}>Open global probe map</button></div>
  <div className="status-overview-grid"><article className="status-overview-card"><span>Failed checks</span><strong>{customEndpoints.filter(e => e.enabled && e.status === "failed").length + (network.probes ?? []).filter(p => p.status !== "online" && !/cors|blocked/i.test(p.error ?? "")).length}</strong></article><article className="status-overview-card"><span>Potentially blocked</span><strong>{customEndpoints.filter(e => e.enabled && e.status === "blocked").length + (network.probes ?? []).filter(p => /cors|blocked/i.test(p.error ?? "")).length}</strong></article><article className="status-overview-card"><span>Healthy checks</span><strong>{customEndpoints.filter(e => e.enabled && e.status === "online").length + (network.probes ?? []).filter(p => p.status === "online").length}</strong></article><article className="status-overview-card"><span>Recent alerts</span><strong>{alerts.length}</strong></article></div>
  <div className="correlation-list">{[...customEndpoints.filter(e => e.enabled).map(e => ({ id: e.id, name: e.name, url: e.url, status: e.status, latency: e.latency, error: e.error, checkedAt: e.checkedAt, source: "Browser check" })), ...(network.probes ?? []).map(p => ({ id: p.id, name: p.name, url: p.url, status: p.status === "online" ? "online" : /cors|blocked/i.test(p.error ?? "") ? "blocked" : "failed", latency: p.latency, error: p.error, checkedAt: p.checkedAt, source: "Backend probe" }))].map(item => <article className="correlation-row" key={item.source + item.id}><span className={"correlation-mark " + (item.status === "online" ? "normal" : item.status === "blocked" ? "warning" : "critical")} /><div><header><strong>{item.name}</strong><span>{item.status.toUpperCase()}</span></header><p>{item.source} · {item.latency === null ? "Latency unavailable" : item.latency + " ms"}{item.checkedAt ? " · Checked " + new Date(item.checkedAt).toLocaleString() : ""}</p>{item.error && <small>{item.error}</small>}<small>{item.url}</small></div></article>)}{!customEndpoints.length && !(network.probes ?? []).length && <div className="empty-state">No endpoint data yet. Add endpoints or wait for backend probes.</div>}</div>
  <div className="page-heading ops-subheading"><div><span className="eyebrow">INCIDENT TIMELINE</span><h2>Latest alerts</h2></div><button className="export" onClick={() => setActivePage("Incidents")}>Open incident center</button></div>
  <div className="incident-list">{alerts.slice(0,8).map((a,i) => <article className={"incident-card " + a.tone} key={a.time+a.text+i}><i className={"legend-dot " + a.tone} /><div><strong>{a.text}</strong><small>{a.time}</small></div></article>)}{!alerts.length && <div className="empty-state">No alert records yet. The radar populates as checks produce events.</div>}</div>
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
                <div className="report-card"><div><span className="eyebrow">SIGNAL NETWORK REPORT</span><h2>{selectedTopology} snapshot</h2><p>Generated from the data currently available in this dashboard.</p><div className="history-summary"><article><span>Nodes</span><strong>{network.nodes}</strong></article><article><span>Connections</span><strong>{network.connections}</strong></article><article><span>Events</span><strong>{eventLog.length}</strong></article></div></div><button className="export" onClick={exportReport}>⇩ Export CSV report</button><button className="export" onClick={() => window.print()}>⇩ Print / Save PDF</button></div>
                <div className="diagnostic-card"><strong>Latest diagnostic</strong><p>{diagnostic}</p><small>Traceroute uses the hosting node system utility when available. Packet monitor and performance test remain illustrative; browser RTT and external endpoint probes are measured live.</small></div>
              </>}
            </section>
          )}

          {commandPaletteOpen && <div className="command-backdrop" role="presentation" onClick={() => setCommandPaletteOpen(false)}>
            <section className="command-dialog" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(event) => event.stopPropagation()}>
              <div className="command-search"><span>⌕</span><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Search pages, diagnostics, actions…" aria-label="Search commands" /><kbd>ESC</kbd></div>
              <div className="command-list">
                {filteredCommands.map((command) => <button key={command.label} className="command-item" onClick={() => { command.run(); setCommandPaletteOpen(false); setCommandQuery("") }}><span><strong>{command.label}</strong><small>{command.detail}</small></span><kbd>↵</kbd></button>)}
                {!filteredCommands.length && <div className="command-empty">No matching commands. Even the command palette has limits.</div>}
              </div>
              <footer><span><kbd>CTRL</kbd> + <kbd>K</kbd> to toggle</span><span>{filteredCommands.length} commands</span></footer>
            </section>
          </div>}
          {settingsOpen && <div className="settings-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}><header><div><span className="eyebrow">PREFERENCES</span><h2 id="settings-title">Signal settings</h2></div><button onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></header><div className="settings-row"><span>Telemetry connection</span><strong className={serverOnline ? "green" : "yellow"}>{serverOnline ? "Connected" : "Disconnected"}</strong></div><div className="settings-row"><span>WebSocket endpoint</span><code>{import.meta.env.VITE_SIGNAL_WS_URL || (import.meta.env.DEV ? "ws://localhost:3000" : "Not configured")}</code></div><div className="settings-row"><span>Latency alert threshold (ms)</span><input className="settings-number" type="number" min={1} max={5000} value={latencyThreshold} onChange={(event) => setLatencyThreshold(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))} /></div><div className="settings-row"><span>Probe failure threshold (%)</span><input className="settings-number" type="number" min={0} max={100} step={0.5} value={lossThreshold} onChange={(event) => setLossThreshold(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} /></div><div className="settings-row"><span>Desktop notifications</span><button onClick={async () => { if (!("Notification" in window)) { setDiagnostic("This browser does not support desktop notifications"); return } const permission = await Notification.requestPermission(); setNotificationsEnabled(permission === "granted"); setDiagnostic(permission === "granted" ? "Desktop alerts enabled" : "Desktop notification permission not granted") }}>{notificationsEnabled ? "Enabled" : "Enable alerts"}</button></div><div className="settings-row"><span>Persistent history</span><button onClick={() => { setHistorySamples([]); localStorage.removeItem("signal-history-v1"); setDiagnostic("Local history cleared") }}>Clear history</button></div><div className="settings-row"><span>Packet animation speed</span><button onClick={() => setSpeed((value) => value === 1 ? 2 : 1)}>{speed}x · Change</button></div><div className="settings-row"><span>Incident highlighting</span><button onClick={() => setIncidentMode((value) => !value)}>{incidentMode ? "Enabled" : "Disabled"}</button></div><p className="settings-note">Custom endpoint checks run in this browser and may be blocked by CORS. Threshold alerts are generated when live measurements cross your configured limits. History and endpoint settings are stored locally in this browser. External endpoint latency and probe loss are measured live by HTTP requests from the backend. Client RTT is measured from this browser to the SIGNAL server. Traffic and per-node topology telemetry remain simulated. Browsers cannot expose Wi-Fi/cellular signal strength in dBm, so this dashboard does not invent a signal-strength reading.</p></section></div>}
        </div>
      </section>
    </main>
  )
}

export default App
