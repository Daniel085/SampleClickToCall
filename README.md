# Sample Click-to-Call

A basic web-based SIP softphone built with [SIP.js](https://sipjs.com/) and WebRTC. Register to any SIP provider that supports SIP-over-WebSocket (WSS), place and receive audio calls from the browser.

## Features (MVP)

- Register / unregister against a SIP account over WSS
- Outbound calls via dial pad
- Inbound calls with ring tone, answer / reject
- In-call: hangup, mute, DTMF keypad (RFC 4733)
- Call state UI with duration timer
- Credentials persisted in `localStorage` (dev only)

## Stack

- Vite + TypeScript (vanilla — no framework)
- SIP.js for SIP signaling
- Browser WebRTC for media (Opus, echo cancellation, ICE)

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173, fill the account form, click **Register**.

## SIP provider requirements

Your provider / PBX must expose **SIP over WebSocket (WSS)**. Examples:

- **Asterisk** — enable `chan_pjsip` with `transport=wss`
- **FreeSWITCH** — enable WSS in `sofia.conf.xml`
- **Kamailio / OpenSIPS** — enable the `websocket` module
- **Twilio Programmable Voice** — use the SIP.js + Twilio Client guide
- **Telnyx** — WebRTC credentials from the portal

Fields:

| Field | Example |
|---|---|
| WebSocket URI | `wss://sip.example.com:7443/ws` |
| SIP URI | `sip:alice@example.com` |
| Auth user | `alice` |
| Password | *** |

## Dialing

- Full URI: `sip:bob@example.com`
- Extension / number: `1001` or `+15551234567` (resolved against the registered domain)

## Scope / non-goals

Out of scope for this MVP: call hold, transfer, conferencing, video, call history, contacts, TURN auth, multi-line, presence/BLF, push notifications.

## Security notes

- Credentials live in `localStorage` — fine for local development, **not** for production. For production, proxy auth via a backend and issue short-lived SIP tokens.
- WSS + SRTP (browser-mandatory) give encrypted signaling and media.
- Behind symmetric NAT you will need a TURN server (wire it into `UserAgentOptions.sessionDescriptionHandlerFactoryOptions.iceServers`).

## Layout

```
index.html          # app shell
styles.css          # theme + layout
src/
  main.ts           # bootstrap
  sip.ts            # SIP.js UserAgent wrapper
  ui.ts             # DOM wiring + state
  audio.ts          # ring tone generator
  config.ts         # localStorage creds
```
