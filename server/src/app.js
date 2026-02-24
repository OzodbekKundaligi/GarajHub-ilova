import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import AppState from "./models/AppState.js";
import { ensureDbShape, initialDb } from "./defaults.js";

const STATE_KEY = "main";

async function getOrCreateState() {
  const found = await AppState.findOne({ key: STATE_KEY });
  if (found) {
    const shaped = ensureDbShape(found.data);
    if (JSON.stringify(shaped) !== JSON.stringify(found.data)) {
      found.data = shaped;
      await found.save();
    }
    return shaped;
  }

  const data = initialDb();
  await AppState.create({ key: STATE_KEY, data });
  return data;
}

export function createApp({ corsOrigin = "*", webDistPath = "" } = {}) {
  const app = express();

  app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }));
  app.use(express.json({ limit: "30mb" }));

  app.get("/api/health", (_, res) => {
    res.json({ ok: true, service: "garajhub-mobile-server", time: new Date().toISOString() });
  });

  app.get("/api/state", async (_, res) => {
    try {
      const data = await getOrCreateState();
      res.json({ data });
    } catch (error) {
      res.status(500).json({ message: "State olishda xatolik", error: error.message });
    }
  });

  app.put("/api/state", async (req, res) => {
    try {
      const payload = ensureDbShape(req.body?.data || {});
      await AppState.findOneAndUpdate(
        { key: STATE_KEY },
        { key: STATE_KEY, data: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      res.json({ ok: true, data: payload });
    } catch (error) {
      res.status(500).json({ message: "State saqlashda xatolik", error: error.message });
    }
  });

  app.post("/api/state/reset", async (_, res) => {
    try {
      const data = initialDb();
      await AppState.findOneAndUpdate(
        { key: STATE_KEY },
        { key: STATE_KEY, data },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ message: "State resetda xatolik", error: error.message });
    }
  });

  const distIndexPath = webDistPath ? path.join(webDistPath, "index.html") : "";
  if (webDistPath && existsSync(distIndexPath)) {
    app.use(express.static(webDistPath, { index: false, maxAge: "1h" }));

    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(distIndexPath);
    });
  }

  return app;
}
