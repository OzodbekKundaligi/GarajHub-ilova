import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { connectDb } from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const webDistPath = path.resolve(rootDir, "dist");

const port = Number.parseInt(process.env.PORT || "4100", 10);
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/garajhub_mobile";
const corsOrigin = process.env.CORS_ORIGIN || "*";

async function start() {
  await connectDb(mongoUri);
  const app = createApp({ corsOrigin, webDistPath });
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[garajhub-mobile-server] listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[garajhub-mobile-server] failed to start", error);
  process.exit(1);
});
