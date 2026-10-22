// Netlify Function: the same Hono API as on Render. Netlify serves public/ itself (see netlify.toml).
import { createApp } from "../../src/app.js";

declare const Netlify: { env: { get(name: string): string | undefined } } | undefined;

// Netlify's own accessor first (its documented way), process.env as the fallback.
const env = (name: string) => (typeof Netlify !== "undefined" ? Netlify.env.get(name) : undefined) ?? process.env[name];
const key = env("EVDS_API_KEY");
if (!key) console.error("EVDS_API_KEY is not set: only Frankfurter FX data is available.");
const openaiKey = env("OPENAI_API_KEY");

const app = createApp(key, { serveFiles: false, openaiKey, appToken: env("FINANS_APP_TOKEN") });

export default (req: Request) => app.fetch(req);

export const config = { path: "/api/*" };
