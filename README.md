# Sample Click-to-Call

A web-based SIP softphone built with [SIP.js](https://sipjs.com/) and WebRTC. Register to any SIP provider that speaks SIP-over-WebSocket, place and receive audio calls from the browser.

## Features

- Register / unregister against a SIP account over WSS
- Outbound calls via dial pad
- Inbound calls with ring tone, answer / reject
- In-call controls: hangup, mute, DTMF (RFC 4733)
- Live call duration + volume meter
- Call history (persisted in `localStorage`)
- Audio device picker (mic + speaker)
- STUN + TURN server configuration
- **Mock mode** — full UI without a real SIP account
- Keyboard shortcuts: Enter to dial, Esc to hangup
- Toast error surface
- Unit tests (Vitest)
- Disposable Asterisk PBX in Docker for local testing

## Stack

- Vite + TypeScript (vanilla, no framework)
- SIP.js for SIP signaling over WebSocket
- Browser WebRTC for media (Opus, echo cancellation, ICE)

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173.

### Run without a real SIP account

Append `?mock=1` to the URL (or set `localStorage.sip-mock = "1"`). You'll get:

- Fake registration (300ms)
- A simulated inbound call 15s after registering
- Fake outbound "connect" after 1.2s
- Fake volume meter activity
- Full state machine, timers, history, mute, hangup, reject

No SIP traffic is sent.

### Run against a local Asterisk PBX

Spin up a throwaway PBX:

```bash
cd docker/pbx
docker compose up -d
```

See [docker/pbx/README.md](docker/pbx/README.md) for extension credentials. Register two browser tabs to dial between them, or dial `600` for an echo test.

### Run against a real SIP provider

Your provider must expose **SIP over WebSocket (WSS)**. Examples: Asterisk/FreeSWITCH/Kamailio with WS(S) enabled, Twilio Programmable Voice, Telnyx WebRTC.

| Field | Example |
|---|---|
| WebSocket URI | `wss://sip.example.com:7443/ws` |
| SIP URI | `sip:alice@example.com` |
| Auth user | `alice` |
| Password | *** |

Expand **Advanced (ICE / TURN)** to add a TURN server if calls stall on NAT.

## Dialing

- Full URI: `sip:bob@example.com`
- Bare extension / number: `1001` (resolved against the registered domain)

Press **Enter** in the dial input to call; press **Esc** during a call to hang up.

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # tsc + vite build → dist/
npm test             # run unit tests (Vitest)
npm run test:watch   # watch mode
```

## Deployment

### Docker (nginx)

```bash
docker build -t click-to-call .
docker run -p 8080:80 click-to-call
```

### GitHub Pages

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to Pages with base path `/SampleClickToCall/`.

## Project layout

```
index.html             # app shell
styles.css             # theme + layout
src/
  main.ts              # bootstrap + mock toggle
  sip.ts               # real SIP.js UserAgent wrapper
  mock.ts              # FakeSipClient (mock mode)
  types.ts             # SipClientLike interface, pure resolver
  ui.ts                # DOM wiring, state, shortcuts
  audio.ts             # ring tone generator
  volume.ts            # RMS volume meter
  devices.ts           # audio device enumeration
  toast.ts             # toast notifications
  config.ts            # localStorage creds + TURN
tests/                 # Vitest suites
docker/
  pbx/                 # local Asterisk PBX (compose)
  nginx.conf           # serving config for the app image
Dockerfile             # build + nginx image
.github/workflows/     # CI + Pages deploy
```

## Scope / non-goals

Out of scope for this version: call hold, transfer, conferencing, video, multi-line, presence/BLF, push notifications, contacts directory, server-side credential proxy.

## Security notes

- Credentials live in `localStorage` — fine for local dev, **not** for production. For production, proxy auth via a backend and issue short-lived SIP tokens.
- WSS + SRTP (browser-mandatory) give encrypted signaling and media in production.
- Behind symmetric NAT you will need a TURN server.
