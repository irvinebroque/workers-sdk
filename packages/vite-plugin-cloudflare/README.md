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

Use `tunnel.autoStart` when another tool needs a public URL as soon as the dev server starts. The primary public URL is published to `process.env.CLOUDFLARE_TUNNEL_URL` after the tunnel is ready:

```ts
cloudflare({
  tunnel: {
    autoStart: true,
  },
});
```

This is useful for tools that launch remote browsers, webhooks, OAuth callbacks, and device testing. For example, Vitest Browser Mode can read the public origin from `CLOUDFLARE_TUNNEL_URL`:

```ts
cloudflare({
  tunnel: {
    autoStart: true,
  },
});
```

Named tunnels also publish the first resolved public URL to `CLOUDFLARE_TUNNEL_URL`:

```ts
cloudflare({
  tunnel: {
    autoStart: true,
    name: "my-tunnel",
  },
});
```

The tunnel URL is public. Environment variables are not removed when the tunnel closes.

## Use cases

- [TanStack Start](https://tanstack.com/start/)
- [React Router v7](https://reactrouter.com/)
- Support for more full-stack frameworks is coming soon
- Static sites, such as single-page applications, with or without an integrated backend API
- Standalone Workers
- Multi-Worker applications
