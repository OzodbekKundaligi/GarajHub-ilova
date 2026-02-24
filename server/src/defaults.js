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
    is_pro: Boolean(u.is_pro),
    pro_since: u.pro_since || null,
  }));
  shaped.startups = Array.isArray(shaped.startups) ? shaped.startups : [];
  shaped.startups = shaped.startups.map((s) => ({
    ...s,
    chat_messages: Array.isArray(s.chat_messages) ? s.chat_messages : [],
    tasks: Array.isArray(s.tasks)
      ? s.tasks.map((t) => ({
          ...t,
          deadline_reminder_sent_at: t.deadline_reminder_sent_at || null,
        }))
      : [],
  }));
  shaped.joinRequests = Array.isArray(shaped.joinRequests) ? shaped.joinRequests : [];
  shaped.notifications = Array.isArray(shaped.notifications) ? shaped.notifications : [];
  shaped.categories =
    Array.isArray(shaped.categories) && shaped.categories.length > 0
      ? shaped.categories
      : initialDb().categories;
  shaped.tasks = Array.isArray(shaped.tasks) ? shaped.tasks : [];
  shaped.tasks = shaped.tasks.map((t) => ({
    ...t,
    deadline_reminder_sent_at: t.deadline_reminder_sent_at || null,
  }));
  shaped.auditLogs = Array.isArray(shaped.auditLogs) ? shaped.auditLogs : [];
  shaped.proRequests = Array.isArray(shaped.proRequests) ? shaped.proRequests : [];
  shaped.settings = { ...initialDb().settings, ...(shaped.settings || {}) };
  return shaped;
}
