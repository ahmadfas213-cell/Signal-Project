# Contributing to SIGNAL

Thanks for considering a contribution to SIGNAL.

## Before you start

- Check the README for the current capabilities, data sources, and known limitations.
- For larger changes, open an issue first to describe the problem and proposed approach.
- Keep measured telemetry clearly separated from simulated or illustrative values.

## Local setup

1. Install Node.js 22 or later.
2. From the `signal/` directory, run `npm ci`.
3. Start the backend with `npm run server`.
4. In a second terminal, start the frontend with `npm run dev`.

See the README for deployment details and backend endpoints.

## Pull requests

- Create a focused branch from `main`.
- Keep each pull request limited to one logical change.
- Explain the user-visible impact and any configuration changes.
- Include screenshots for visual changes when practical.
- Test the affected flow locally before opening the pull request.
- Update the README when setup steps, API behavior, or data-source limitations change.

## Data and privacy

Do not commit API keys, access tokens, private endpoints, or personal data. Do not describe simulated values as live measurements. When adding a new data source, document its origin, refresh behavior, and limitations.

## Reporting problems

Include the steps to reproduce the issue, expected behavior, actual behavior, relevant browser-console output, and backend logs with secrets removed.
