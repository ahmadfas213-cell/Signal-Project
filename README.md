# SIGNAL

SIGNAL is a network monitoring dashboard built with React, TypeScript, Vite, and a Node.js backend.

The project collects a few real measurements, such as HTTP response times and the connection time between the browser and the SIGNAL server. Other parts of the dashboard are still using sample data. The sections below explain which is which.

## What works now

- Checks whether selected public endpoints respond and records their HTTP status and response time.
- Measures browser-to-server round-trip time with WebSocket ping/pong.
- Loads public RIPE Atlas probe locations for the global map.
- Filters the loaded probe list by country.
- Shows probe details such as location, country, ASN, and registry status.
- Provides network reports and event panels.
- Builds the frontend for GitHub Pages and includes a Render service configuration for the backend.

## Where the data comes from

| Dashboard data | Source | Current status |
| --- | --- | --- |
| External endpoint response time and HTTP status | Backend HTTP requests | Measured |
| Browser-to-SIGNAL-server RTT | WebSocket ping/pong | Measured |
| Probe location, country, ASN, and registry status | RIPE Atlas public registry | Live registry data |
| Per-node latency and packet loss in the sample topology | Local demo model | Simulated |
| Traffic chart and packet animations | Frontend demo model | Simulated |
| Latency or routes between RIPE Atlas probes | Not collected yet | Unavailable |
| Wi-Fi or cellular signal strength in dBm | Not exposed by standard browser APIs | Unavailable |

The map uses a sample of active public RIPE Atlas probes. A marker only tells you where a registered probe is listed. It does not mean SIGNAL has measured that probe's latency. Country coverage can also vary depending on the returned sample.

## Run it locally

Requirements: Node.js 22 or newer and npm.

Install the dependencies:

```bash
cd signal
npm ci
```

Start the backend in one terminal:

```bash
npm run server
```

The backend uses port `3000` by default.

Start the frontend in another terminal:

```bash
npm run dev
```

Open the local address printed by Vite. During development, the frontend connects to `ws://localhost:3000`.

## Backend endpoints

| Method and path | Description |
| --- | --- |
| `GET /api/health` | Backend health status |
| `GET /api/network` | Combined telemetry snapshot |
| `GET /api/probes` | Results from external HTTP checks |
| `GET /api/global-probes` | Cached RIPE Atlas probe locations |

External HTTP checks refresh about every 10 seconds. The global probe registry is refreshed about every 5 minutes. Registry results are cached in memory and fetched using a bounded, multi-page sample.

## Deployment

### Frontend on GitHub Pages

The workflow at `.github/workflows/deploy.yml` builds the `signal/` directory and publishes `signal/dist` to GitHub Pages when the frontend or workflow changes.

### Backend on Render

The root `render.yaml` contains the Render Blueprint configuration. To connect the hosted frontend to the backend:

1. Import this repository into Render as a Blueprint.
2. Deploy the `signal-telemetry` service.
3. Copy the service's HTTPS address.
4. Change the scheme from `https://` to `wss://`.
5. In GitHub, open Settings → Secrets and variables → Actions → Variables.
6. Add `VITE_SIGNAL_WS_URL` with the `wss://` address.
7. Run the **Deploy Signal to GitHub Pages** workflow again.

The frontend uses this hostname to determine the HTTP API address too. Until the backend is deployed and the variable is set, the public site cannot load hosted telemetry or connect to the WebSocket.

A free hosting service may sleep while idle, so its first request can take longer.

## Troubleshooting

**The dashboard cannot connect**

- Check that the backend is running and that `GET /api/health` responds.
- For the hosted site, check the `VITE_SIGNAL_WS_URL` repository variable.
- Check the browser console and Network panel for failed requests or WebSocket errors.
- If the backend is on a free plan, wait for the service to wake up.

**The global probe map is empty**

- Open `/api/global-probes` on the backend host.
- Check the backend logs for failed requests or rate limits.
- Keep in mind that registry locations are not latency measurements.

**The local frontend uses the wrong backend**

- Start the backend before opening the frontend.
- Check that the backend is listening on port `3000`.
- The local WebSocket address is `ws://localhost:3000`.

## Next steps

- [ ] Deploy and test the hosted backend from end to end.
- [x] Load probe locations from multiple registry pages and report partial results.
- [x] Filter the global probe map by country.
- [x] Open probe details from map markers.
- [ ] Improve country coverage and show when each sample was fetched.
- [ ] Add actual RIPE Atlas latency measurements and traceroute data where available.
- [ ] Store historical measurements instead of keeping charts session-only.
- [ ] Add alert thresholds and incident acknowledgement.
- [ ] Add ASN filtering and latency overlays based on measured results.
- [ ] Add automated tests for API responses, calculations, and UI states.
- [ ] Review dependency audit findings and keep dependencies updated.

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

No license has been added yet. Until one is added, the project remains under the default copyright terms.
