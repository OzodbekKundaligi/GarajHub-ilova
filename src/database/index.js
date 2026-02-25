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
let cachedRevision = null;

const API_WRITE_TOKEN = String(process.env.EXPO_PUBLIC_API_WRITE_TOKEN || "").trim();

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
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  let jsonBody = null;
  let textBody = "";

  if (contentType.includes("application/json")) {
    try {
      jsonBody = await response.json();
    } catch {}
  } else {
    try {
      textBody = await response.text();
    } catch {}
  }

  if (!response.ok) {
    const serverMessage =
      jsonBody?.message || jsonBody?.error || textBody || `Server xatoligi: ${response.status}`;
    const error = new Error(String(serverMessage));
    error.status = response.status;
    error.code = jsonBody?.code || "";
    error.payload = jsonBody || null;
    throw error;
  }

  if (jsonBody) return jsonBody;
  const shortBody = textBody ? ` ${textBody.slice(0, 140)}` : "";
  throw new Error(`API JSON qaytarmadi (${requestUrl}).${shortBody}`);
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

function toPositiveInt(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function updateCachedRevision(meta) {
  const nextRevision = toPositiveInt(meta?.revision, null);
  if (nextRevision) cachedRevision = nextRevision;
}

function createIdempotencyKey(prefix = "state") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

function buildWriteHeaders(idempotencyKey) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Idempotency-Key": idempotencyKey,
  };
  if (cachedRevision) headers["If-Match"] = `W/"state-${cachedRevision}"`;
  if (API_WRITE_TOKEN) headers["X-App-Token"] = API_WRITE_TOKEN;
  return headers;
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
const MAX_MEMBER_REVIEWS = 900;
const MAX_WORKSPACE_DECISIONS = 300;
const MAX_WORKSPACE_FOUNDER_VOTES = 200;
const MAX_WORKSPACE_INVESTOR_LOGS = 600;
const DEFAULT_SUCCESS_FEE_PERCENT = 2;
const DEFAULT_SEGMENT_FOCUS = "it_founder_developer";
const DEFAULT_SAFEKEEPING_TEXT =
  "GarajHub safekeeping agreement: jamoa ichki qarorlar, ulushlar va contribution loglari platformada yuritiladi.";

function sanitizeDataImage(value, fallback = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  if (!normalized.startsWith("data:image/")) return normalized;
  if (normalized.length <= MAX_DATA_IMAGE_LENGTH) return normalized;
  return fallback;
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeReview(review) {
  if (!review) return null;
  return {
    id: String(review.id || `rv_${Date.now()}_${Math.floor(Math.random() * 1000)}`),
    target_user_id: String(review.target_user_id || "").trim(),
    target_user_name: String(review.target_user_name || "Unknown").trim(),
    reviewer_id: String(review.reviewer_id || "").trim(),
    reviewer_name: String(review.reviewer_name || "Unknown").trim(),
    rating: clampNumber(review.rating, 1, 5),
    comment: String(review.comment || "").trim(),
    created_at: review.created_at || nowIso(),
  };
}

function ensureMemberReviews(reviews) {
  return asArray(reviews)
    .map(sanitizeReview)
    .filter(Boolean)
    .filter((r) => r.target_user_id && r.reviewer_id)
    .slice(0, MAX_MEMBER_REVIEWS);
}

function buildDefaultWorkspace(startup = {}) {
  return {
    id: `ws_${startup.id || Date.now()}`,
    startup_id: startup.id || "",
    opened_at: nowIso(),
    lock_in_enabled: true,
    segment_focus: DEFAULT_SEGMENT_FOCUS,
    lifecycle: "active",
    closed_at: null,
    success_fee_percent: DEFAULT_SUCCESS_FEE_PERCENT,
    safekeeping_agreement: {
      status: "active",
      text: DEFAULT_SAFEKEEPING_TEXT,
      accepted_user_ids: asArray(startup.a_zolar).map((m) => m.user_id).filter(Boolean),
      updated_at: nowIso(),
    },
    equity_entries: [],
    decisions: [],
    founder_votes: [],
    investor_logs: [],
    updated_at: nowIso(),
  };
}

function sanitizeWorkspaceVote(vote) {
  if (!vote) return null;
  return {
    user_id: String(vote.user_id || "").trim(),
    user_name: String(vote.user_name || "Unknown").trim(),
    vote: String(vote.vote || "").trim(),
    created_at: vote.created_at || nowIso(),
  };
}

function sanitizeDecision(decision) {
  if (!decision) return null;
  return {
    id: String(decision.id || `dec_${Date.now()}_${Math.floor(Math.random() * 1000)}`),
    title: String(decision.title || "Untitled decision").trim(),
    description: String(decision.description || "").trim(),
    type: String(decision.type || "general").trim(),
    deadline: String(decision.deadline || "").trim(),
    status: ["open", "accepted", "rejected", "closed"].includes(decision.status)
      ? decision.status
      : "open",
    votes: asArray(decision.votes).map(sanitizeWorkspaceVote).filter((v) => v && v.user_id),
    result_note: String(decision.result_note || "").trim(),
    created_at: decision.created_at || nowIso(),
    created_by: String(decision.created_by || "").trim(),
    resolved_at: decision.resolved_at || null,
  };
}

function sanitizeFounderVote(voteItem) {
  if (!voteItem) return null;
  return {
    id: String(voteItem.id || `fv_${Date.now()}_${Math.floor(Math.random() * 1000)}`),
    target_user_id: String(voteItem.target_user_id || "").trim(),
    target_user_name: String(voteItem.target_user_name || "Unknown").trim(),
    reason: String(voteItem.reason || "").trim(),
    status: ["open", "keep", "remove", "closed"].includes(voteItem.status)
      ? voteItem.status
      : "open",
    votes: asArray(voteItem.votes).map(sanitizeWorkspaceVote).filter((v) => v && v.user_id),
    created_at: voteItem.created_at || nowIso(),
    created_by: String(voteItem.created_by || "").trim(),
    resolved_at: voteItem.resolved_at || null,
  };
}

function sanitizeEquityEntry(entry) {
  if (!entry) return null;
  return {
    id: String(entry.id || `eq_${Date.now()}_${Math.floor(Math.random() * 1000)}`),
    user_id: String(entry.user_id || "").trim(),
    user_name: String(entry.user_name || "Unknown").trim(),
    role: String(entry.role || "Contributor").trim(),
    percent: Math.round(clampNumber(entry.percent, 0, 100) * 100) / 100,
    vesting_months: Math.round(clampNumber(entry.vesting_months || 0, 0, 120)),
    created_at: entry.created_at || nowIso(),
    updated_at: entry.updated_at || nowIso(),
  };
}

function sanitizeInvestorLog(log) {
  if (!log) return null;
  return {
    id: String(log.id || `inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`),
    investor_name: String(log.investor_name || "").trim(),
    contact: String(log.contact || "").trim(),
    stage: String(log.stage || "intro").trim(),
    note: String(log.note || "").trim(),
    outcome: String(log.outcome || "open").trim(),
    introduced_by_id: String(log.introduced_by_id || "").trim(),
    introduced_by_name: String(log.introduced_by_name || "").trim(),
    created_at: log.created_at || nowIso(),
    updated_at: log.updated_at || nowIso(),
  };
}

function ensureWorkspaceShape(workspace, startup = {}) {
  const base = buildDefaultWorkspace(startup);
  const merged = { ...base, ...(workspace || {}) };
  const lifecycle = String(merged.lifecycle || "active").trim();

  merged.id = String(merged.id || base.id);
  merged.startup_id = String(merged.startup_id || startup.id || "");
  merged.opened_at = merged.opened_at || nowIso();
  merged.lock_in_enabled = merged.lock_in_enabled !== false;
  merged.segment_focus = String(merged.segment_focus || DEFAULT_SEGMENT_FOCUS);
  merged.lifecycle = ["active", "paused", "closed"].includes(lifecycle) ? lifecycle : "active";
  merged.closed_at = merged.lifecycle === "closed" ? merged.closed_at || nowIso() : null;
  merged.success_fee_percent = clampNumber(
    merged.success_fee_percent || DEFAULT_SUCCESS_FEE_PERCENT,
    1,
    3
  );
  merged.safekeeping_agreement = {
    status: merged.safekeeping_agreement?.status || "active",
    text: String(merged.safekeeping_agreement?.text || DEFAULT_SAFEKEEPING_TEXT),
    accepted_user_ids: Array.from(
      new Set(
        asArray(merged.safekeeping_agreement?.accepted_user_ids)
          .map((x) => String(x || "").trim())
          .filter(Boolean)
      )
    ),
    updated_at: merged.safekeeping_agreement?.updated_at || nowIso(),
  };
  merged.equity_entries = asArray(merged.equity_entries)
    .map(sanitizeEquityEntry)
    .filter((x) => x && x.user_id)
    .slice(0, 80);
  merged.decisions = asArray(merged.decisions)
    .map(sanitizeDecision)
    .filter((x) => x && x.id)
    .slice(0, MAX_WORKSPACE_DECISIONS);
  merged.founder_votes = asArray(merged.founder_votes)
    .map(sanitizeFounderVote)
    .filter((x) => x && x.id && x.target_user_id)
    .slice(0, MAX_WORKSPACE_FOUNDER_VOTES);
  merged.investor_logs = asArray(merged.investor_logs)
    .map(sanitizeInvestorLog)
    .filter((x) => x && x.investor_name)
    .slice(0, MAX_WORKSPACE_INVESTOR_LOGS);
  merged.updated_at = nowIso();

  return merged;
}

function isStartupMember(startup, userId) {
  if (!startup || !userId) return false;
  if (startup.egasi_id === userId) return true;
  return asArray(startup.a_zolar).some((m) => m.user_id === userId);
}

function getTaskCompletionForUser(startup, userId) {
  const tasks = asArray(startup?.tasks).filter((task) => task.assigned_to_id === userId);
  const done = tasks.filter((task) => task.status === "done").length;
  const nowTs = Date.now();
  const missed = tasks.filter((task) => {
    if (!task.deadline || task.status === "done") return false;
    const dueTs = new Date(`${task.deadline}T23:59:59`).getTime();
    return Number.isFinite(dueTs) && dueTs < nowTs;
  }).length;
  return { assigned: tasks.length, done, missed };
}

function calculateUserReputationFromDb(db, userId) {
  const startups = asArray(db?.startups);
  const relatedStartups = startups.filter((startup) => isStartupMember(startup, userId));
  const collaboratorSet = new Set();
  let daysWorked = 0;
  let assignedTasks = 0;
  let doneTasks = 0;
  let missedTasks = 0;
  let ratingCount = 0;
  let ratingTotal = 0;
  let closedSuccess = 0;
  let closedFailed = 0;

  for (const startup of relatedStartups) {
    const memberRows = asArray(startup.a_zolar);
    memberRows.forEach((member) => {
      if (member.user_id && member.user_id !== userId) collaboratorSet.add(member.user_id);
    });
    if (startup.egasi_id && startup.egasi_id !== userId) collaboratorSet.add(startup.egasi_id);

    const membership = memberRows.find((member) => member.user_id === userId);
    const startAt =
      membership?.joined_at || startup.yaratilgan_vaqt || startup.created_at || nowIso();
    const workspace = ensureWorkspaceShape(startup.workspace, startup);
    const endAt =
      workspace.lifecycle === "closed" ? workspace.closed_at || nowIso() : nowIso();
    const durationDays = Math.max(
      1,
      Math.round(
        (new Date(endAt).getTime() - new Date(startAt).getTime()) / (1000 * 60 * 60 * 24)
      )
    );
    if (Number.isFinite(durationDays)) daysWorked += durationDays;

    const taskStats = getTaskCompletionForUser(startup, userId);
    assignedTasks += taskStats.assigned;
    doneTasks += taskStats.done;
    missedTasks += taskStats.missed;

    const reviews = ensureMemberReviews(startup.member_reviews).filter(
      (review) => review.target_user_id === userId
    );
    reviews.forEach((review) => {
      ratingTotal += review.rating;
      ratingCount += 1;
    });

    if (workspace.lifecycle === "closed") {
      const startupDone = asArray(startup.tasks).filter((task) => task.status === "done").length;
      const startupTotal = asArray(startup.tasks).length;
      const completion = startupTotal > 0 ? Math.round((startupDone / startupTotal) * 100) : 0;
      if (completion >= 60) closedSuccess += 1;
      else closedFailed += 1;
    }
  }

  const avgRating = ratingCount > 0 ? ratingTotal / ratingCount : 0;
  let score = 20;
  score += Math.min(doneTasks * 2, 30);
  score -= Math.min(missedTasks * 2, 22);
  score += avgRating > 0 ? avgRating * 8 : 0;
  score += Math.min(collaboratorSet.size * 2, 16);
  score += Math.min(Math.round(daysWorked / 14), 16);
  score += closedSuccess * 6;
  score -= closedFailed * 4;
  score = clampNumber(Math.round(score), 0, 100);

  return {
    user_id: userId,
    score,
    tier: score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D",
    projects: relatedStartups.length,
    collaborators: collaboratorSet.size,
    days_worked: daysWorked,
    assigned_tasks: assignedTasks,
    done_tasks: doneTasks,
    missed_tasks: missedTasks,
    avg_rating: Number(avgRating.toFixed(2)),
    ratings_count: ratingCount,
    closed_success: closedSuccess,
    closed_failed: closedFailed,
  };
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
    member_reviews: ensureMemberReviews(s.member_reviews),
    workspace: ensureWorkspaceShape(s.workspace, s),
    chat_messages: Array.isArray(s.chat_messages)
      ? s.chat_messages.slice(-MAX_CHAT_MESSAGES)
      : [],
    tasks: Array.isArray(s.tasks)
      ? s.tasks.map((t) => ({
          ...t,
          created_at: t.created_at || nowIso(),
          updated_at: t.updated_at || t.created_at || nowIso(),
          completed_at: t.status === "done" ? t.completed_at || nowIso() : null,
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
      updateCachedRevision(json?.meta);
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
  const idempotencyKey = createIdempotencyKey("write_state");

  for (const base of candidates) {
    try {
      const requestUrl = `${base}/state`;
      const response = await fetchWithTimeout(requestUrl, {
        method: "PUT",
        headers: buildWriteHeaders(idempotencyKey),
        body: JSON.stringify({ data: cachedDb }),
      });
      const json = await parseJsonResponse(response, requestUrl);
      updateCachedRevision(json?.meta);
      apiBaseInUse = base;
      return cachedDb;
    } catch (error) {
      if (error?.status === 409 && error?.code === "STATE_CONFLICT") {
        updateCachedRevision(error?.payload?.meta);
        error.isConflict = true;
      }
      lastError = error;
    }
  }

  if (lastError?.isConflict) {
    const conflictError = new Error(lastError.message || "State conflict");
    conflictError.code = "STATE_CONFLICT";
    conflictError.meta = lastError?.payload?.meta || null;
    throw conflictError;
  }

  throw new Error(`MongoDB ga saqlashda xatolik. Tried: ${candidates.join(", ")}. ${lastError?.message || "Noma'lum xatolik"}`);
}

let mutationQueue = Promise.resolve();

async function mutate(mutator) {
  const run = async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const current = await readDb();
        const draft = clone(current);
        const result = await mutator(draft);
        await writeDb(draft);
        return result;
      } catch (error) {
        lastError = error;
        if (error?.code === "STATE_CONFLICT" && attempt < 2) {
          cachedDb = null;
          continue;
        }
        throw error;
      }
    }
    throw lastError || new Error("Mutatsiya bajarilmadi");
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
          member_reviews: ensureMemberReviews(s.member_reviews).filter(
            (review) => review.target_user_id !== userId && review.reviewer_id !== userId
          ),
          workspace: (() => {
            const workspace = ensureWorkspaceShape(s.workspace, s);
            return {
              ...workspace,
              safekeeping_agreement: {
                ...workspace.safekeeping_agreement,
                accepted_user_ids: workspace.safekeeping_agreement.accepted_user_ids.filter(
                  (id) => id !== userId
                ),
              },
              equity_entries: workspace.equity_entries.filter((entry) => entry.user_id !== userId),
              decisions: workspace.decisions.map((decision) => ({
                ...decision,
                votes: decision.votes.filter((vote) => vote.user_id !== userId),
              })),
              founder_votes: workspace.founder_votes
                .filter((vote) => vote.target_user_id !== userId)
                .map((vote) => ({
                  ...vote,
                  votes: vote.votes.filter((item) => item.user_id !== userId),
                })),
            };
          })(),
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
      const prepared = {
        ...startup,
        created_at: startup.created_at || nowIso(),
        tasks: Array.isArray(startup.tasks)
          ? startup.tasks.map((t) => ({
              ...t,
              created_at: t.created_at || nowIso(),
              updated_at: t.updated_at || t.created_at || nowIso(),
              completed_at: t.status === "done" ? t.completed_at || nowIso() : null,
            }))
          : [],
        a_zolar: Array.isArray(startup.a_zolar) ? startup.a_zolar : [],
        chat_messages: Array.isArray(startup.chat_messages) ? startup.chat_messages : [],
      };
      prepared.workspace = ensureWorkspaceShape(startup.workspace, prepared);
      prepared.member_reviews = ensureMemberReviews(startup.member_reviews);
      db.startups.unshift(prepared);
      addAuditLog(db, "create_startup", "startup", startup.id, startup.egasi_id);
      return clone(prepared);
    });
  },

  async updateStartup(startupId, patch) {
    return mutate((db) => {
      const index = db.startups.findIndex((s) => s.id === startupId);
      if (index < 0) {
        throw new Error("Startup topilmadi");
      }
      const current = db.startups[index];
      const merged = { ...current, ...(patch || {}) };
      merged.workspace = ensureWorkspaceShape(
        patch && Object.prototype.hasOwnProperty.call(patch, "workspace")
          ? { ...current.workspace, ...(patch.workspace || {}) }
          : current.workspace,
        merged
      );
      merged.member_reviews = ensureMemberReviews(
        patch && Object.prototype.hasOwnProperty.call(patch, "member_reviews")
          ? patch.member_reviews
          : current.member_reviews
      );
      db.startups[index] = merged;
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
        reviewed_at: nowIso(),
        approved_at: status === "approved" ? nowIso() : current.approved_at || null,
        workspace:
          status === "approved"
            ? ensureWorkspaceShape(current.workspace, current)
            : current.workspace,
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
        created_at: task.created_at || nowIso(),
        updated_at: task.updated_at || task.created_at || nowIso(),
        completed_at: task.status === "done" ? task.completed_at || nowIso() : null,
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
      const touchedAt = nowIso();
      db.tasks = db.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
              updated_at: touchedAt,
              completed_at: status === "done" ? task.completed_at || touchedAt : null,
            }
          : task
      );

      db.startups = db.startups.map((startup) => ({
        ...startup,
        tasks: (startup.tasks || []).map((task) =>
          task.id === taskId
            ? {
                ...task,
                status,
                updated_at: touchedAt,
                completed_at: status === "done" ? task.completed_at || touchedAt : null,
              }
            : task
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

  async ensureStartupWorkspace(startupId, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      db.startups[idx] = {
        ...startup,
        workspace: ensureWorkspaceShape(startup.workspace, startup),
      };
      addAuditLog(db, "ensure_workspace", "workspace", startupId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async setWorkspaceLifecycle(startupId, lifecycle, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      const safeLifecycle = ["active", "paused", "closed"].includes(lifecycle)
        ? lifecycle
        : "active";
      workspace.lifecycle = safeLifecycle;
      workspace.closed_at = safeLifecycle === "closed" ? workspace.closed_at || nowIso() : null;
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "set_workspace_lifecycle", "workspace", startupId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async setWorkspaceSuccessFee(startupId, percent, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      workspace.success_fee_percent = clampNumber(percent, 1, 3);
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "set_workspace_success_fee", "workspace", startupId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async setSafekeepingAgreement(startupId, text, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      const normalizedText = String(text || "").trim();
      if (!normalizedText) throw new Error("Safekeeping matni bo'sh bo'lmasin");
      workspace.safekeeping_agreement = {
        ...workspace.safekeeping_agreement,
        text: normalizedText,
        status: "active",
        updated_at: nowIso(),
      };
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "set_safekeeping_agreement", "workspace", startupId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async acceptSafekeepingAgreement(startupId, userId, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      if (!isStartupMember(startup, userId)) {
        throw new Error("Faqat jamoa a'zosi agreement qabul qila oladi");
      }
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      const set = new Set(workspace.safekeeping_agreement.accepted_user_ids);
      set.add(userId);
      workspace.safekeeping_agreement = {
        ...workspace.safekeeping_agreement,
        accepted_user_ids: Array.from(set),
        updated_at: nowIso(),
      };
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "accept_safekeeping_agreement", "workspace", startupId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async upsertEquityEntry(startupId, payload, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const userId = String(payload?.user_id || "").trim();
      if (!userId) throw new Error("A'zo tanlang");
      if (!isStartupMember(startup, userId)) throw new Error("Faqat startup a'zosiga equity beriladi");

      const member = asArray(startup.a_zolar).find((m) => m.user_id === userId);
      const now = nowIso();
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      const safePercent = Math.round(clampNumber(payload?.percent, 0, 100) * 100) / 100;
      if (safePercent <= 0) throw new Error("Equity foizi 0 dan katta bo'lishi kerak");

      const nextEntry = sanitizeEquityEntry({
        ...(payload || {}),
        user_id: userId,
        user_name: payload?.user_name || member?.name || "Unknown",
        percent: safePercent,
        updated_at: now,
      });

      const entryIndex = workspace.equity_entries.findIndex((entry) => entry.user_id === userId);
      if (entryIndex >= 0) {
        workspace.equity_entries[entryIndex] = {
          ...workspace.equity_entries[entryIndex],
          ...nextEntry,
          created_at: workspace.equity_entries[entryIndex].created_at || now,
          updated_at: now,
        };
      } else {
        workspace.equity_entries.push(nextEntry);
      }
      workspace.equity_entries = workspace.equity_entries
        .map(sanitizeEquityEntry)
        .filter(Boolean)
        .sort((a, b) => b.percent - a.percent);
      workspace.updated_at = now;
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "upsert_equity_entry", "workspace_equity", startupId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async removeEquityEntry(startupId, userId, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      workspace.equity_entries = workspace.equity_entries.filter((entry) => entry.user_id !== userId);
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "remove_equity_entry", "workspace_equity", startupId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async createWorkspaceDecision(startupId, payload, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const title = String(payload?.title || "").trim();
      if (!title) throw new Error("Decision sarlavhasi kerak");
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      workspace.decisions.unshift(
        sanitizeDecision({
          id: `dec_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          title,
          description: String(payload?.description || "").trim(),
          type: String(payload?.type || "general").trim(),
          deadline: String(payload?.deadline || "").trim(),
          status: "open",
          votes: [],
          created_by: actorId,
          created_at: nowIso(),
        })
      );
      workspace.decisions = workspace.decisions.slice(0, MAX_WORKSPACE_DECISIONS);
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "create_workspace_decision", "workspace_decision", startupId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async castWorkspaceDecisionVote(startupId, decisionId, vote, voter, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const voterId = String(voter?.user_id || "").trim();
      if (!voterId || !isStartupMember(startup, voterId)) {
        throw new Error("Faqat jamoa a'zosi ovoz bera oladi");
      }
      const safeVote = ["yes", "no", "abstain"].includes(vote) ? vote : null;
      if (!safeVote) throw new Error("Noto'g'ri ovoz turi");

      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      const decisionIndex = workspace.decisions.findIndex((decision) => decision.id === decisionId);
      if (decisionIndex < 0) throw new Error("Decision topilmadi");
      const decision = workspace.decisions[decisionIndex];
      if (decision.status !== "open") throw new Error("Decision yopilgan");

      const votes = asArray(decision.votes).filter((item) => item.user_id !== voterId);
      votes.push({
        user_id: voterId,
        user_name: String(voter?.user_name || "Unknown"),
        vote: safeVote,
        created_at: nowIso(),
      });

      const memberCount = Math.max(1, asArray(startup.a_zolar).length);
      const yesCount = votes.filter((item) => item.vote === "yes").length;
      const noCount = votes.filter((item) => item.vote === "no").length;
      let status = decision.status;
      let resolvedAt = decision.resolved_at || null;
      let note = decision.result_note || "";

      if (votes.length >= memberCount) {
        status = yesCount > noCount ? "accepted" : "rejected";
        resolvedAt = nowIso();
        note = `Auto close: yes ${yesCount}, no ${noCount}`;
      }

      workspace.decisions[decisionIndex] = {
        ...decision,
        votes,
        status,
        resolved_at: resolvedAt,
        result_note: note,
      };
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "cast_workspace_decision_vote", "workspace_decision", decisionId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async closeWorkspaceDecision(startupId, decisionId, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      const decisionIndex = workspace.decisions.findIndex((decision) => decision.id === decisionId);
      if (decisionIndex < 0) throw new Error("Decision topilmadi");
      const decision = workspace.decisions[decisionIndex];
      const votes = asArray(decision.votes);
      const yesCount = votes.filter((item) => item.vote === "yes").length;
      const noCount = votes.filter((item) => item.vote === "no").length;
      workspace.decisions[decisionIndex] = {
        ...decision,
        status: yesCount > noCount ? "accepted" : "rejected",
        resolved_at: nowIso(),
        result_note: `Manual close: yes ${yesCount}, no ${noCount}`,
      };
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "close_workspace_decision", "workspace_decision", decisionId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async createFounderVote(startupId, payload, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const targetUserId = String(payload?.target_user_id || "").trim();
      if (!targetUserId) throw new Error("Kim uchun vote ochilayotganini tanlang");
      if (targetUserId === startup.egasi_id) throw new Error("Founder egasini vote bilan chiqarib bo'lmaydi");
      if (!isStartupMember(startup, targetUserId)) throw new Error("Target foydalanuvchi jamoada emas");
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      const member = asArray(startup.a_zolar).find((m) => m.user_id === targetUserId);

      workspace.founder_votes.unshift(
        sanitizeFounderVote({
          id: `fv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          target_user_id: targetUserId,
          target_user_name: payload?.target_user_name || member?.name || "Unknown",
          reason: String(payload?.reason || "").trim(),
          status: "open",
          votes: [],
          created_by: actorId,
          created_at: nowIso(),
        })
      );
      workspace.founder_votes = workspace.founder_votes.slice(0, MAX_WORKSPACE_FOUNDER_VOTES);
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "create_founder_vote", "workspace_founder_vote", startupId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async castFounderVote(startupId, founderVoteId, vote, voter, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const voterId = String(voter?.user_id || "").trim();
      if (!voterId || !isStartupMember(startup, voterId)) {
        throw new Error("Faqat jamoa a'zosi ovoz bera oladi");
      }
      const safeVote = ["keep", "remove", "abstain"].includes(vote) ? vote : null;
      if (!safeVote) throw new Error("Noto'g'ri ovoz turi");

      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      const voteIndex = workspace.founder_votes.findIndex((item) => item.id === founderVoteId);
      if (voteIndex < 0) throw new Error("Founder vote topilmadi");
      const founderVote = workspace.founder_votes[voteIndex];
      if (founderVote.status !== "open") throw new Error("Founder vote yopilgan");

      const votes = asArray(founderVote.votes).filter((item) => item.user_id !== voterId);
      votes.push({
        user_id: voterId,
        user_name: String(voter?.user_name || "Unknown"),
        vote: safeVote,
        created_at: nowIso(),
      });

      const memberCount = Math.max(1, asArray(startup.a_zolar).length);
      const keepCount = votes.filter((item) => item.vote === "keep").length;
      const removeCount = votes.filter((item) => item.vote === "remove").length;
      let status = founderVote.status;
      let resolvedAt = founderVote.resolved_at || null;
      const shouldAutoResolve = votes.length >= memberCount || removeCount > memberCount / 2;
      if (shouldAutoResolve) {
        status = removeCount > keepCount ? "remove" : "keep";
        resolvedAt = nowIso();
      }

      workspace.founder_votes[voteIndex] = {
        ...founderVote,
        votes,
        status,
        resolved_at: resolvedAt,
      };

      if (status === "remove") {
        const targetId = founderVote.target_user_id;
        startup.a_zolar = asArray(startup.a_zolar).filter((member) => member.user_id !== targetId);
        startup.tasks = asArray(startup.tasks).map((task) =>
          task.assigned_to_id === targetId
            ? { ...task, assigned_to_id: "", assigned_to_name: "Belgilanmagan" }
            : task
        );
        startup.member_reviews = ensureMemberReviews(startup.member_reviews).filter(
          (review) => review.target_user_id !== targetId && review.reviewer_id !== targetId
        );
        workspace.equity_entries = workspace.equity_entries.filter((entry) => entry.user_id !== targetId);
        workspace.safekeeping_agreement = {
          ...workspace.safekeeping_agreement,
          accepted_user_ids: workspace.safekeeping_agreement.accepted_user_ids.filter(
            (id) => id !== targetId
          ),
        };
      }

      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "cast_founder_vote", "workspace_founder_vote", founderVoteId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async closeFounderVote(startupId, founderVoteId, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      const voteIndex = workspace.founder_votes.findIndex((item) => item.id === founderVoteId);
      if (voteIndex < 0) throw new Error("Founder vote topilmadi");
      const founderVote = workspace.founder_votes[voteIndex];
      const votes = asArray(founderVote.votes);
      const keepCount = votes.filter((item) => item.vote === "keep").length;
      const removeCount = votes.filter((item) => item.vote === "remove").length;
      workspace.founder_votes[voteIndex] = {
        ...founderVote,
        status: removeCount > keepCount ? "remove" : "keep",
        resolved_at: nowIso(),
      };
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "close_founder_vote", "workspace_founder_vote", founderVoteId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async addInvestorIntroduction(startupId, payload, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const investorName = String(payload?.investor_name || "").trim();
      if (!investorName) throw new Error("Investor nomi kerak");
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      workspace.investor_logs.unshift(
        sanitizeInvestorLog({
          ...payload,
          id: `inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          investor_name: investorName,
          introduced_by_id: payload?.introduced_by_id || actorId,
          created_at: nowIso(),
          updated_at: nowIso(),
        })
      );
      workspace.investor_logs = workspace.investor_logs.slice(0, MAX_WORKSPACE_INVESTOR_LOGS);
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "add_investor_introduction", "workspace_investor_log", startupId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async updateInvestorIntroductionOutcome(startupId, logId, outcome, note = "", actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const workspace = ensureWorkspaceShape(startup.workspace, startup);
      const safeOutcome = ["open", "meeting", "interested", "rejected", "funded"].includes(outcome)
        ? outcome
        : "open";
      workspace.investor_logs = workspace.investor_logs.map((log) =>
        log.id === logId
          ? {
              ...log,
              outcome: safeOutcome,
              note: note ? String(note).trim() : log.note,
              updated_at: nowIso(),
            }
          : log
      );
      workspace.updated_at = nowIso();
      db.startups[idx] = { ...startup, workspace };
      addAuditLog(db, "update_investor_outcome", "workspace_investor_log", logId, actorId);
      return clone(db.startups[idx]);
    });
  },

  async createMemberReview(startupId, payload, actorId = "system") {
    return mutate((db) => {
      const idx = db.startups.findIndex((s) => s.id === startupId);
      if (idx < 0) throw new Error("Startup topilmadi");
      const startup = db.startups[idx];
      const targetId = String(payload?.target_user_id || "").trim();
      const reviewerId = String(payload?.reviewer_id || "").trim();
      if (!targetId || !reviewerId) throw new Error("Review uchun target va reviewer kerak");
      if (targetId === reviewerId) throw new Error("O'zingizga review bera olmaysiz");
      if (!isStartupMember(startup, targetId) || !isStartupMember(startup, reviewerId)) {
        throw new Error("Review faqat jamoa a'zolari orasida bo'ladi");
      }
      const rating = clampNumber(payload?.rating, 1, 5);
      const memberMap = new Map(asArray(startup.a_zolar).map((m) => [m.user_id, m.name]));
      memberMap.set(startup.egasi_id, startup.egasi_name || "Founder");
      const nextReview = sanitizeReview({
        id: payload?.id || `rv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        target_user_id: targetId,
        target_user_name: payload?.target_user_name || memberMap.get(targetId) || "Unknown",
        reviewer_id: reviewerId,
        reviewer_name: payload?.reviewer_name || memberMap.get(reviewerId) || "Unknown",
        rating,
        comment: payload?.comment || "",
        created_at: nowIso(),
      });

      const reviews = ensureMemberReviews(startup.member_reviews);
      const existingIndex = reviews.findIndex(
        (review) => review.target_user_id === targetId && review.reviewer_id === reviewerId
      );
      if (existingIndex >= 0) {
        reviews[existingIndex] = { ...reviews[existingIndex], ...nextReview };
      } else {
        reviews.unshift(nextReview);
      }
      startup.member_reviews = ensureMemberReviews(reviews);
      db.startups[idx] = startup;
      addAuditLog(db, "create_member_review", "startup_review", startupId, actorId);
      return clone(startup);
    });
  },

  async getUserReputation(userId) {
    const db = await readDb();
    return calculateUserReputationFromDb(db, userId);
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
