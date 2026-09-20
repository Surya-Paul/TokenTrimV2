# Groq Configuration

TokenTrim uses Groq to perform high-speed cloud-based AI compression.

## Obtaining an API Key

1. Go to the [Groq Console](https://console.groq.com/).
2. Create an account or log in.
3. Navigate to the API Keys section.
4. Create a new API key.

## Server Configuration

The Groq API key is configured **securely on the server** to prevent exposing it to clients.

1. Open `apps/api/.env`.
2. Set your `GROQ_API_KEY`:
   ```env
   GROQ_API_KEY=gsk_your_key_here
   ```
3. (Optional) Set the target model using `GROQ_MODEL`. By default, it uses `llama-3.1-8b-instant`.

Restart your API server for the changes to take effect.

## Production vs Preview Models

Groq frequently releases "preview" models (e.g. `llama-3.1-70b-versatile`) which may have varying rate limits or temporary lifecycles.

- **Preview Models:** Must be deliberately chosen. They can change or be deprecated without notice.
- **Production:** For stable, long-term deployments, always configure `GROQ_MODEL` to a production-ready model ID as listed in the Groq console.

## Security

- The Web Client **never** sees or requests the Groq API key.
- The Fastify API redacts the prompt text from all logs.
- Secrets detected by the privacy scanner trigger an immediate rejection, and the prompt is never sent to Groq.