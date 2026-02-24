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

function sanitizeDataImage(value, fallback = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  if (!normalized.startsWith("data:image/")) return normalized;
  if (normalized.length <= MAX_DATA_IMAGE_LENGTH) return normalized;
  return fallback;
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
