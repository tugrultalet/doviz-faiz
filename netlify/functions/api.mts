// Netlify Function: the same Hono API as on Render. Netlify serves public/ itself (see netlify.toml).
import { createApp } from "../../src/app.js";

declare const Netlify: { env: { get(name: string): string | undefined } } | undefined;

// Netlify's own accessor first (its documented way), process.env as the fallback.
const key = (typeof Netlify !== "undefined" ? Netlify.env.get("EVDS_API_KEY") : undefined) ?? process.env.EVDS_API_KEY;
if (!key) console.error("EVDS_API_KEY is not set: only Frankfurter FX data is available.");

const app = createApp(key, { serveFiles: false });

export default (req: Request) => app.fetch(req);

export const config = { path: "/api/*" };
