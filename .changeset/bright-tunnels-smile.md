---
"@cloudflare/vite-plugin": minor
---

Expose auto-start tunnel URLs through the default environment

Auto-started Vite plugin tunnels now publish their primary public tunnel URL to `process.env.CLOUDFLARE_TUNNEL_URL` when the tunnel is ready.
