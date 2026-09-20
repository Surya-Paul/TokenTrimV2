# Troubleshooting

## API Connection Issues

If the Web Client cannot connect to the API Server:
1. Ensure the API server is running (`pnpm dev:api`).
2. Verify `VITE_API_URL` in `apps/web/.env` points to the correct API host (default `http://localhost:3001`).
3. Check for CORS errors in the browser console. If present, ensure `CORS_ORIGIN` in `apps/api/.env` matches the Web Client URL.

## Groq API Errors

If compression fails during the Cloud AI step:
1. Verify `GROQ_API_KEY` is set correctly in `apps/api/.env`.
2. Check if the specified `GROQ_MODEL` is available on your account.
3. Check the API server logs for rate limiting or authorization errors.

## Secrets Detected

If TokenTrim refuses to compress your prompt due to "Secrets Detected":
- This is an intentional security feature. TokenTrim uses regex patterns to identify API keys, passwords, and private keys.
- Remove or mask the secret in your prompt before trying again.
- In `apps/api/src/server.ts`, this throws a 422 error, which the client safely handles.