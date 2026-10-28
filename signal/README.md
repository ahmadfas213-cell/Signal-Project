# SIGNAL Network Monitor

SIGNAL is a React + TypeScript network-monitoring dashboard with a WebSocket telemetry backend.

## What is measured live

- **Browser-to-SIGNAL RTT:** the browser sends an application-level ping over WebSocket every two seconds and measures the round-trip time.
- **External endpoint latency:** the backend performs real HTTP requests to Cloudflare, Google, GitHub, and Microsoft. Latency is measured with a monotonic timer; probes refresh every ten seconds.
- **Probe failure rate:** calculated from the proportion of those HTTP probes that fail.
- **Endpoint health:** the live endpoint panel displays the last result and HTTP status where available.

These are HTTP/WebSocket measurements, not ICMP ping. Results depend on the network path between the deployed backend and the target service.

## What is still simulated

- The visual topology's individual node latency/status, uptime, traffic volume, and connections are demonstration telemetry. They do not represent real router, database, Wi-Fi, or mobile-radio measurements.
- A normal browser website cannot read Wi-Fi/cellular signal strength in dBm or access device radio diagnostics. SIGNAL therefore reports browser-to-server RTT rather than inventing a signal-strength number.
- The displayed probe failure rate is HTTP probe failure rate, not raw packet loss measured by ICMP.

## Run locally

Use Node.js 22 or newer.

```bash
npm ci
npm run server
```

In a second terminal:

```bash
npm run dev
```

The development frontend connects to `ws://localhost:3000` by default. The backend exposes:

- `GET /api/health` - service health
- `GET /api/network` - network telemetry and live probe results
- `GET /api/probes` - external probe results only
- WebSocket `network:update` - telemetry stream
- WebSocket application message `client:ping` / `client:pong` - browser RTT measurement

## Deploy the live backend

The GitHub Pages frontend is static, so it cannot host the WebSocket server itself.

1. Import this repository into Render and deploy the included `render.yaml` blueprint. It creates the `signal-telemetry` web service from the `signal` directory.
2. Copy the deployed backend's public HTTPS URL, for example `https://your-service.onrender.com`.
3. Convert its scheme to WebSocket: `wss://your-service.onrender.com`.
4. In GitHub, open **Settings → Secrets and variables → Actions → Variables**, then create the repository variable `VITE_SIGNAL_WS_URL` with that `wss://...` URL.
5. Trigger the **Deploy Signal to GitHub Pages** workflow again. The build embeds that variable into the static frontend.

Check the backend at `https://your-service.onrender.com/api/health` and `https://your-service.onrender.com/api/probes` before expecting the public dashboard to connect. Free hosted services may sleep when idle, so the first request can take longer.

## Build

```bash
npm run build
```
