---
"@cloudflare/vite-plugin": minor
---

Expose Cloudflare tunnel URLs programmatically

You can now configure `tunnel.env` to publish the primary public tunnel URL to `process.env` when the tunnel is ready, or use `tunnel.onReady` to receive structured tunnel metadata including all public URLs for named tunnels.
