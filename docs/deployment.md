# Deployment

TokenTrim uses a Web Client + Fastify API architecture. The API server and web client are deployed independently.

## Prerequisites
- Node.js >= 20.0.0
- pnpm >= 9.4.0

## Building for Production

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Build all packages and apps:
   ```bash
   pnpm build
   ```

## Deploying the API Server

The API server runs on Fastify and is built to `apps/api/dist/server.js`.

**Environment Variables (set in `apps/api/.env` — never commit this file):**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | **Yes** | — | Groq API key for AI compression |
| `API_AUTH_TOKEN` | No | — | Bearer token required by clients to call API |
| `GROQ_MODEL` | No | `qwen/qwen3.8-27b` | Groq model ID |
| `PORT` | No | `3001` | Listen port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `CORS_ORIGIN` | No | `http://localhost:5173` | **Must match the deployed web client URL** |
| `REQUEST_SIZE_LIMIT` | No | `1mb` | Max request body (e.g. `500kb`, `2mb`) |
| `REQUEST_TIMEOUT_MS` | No | `60000` | Groq call timeout in ms |
| `RATE_LIMIT_MAX` | No | `30` | Max requests per minute per IP |
| `NODE_ENV` | No | `development` | `production` for deployments |
| `LOG_LEVEL` | No | `info` | Pino log level |

Start the server:
```bash
cd apps/api
NODE_ENV=production node dist/server.js
```

> **Important:** Set `CORS_ORIGIN` to your exact deployed web client URL (e.g. `https://tokentrim.example.com`). Wildcard origins are not recommended in production.

### Rate Limiting in Production

The default Fastify rate limiter uses an in-memory store. If you are running **multiple instances** of the API server (e.g., Kubernetes, PM2 cluster, or multiple Serverless containers), the memory store will not be shared across instances.

You must configure a shared store (like Redis) for the rate limiter, or disable the application-level rate limiter and handle it at the edge (e.g., Cloudflare, AWS WAF, NGINX).

## Deploying the Web Client

The Web Client is a static React application built by Vite into `apps/web/dist`.

1. Set `VITE_API_URL` in `apps/web/.env` to your deployed API server URL **before building**:
   ```bash
   # apps/web/.env
   VITE_API_URL=https://api.tokentrim.example.com
   ```

2. Build the static files:
   ```bash
   cd apps/web
   pnpm build
   ```

3. Deploy the `apps/web/dist` folder to any static hosting service (Vercel, Netlify, Cloudflare Pages, S3, etc.).

> **Important:** `VITE_API_URL` is baked into the JavaScript bundle at build time. If you change it, you must rebuild.

## Security Checklist

- [ ] `.env` files are in `.gitignore` and never committed.
- [ ] `CORS_ORIGIN` is set to the exact web client origin (no wildcards).
- [ ] `GROQ_API_KEY` is only in the API server's environment — never in the web client.
- [ ] `API_AUTH_TOKEN` is configured to prevent unauthorized public usage of your API.
- [ ] `NODE_ENV=production` is set on the API server.
- [ ] HTTPS is enforced between the web client and API server.