# Local Asterisk PBX (for testing)

A disposable Asterisk container with chan_pjsip + WebSocket transport. Two pre-configured WebRTC extensions (`1001` and `1002`) and an echo test at `600`.

## Start

```bash
cd docker/pbx
docker compose up -d
```

The container uses `network_mode: host` so WebSocket (port **8088**) and RTP (**10000–10200/udp**) are reachable from the browser on localhost.

## Register a softphone

Open two browser tabs to the app, register each with different credentials:

**Tab 1 (alice)**
| Field | Value |
|---|---|
| WebSocket URI | `ws://localhost:8088/ws` |
| SIP URI | `sip:1001@localhost` |
| Auth user | `1001` |
| Password | `secret1001` |

**Tab 2 (bob)**
| Field | Value |
|---|---|
| WebSocket URI | `ws://localhost:8088/ws` |
| SIP URI | `sip:1002@localhost` |
| Auth user | `1002` |
| Password | `secret1002` |

Then dial `1002` from Alice's tab (or `1001` from Bob's). Dial `600` for an echo test.

## Notes

- Uses `ws://` (not `wss://`). Browsers accept plain WebSocket from `http://localhost` origins.
- For non-localhost deployment you must terminate TLS and use `wss://`.
- Stop with `docker compose down`.
- Config files are bind-mounted from `config/` — edit and restart to apply.

## Troubleshooting

Tail the Asterisk console:

```bash
docker exec -it softphone-pbx asterisk -rvvv
```

Common checks:

```
pjsip show endpoints
pjsip show aors
pjsip show contacts
```
