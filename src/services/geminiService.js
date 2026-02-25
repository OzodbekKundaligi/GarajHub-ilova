import { Platform } from "react-native";

const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.EXPO_PUBLIC_AI_TIMEOUT_MS || "18000", 10);

function normalizeApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveApiCandidates() {
  const envBase = String(process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();
  if (envBase) return [normalizeApiBase(envBase)];

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const host = String(window.location.hostname || "").toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
    if (isLocal) {
      const localHost = host === "0.0.0.0" ? "localhost" : host;
      return [
        normalizeApiBase(`http://${localHost}:4100/api`),
        "http://127.0.0.1:4100/api",
        normalizeApiBase(`http://${localHost}:8080/api`),
        "http://127.0.0.1:8080/api",
      ];
    }
    return [normalizeApiBase(`${window.location.origin}/api`)];
  }

  if (Platform.OS === "android") return ["http://10.0.2.2:4100/api"];
  return ["http://localhost:4100/api"];
}

async function fetchWithTimeout(url, options = {}) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId = null;
  try {
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), Math.max(3000, REQUEST_TIMEOUT_MS));
    }
    return await fetch(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function offlineMentorFallback(promptText) {
  const text = String(promptText || "").toLowerCase();

  if (text.includes("mvp")) {
    return "MVP: 1) bitta og'riq nuqtani tanlang, 2) 1 haftada demo chiqaring, 3) 10 ta user feedback oling.";
  }
  if (text.includes("pitch") || text.includes("investor")) {
    return "Pitch ketma-ketligi: muammo -> yechim -> bozor -> traction -> monetizatsiya -> jamoa -> investitsiya so'rovi.";
  }
  if (text.includes("marketing")) {
    return "Marketing: 1 kanal + 1 auditoriya segmenti + 2 haftalik kontent test + lead form.";
  }
  if (text.includes("team") || text.includes("jamoa")) {
    return "Jamoa: rollarni yozma ajrating, weekly sprint KPI belgilang, daily standup qiling.";
  }

  return "Boshlash uchun: muammo, auditoriya, 1 haftalik plan va o'lchanadigan KPI ni aniq yozing.";
}

export async function getAIMentorResponse(history, promptText) {
  const prompt = String(promptText || "").trim();
  if (!prompt) return "Savol kiriting.";

  const payload = {
    prompt,
    history: Array.isArray(history) ? history.slice(-10) : [],
  };

  const candidates = resolveApiCandidates();
  let lastError = null;
  for (const base of candidates) {
    const requestUrl = `${base}/ai/mentor`;
    try {
      const response = await fetchWithTimeout(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        let serverText = "";
        try {
          serverText = await response.text();
        } catch {}
        throw new Error(serverText || `AI endpoint error: ${response.status}`);
      }
      const json = await response.json();
      const text = String(json?.text || "").trim();
      if (text) return text;
      throw new Error("AI bo'sh javob qaytardi");
    } catch (error) {
      lastError = error;
    }
  }

  return `${offlineMentorFallback(prompt)}\n\nAI endpointga ulanishda muammo: ${lastError?.message || "unknown"}`;
}
