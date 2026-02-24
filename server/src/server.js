import dotenv from "dotenv";
import { createApp } from "./app.js";
import { connectDb } from "./db.js";

dotenv.config();

const port = Number.parseInt(process.env.PORT || "4100", 10);
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/garajhub_mobile";
const corsOrigin = process.env.CORS_ORIGIN || "*";

async function start() {
  await connectDb(mongoUri);
  const app = createApp({ corsOrigin });
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
