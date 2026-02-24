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
const corsOrigin = process.env.CORS_ORIGIN || "*";

function resolveMongoUri() {
  const isRailway =
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.RAILWAY_PROJECT_ID) ||
    Boolean(process.env.RAILWAY_SERVICE_ID);

  const fromEnv =
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL ||
    "";

  const normalized = String(fromEnv).trim();
  if (normalized) return normalized;

  if (!isRailway) {
    return "mongodb://mongo:KRetcTesekiXBhxgKiyeCtDvsLNvxeBC@maglev.proxy.rlwy.net:36907";
  }

  throw new Error(
    "MongoDB URI topilmadi. Railway Variables ga MONGODB_URI (yoki MONGO_URL) qo'shing."
  );
}

async function start() {
  const mongoUri = resolveMongoUri();
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
