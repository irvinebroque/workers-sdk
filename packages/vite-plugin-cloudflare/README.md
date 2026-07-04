# `@cloudflare/vite-plugin`

The Cloudflare Vite plugin enables a full-featured integration between [Vite](https://vite.dev/) and the [Workers runtime](https://developers.cloudflare.com/workers/runtime-apis/).
Your Worker code runs inside [workerd](https://github.com/cloudflare/workerd), matching the production behavior as closely as possible and providing confidence as you develop and deploy your applications.

```ts
// vite.config.ts

import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
});
```

## Documentation

Full documentation can be found [here](https://developers.cloudflare.com/workers/vite-plugin/).

## Features

- Uses the Vite [Environment API](https://vite.dev/guide/api-environment) to integrate Vite with the Workers runtime
- Provides direct access to [Workers runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/) and [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)
- Builds your front-end assets for deployment to Cloudflare, enabling you to build static sites, SPAs, and full-stack applications
- Official support for [TanStack Start](https://tanstack.com/start/) and [React Router v7](https://reactrouter.com/) with server-side rendering
- Leverages Vite's hot module replacement for consistently fast updates
- Supports `vite preview` for previewing your build output in the Workers runtime prior to deployment

## Access the tunnel URL programmatically

When tunnel sharing is enabled, use `tunnel.env` to write the primary public tunnel URL to `process.env` after the tunnel is ready:

```ts
cloudflare({
  tunnel: {
    autoStart: true,
    env: "PUBLIC_TUNNEL_URL",
  },
});
```

This is useful for tools that launch remote browsers, webhooks, OAuth callbacks, and device testing. For example, Vitest Browser Mode can read the public origin from `VITEST_BROWSER_PUBLIC_ORIGIN`:

```ts
cloudflare({
  tunnel: {
    autoStart: true,
    env: "VITEST_BROWSER_PUBLIC_ORIGIN",
  },
});
```

Use `tunnel.onReady` when you need structured tunnel metadata or every URL from a named tunnel:

```ts
cloudflare({
  tunnel: {
    autoStart: true,
    name: "my-tunnel",
    env: ["PUBLIC_DEV_ORIGIN", "VITEST_BROWSER_PUBLIC_ORIGIN"],
    onReady({ url, urls, mode, kind }) {
      console.log(`Tunnel ready for ${mode}: ${url}`);
      console.log(`Tunnel kind: ${kind}; URLs: ${urls.join(", ")}`);
    },
  },
});
```

The tunnel URL is public. For named tunnels with multiple hostnames, `env` receives `context.url`, the first URL; `onReady` receives every URL in `context.urls`. Environment variables are not removed when the tunnel closes.

## Use cases

- [TanStack Start](https://tanstack.com/start/)
- [React Router v7](https://reactrouter.com/)
- Support for more full-stack frameworks is coming soon
- Static sites, such as single-page applications, with or without an integrated backend API
- Standalone Workers
- Multi-Worker applications
