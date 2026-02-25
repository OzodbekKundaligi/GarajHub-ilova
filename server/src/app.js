import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import AppState from "./models/AppState.js";
import IdempotencyRecord from "./models/IdempotencyRecord.js";
import { ensureDbShape, initialDb } from "./defaults.js";

const STATE_KEY = "main";
const IDEMPOTENCY_TTL_SECONDS = Number.parseInt(
  process.env.IDEMPOTENCY_TTL_SECONDS || "86400",
  10
);
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const GROQ_TIMEOUT_MS = Number.parseInt(process.env.GROQ_TIMEOUT_MS || "20000", 10);

function safeInt(value, fallback, min = 1) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function hashJson(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value || {})).digest("hex");
}

function normalizeEtag(revision) {
  const safeRevision = safeInt(revision, 1, 1);
  return `W/"state-${safeRevision}"`;
}

function parseIfMatchRevision(headerValue) {
  const raw = String(headerValue || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/^W\//i, "").replace(/^"|"$/g, "");
  const match = normalized.match(/state-(\d+)/i) || normalized.match(/^(\d+)$/);
  if (!match) return null;
  return safeInt(match[1], 1, 1);
}

function getIdempotencyKey(req) {
  const value = String(req.headers["idempotency-key"] || "").trim();
  if (!value) return "";
  return value.slice(0, 160);
}

function getActorFromRequest(req) {
  const actorId = String(req.headers["x-actor-id"] || "system").trim() || "system";
  const actorRole = String(req.headers["x-actor-role"] || "user").trim().toLowerCase();
  return { actorId, actorRole };
}

function createStateMeta(doc) {
  return {
    revision: safeInt(doc?.revision, 1, 1),
    updated_at: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
  };
}

async function getOrCreateStateDoc() {
  const found = await AppState.findOne({ key: STATE_KEY });
  if (found) {
    const shaped = ensureDbShape(found.data);
    let changed = false;
    if (JSON.stringify(shaped) !== JSON.stringify(found.data)) {
      found.data = shaped;
      changed = true;
    }
    if (!Number.isFinite(found.revision) || found.revision < 1) {
      found.revision = 1;
      changed = true;
    }
    if (changed) await found.save();
    return found;
  }

  const data = initialDb();
  return AppState.create({ key: STATE_KEY, data, revision: 1 });
}

function offlineMentorFallback(promptText) {
  const text = String(promptText || "").toLowerCase();
  if (text.includes("mvp")) {
    return "MVP uchun: bitta kritik muammoni tanlang, 7 kunlik demo chiqaring, 10 user feedback bilan iteratsiya qiling.";
  }
  if (text.includes("pitch") || text.includes("investor")) {
    return "Pitch: muammo -> yechim -> TAM/SAM/SOM -> traction -> unit economics -> team -> ask.";
  }
  if (text.includes("marketing")) {
    return "Marketing: bitta kanal, bitta ICP, 2 haftalik experiment backlog va CAC/LTV tracking.";
  }
  return "1) muammo, 2) auditoriya, 3) 1 haftalik reja, 4) KPI, 5) feedback loop.";
}

function toGroqMessages(history, promptText) {
  const cleanHistory = Array.isArray(history) ? history : [];
  const messages = cleanHistory.slice(-12).map((message) => ({
    role: message?.role === "model" ? "assistant" : "user",
    content: String(message?.text || "").slice(0, 1800),
  }));
  messages.unshift({
    role: "system",
    content:
      "You are a practical startup operations mentor. Reply in Uzbek, concise, actionable, and structured.",
  });
  messages.push({ role: "user", content: String(promptText || "").slice(0, 3000) });
  return messages;
}

async function callGroqMentor({ history, prompt }) {
  const apiKey = String(process.env.GROQ_API_KEY || "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").trim();
  if (!apiKey) {
    return {
      text: `${offlineMentorFallback(prompt)}\n\nServerda GROQ_API_KEY yo'q, fallback javob qaytarildi.`,
      source: "offline",
    };
  }

  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), safeInt(GROQ_TIMEOUT_MS, 20000, 5000));

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: toGroqMessages(history, prompt),
        temperature: 0.5,
        max_tokens: 700,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Groq error ${response.status}`);
    }
    const json = await response.json();
    const text = String(json?.choices?.[0]?.message?.content || "").trim();
    if (!text) {
      return { text: "AI javobi bo'sh qaytdi. Keyinroq urinib ko'ring.", source: "groq" };
    }
    return { text, source: "groq" };
  } catch (error) {
    return {
      text: `${offlineMentorFallback(prompt)}\n\nAI vaqtincha ishlamadi: ${error?.message || "unknown"}`,
      source: "offline",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getIdempotentRecord(route, key) {
  if (!key) return null;
  return IdempotencyRecord.findOne({ route, key });
}

async function storeIdempotentRecord(route, key, requestHash, statusCode, responseBody) {
  if (!key) return;
  const expiresAt = new Date(Date.now() + safeInt(IDEMPOTENCY_TTL_SECONDS, 86400, 60) * 1000);
  try {
    await IdempotencyRecord.findOneAndUpdate(
      { route, key },
      {
        route,
        key,
        request_hash: requestHash,
        status_code: statusCode,
        response_body: responseBody,
        expires_at: expiresAt,
      },
      { upsert: true, setDefaultsOnInsert: true, new: true }
    );
  } catch {}
}

function createWriteAuthMiddleware() {
  const writeToken = String(process.env.APP_WRITE_TOKEN || "").trim();
  return function requireWriteAccess(req, res, next) {
    if (!writeToken) {
      next();
      return;
    }
    const headerToken = String(req.headers["x-app-token"] || "").trim();
    const bearer = String(req.headers.authorization || "").trim();
    const bearerToken = bearer.toLowerCase().startsWith("bearer ")
      ? bearer.slice(7).trim()
      : "";
    const matched = headerToken === writeToken || bearerToken === writeToken;
    if (!matched) {
      res.status(401).json({ message: "Write ruxsat yo'q. X-App-Token noto'g'ri." });
      return;
    }
    next();
  };
}

export function createApp({ corsOrigin = "*", webDistPath = "" } = {}) {
  const app = express();
  const jsonLimit = process.env.API_JSON_LIMIT || "20mb";
  const requireWriteAccess = createWriteAuthMiddleware();

  app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }));
  app.use(express.json({ limit: jsonLimit }));

  app.get("/api/health", (_, res) => {
    res.json({ ok: true, service: "garajhub-mobile-server", time: new Date().toISOString() });
  });

  app.get("/api/state", async (_, res) => {
    try {
      const stateDoc = await getOrCreateStateDoc();
      const meta = createStateMeta(stateDoc);
      res.set("ETag", normalizeEtag(meta.revision));
      res.json({ data: stateDoc.data, meta });
    } catch (error) {
      res.status(500).json({ message: "State olishda xatolik", error: error.message });
    }
  });

  app.put("/api/state", requireWriteAccess, async (req, res) => {
    try {
      const route = "/api/state";
      const payload = ensureDbShape(req.body?.data || {});
      const requestHash = hashJson(payload);
      const idempotencyKey = getIdempotencyKey(req);
      const actor = getActorFromRequest(req);
      const existingRecord = await getIdempotentRecord(route, idempotencyKey);
      if (existingRecord) {
        if (existingRecord.request_hash !== requestHash) {
          res.status(409).json({
            message: "Idempotency key boshqa payload bilan qayta yuborildi.",
            code: "IDEMPOTENCY_HASH_MISMATCH",
          });
          return;
        }
        res.set("X-Idempotent-Replay", "1");
        res.status(existingRecord.status_code).json(existingRecord.response_body);
        return;
      }

      await getOrCreateStateDoc();
      const expectedRevision = parseIfMatchRevision(req.headers["if-match"]);

      let updatedDoc = null;
      if (Number.isFinite(expectedRevision)) {
        updatedDoc = await AppState.findOneAndUpdate(
          { key: STATE_KEY, revision: expectedRevision },
          {
            $set: { data: payload },
            $inc: { revision: 1 },
          },
          { new: true }
        );

        if (!updatedDoc) {
          const latest = await AppState.findOne({ key: STATE_KEY });
          const responseBody = {
            message: "State konflikti. Yangi holatni olib qayta yuboring.",
            code: "STATE_CONFLICT",
            meta: createStateMeta(latest),
          };
          await storeIdempotentRecord(route, idempotencyKey, requestHash, 409, responseBody);
          res.status(409).json(responseBody);
          return;
        }
      } else {
        updatedDoc = await AppState.findOneAndUpdate(
          { key: STATE_KEY },
          {
            $set: { data: payload },
            $inc: { revision: 1 },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      }

      const responseBody = { ok: true, meta: createStateMeta(updatedDoc), actor };
      res.set("ETag", normalizeEtag(responseBody.meta.revision));
      await storeIdempotentRecord(route, idempotencyKey, requestHash, 200, responseBody);
      res.json(responseBody);
    } catch (error) {
      res.status(500).json({ message: "State saqlashda xatolik", error: error.message });
    }
  });

  app.post("/api/state/reset", requireWriteAccess, async (req, res) => {
    try {
      const route = "/api/state/reset";
      const data = initialDb();
      const requestHash = hashJson(data);
      const idempotencyKey = getIdempotencyKey(req);
      const existingRecord = await getIdempotentRecord(route, idempotencyKey);
      if (existingRecord) {
        if (existingRecord.request_hash !== requestHash) {
          res.status(409).json({
            message: "Idempotency key boshqa payload bilan qayta yuborildi.",
            code: "IDEMPOTENCY_HASH_MISMATCH",
          });
          return;
        }
        res.set("X-Idempotent-Replay", "1");
        res.status(existingRecord.status_code).json(existingRecord.response_body);
        return;
      }

      const updated = await AppState.findOneAndUpdate(
        { key: STATE_KEY },
        {
          $set: { key: STATE_KEY, data },
          $inc: { revision: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      const responseBody = {
        ok: true,
        data,
        meta: createStateMeta(updated),
      };
      res.set("ETag", normalizeEtag(responseBody.meta.revision));
      await storeIdempotentRecord(route, idempotencyKey, requestHash, 200, responseBody);
      res.json(responseBody);
    } catch (error) {
      res.status(500).json({ message: "State resetda xatolik", error: error.message });
    }
  });

  app.post("/api/ai/mentor", async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || "").trim();
      const history = Array.isArray(req.body?.history) ? req.body.history : [];
      if (!prompt) {
        res.status(400).json({ message: "Prompt bo'sh bo'lmasligi kerak." });
        return;
      }
      const result = await callGroqMentor({ history, prompt });
      res.json({
        text: result.text,
        source: result.source,
        model: result.source === "groq" ? GROQ_MODEL : "offline",
      });
    } catch (error) {
      res.status(500).json({ message: "AI so'rovida xatolik", error: error.message });
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

    if (
      error?.name === "BadRequestError" &&
      String(error?.message || "").toLowerCase().includes("request aborted")
    ) {
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
