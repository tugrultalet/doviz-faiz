// Netlify Function: the same Hono API as on Render. Netlify serves public/ itself (see netlify.toml).
import { createApp } from "../../src/app.js";

const app = createApp(process.env.EVDS_API_KEY, { serveFiles: false });

export default (req: Request) => app.fetch(req);

export const config = { path: "/api/*" };
