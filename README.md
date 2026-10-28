# SIGNAL

**SIGNAL** is an open-source network observability dashboard built with React, TypeScript, Vite, Node.js, HTTP probes, and WebSockets. The long-term goal is a global network intelligence platform that clearly separates measured telemetry from illustrative/demo data.

## Current capabilities

- Live HTTP reachability and response-time probes from the backend to Cloudflare, Google, GitHub, and Microsoft.
- Browser-to-SIGNAL-server round-trip time measured with WebSocket ping/pong.
- Global Internet view using active public probe locations from the RIPE Atlas registry.
- Country filter for the currently loaded public probe sample.
- Geographic world overview with real probe markers.
- Exportable network report and event/incident panels.
- GitHub Pages frontend deployment workflow and Render service blueprint.

## Data integrity

SIGNAL intentionally distinguishes between measurements and visual/demo values.

| Data | Source | Status |
| --- | --- | --- |
| External endpoint response time | HTTP requests from backend | Live measurement |
| External endpoint reachability / HTTP status | HTTP requests from backend | Live measurement |
| Browser RTT to SIGNAL backend | WebSocket ping/pong | Live measurement |
| Probe location, country, ASN, registry status | RIPE Atlas public probe registry | Live registry data |
| Per-node latency and packet loss in the sample topology | Local demo model | Simulated |
| Traffic chart and packet animations | Frontend demo model | Simulated |
| Pairwise latency or routes between RIPE Atlas probes | Not currently collected | Not available; not inferred |
| Wi-Fi/cellular radio signal strength in dBm | Not exposed by standard browser APIs | Not available |

The global view samples multiple pages of active public RIPE Atlas probes. It does **not** guarantee that every country is represented, and it does not mean SIGNAL is measuring every marker's latency. Probe registry locations are not a substitute for measurement results.

## Run locally

Requirements: Node.js 22 or later and npm.

### 1. Install dependencies

```bash
cd signal
npm ci
```

### 2. Start the backend

In one terminal:

```bash
npm run server
```

The backend listens on port `3000` by default.

### 3. Start the frontend

In a second terminal, from the `signal` directory:

```bash
npm run dev
```

Open the local URL printed by Vite. In development, the frontend defaults to `ws://localhost:3000`.

### Backend endpoints

- `GET /api/health` - health status.
- `GET /api/network` - combined telemetry snapshot.
- `GET /api/probes` - external HTTP probe results.
- `GET /api/global-probes` - cached active public RIPE Atlas probe locations.

The backend refreshes external HTTP probes approximately every 10 seconds and global registry data approximately every 5 minutes. Registry calls are cached in memory and use a bounded multi-page sample.

## Deployment

### Frontend: GitHub Pages

The workflow at `.github/workflows/deploy.yml` builds `signal/` and deploys `signal/dist` to GitHub Pages after changes to the frontend or workflow.

### Backend: Render

The root `render.yaml` defines a Node web service using `signal/` as its root directory.

1. Import this repository into Render as a Blueprint.
2. Deploy the `signal-telemetry` web service.
3. Copy the deployed service's HTTPS hostname.
4. Convert the URL scheme to WebSocket form for the frontend variable:
   - HTTPS service URL: `https://YOUR-SERVICE.onrender.com`
   - WebSocket URL: `wss://YOUR-SERVICE.onrender.com`
5. In GitHub, open **Settings → Secrets and variables → Actions → Variables** and add `VITE_SIGNAL_WS_URL` with the `wss://...` value.
6. Rerun the **Deploy Signal to GitHub Pages** workflow.

The same configured hostname is used by the frontend to derive the HTTP API base URL. Until the backend is deployed and the GitHub Actions variable is set, the public frontend cannot fetch live registry data or connect to the hosted telemetry WebSocket.

Free hosting may sleep when idle, so the first request after inactivity can take longer.

## Roadmap

- [ ] Deploy and verify the hosted backend end to end.
- [ ] Improve global probe coverage and show exact sample freshness and partial-fetch warnings.
- [ ] Add genuine RIPE Atlas latency measurements and traceroute data where public results and permissions allow.
- [ ] Add historical persistence instead of session-only charts.
- [ ] Add alert thresholds, incident acknowledgement, and configurable probe targets.
- [ ] Add map interaction, probe detail views, and richer country/ASN filtering.
- [ ] Add automated tests for API responses, telemetry calculations, and UI states.
- [ ] Review dependency audit findings and establish a regular security update process.

## Project structure

```text
Signal-Project/
├── .github/workflows/deploy.yml
├── render.yaml
└── signal/
    ├── server/server.js
    ├── src/App.tsx
    ├── src/App.css
    ├── src/index.css
    ├── package.json
    └── vite.config.ts
```

## License

No license has been declared yet. Until a license is added, assume the usual default copyright applies.
