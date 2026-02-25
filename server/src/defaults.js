export const DEFAULT_CATEGORIES = [
  "Fintech",
  "Edtech",
  "AI/ML",
  "E-commerce",
  "SaaS",
  "Blockchain",
  "Healthcare",
  "Cybersecurity",
  "GameDev",
  "Networking",
  "Productivity",
  "Other",
];

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

function nowIso() {
  return new Date().toISOString();
}

function ensureMemberReviews(reviews) {
  return asArray(reviews)
    .map((review) => ({
      id: String(review?.id || `rv_${Date.now()}_${Math.floor(Math.random() * 1000)}`),
      target_user_id: String(review?.target_user_id || "").trim(),
      target_user_name: String(review?.target_user_name || "Unknown").trim(),
      reviewer_id: String(review?.reviewer_id || "").trim(),
      reviewer_name: String(review?.reviewer_name || "Unknown").trim(),
      rating: clampNumber(review?.rating, 1, 5),
      comment: String(review?.comment || "").trim(),
      created_at: review?.created_at || nowIso(),
    }))
    .filter((review) => review.target_user_id && review.reviewer_id)
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

function ensureWorkspaceShape(workspace, startup = {}) {
  const base = buildDefaultWorkspace(startup);
  const merged = { ...base, ...(workspace || {}) };
  const lifecycle = String(merged.lifecycle || "active");
  merged.id = String(merged.id || base.id);
  merged.startup_id = String(merged.startup_id || startup.id || "");
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
    .map((entry) => ({
      id: String(entry?.id || `eq_${Date.now()}_${Math.floor(Math.random() * 1000)}`),
      user_id: String(entry?.user_id || "").trim(),
      user_name: String(entry?.user_name || "Unknown").trim(),
      role: String(entry?.role || "Contributor").trim(),
      percent: Math.round(clampNumber(entry?.percent, 0, 100) * 100) / 100,
      vesting_months: Math.round(clampNumber(entry?.vesting_months || 0, 0, 120)),
      created_at: entry?.created_at || nowIso(),
      updated_at: entry?.updated_at || nowIso(),
    }))
    .filter((entry) => entry.user_id)
    .slice(0, 80);
  merged.decisions = asArray(merged.decisions)
    .map((decision) => ({
      id: String(decision?.id || `dec_${Date.now()}_${Math.floor(Math.random() * 1000)}`),
      title: String(decision?.title || "Untitled decision").trim(),
      description: String(decision?.description || "").trim(),
      type: String(decision?.type || "general").trim(),
      deadline: String(decision?.deadline || "").trim(),
      status: ["open", "accepted", "rejected", "closed"].includes(decision?.status)
        ? decision.status
        : "open",
      votes: asArray(decision?.votes)
        .map((vote) => ({
          user_id: String(vote?.user_id || "").trim(),
          user_name: String(vote?.user_name || "Unknown").trim(),
          vote: String(vote?.vote || "").trim(),
          created_at: vote?.created_at || nowIso(),
        }))
        .filter((vote) => vote.user_id),
      result_note: String(decision?.result_note || "").trim(),
      created_at: decision?.created_at || nowIso(),
      created_by: String(decision?.created_by || "").trim(),
      resolved_at: decision?.resolved_at || null,
    }))
    .slice(0, MAX_WORKSPACE_DECISIONS);
  merged.founder_votes = asArray(merged.founder_votes)
    .map((voteItem) => ({
      id: String(voteItem?.id || `fv_${Date.now()}_${Math.floor(Math.random() * 1000)}`),
      target_user_id: String(voteItem?.target_user_id || "").trim(),
      target_user_name: String(voteItem?.target_user_name || "Unknown").trim(),
      reason: String(voteItem?.reason || "").trim(),
      status: ["open", "keep", "remove", "closed"].includes(voteItem?.status)
        ? voteItem.status
        : "open",
      votes: asArray(voteItem?.votes)
        .map((vote) => ({
          user_id: String(vote?.user_id || "").trim(),
          user_name: String(vote?.user_name || "Unknown").trim(),
          vote: String(vote?.vote || "").trim(),
          created_at: vote?.created_at || nowIso(),
        }))
        .filter((vote) => vote.user_id),
      created_at: voteItem?.created_at || nowIso(),
      created_by: String(voteItem?.created_by || "").trim(),
      resolved_at: voteItem?.resolved_at || null,
    }))
    .filter((voteItem) => voteItem.target_user_id)
    .slice(0, MAX_WORKSPACE_FOUNDER_VOTES);
  merged.investor_logs = asArray(merged.investor_logs)
    .map((log) => ({
      id: String(log?.id || `inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`),
      investor_name: String(log?.investor_name || "").trim(),
      contact: String(log?.contact || "").trim(),
      stage: String(log?.stage || "intro").trim(),
      note: String(log?.note || "").trim(),
      outcome: String(log?.outcome || "open").trim(),
      introduced_by_id: String(log?.introduced_by_id || "").trim(),
      introduced_by_name: String(log?.introduced_by_name || "").trim(),
      created_at: log?.created_at || nowIso(),
      updated_at: log?.updated_at || nowIso(),
    }))
    .filter((log) => log.investor_name)
    .slice(0, MAX_WORKSPACE_INVESTOR_LOGS);
  merged.updated_at = nowIso();
  return merged;
}

export function initialDb() {
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

export function ensureDbShape(db) {
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
  shaped.categories =
    Array.isArray(shaped.categories) && shaped.categories.length > 0
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
