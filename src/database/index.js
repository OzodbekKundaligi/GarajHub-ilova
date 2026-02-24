import { Platform } from "react-native";
import { DEFAULT_CATEGORIES } from "../constants";

function initialDb() {
  return {
    users: [],
    startups: [],
    joinRequests: [],
    notifications: [],
    categories: DEFAULT_CATEGORIES.map((name, index) => ({
      id: `cat_${index + 1}`,
      name,
    })),
    tasks: [],
    auditLogs: [],
    proRequests: [],
    settings: {
      pro_enabled: true,
      pro_price_uzs: 79000,
      pro_plan_name: "GarajHub PRO",
      payment_card: "8600 1234 5678 9012",
      payment_holder: "MAMATOV OZODBEK",
      startup_limit_free: 1,
    },
  };
}

let cachedDb = null;

function normalizeApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isLocalWebDev() {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  const localHosts = ["localhost", "127.0.0.1", "0.0.0.0"];
  const devPorts = ["8081", "19000", "19006", "3000", "5173"];
  return localHosts.includes(host) && devPorts.includes(port);
}

function resolveApiBaseCandidates() {
  const envBase = String(process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();
  if (envBase) {
    return [normalizeApiBase(envBase)];
  }

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const originApi = normalizeApiBase(`${window.location.origin}/api`);
    if (isLocalWebDev()) {
      const host = String(window.location.hostname || "localhost");
      const localHost = host === "0.0.0.0" ? "localhost" : host;
      return [
        normalizeApiBase(`http://${localHost}:4100/api`),
        "http://127.0.0.1:4100/api",
        normalizeApiBase(`http://${localHost}:8080/api`),
        "http://127.0.0.1:8080/api",
      ];
    }
    return [originApi];
  }

  const fallback =
    Platform.OS === "android" ? "http://10.0.2.2:4100/api" : "http://localhost:4100/api";
  return [normalizeApiBase(fallback)];
}

const API_BASE_CANDIDATES = resolveApiBaseCandidates();
let apiBaseInUse = API_BASE_CANDIDATES[0];

function getApiCandidatesInOrder() {
  const uniq = [];
  [apiBaseInUse, ...API_BASE_CANDIDATES]
    .map(normalizeApiBase)
    .filter(Boolean)
    .forEach((base) => {
      if (!uniq.includes(base)) uniq.push(base);
    });
  return uniq;
}

async function parseJsonResponse(response, requestUrl) {
  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {}
    throw new Error(`Server xatoligi: ${response.status}${body ? ` ${body}` : ""}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    let body = "";
    try {
      body = await response.text();
    } catch {}
    const shortBody = body ? ` ${body.slice(0, 140)}` : "";
    throw new Error(`API JSON qaytarmadi (${requestUrl}).${shortBody}`);
  }

  return response.json();
}

function getRequestTimeoutMs() {
  const parsed = Number.parseInt(String(process.env.EXPO_PUBLIC_API_TIMEOUT_MS || ""), 10);
  if (Number.isFinite(parsed) && parsed >= 3000) {
    return parsed;
  }
  return 12000;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = getRequestTimeoutMs()) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId = null;

  try {
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }
    return await fetch(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`So'rov vaqti tugadi (${timeoutMs}ms): ${url}`);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

const MAX_DATA_IMAGE_LENGTH = 260000;
const DEFAULT_STARTUP_LOGO_URL = "https://via.placeholder.com/150/0a84ff/ffffff?text=Startup";
const DEFAULT_AVATAR_URL = "https://ui-avatars.com/api/?name=User&background=111&color=fff";
const MAX_AUDIT_LOGS = 1200;
const MAX_NOTIFICATIONS = 2500;
const MAX_CHAT_MESSAGES = 500;

function sanitizeDataImage(value, fallback = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  if (!normalized.startsWith("data:image/")) return normalized;
  if (normalized.length <= MAX_DATA_IMAGE_LENGTH) return normalized;
  return fallback;
}

function ensureDbShape(db) {
  const shaped = { ...initialDb(), ...(db || {}) };
  shaped.users = Array.isArray(shaped.users) ? shaped.users : [];
  shaped.users = shaped.users.map((u) => ({
    ...u,
    avatar: sanitizeDataImage(u.avatar, DEFAULT_AVATAR_URL),
    is_pro: Boolean(u.is_pro),
    pro_since: u.pro_since || null,
  }));
  shaped.startups = Array.isArray(shaped.startups) ? shaped.startups : [];
  shaped.startups = shaped.startups.map((s) => ({
    ...s,
    logo: sanitizeDataImage(s.logo, DEFAULT_STARTUP_LOGO_URL),
    chat_messages: Array.isArray(s.chat_messages)
      ? s.chat_messages.slice(-MAX_CHAT_MESSAGES)
      : [],
    tasks: Array.isArray(s.tasks)
      ? s.tasks.map((t) => ({
          ...t,
          deadline_reminder_sent_at: t.deadline_reminder_sent_at || null,
        }))
      : [],
  }));
  shaped.joinRequests = Array.isArray(shaped.joinRequests) ? shaped.joinRequests : [];
  shaped.notifications = Array.isArray(shaped.notifications) ? shaped.notifications : [];
  shaped.notifications = shaped.notifications.slice(0, MAX_NOTIFICATIONS);
  shaped.categories = Array.isArray(shaped.categories) && shaped.categories.length > 0
    ? shaped.categories
    : initialDb().categories;
  shaped.tasks = Array.isArray(shaped.tasks) ? shaped.tasks : [];
  shaped.tasks = shaped.tasks.map((t) => ({
    ...t,
    deadline_reminder_sent_at: t.deadline_reminder_sent_at || null,
  }));
  shaped.auditLogs = Array.isArray(shaped.auditLogs) ? shaped.auditLogs.slice(0, MAX_AUDIT_LOGS) : [];
  shaped.proRequests = Array.isArray(shaped.proRequests) ? shaped.proRequests : [];
  shaped.proRequests = shaped.proRequests.map((request) => ({
    ...request,
    receipt_image: sanitizeDataImage(request.receipt_image, ""),
  }));
  shaped.settings = { ...initialDb().settings, ...(shaped.settings || {}) };
  return shaped;
}

async function readDb() {
  if (cachedDb) {
    return cachedDb;
  }

  const candidates = getApiCandidatesInOrder();
  let lastError = null;

  for (const base of candidates) {
    try {
      const requestUrl = `${base}/state`;
      const response = await fetchWithTimeout(requestUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const json = await parseJsonResponse(response, requestUrl);
      cachedDb = ensureDbShape(json?.data || {});
      apiBaseInUse = base;
      return cachedDb;
    } catch (error) {
      lastError = error;
    }
  }

  const debugBases = candidates.join(", ");
  throw new Error(
    `MongoDB serverga ulanib bo'lmadi. Tekshiring: EXPO_PUBLIC_API_BASE_URL, server, MONGODB_URI. Tried: ${debugBases}. (${lastError?.message || "Noma'lum xatolik"})`
  );
}

async function writeDb(db) {
  cachedDb = ensureDbShape(db);

  const candidates = getApiCandidatesInOrder();
  let lastError = null;

  for (const base of candidates) {
    try {
      const requestUrl = `${base}/state`;
      const response = await fetchWithTimeout(requestUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ data: cachedDb }),
      });
      await parseJsonResponse(response, requestUrl);
      apiBaseInUse = base;
      return cachedDb;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `MongoDB ga saqlashda xatolik. Tried: ${candidates.join(", ")}. ${
      lastError?.message || "Noma'lum xatolik"
    }`
  );
}

let mutationQueue = Promise.resolve();

async function mutate(mutator) {
  const run = async () => {
    const current = await readDb();
    const draft = clone(current);
    const result = await mutator(draft);
    await writeDb(draft);
    return result;
  };

  const next = mutationQueue.then(run, run);
  mutationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function addAuditLog(db, action, entityType, entityId, actorId = "system") {
  db.auditLogs.unshift({
    id: `audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    action,
    entity_type: entityType,
    entity_id: entityId,
    actor_id: actorId || "system",
    created_at: nowIso(),
  });
}

export async function initDatabase() {
  await readDb();
}

export async function saveDatabase() {
  const db = await readDb();
  await writeDb(db);
}

export const dbOperations = {
  async getUsers() {
    const db = await readDb();
    return clone(db.users);
  },

  async getUserById(userId) {
    const db = await readDb();
    const user = db.users.find((item) => item.id === userId);
    return user ? clone(user) : null;
  },

  async getUserByEmail(email) {
    const db = await readDb();
    const lowered = String(email || "").toLowerCase();
    const user = db.users.find((item) => String(item.email || "").toLowerCase() === lowered);
    return user ? clone(user) : null;
  },

  async createUser(user) {
    return mutate((db) => {
      db.users.unshift({
        ...user,
        created_at: user.created_at || nowIso(),
        is_pro: Boolean(user.is_pro),
        pro_since: user.pro_since || null,
      });
      addAuditLog(db, "create_user", "user", user.id, user.id);
      return clone(user);
    });
  },

  async updateUser(userId, patch) {
    return mutate((db) => {
      const index = db.users.findIndex((u) => u.id === userId);
      if (index < 0) {
        throw new Error("User topilmadi");
      }
      db.users[index] = { ...db.users[index], ...patch };
      addAuditLog(db, "update_user", "user", userId, userId);
      return clone(db.users[index]);
    });
  },

  async updateUserRole(userId, role, actorId) {
    return mutate((db) => {
      const index = db.users.findIndex((u) => u.id === userId);
      if (index < 0) {
        throw new Error("User topilmadi");
      }
      db.users[index] = { ...db.users[index], role };
      addAuditLog(db, "update_user_role", "user", userId, actorId);
      return clone(db.users[index]);
    });
  },

  async setUserBanned(userId, banned, actorId) {
    return mutate((db) => {
      const index = db.users.findIndex((u) => u.id === userId);
      if (index < 0) {
        throw new Error("User topilmadi");
      }
      db.users[index] = { ...db.users[index], banned: Boolean(banned) };
      addAuditLog(db, banned ? "ban_user" : "unban_user", "user", userId, actorId);
      return clone(db.users[index]);
    });
  },

  async deleteUser(userId, actorId) {
    return mutate((db) => {
      db.users = db.users.filter((u) => u.id !== userId);

      db.startups = db.startups
        .filter((s) => s.egasi_id !== userId)
        .map((s) => ({
          ...s,
          a_zolar: (s.a_zolar || []).filter((m) => m.user_id !== userId),
          tasks: (s.tasks || []).filter((t) => t.assigned_to_id !== userId),
        }));

      db.tasks = db.tasks.filter((t) => t.assigned_to_id !== userId);
      db.joinRequests = db.joinRequests.filter((r) => r.user_id !== userId);
      db.notifications = db.notifications.filter((n) => n.user_id !== userId);

      addAuditLog(db, "delete_user", "user", userId, actorId);
      return true;
    });
  },

  async getStartups() {
    const db = await readDb();
    return clone(db.startups);
  },

  async createStartup(startup) {
    return mutate((db) => {
      db.startups.unshift({
        ...startup,
        created_at: startup.created_at || nowIso(),
        tasks: Array.isArray(startup.tasks) ? startup.tasks : [],
        a_zolar: Array.isArray(startup.a_zolar) ? startup.a_zolar : [],
        chat_messages: Array.isArray(startup.chat_messages) ? startup.chat_messages : [],
      });
      addAuditLog(db, "create_startup", "startup", startup.id, startup.egasi_id);
      return clone(startup);
    });
  },

  async updateStartup(startupId, patch) {
    return mutate((db) => {
      const index = db.startups.findIndex((s) => s.id === startupId);
      if (index < 0) {
        throw new Error("Startup topilmadi");
      }
      db.startups[index] = { ...db.startups[index], ...patch };
      addAuditLog(db, "update_startup", "startup", startupId, "system");
      return clone(db.startups[index]);
    });
  },

  async updateStartupStatus(startupId, status, reason, actorId) {
    return mutate((db) => {
      const index = db.startups.findIndex((s) => s.id === startupId);
      if (index < 0) {
        throw new Error("Startup topilmadi");
      }
      const current = db.startups[index];
      if (current.status !== "pending_admin") {
        throw new Error("Bu startup allaqachon ko'rib chiqilgan.");
      }
      if (!["approved", "rejected"].includes(status)) {
        throw new Error("Noto'g'ri status qiymati.");
      }
      db.startups[index] = {
        ...current,
        status,
        rejection_reason: reason || "",
      };
      addAuditLog(db, "update_startup_status", "startup", startupId, actorId);
      return clone(db.startups[index]);
    });
  },

  async deleteStartup(startupId, actorId = "system") {
    return mutate((db) => {
      db.startups = db.startups.filter((s) => s.id !== startupId);
      db.joinRequests = db.joinRequests.filter((r) => r.startup_id !== startupId);
      db.tasks = db.tasks.filter((t) => t.startup_id !== startupId);
      addAuditLog(db, "delete_startup", "startup", startupId, actorId);
      return true;
    });
  },

  async getJoinRequests() {
    const db = await readDb();
    return clone(db.joinRequests);
  },

  async createJoinRequest(request) {
    return mutate((db) => {
      db.joinRequests.unshift(request);
      addAuditLog(db, "create_join_request", "join_request", request.id, request.user_id);
      return clone(request);
    });
  },

  async deleteRequest(requestId) {
    return mutate((db) => {
      db.joinRequests = db.joinRequests.filter((r) => r.id !== requestId);
      addAuditLog(db, "delete_join_request", "join_request", requestId, "system");
      return true;
    });
  },

  async getNotifications(userId) {
    const db = await readDb();
    const filtered = db.notifications.filter((n) => n.user_id === userId);
    return clone(filtered);
  },

  async createNotification(notification) {
    return mutate((db) => {
      db.notifications.unshift(notification);
      addAuditLog(db, "create_notification", "notification", notification.id, "system");
      return clone(notification);
    });
  },

  async markAllNotificationsAsRead(userId) {
    return mutate((db) => {
      db.notifications = db.notifications.map((n) =>
        n.user_id === userId ? { ...n, is_read: true } : n
      );
      addAuditLog(db, "mark_all_notifications_read", "notification", userId, userId);
      return true;
    });
  },

  async markNotificationAsRead(notificationId) {
    return mutate((db) => {
      db.notifications = db.notifications.map((n) =>
        n.id === notificationId ? { ...n, is_read: true } : n
      );
      addAuditLog(db, "mark_notification_read", "notification", notificationId, "system");
      return true;
    });
  },

  async getCategories() {
    const db = await readDb();
    return clone(db.categories);
  },

  async createCategory(name, actorId) {
    const trimmed = String(name || "").trim();
    if (!trimmed) {
      throw new Error("Kategoriya nomi bo'sh");
    }

    return mutate((db) => {
      const exists = db.categories.some(
        (cat) => cat.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        throw new Error("Kategoriya mavjud");
      }
      const created = { id: `cat_${Date.now()}`, name: trimmed };
      db.categories.push(created);
      addAuditLog(db, "create_category", "category", created.id, actorId);
      return clone(created);
    });
  },

  async deleteCategory(categoryId, actorId) {
    return mutate((db) => {
      db.categories = db.categories.filter((c) => c.id !== categoryId);
      addAuditLog(db, "delete_category", "category", categoryId, actorId);
      return true;
    });
  },

  async createTask(task) {
    return mutate((db) => {
      const safeTask = {
        ...task,
        deadline_reminder_sent_at: task.deadline_reminder_sent_at || null,
      };
      db.tasks.unshift(safeTask);

      db.startups = db.startups.map((startup) => {
        if (startup.id !== task.startup_id) {
          return startup;
        }
        const tasks = Array.isArray(startup.tasks) ? startup.tasks : [];
        return { ...startup, tasks: [...tasks, safeTask] };
      });

      addAuditLog(db, "create_task", "task", task.id, task.assigned_to_id);
      return clone(safeTask);
    });
  },

  async updateTaskStatus(taskId, status) {
    return mutate((db) => {
      db.tasks = db.tasks.map((task) =>
        task.id === taskId ? { ...task, status } : task
      );

      db.startups = db.startups.map((startup) => ({
        ...startup,
        tasks: (startup.tasks || []).map((task) =>
          task.id === taskId ? { ...task, status } : task
        ),
      }));

      addAuditLog(db, "update_task_status", "task", taskId, "system");
      return true;
    });
  },

  async deleteTask(taskId) {
    return mutate((db) => {
      db.tasks = db.tasks.filter((task) => task.id !== taskId);

      db.startups = db.startups.map((startup) => ({
        ...startup,
        tasks: (startup.tasks || []).filter((task) => task.id !== taskId),
      }));

      addAuditLog(db, "delete_task", "task", taskId, "system");
      return true;
    });
  },

  async getStats() {
    const db = await readDb();
    return {
      users: db.users.length,
      pro_users: db.users.filter((u) => Boolean(u.is_pro)).length,
      startups: db.startups.length,
      pending_startups: db.startups.filter((s) => s.status === "pending_admin").length,
      join_requests: db.joinRequests.length,
      notifications: db.notifications.length,
      pro_requests_pending: db.proRequests.filter((r) => r.status === "pending").length,
    };
  },

  async getAuditLogs(limit = 80) {
    const db = await readDb();
    return clone(db.auditLogs.slice(0, limit));
  },

  async getSettings() {
    const db = await readDb();
    return clone(db.settings);
  },

  async updateSettings(patch, actorId = "admin") {
    return mutate((db) => {
      db.settings = { ...db.settings, ...(patch || {}) };
      addAuditLog(db, "update_settings", "settings", "global", actorId);
      return clone(db.settings);
    });
  },

  async setUserPro(userId, isPro, actorId = "admin") {
    return mutate((db) => {
      const index = db.users.findIndex((u) => u.id === userId);
      if (index < 0) {
        throw new Error("User topilmadi");
      }
      db.users[index] = {
        ...db.users[index],
        is_pro: Boolean(isPro),
        pro_since: isPro ? nowIso() : null,
      };
      addAuditLog(db, isPro ? "enable_user_pro" : "disable_user_pro", "user", userId, actorId);
      return clone(db.users[index]);
    });
  },

  async getProRequests() {
    const db = await readDb();
    return clone(db.proRequests);
  },

  async createProRequest(request) {
    return mutate((db) => {
      db.proRequests.unshift({
        ...request,
        created_at: request.created_at || nowIso(),
        status: request.status || "pending",
      });
      addAuditLog(db, "create_pro_request", "pro_request", request.id, request.user_id || "user");
      return clone(request);
    });
  },

  async updateProRequestStatus(requestId, status, actorId = "admin", note = "") {
    return mutate((db) => {
      const idx = db.proRequests.findIndex((r) => r.id === requestId);
      if (idx < 0) {
        throw new Error("Pro request topilmadi");
      }
      db.proRequests[idx] = {
        ...db.proRequests[idx],
        status,
        note,
        reviewed_at: nowIso(),
        reviewed_by: actorId,
      };
      addAuditLog(db, `pro_request_${status}`, "pro_request", requestId, actorId);
      return clone(db.proRequests[idx]);
    });
  },

  async createStartupMessage(startupId, message, actorId = "user") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) {
        throw new Error("Startup topilmadi");
      }
      const startup = db.startups[idx];
      const chat = Array.isArray(startup.chat_messages) ? startup.chat_messages : [];
      const nextMsg = {
        ...message,
        id: message.id || `chat_${Date.now()}`,
        created_at: message.created_at || nowIso(),
      };
      db.startups[idx] = {
        ...startup,
        chat_messages: [...chat, nextMsg],
      };
      addAuditLog(db, "create_startup_message", "startup_chat", startupId, actorId);
      return clone(nextMsg);
    });
  },
};
