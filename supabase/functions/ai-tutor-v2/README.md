# AI Tutor V2 Edge Function

This authenticated function keeps `GEMINI_API_KEY` on the server and exposes a small, versioned SSE contract:

- `event: delta` with `{ "type": "delta", "text": "..." }`
- `event: done` with `{ "type": "done" }`
- `event: error` with `{ "type": "error", "code": "...", "message": "..." }`

Before deployment, configure `GEMINI_API_KEY` in the target Supabase environment. Do not add it to an Expo environment file. The caller must send a valid Supabase user access token; the function validates it through Supabase Auth before contacting Gemini.

The existing `ai-tutor` function remains untouched for rollback. The app targets `ai-tutor-v2` by default. Setting the public `EXPO_PUBLIC_AI_TUTOR_FUNCTION_NAME` to `ai-tutor` is a deliberate, temporary rollback switch.
