# TokenTrim

TokenTrim is a model-aware, deterministic and AI-powered prompt compression engine for LLMs. It safely reduces your API costs without losing context.

TokenTrim ensures **SAFE compression** by rigorously verifying that instructions, constraints, technical details, and semantic meaning are preserved.

## Architecture

TokenTrim consists of two parts:
1. **API Server (`apps/api`)**: A Fastify REST API that runs the TokenTrim core engine.
2. **Web Client (`apps/web`)**: A React + Vite web application for interacting with the engine.

## Features

- **Tier 0 Deterministic Compression**: Fast, rule-based compression that safely removes whitespace, redundant phrases, and compresses lists.
- **Cloud AI Compression (Groq)**: High-speed semantic compression via Groq.
- **Verification Engine**: Multi-layer safety checks before accepting any compression to ensure technical integrity.
- **Privacy First**: Built-in secret detection to block API calls if sensitive information is detected.

## Getting Started

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Configure the API:
   - Copy `apps/api/.env.example` to `apps/api/.env`
   - Set your `GROQ_API_KEY`
4. Configure the Web Client:
   - Copy `apps/web/.env.example` to `apps/web/.env`
5. Build all packages: `pnpm build`
6. Run the development server: `pnpm dev`
   - This starts both the API (port 3001) and Web Client (port 5173).

> **Never commit `.env` files.** They contain secrets and are listed in `.gitignore`.

## Production Deployment

### API Server

1. Set environment variables (see `apps/api/.env.example` for the full list):
   - `GROQ_API_KEY` — required
   - `CORS_ORIGIN` — must match your deployed web client URL
   - `NODE_ENV=production`
2. Start: `node apps/api/dist/server.js`

### Web Client

1. Set `VITE_API_URL` in `apps/web/.env` to your deployed API URL **before building**.
2. Build: `cd apps/web && pnpm build`
3. Deploy the `apps/web/dist` folder to any static host (Vercel, Netlify, Cloudflare Pages, S3, etc.).

See [docs/deployment.md](docs/deployment.md) for full details.

## Documentation

| Topic | Link |
|-------|------|
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Development | [docs/development.md](docs/development.md) |
| Deployment | [docs/deployment.md](docs/deployment.md) |
| Security | [docs/security.md](docs/security.md) |
| Privacy | [docs/privacy.md](docs/privacy.md) |
| Groq Setup | [docs/groq.md](docs/groq.md) |
| Troubleshooting | [docs/troubleshooting.md](docs/troubleshooting.md) |

## License

MIT