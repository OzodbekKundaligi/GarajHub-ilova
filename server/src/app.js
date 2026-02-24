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
  const jsonLimit = process.env.API_JSON_LIMIT || "20mb";

  app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }));
  app.use(express.json({ limit: jsonLimit }));

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
      res.json({ ok: true });
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

  app.use((error, req, res, _next) => {
    if (res.headersSent) return;

    if (error?.type === "request.aborted") {
      res.status(499).json({ message: "So'rov client tomonidan bekor qilindi." });
      return;
    }

    if (error?.type === "entity.too.large") {
      res.status(413).json({ message: "Yuborilgan ma'lumot hajmi juda katta." });
      return;
    }

    if (error instanceof SyntaxError && error?.status === 400 && "body" in error) {
      res.status(400).json({ message: "JSON formati noto'g'ri." });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("[garajhub-mobile-server] request error", {
      path: req?.path,
      method: req?.method,
      message: error?.message,
    });
    res.status(500).json({ message: "Serverda ichki xatolik yuz berdi." });
  });

  return app;
}
