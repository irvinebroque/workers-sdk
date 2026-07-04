---
"@cloudflare/vite-plugin": patch
"@cloudflare/workers-utils": patch
---

Pass through Vitest Browser Mode WebSocket upgrades and improve tunnel readiness

Vitest Browser Mode's browser RPC WebSocket is now left for Vite/Vitest to handle instead of being forwarded to the Worker during `vite dev`, avoiding timeouts when the Worker does not return a WebSocket response.

Auto-started Vite plugin tunnels now publish `CLOUDFLARE_TUNNEL_URL` after any required dev server restart, and quick tunnel readiness waits for cloudflared to register an edge connection plus a short propagation window before the URL is reported.
