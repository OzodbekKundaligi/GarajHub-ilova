import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { getAIMentorResponse } from "./services/geminiService";
import { initDatabase, dbOperations } from "./database";
import { ADMIN_EMAIL, ADMIN_PASS, APP_STORAGE_KEYS, DEFAULT_CATEGORIES } from "./constants";

const STATUS = ["todo", "in-progress", "done"];
const TAB_META = {
  explore: "Kashfiyot",
  create: "Yaratish",
  "my-projects": "Loyihalarim",
  details: "Batafsil",
  requests: "So'rovlar",
  profile: "Profil",
  inbox: "Inbox",
  admin: "Admin",
};
const TAB_ICON = {
  explore: "compass-outline",
  create: "add-circle-outline",
  "my-projects": "rocket-outline",
  details: "albums-outline",
  requests: "people-outline",
  profile: "person-outline",
  inbox: "notifications-outline",
  admin: "shield-checkmark-outline",
};
const BOTTOM_TAB_META = {
  explore: { label: "Kashf", icon: "compass-outline", iconActive: "compass" },
  "my-projects": { label: "Loyiha", icon: "rocket-outline", iconActive: "rocket" },
  create: { label: "Yarat", icon: "add-circle-outline", iconActive: "add-circle" },
  inbox: { label: "Inbox", icon: "notifications-outline", iconActive: "notifications" },
  profile: { label: "Profil", icon: "person-outline", iconActive: "person" },
  admin: { label: "Admin", icon: "shield-checkmark-outline", iconActive: "shield-checkmark" },
};
const STATUS_LABEL = {
  todo: "Kutilmoqda",
  "in-progress": "Jarayonda",
  done: "Bajarildi",
};
const STATUS_VARIANT = {
  approved: "success",
  pending_admin: "default",
  rejected: "danger",
};
const DEFAULT_APP_SETTINGS = {
  pro_enabled: true,
  pro_price_uzs: 5000,
  pro_plan_name: "GarajHub PRO",
  payment_card: "8600 1234 5678 9012",
  payment_holder: "MAMATOV OZODBEK",
  startup_limit_free: 1,
};
const THEME_STORAGE_KEY = "@garajhub_theme_mode";
const ONBOARDING_STORAGE_KEY = "@garajhub_onboarding_v1";
const IS_ANDROID = Platform.OS === "android";
const IS_WEB = Platform.OS === "web";
const FONT_DISPLAY = Platform.select({
  ios: "System",
  android: "sans-serif-medium",
  default: undefined,
});
const FONT_BODY = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: undefined,
});
const FONT_ACCENT = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: undefined,
});
const ONBOARDING_PAGES = [
  {
    icon: "sparkles-outline",
    title: "G'oyadan jamoagacha",
    text: "Startapingizni tez yaratib, kerakli mutaxassislarni bitta joyda to'plang.",
  },
  {
    icon: "layers-outline",
    title: "Ish jarayoni nazorati",
    text: "Vazifalarni status bo'yicha boshqarib, loyiha ritmini yo'qotmasdan olib boring.",
  },
  {
    icon: "bulb-outline",
    title: "AI mentor bilan o'sing",
    text: "Strategiya, MVP va pitch bo'yicha maslahatlarni ilova ichida oling.",
  },
];
let isDarkGlobal = false;
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function adminUser() {
  return {
    id: "admin",
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
    name: "Ozodbek Mamatov",
    phone: "+998932303410",
    role: "admin",
    avatar: "https://ui-avatars.com/api/?name=Ozodbek+Mamatov&background=111&color=fff",
    created_at: new Date().toISOString(),
    skills: [],
  };
}

function getAvatar(name) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "User")}&background=111&color=fff`;
}

function normalizeExternalUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function toSafePositiveInt(value, fallback, min = 1) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function nextStatus(current) {
  if (current === "todo") return "in-progress";
  if (current === "in-progress") return "done";
  return "todo";
}

function normalizeSkillWords(input) {
  return String(input || "")
    .toLowerCase()
    .split(/[^a-zA-Z0-9+#.]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function calculateSmartMatchScore(startup, user) {
  if (!startup || !user) return 0;
  const wantedWords = normalizeSkillWords((startup.kerakli_mutaxassislar || []).join(" "));
  const userWords = [
    ...normalizeSkillWords((user.skills || []).join(" ")),
    ...normalizeSkillWords(user.bio || ""),
  ];
  if (wantedWords.length === 0) return userWords.length > 0 ? 1 : 0;
  let score = 0;
  wantedWords.forEach((w) => {
    if (userWords.includes(w)) score += 3;
    else if (userWords.some((u) => u.includes(w) || w.includes(u))) score += 1;
  });
  if (userWords.length > 0) score += 1;
  return score;
}

function getStartupProgress(startup) {
  const tasks = startup?.tasks || [];
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const todo = tasks.filter((t) => t.status === "todo").length;
  const now = Date.now();
  const overdue = tasks.filter((t) => {
    if (!t.deadline || t.status === "done") return false;
    const due = new Date(`${t.deadline}T23:59:59`).getTime();
    return Number.isFinite(due) && due < now;
  }).length;
  const completion = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, inProgress, todo, overdue, completion };
}

function clampMetric(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function getStartupWorkspace(startup) {
  if (!startup) return null;
  return startup.workspace || null;
}

function getWorkspaceLifecycleLabel(lifecycle) {
  if (lifecycle === "closed") return "Yopilgan";
  if (lifecycle === "paused") return "To'xtatilgan";
  return "Faol";
}

function getEquitySignal(workspace, membersCount = 0) {
  const entries = workspace?.equity_entries || [];
  if (entries.length === 0) {
    return {
      variant: "default",
      text: "Equity kiritilmagan",
      total: 0,
      topShare: 0,
      isBalanced: false,
    };
  }
  const total = entries.reduce((sum, item) => sum + Number(item.percent || 0), 0);
  const topShare = Math.max(...entries.map((item) => Number(item.percent || 0)));
  const withinRange = total >= 95 && total <= 105;
  const tooCentralized = topShare > 45;
  const lowCoverage = membersCount > 0 && entries.length < Math.max(1, Math.floor(membersCount / 2));
  const risky = !withinRange || tooCentralized || lowCoverage;
  return {
    variant: risky ? "danger" : "success",
    text: risky ? "Riskli taqsimot" : "Balansli taqsimot",
    total: Math.round(total * 100) / 100,
    topShare: Math.round(topShare * 100) / 100,
    isBalanced: !risky,
  };
}

function getUserReputationSummary(user, startups) {
  if (!user) {
    return {
      score: 0,
      tier: "D",
      projects: 0,
      collaborators: 0,
      daysWorked: 0,
      assignedTasks: 0,
      doneTasks: 0,
      missedTasks: 0,
      avgRating: 0,
      ratingsCount: 0,
      closedSuccess: 0,
      closedFailed: 0,
      history: [],
    };
  }

  const collaboratorSet = new Set();
  const history = [];
  let daysWorked = 0;
  let assignedTasks = 0;
  let doneTasks = 0;
  let missedTasks = 0;
  let ratingsCount = 0;
  let ratingsTotal = 0;
  let closedSuccess = 0;
  let closedFailed = 0;

  (startups || []).forEach((startup) => {
    if (!startup) return;
    const members = startup.a_zolar || [];
    const isMember = startup.egasi_id === user.id || members.some((member) => member.user_id === user.id);
    if (!isMember) return;

    members.forEach((member) => {
      if (member.user_id && member.user_id !== user.id) collaboratorSet.add(member.user_id);
    });
    if (startup.egasi_id && startup.egasi_id !== user.id) collaboratorSet.add(startup.egasi_id);

    const memberRow = members.find((member) => member.user_id === user.id);
    const startedAt = memberRow?.joined_at || startup.yaratilgan_vaqt || startup.created_at || new Date().toISOString();
    const workspace = getStartupWorkspace(startup);
    const endedAt =
      workspace?.lifecycle === "closed" ? workspace?.closed_at || new Date().toISOString() : new Date().toISOString();
    const diff = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (Number.isFinite(diff)) daysWorked += Math.max(1, diff);

    const myTasks = (startup.tasks || []).filter((task) => task.assigned_to_id === user.id);
    assignedTasks += myTasks.length;
    doneTasks += myTasks.filter((task) => task.status === "done").length;
    missedTasks += myTasks.filter((task) => {
      if (!task.deadline || task.status === "done") return false;
      const dueTs = new Date(`${task.deadline}T23:59:59`).getTime();
      return Number.isFinite(dueTs) && dueTs < Date.now();
    }).length;

    const myReviews = (startup.member_reviews || []).filter((review) => review.target_user_id === user.id);
    myReviews.forEach((review) => {
      ratingsTotal += Number(review.rating || 0);
      ratingsCount += 1;
    });

    const progress = getStartupProgress(startup);
    if (workspace?.lifecycle === "closed") {
      if (progress.completion >= 60) closedSuccess += 1;
      else closedFailed += 1;
    }

    history.push({
      startup_id: startup.id,
      startup_name: startup.nomi,
      lifecycle: workspace?.lifecycle || "active",
      joined_at: startedAt,
      completion: progress.completion,
      tasks_done: myTasks.filter((task) => task.status === "done").length,
      tasks_total: myTasks.length,
    });
  });

  const avgRating = ratingsCount > 0 ? ratingsTotal / ratingsCount : 0;
  let score = 20;
  score += Math.min(doneTasks * 2, 30);
  score -= Math.min(missedTasks * 2, 22);
  score += avgRating > 0 ? avgRating * 8 : 0;
  score += Math.min(collaboratorSet.size * 2, 16);
  score += Math.min(Math.round(daysWorked / 14), 16);
  score += closedSuccess * 6;
  score -= closedFailed * 4;
  score = Math.round(clampMetric(score, 0, 100));

  return {
    score,
    tier: score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D",
    projects: history.length,
    collaborators: collaboratorSet.size,
    daysWorked,
    assignedTasks,
    doneTasks,
    missedTasks,
    avgRating: Number(avgRating.toFixed(2)),
    ratingsCount,
    closedSuccess,
    closedFailed,
    history: history.sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()),
  };
}

function buildStartupCollaborationGraph(startup) {
  if (!startup) return { nodes: [], edges: [] };
  const members = startup.a_zolar || [];
  if (members.length === 0) return { nodes: [], edges: [] };
  const reviews = startup.member_reviews || [];

  const nodes = members.map((member) => {
    const memberReviews = reviews.filter((review) => review.target_user_id === member.user_id);
    const avgRating =
      memberReviews.length > 0
        ? memberReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / memberReviews.length
        : 0;
    return {
      user_id: member.user_id,
      name: member.name,
      role: member.role,
      joined_at: member.joined_at,
      avg_rating: Number(avgRating.toFixed(2)),
      ratings_count: memberReviews.length,
    };
  });

  const edges = [];
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const left = members[i];
      const right = members[j];
      const linkReviews = reviews.filter(
        (review) =>
          (review.reviewer_id === left.user_id && review.target_user_id === right.user_id) ||
          (review.reviewer_id === right.user_id && review.target_user_id === left.user_id)
      );
      const avgLinkRating =
        linkReviews.length > 0
          ? linkReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / linkReviews.length
          : 0;
      const leftJoined = new Date(left.joined_at || startup.yaratilgan_vaqt || startup.created_at || Date.now()).getTime();
      const rightJoined = new Date(right.joined_at || startup.yaratilgan_vaqt || startup.created_at || Date.now()).getTime();
      const sharedDays = Math.max(
        1,
        Math.round((Date.now() - Math.max(leftJoined, rightJoined)) / (1000 * 60 * 60 * 24))
      );
      const linkStrength = Math.round(
        clampMetric(sharedDays / 7 + avgLinkRating * 8, 0, 100)
      );
      edges.push({
        id: `edge_${left.user_id}_${right.user_id}`,
        from: left.user_id,
        to: right.user_id,
        shared_days: sharedDays,
        avg_rating: Number(avgLinkRating.toFixed(2)),
        strength: linkStrength,
      });
    }
  }

  return {
    nodes,
    edges: edges.sort((a, b) => b.strength - a.strength),
  };
}

function buildStartupAiInsight(startup) {
  if (!startup) {
    return {
      riskScore: 0,
      riskLevel: "low",
      founderCompatibility: 0,
      warnings: [],
      recommendations: [],
      overdueRatio: 0,
      pendingDecisions: 0,
      pendingFounderVotes: 0,
      inactiveDays: 0,
      equitySignal: getEquitySignal(null, 0),
    };
  }

  const progress = getStartupProgress(startup);
  const workspace = getStartupWorkspace(startup) || {};
  const members = startup.a_zolar || [];
  const equitySignal = getEquitySignal(workspace, members.length);
  const openDecisions = (workspace.decisions || []).filter((decision) => decision.status === "open");
  const openFounderVotes = (workspace.founder_votes || []).filter((vote) => vote.status === "open");
  const lastChatAt = (startup.chat_messages || []).length
    ? new Date((startup.chat_messages || []).slice(-1)[0].created_at).getTime()
    : new Date(startup.yaratilgan_vaqt || startup.created_at || Date.now()).getTime();
  const inactiveDays = Math.max(0, Math.round((Date.now() - lastChatAt) / (1000 * 60 * 60 * 24)));
  const overdueRatio = progress.total > 0 ? progress.overdue / progress.total : 0;
  const safekeepingAccepted = workspace?.safekeeping_agreement?.accepted_user_ids?.length || 0;
  const safekeepingCoverage = members.length > 0 ? safekeepingAccepted / members.length : 1;

  const founderMembers = members.filter(
    (member) =>
      member.user_id === startup.egasi_id ||
      String(member.role || "").toLowerCase().includes("asoschi") ||
      String(member.role || "").toLowerCase().includes("founder")
  );
  const founderIds = new Set(founderMembers.map((member) => member.user_id));
  founderIds.add(startup.egasi_id);
  const founderReviews = (startup.member_reviews || []).filter(
    (review) => founderIds.has(review.reviewer_id) && founderIds.has(review.target_user_id)
  );
  const founderCompatibilityRaw =
    founderReviews.length > 0
      ? founderReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / founderReviews.length
      : 3;
  const founderCompatibility = Math.round(clampMetric(founderCompatibilityRaw * 20, 20, 100));

  let riskScore = 15;
  if (overdueRatio >= 0.4) riskScore += 24;
  else if (overdueRatio >= 0.2) riskScore += 12;
  if (progress.completion < 25 && progress.total > 3) riskScore += 15;
  if (inactiveDays > 7) riskScore += 14;
  if (inactiveDays > 14) riskScore += 12;
  if (openDecisions.length >= 3) riskScore += 10;
  if (openFounderVotes.length > 0) riskScore += 10;
  if (!equitySignal.isBalanced) riskScore += 12;
  if (safekeepingCoverage < 0.75) riskScore += 8;
  if (founderCompatibility < 55) riskScore += 12;
  riskScore = Math.round(clampMetric(riskScore, 0, 100));

  const warnings = [];
  if (overdueRatio > 0.2) warnings.push({ code: "overdue", text: "Tasklarda kechikish yuqori", variant: "danger" });
  if (inactiveDays > 7) warnings.push({ code: "inactive", text: `Chat faolligi past (${inactiveDays} kun)`, variant: "danger" });
  if (!equitySignal.isBalanced) warnings.push({ code: "equity", text: "Equity adolatsiz yoki noto'liq", variant: "danger" });
  if (openFounderVotes.length > 0) warnings.push({ code: "founder_vote", text: "Founder vote hali ochiq", variant: "default" });
  if (safekeepingCoverage < 0.75) warnings.push({ code: "agreement", text: "Safekeeping hamma tomonidan qabul qilinmagan", variant: "default" });
  if (warnings.length === 0) warnings.push({ code: "ok", text: "Jiddiy risk signal topilmadi", variant: "success" });

  const recommendations = [];
  if (overdueRatio > 0.2) recommendations.push("Haftalik sprint review va owner-assignee qayta taqsimlashni yoqing.");
  if (!equitySignal.isBalanced) recommendations.push("Equity jadvalini qayta balanslang (jami 100% va top-share <=45%).");
  if (founderCompatibility < 60) recommendations.push("Founderlar o'rtasida qaror protokoli va haftalik alignment meeting kiriting.");
  if (inactiveDays > 7) recommendations.push("Jamoa chatda daily update formatini majburiy qiling.");
  if (openDecisions.length >= 3) recommendations.push("Ochiq qarorlarni yopish uchun deadline va owner belgilang.");
  if (recommendations.length === 0) recommendations.push("Hozirgi ritm yaxshi. Investor intro va delivery tezligini oshirishga fokus qiling.");

  return {
    riskScore,
    riskLevel: riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low",
    founderCompatibility,
    warnings,
    recommendations,
    overdueRatio: Number((overdueRatio * 100).toFixed(1)),
    pendingDecisions: openDecisions.length,
    pendingFounderVotes: openFounderVotes.length,
    inactiveDays,
    equitySignal,
  };
}

function confirmAction(title, message, onConfirm) {
  if (Platform.OS === "web") {
    const canConfirm = typeof globalThis.confirm === "function";
    if (!canConfirm || globalThis.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Yo'q", style: "cancel" },
    { text: "Ha", style: "destructive", onPress: onConfirm },
  ]);
}

const Badge = ({ label, variant = "default", style, textStyle }) => (
  <View style={[styles.badge, styles[`badge_${variant}`], style]}>
    <Text style={[styles.badgeText, styles[`badgeText_${variant}`], textStyle]}>{label}</Text>
  </View>
);

const EmptyState = ({ title, subtitle, action }) => (
  <View style={styles.emptyWrap}>
    <View style={styles.emptyIcon}>
      <Text style={styles.emptyIconText}>G</Text>
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    {!!subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    {action}
  </View>
);

const Btn = ({ title, onPress, type = "primary", small = false, style, textStyle, icon, disabled = false }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.btn, styles[`btn_${type}`], small && styles.btnSmall, disabled && styles.btnDisabled, style]}
    activeOpacity={disabled ? 1 : 0.8}
    disabled={disabled}
  >
    <View style={styles.btnInner}>
      {!!icon && (
        <Ionicons
          name={icon}
          size={small ? 12 : 14}
          color={type === "primary" ? "#fff" : isDarkGlobal ? "#dde7fb" : "#0f172a"}
          style={styles.btnIcon}
        />
      )}
      <Text
        style={[
          styles.btnText,
          type === "primary" ? styles.btnTextPrimary : styles.btnTextSecondary,
          textStyle,
        ]}
      >
        {title}
      </Text>
    </View>
  </TouchableOpacity>
);

const Field = ({ label, value, onChangeText, placeholder, multiline = false, secureTextEntry = false }) => (
  <View style={{ marginBottom: 10 }}>
    {label ? <Text style={styles.label}>{label}</Text> : null}
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={isDarkGlobal ? "#7f93b6" : "#8c8c8c"}
      multiline={multiline}
      secureTextEntry={secureTextEntry}
      style={[styles.input, multiline && styles.textArea]}
    />
  </View>
);

const ImagePickerField = ({ label, imageUri, onPick, hint }) => (
  <View style={{ marginBottom: 10 }}>
    {!!label && <Text style={styles.label}>{label}</Text>}
    <TouchableOpacity style={styles.imagePickerBox} onPress={onPick} activeOpacity={0.86}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.imagePickerPreview} />
      ) : (
        <View style={styles.imagePickerEmpty}>
          <Ionicons name="image-outline" size={20} color={isDarkGlobal ? "#9eb0cf" : "#6b7a99"} />
          <Text style={styles.imagePickerEmptyText}>Rasm tanlash</Text>
        </View>
      )}
    </TouchableOpacity>
    {!!hint && <Text style={styles.tinyMuted}>{hint}</Text>}
  </View>
);

export default function App() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isCompact = screenWidth <= 390;
  const isVeryCompact = screenWidth <= 350;
  const isTabletLayout = screenWidth >= 768;

  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [activeTab, setActiveTab] = useState("explore");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState("vazifalar");
  const [selectedStartupId, setSelectedStartupId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [adminTab, setAdminTab] = useState("dashboard");
  const [newCategoryName, setNewCategoryName] = useState("");

  const [allUsers, setAllUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [startups, setStartups] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [auditLogs, setAuditLogs] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [appSettings, setAppSettings] = useState(DEFAULT_APP_SETTINGS);
  const [proRequests, setProRequests] = useState([]);
  const [proSettingsDraft, setProSettingsDraft] = useState({
    pro_price_uzs: String(DEFAULT_APP_SETTINGS.pro_price_uzs),
    payment_card: DEFAULT_APP_SETTINGS.payment_card,
    payment_holder: DEFAULT_APP_SETTINGS.payment_holder,
    startup_limit_free: String(DEFAULT_APP_SETTINGS.startup_limit_free),
  });

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", phone: "", password: "", avatar: "" });
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editedUser, setEditedUser] = useState({});
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [proModalOpen, setProModalOpen] = useState(false);
  const [proReceipt, setProReceipt] = useState("");
  const [proNote, setProNote] = useState("");
  const [moderationBusyId, setModerationBusyId] = useState("");
  const [workspaceDraft, setWorkspaceDraft] = useState({
    agreementText: "",
    equityMemberId: "",
    equityPercent: "",
    equityRole: "",
    equityVestingMonths: "12",
    decisionTitle: "",
    decisionDescription: "",
    decisionDeadline: "",
    founderVoteTargetId: "",
    founderVoteReason: "",
    investorName: "",
    investorContact: "",
    investorStage: "intro",
    investorNote: "",
    successFeePercent: "2",
    reviewTargetId: "",
    reviewRating: "5",
    reviewComment: "",
  });

  const [createForm, setCreateForm] = useState({
    nomi: "",
    tavsif: "",
    category: DEFAULT_CATEGORIES[0],
    specialists: "",
    logo: "",
    github_url: "",
    website_url: "",
  });

  const [taskModal, setTaskModal] = useState({ open: false, startupId: "", title: "", description: "", deadline: "" });
  const [showAI, setShowAI] = useState(false);
  const [aiChat, setAiChat] = useState([{ id: "w1", sender: "ai", text: "Assalomu alaykum, savolingizni yozing." }]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [teamChatInput, setTeamChatInput] = useState("");
  const drawerX = React.useRef(new Animated.Value(-320)).current;
  const detailsAnim = React.useRef(new Animated.Value(0)).current;
  const onboardingShiftX = React.useRef(new Animated.Value(0)).current;
  const onboardingOpacity = React.useRef(new Animated.Value(1)).current;
  const contentFade = React.useRef(new Animated.Value(1)).current;
  const aiPulse = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setShowSplash(false), 950);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [loading]);

  useEffect(() => {
    if (activeTab !== "details" || !selectedStartupId) return;
    detailsAnim.setValue(0);
    Animated.spring(detailsAnim, {
      toValue: 1,
      speed: 15,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
  }, [activeTab, selectedStartupId, activeDetailTab, detailsAnim]);

  useEffect(() => {
    contentFade.setValue(0);
    Animated.timing(contentFade, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeTab, activeDetailTab, selectedStartupId, contentFade]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(aiPulse, {
          toValue: 1.06,
          duration: 1150,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(aiPulse, {
          toValue: 1,
          duration: 1150,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => {
      pulse.stop();
    };
  }, [aiPulse]);

  useEffect(() => {
    if (currentUser?.role === "admin" && activeTab === "admin") {
      refreshAdminData();
    }
  }, [activeTab, currentUser, adminTab]);

  useEffect(() => {
    if (selectedCategory !== "All" && !categories.includes(selectedCategory)) {
      setSelectedCategory("All");
    }
    if (!categories.includes(createForm.category)) {
      setCreateForm((prev) => ({ ...prev, category: categories[0] || "Other" }));
    }
  }, [categories, selectedCategory, createForm.category]);

  useEffect(() => {
    const startupForDraft = startups.find((item) => item.id === selectedStartupId);
    if (!startupForDraft) return;
    const workspace = getStartupWorkspace(startupForDraft);
    const members = startupForDraft.a_zolar || [];
    const defaultTargetMember = members.find((member) => member.user_id !== currentUser?.id);
    setWorkspaceDraft((prev) => ({
      ...prev,
      agreementText:
        workspace?.safekeeping_agreement?.text ||
        prev.agreementText ||
        "GarajHub safekeeping agreement",
      equityMemberId: members[0]?.user_id || prev.equityMemberId || "",
      equityRole: prev.equityRole || "Contributor",
      successFeePercent: String(workspace?.success_fee_percent || 2),
      founderVoteTargetId: defaultTargetMember?.user_id || "",
      reviewTargetId: defaultTargetMember?.user_id || "",
    }));
  }, [selectedStartupId, startups, currentUser?.id]);

  async function pickImageAndSet(setter) {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Ruxsat kerak", "Rasm tanlash uchun galereya ruxsatini bering.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.55,
        base64: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const maxFileSizeBytes = 2 * 1024 * 1024;
      if (asset.fileSize && asset.fileSize > maxFileSizeBytes) {
        Alert.alert("Katta rasm", "Rasm 2MB dan kichik bo'lishi kerak.");
        return;
      }
      setter(asset.uri || "");
    } catch {
      Alert.alert("Xatolik", "Rasm yuklashda muammo bo'ldi.");
    }
  }

  async function runDeadlineReminderSweep(startupInput = null) {
    const list = Array.isArray(startupInput) ? startupInput : await dbOperations.getStartups();
    const now = Date.now();
    const in24Hours = now + 24 * 60 * 60 * 1000;
    const nextList = [];

    for (const startup of list) {
      let startupChanged = false;
      const tasks = (startup.tasks || []).map((task) => ({ ...task }));
      const nextTasks = [];

      for (const task of tasks) {
        let nextTask = { ...task };
        if (
          task.deadline &&
          task.status !== "done" &&
          !task.deadline_reminder_sent_at
        ) {
          const dueTs = new Date(`${task.deadline}T23:59:59`).getTime();
          if (Number.isFinite(dueTs) && dueTs <= in24Hours) {
            const notifyIds = [task.assigned_to_id, startup.egasi_id]
              .map((x) => String(x || "").trim())
              .filter(Boolean)
              .filter((x, i, arr) => arr.indexOf(x) === i);
            for (const uid of notifyIds) {
              await dbOperations.createNotification({
                id: `n_deadline_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                user_id: uid,
                title: "Deadline reminder",
                text: `"${task.title}" vazifasi uchun deadline yaqin (${task.deadline}).`,
                type: "info",
                is_read: false,
                created_at: new Date().toISOString(),
              });
            }
            nextTask.deadline_reminder_sent_at = new Date().toISOString();
            startupChanged = true;
          }
        }
        nextTasks.push(nextTask);
      }

      if (startupChanged) {
        const updated = await dbOperations.updateStartup(startup.id, { tasks: nextTasks });
        nextList.push(updated);
      } else {
        nextList.push(startup);
      }
    }

    return nextList;
  }

  async function loadData() {
    try {
      setLoading(true);
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      setIsDarkMode(savedTheme === "dark");
      const onboardingDone = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
      const shouldShowOnboarding = onboardingDone !== "1";
      setShowOnboarding(shouldShowOnboarding);
      setOnboardingStep(0);
      await initDatabase();
      const [users, startupList, requests, cats, settings, allProRequests] = await Promise.all([
        dbOperations.getUsers(),
        dbOperations.getStartups(),
        dbOperations.getJoinRequests(),
        dbOperations.getCategories(),
        dbOperations.getSettings(),
        dbOperations.getProRequests(),
      ]);
      setAllUsers(users);
      const startupsAfterReminder = await runDeadlineReminderSweep(startupList);
      setStartups(startupsAfterReminder);
      setJoinRequests(requests);
      const categoryNames = (cats || []).map((c) => c.name).filter(Boolean);
      setCategories(categoryNames.length > 0 ? categoryNames : DEFAULT_CATEGORIES);
      const safeSettings = { ...DEFAULT_APP_SETTINGS, ...(settings || {}) };
      setAppSettings(safeSettings);
      setProRequests(allProRequests);
      setProSettingsDraft({
        pro_price_uzs: String(safeSettings.pro_price_uzs || DEFAULT_APP_SETTINGS.pro_price_uzs),
        payment_card: safeSettings.payment_card || DEFAULT_APP_SETTINGS.payment_card,
        payment_holder: safeSettings.payment_holder || DEFAULT_APP_SETTINGS.payment_holder,
        startup_limit_free: String(safeSettings.startup_limit_free || DEFAULT_APP_SETTINGS.startup_limit_free),
      });

      const savedId = await AsyncStorage.getItem(APP_STORAGE_KEYS.currentUserId);
      if (savedId) {
        if (savedId === "admin") {
          const adm = adminUser();
          setCurrentUser(adm);
          setNotifications(await dbOperations.getNotifications("admin"));
        } else {
          const user = await dbOperations.getUserById(savedId);
          if (user) {
            setCurrentUser(user);
            setNotifications(await dbOperations.getNotifications(user.id));
          } else {
            setCurrentUser(null);
            setNotifications([]);
            await AsyncStorage.removeItem(APP_STORAGE_KEYS.currentUserId);
            setShowAuthModal(!shouldShowOnboarding);
          }
        }
      } else {
        setShowAuthModal(!shouldShowOnboarding);
      }
    } catch {
      Alert.alert("Xatolik", "Yuklashda muammo bo'ldi.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleTheme() {
    const next = !isDarkMode;
    setIsDarkMode(next);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {}
  }

  async function finishOnboarding() {
    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    } catch {}
    setShowOnboarding(false);
    if (!currentUser) setShowAuthModal(true);
  }

  function animateOnboardingStep(targetStep, direction = 1) {
    onboardingShiftX.setValue(direction > 0 ? 26 : -26);
    onboardingOpacity.setValue(0.25);
    setOnboardingStep(targetStep);
    Animated.parallel([
      Animated.timing(onboardingShiftX, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(onboardingOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }

  function nextOnboardingStep() {
    if (onboardingStep >= ONBOARDING_PAGES.length - 1) {
      finishOnboarding();
      return;
    }
    animateOnboardingStep(onboardingStep + 1, 1);
  }

  function prevOnboardingStep() {
    if (onboardingStep <= 0) return;
    animateOnboardingStep(onboardingStep - 1, -1);
  }

  const onboardingPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -55) {
            nextOnboardingStep();
            return;
          }
          if (gesture.dx > 55) {
            prevOnboardingStep();
          }
        },
      }),
    [onboardingStep]
  );

  async function refreshAdminData() {
    const [stats, logs, cats, settings, allProRequests] = await Promise.all([
      dbOperations.getStats(),
      dbOperations.getAuditLogs(60),
      dbOperations.getCategories(),
      dbOperations.getSettings(),
      dbOperations.getProRequests(),
    ]);
    setAdminStats(stats);
    setAuditLogs(logs || []);
    setCategories(cats.map((c) => c.name));
    const safeSettings = { ...DEFAULT_APP_SETTINGS, ...(settings || {}) };
    setAppSettings(safeSettings);
    setProRequests(allProRequests || []);
    setProSettingsDraft({
      pro_price_uzs: String(safeSettings.pro_price_uzs || DEFAULT_APP_SETTINGS.pro_price_uzs),
      payment_card: safeSettings.payment_card || DEFAULT_APP_SETTINGS.payment_card,
      payment_holder: safeSettings.payment_holder || DEFAULT_APP_SETTINGS.payment_holder,
      startup_limit_free: String(safeSettings.startup_limit_free || DEFAULT_APP_SETTINGS.startup_limit_free),
    });
  }

  function openMenu() {
    drawerX.setValue(drawerHiddenX);
    setIsMenuOpen(true);
    Animated.spring(drawerX, {
      toValue: 0,
      damping: 20,
      stiffness: 230,
      mass: 0.75,
      useNativeDriver: true,
    }).start();
  }

  function closeMenu(onClosed) {
    Animated.timing(drawerX, {
      toValue: drawerHiddenX,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsMenuOpen(false);
        if (typeof onClosed === "function") onClosed();
      }
    });
  }

  function hasStartupAccess(startup) {
    if (!currentUser || !startup) return false;
    if (currentUser.role === "admin") return true;
    if (startup.egasi_id === currentUser.id) return true;
    return (startup.a_zolar || []).some((m) => m.user_id === currentUser.id);
  }

  async function openExternalLink(rawUrl) {
    const normalized = normalizeExternalUrl(rawUrl);
    if (!normalized) return;
    try {
      const supported = await Linking.canOpenURL(normalized);
      if (!supported) {
        Alert.alert("Noto'g'ri link", "Link ochib bo'lmadi. URL ni tekshirib qayta urinib ko'ring.");
        return;
      }
      await Linking.openURL(normalized);
    } catch {
      Alert.alert("Xatolik", "Linkni ochishda muammo bo'ldi.");
    }
  }

  function navigateTo(tab, startupId = null, options = {}) {
    const skipGuard = Boolean(options?.skipGuard);
    const applyNavigation = () => {
      setActiveTab(tab);
      if (startupId) {
        setSelectedStartupId(startupId);
        setActiveDetailTab("vazifalar");
      }
    };

    const privateTabs = ["my-projects", "requests", "profile", "inbox", "admin"];
    if (!skipGuard && !currentUser && privateTabs.includes(tab)) {
      setShowAuthModal(true);
      if (isMenuOpen) closeMenu(() => setActiveTab("explore"));
      else setActiveTab("explore");
      return;
    }
    if (!skipGuard && tab === "admin" && currentUser?.role !== "admin") {
      return;
    }
    if (isMenuOpen) {
      closeMenu(applyNavigation);
      return;
    }
    applyNavigation();
  }

  async function addNotification(userId, title, text, type = "info") {
    const n = {
      id: `n_${Date.now()}`,
      user_id: userId,
      title,
      text,
      type,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    await dbOperations.createNotification(n);
    if (currentUser && (currentUser.id === userId || (currentUser.role === "admin" && userId === "admin"))) {
      setNotifications((prev) => [n, ...prev]);
    }
  }

  async function handleAuth() {
    try {
      const email = authForm.email.trim().toLowerCase();
      const pass = authForm.password.trim();
      if (!email || !pass) return Alert.alert("Xatolik", "Email va parol kiriting.");

      const closeAuthModal = () => {
        setShowAuthModal(false);
        setAuthMode("login");
        setAuthForm({ name: "", email: "", phone: "", password: "", avatar: "" });
      };

      if (authMode === "login") {
        if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
          const adm = adminUser();
          setCurrentUser(adm);
          await AsyncStorage.setItem(APP_STORAGE_KEYS.currentUserId, "admin");
          setNotifications(await dbOperations.getNotifications("admin"));
          closeAuthModal();
          navigateTo("admin", null, { skipGuard: true });
          return;
        }
        const user = await dbOperations.getUserByEmail(email);
        if (!user || user.password !== pass) return Alert.alert("Xatolik", "Email yoki parol noto'g'ri.");
        if (user.banned) return Alert.alert("Blok", "Sizning profilingiz bloklangan.");
        setCurrentUser(user);
        await AsyncStorage.setItem(APP_STORAGE_KEYS.currentUserId, user.id);
        setNotifications(await dbOperations.getNotifications(user.id));
        closeAuthModal();
        navigateTo("explore");
        return;
      }

      if (!authForm.name.trim()) return Alert.alert("Xatolik", "Ism kiriting.");
      const exists = await dbOperations.getUserByEmail(email);
      if (exists) return Alert.alert("Xatolik", "Bu email oldin ro'yxatdan o'tgan.");

      const u = {
        id: `u_${Date.now()}`,
        email,
        password: pass,
        name: authForm.name.trim(),
        phone: authForm.phone.trim(),
        role: "user",
        created_at: new Date().toISOString(),
        skills: [],
        is_pro: false,
        pro_since: null,
        avatar: authForm.avatar.trim() || getAvatar(authForm.name),
      };
      await dbOperations.createUser(u);
      setAllUsers((prev) => [u, ...prev]);
      setCurrentUser(u);
      await AsyncStorage.setItem(APP_STORAGE_KEYS.currentUserId, u.id);
      closeAuthModal();
      navigateTo("profile", null, { skipGuard: true });
    } catch (error) {
      Alert.alert("Xatolik", error?.message || "Kirish/ro'yxatdan o'tishda xatolik bo'ldi.");
    }
  }

  async function logout() {
    setCurrentUser(null);
    setNotifications([]);
    await AsyncStorage.removeItem(APP_STORAGE_KEYS.currentUserId);
    navigateTo("explore");
  }

  async function createStartup() {
    try {
      if (!currentUser) return setShowAuthModal(true);
      if (!createForm.nomi.trim() || !createForm.tavsif.trim()) return Alert.alert("Xatolik", "Nomi va tavsifni kiriting.");
      const isProEnabled = Boolean(appSettings.pro_enabled);
      const freeLimit = toSafePositiveInt(appSettings.startup_limit_free, 1, 1);
      const ownedByMe = startups.filter((s) => s.egasi_id === currentUser.id).length;
      const hasProAccess = currentUser.role === "admin" || (isProEnabled && Boolean(currentUser.is_pro));
      if (isProEnabled && !hasProAccess && ownedByMe >= freeLimit) {
        Alert.alert(
          "Free limit tugadi",
          `Oddiy tarifda ${freeLimit} ta startup yaratish mumkin. PRO orqali cheksiz yarating.`
        );
        navigateTo("profile");
        setProModalOpen(true);
        return;
      }

      const specialistsList = createForm.specialists
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const specialistWords = specialistsList.join(" ").toLowerCase();
      const isItFocused =
        specialistWords.includes("developer") ||
        specialistWords.includes("frontend") ||
        specialistWords.includes("backend") ||
        specialistWords.includes("fullstack") ||
        specialistWords.includes("engineer");
      if (!isItFocused) {
        return Alert.alert(
          "Segment qoidasi",
          "Hozircha faqat IT founder + developer segmenti ochiq. Mutaxassislar maydoniga kamida bir developer roli kiriting."
        );
      }

      const s = {
        id: `s_${Date.now()}`,
        nomi: createForm.nomi.trim(),
        tavsif: createForm.tavsif.trim(),
        category: String(createForm.category || "").trim() || categories[0] || "Other",
        kerakli_mutaxassislar: specialistsList,
        logo: createForm.logo.trim() || "https://via.placeholder.com/150/111/fff?text=Startup",
        egasi_id: currentUser.id,
        egasi_name: currentUser.name,
        status: "pending_admin",
        yaratilgan_vaqt: new Date().toISOString(),
        a_zolar: [{ user_id: currentUser.id, name: currentUser.name, role: "Asoschi", joined_at: new Date().toISOString() }],
        tasks: [],
        github_url: createForm.github_url.trim(),
        website_url: createForm.website_url.trim(),
      };
      await dbOperations.createStartup(s);
      setStartups((prev) => [s, ...prev]);
      await addNotification("admin", "Yangi ariza", `${s.nomi} moderatsiyaga yuborildi.`, "info");
      setCreateForm({ nomi: "", tavsif: "", category: categories[0] || "Other", specialists: "", logo: "", github_url: "", website_url: "" });
      navigateTo("my-projects");
    } catch (error) {
      Alert.alert("Xatolik", error?.message || "Startup yaratishda xatolik bo'ldi.");
    }
  }

  async function sendJoinRequest(startup) {
    try {
      if (!currentUser) return setShowAuthModal(true);
      if (startup.egasi_id === currentUser.id) return Alert.alert("Xatolik", "O'zingizning loyihangiz.");
      if ((startup.a_zolar || []).some((m) => m.user_id === currentUser.id)) return Alert.alert("Xatolik", "Siz jamoada borsiz.");
      const hasPendingRequest = joinRequests.some(
        (req) => req.startup_id === startup.id && req.user_id === currentUser.id
      );
      if (hasPendingRequest) {
        return Alert.alert("Kutilmoqda", "Bu loyiha uchun avval yuborgan so'rovingiz hali ko'rib chiqilmagan.");
      }

      const req = {
        id: `req_${Date.now()}`,
        startup_id: startup.id,
        startup_name: startup.nomi,
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_phone: currentUser.phone,
        specialty: "Developer",
        comment: "Hamkorlik qilish istagi.",
        status: "pending",
        created_at: new Date().toISOString(),
      };
      await dbOperations.createJoinRequest(req);
      setJoinRequests((prev) => [req, ...prev]);
      await addNotification(startup.egasi_id, "Yangi ariza", `${currentUser.name} jamoaga qo'shilmoqchi.`, "info");
      Alert.alert("Yuborildi", "So'rovingiz yuborildi.");
    } catch (error) {
      Alert.alert("Xatolik", error?.message || "So'rov yuborishda xatolik bo'ldi.");
    }
  }

  async function requestAction(id, action) {
    const r = joinRequests.find((x) => x.id === id);
    if (!r) return;
    if (action === "accept") {
      const s = startups.find((x) => x.id === r.startup_id);
      if (s && !(s.a_zolar || []).some((m) => m.user_id === r.user_id)) {
        const updated = [...(s.a_zolar || []), { user_id: r.user_id, name: r.user_name, role: r.specialty, joined_at: new Date().toISOString() }];
        const persistedStartup = await dbOperations.updateStartup(s.id, { a_zolar: updated });
        setStartups((prev) => prev.map((x) => (x.id === s.id ? persistedStartup : x)));
        await addNotification(
          r.user_id,
          "Qabul qilindingiz",
          `${r.startup_name} jamoasiga qabul qilindingiz. Workspace avtomatik ochildi.`,
          "success"
        );
      }
    } else {
      await addNotification(
        r.user_id,
        "So'rov rad etildi",
        `${r.startup_name} jamoasiga qo'shilish so'rovingiz rad etildi.`,
        "danger"
      );
    }
    await dbOperations.deleteRequest(id);
    setJoinRequests((prev) => prev.filter((x) => x.id !== id));
  }

  async function addTask() {
    try {
      const startup = startups.find((s) => s.id === taskModal.startupId);
      if (!startup) return Alert.alert("Xatolik", "Loyiha topilmadi.");
      if (!hasStartupAccess(startup)) {
        return Alert.alert("Ruxsat yo'q", "Bu loyiha uchun vazifa qo'shish huquqingiz yo'q.");
      }
      if (!taskModal.title.trim()) return Alert.alert("Xatolik", "Vazifa nomi kerak.");
      const t = {
        id: `t_${Date.now()}`,
        startup_id: taskModal.startupId,
        title: taskModal.title.trim(),
        description: taskModal.description.trim(),
        assigned_to_id: currentUser?.id || "",
        assigned_to_name: currentUser?.name || "Belgilanmagan",
        deadline: taskModal.deadline.trim(),
        status: "todo",
      };
      await dbOperations.createTask(t);
      const refreshed = await dbOperations.getStartups();
      const afterReminder = await runDeadlineReminderSweep(refreshed);
      setStartups(afterReminder);
      if (currentUser) {
        const notifUserId = currentUser.role === "admin" ? "admin" : currentUser.id;
        setNotifications(await dbOperations.getNotifications(notifUserId));
      }
      setTaskModal({ open: false, startupId: "", title: "", description: "", deadline: "" });
    } catch (error) {
      Alert.alert("Xatolik", error?.message || "Vazifa qo'shishda xatolik bo'ldi.");
    }
  }

  async function moveTask(taskId, status) {
    try {
      const startup = startups.find((s) => (s.tasks || []).some((t) => t.id === taskId));
      if (!startup) return;
      if (!hasStartupAccess(startup)) {
        Alert.alert("Ruxsat yo'q", "Bu vazifani yangilash huquqingiz yo'q.");
        return;
      }
      await dbOperations.updateTaskStatus(taskId, status);
      const refreshed = await dbOperations.getStartups();
      const afterReminder = await runDeadlineReminderSweep(refreshed);
      setStartups(afterReminder);
      if (currentUser) {
        const notifUserId = currentUser.role === "admin" ? "admin" : currentUser.id;
        setNotifications(await dbOperations.getNotifications(notifUserId));
      }
    } catch (error) {
      Alert.alert("Xatolik", error?.message || "Task statusini yangilab bo'lmadi.");
    }
  }

  function deleteTask(taskId) {
    const startup = startups.find((s) => (s.tasks || []).some((t) => t.id === taskId));
    const canDelete =
      Boolean(currentUser) &&
      Boolean(startup) &&
      (currentUser.role === "admin" || startup.egasi_id === currentUser.id);
    if (!canDelete) {
      Alert.alert("Ruxsat yo'q", "Vazifani faqat loyiha egasi yoki admin o'chira oladi.");
      return;
    }
    confirmAction("Tasdiq", "Vazifani o'chirasizmi?", async () => {
      try {
        await dbOperations.deleteTask(taskId);
        const refreshed = await dbOperations.getStartups();
        const afterReminder = await runDeadlineReminderSweep(refreshed);
        setStartups(afterReminder);
      } catch (error) {
        Alert.alert("Xatolik", error?.message || "Vazifani o'chirib bo'lmadi.");
      }
    });
  }

  function deleteStartup(startupId) {
    const startup = startups.find((s) => s.id === startupId);
    const canDelete =
      Boolean(currentUser) &&
      Boolean(startup) &&
      (currentUser.role === "admin" || startup.egasi_id === currentUser.id);
    if (!canDelete) {
      Alert.alert("Ruxsat yo'q", "Loyihani faqat egasi yoki admin o'chira oladi.");
      return;
    }
    confirmAction("Tasdiq", "Loyihani o'chirasizmi?", async () => {
      const prevStartups = [...startups];
      const prevRequests = [...joinRequests];
      setStartups((prev) => prev.filter((s) => s.id !== startupId));
      setJoinRequests((prev) => prev.filter((r) => r.startup_id !== startupId));
      if (selectedStartupId === startupId) setSelectedStartupId(null);
      try {
        await dbOperations.deleteStartup(startupId, currentUser?.id);
        const [nextStartups, nextRequests] = await Promise.all([
          dbOperations.getStartups(),
          dbOperations.getJoinRequests(),
        ]);
        setStartups(nextStartups);
        setJoinRequests(nextRequests);
        navigateTo("my-projects");
      } catch (error) {
        setStartups(prevStartups);
        setJoinRequests(prevRequests);
        Alert.alert("Xatolik", error?.message || "Startupni o'chirib bo'lmadi.");
      }
    });
  }

  async function updateProfile() {
    if (!currentUser) return;
    const next = {
      ...currentUser,
      ...editedUser,
      skills: (editedUser.skills || currentUser.skills || [])
        .toString()
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    };
    if (currentUser.id !== "admin") {
      await dbOperations.updateUser(currentUser.id, next);
      setAllUsers((prev) => prev.map((u) => (u.id === currentUser.id ? next : u)));
    }
    setCurrentUser(next);
    setEditModalOpen(false);
  }

  async function adminSetStartupStatus(startupId, status) {
    if (!currentUser || currentUser.role !== "admin") return;
    if (moderationBusyId === startupId) return;
    const target = startups.find((s) => s.id === startupId);
    if (!target) {
      Alert.alert("Xatolik", "Startup topilmadi.");
      return;
    }
    if (target.status !== "pending_admin") {
      Alert.alert("Ma'lumot", "Bu startup allaqachon ko'rib chiqilgan.");
      navigateTo("explore");
      return;
    }
    const reason = status === "rejected" ? "Admin tomonidan rad etildi" : "";
    setModerationBusyId(startupId);
    try {
      const updated = await dbOperations.updateStartupStatus(startupId, status, reason, currentUser?.id);
      setStartups((prev) => prev.map((s) => (s.id === startupId ? updated : s)));
      if (updated?.egasi_id) {
        await addNotification(
          updated.egasi_id,
          status === "approved" ? "Tasdiqlandi" : "Rad etildi",
          `${updated.nomi} - ${status}`,
          status === "approved" ? "success" : "danger"
        );
      }
      setAdminTab("dashboard");
      navigateTo("explore");
    } catch (error) {
      Alert.alert("Xatolik", error?.message || "Moderatsiya vaqtida xatolik bo'ldi.");
    } finally {
      setModerationBusyId("");
    }
  }

  async function adminUserRole(id, role) {
    const updated = await dbOperations.updateUserRole(id, role, currentUser?.id);
    setAllUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
  }

  async function adminToggleUserPro(id, enabled) {
    const updated = await dbOperations.setUserPro(id, enabled, currentUser?.id);
    setAllUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    if (currentUser?.id === id) {
      setCurrentUser(updated);
    }
    await addNotification(
      id,
      enabled ? "PRO faollashtirildi" : "PRO o'chirildi",
      enabled
        ? "Tabriklaymiz, akkauntingizda PRO faollashtirildi."
        : "Akkauntingizda PRO to'xtatildi.",
      enabled ? "success" : "danger"
    );
  }

  async function adminUserBan(id, banned) {
    const updated = await dbOperations.setUserBanned(id, banned, currentUser?.id);
    setAllUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
  }

  async function adminUserDelete(id) {
    await dbOperations.deleteUser(id, currentUser?.id);
    setAllUsers(await dbOperations.getUsers());
    setStartups(await dbOperations.getStartups());
  }

  async function adminDeleteStartup(id) {
    const prevStartups = [...startups];
    const prevRequests = [...joinRequests];
    setStartups((prev) => prev.filter((s) => s.id !== id));
    setJoinRequests((prev) => prev.filter((r) => r.startup_id !== id));
    if (selectedStartupId === id) setSelectedStartupId(null);
    try {
      await dbOperations.deleteStartup(id, currentUser?.id);
      const [nextStartups, nextRequests] = await Promise.all([
        dbOperations.getStartups(),
        dbOperations.getJoinRequests(),
      ]);
      setStartups(nextStartups);
      setJoinRequests(nextRequests);
    } catch (error) {
      setStartups(prevStartups);
      setJoinRequests(prevRequests);
      Alert.alert("Xatolik", error?.message || "Startupni o'chirib bo'lmadi.");
    }
  }

  async function addCategory(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    try {
      await dbOperations.createCategory(trimmed, currentUser?.id);
      const cats = await dbOperations.getCategories();
      setCategories(cats.map((c) => c.name));
      setNewCategoryName("");
    } catch (error) {
      Alert.alert("Xatolik", error?.message || "Kategoriya qo'shib bo'lmadi.");
    }
  }

  async function deleteCategory(name) {
    const usedInStartups = startups.some((s) => s.category === name);
    if (usedInStartups) {
      return Alert.alert("Mumkin emas", "Bu kategoriyadan foydalangan loyihalar bor, avval ularni o'zgartiring.");
    }
    try {
      const cats = await dbOperations.getCategories();
      const cat = cats.find((c) => c.name === name);
      if (!cat) return;
      await dbOperations.deleteCategory(cat.id, currentUser?.id);
      const next = await dbOperations.getCategories();
      setCategories(next.map((c) => c.name));
    } catch (error) {
      Alert.alert("Xatolik", error?.message || "Kategoriya o'chirib bo'lmadi.");
    }
  }

  async function saveProSettings() {
    const parsedPrice = toSafePositiveInt(
      proSettingsDraft.pro_price_uzs,
      Number(DEFAULT_APP_SETTINGS.pro_price_uzs || 5000),
      1000
    );
    const parsedFreeLimit = toSafePositiveInt(
      proSettingsDraft.startup_limit_free,
      Number(DEFAULT_APP_SETTINGS.startup_limit_free || 1),
      1
    );
    const next = {
      pro_price_uzs: parsedPrice,
      payment_card: String(proSettingsDraft.payment_card || "").trim(),
      payment_holder: String(proSettingsDraft.payment_holder || "").trim(),
      startup_limit_free: parsedFreeLimit,
    };
    if (!next.payment_card || !next.payment_holder) {
      return Alert.alert("Xatolik", "Karta raqami va ism-familiya kiriting.");
    }
    const updated = await dbOperations.updateSettings(next, currentUser?.id || "admin");
    setAppSettings({ ...DEFAULT_APP_SETTINGS, ...updated });
    setProSettingsDraft((prev) => ({
      ...prev,
      pro_price_uzs: String(next.pro_price_uzs),
      startup_limit_free: String(next.startup_limit_free),
      payment_card: next.payment_card,
      payment_holder: next.payment_holder,
    }));
    Alert.alert("Saqlandi", "PRO sozlamalari yangilandi.");
  }

  async function toggleProModule() {
    const updated = await dbOperations.updateSettings(
      { pro_enabled: !Boolean(appSettings.pro_enabled) },
      currentUser?.id || "admin"
    );
    setAppSettings({ ...DEFAULT_APP_SETTINGS, ...updated });
    Alert.alert("Yangilandi", updated.pro_enabled ? "PRO modul yoqildi." : "PRO modul o'chirildi.");
  }

  async function submitProRequest() {
    if (!currentUser) return setShowAuthModal(true);
    if (!appSettings.pro_enabled) return Alert.alert("Yopiq", "Hozircha PRO modul admin tomonidan o'chirilgan.");
    if (currentUser.is_pro || currentUser.role === "admin") {
      return Alert.alert("Faol", "Sizda PRO allaqachon faol.");
    }
    if (!proReceipt) return Alert.alert("Chek kerak", "To'lov cheki rasmini yuklang.");
    const existsPending = proRequests.some((r) => r.user_id === currentUser.id && r.status === "pending");
    if (existsPending) return Alert.alert("Kutilmoqda", "Sizda allaqachon pending PRO ariza mavjud.");

    const req = {
      id: `pro_${Date.now()}`,
      user_id: currentUser.id,
      user_name: currentUser.name,
      user_email: currentUser.email,
      plan_name: appSettings.pro_plan_name || "GarajHub PRO",
      amount_uzs: Number(appSettings.pro_price_uzs || 79000),
      receipt_image: proReceipt,
      note: proNote.trim(),
      status: "pending",
      created_at: new Date().toISOString(),
    };
    await dbOperations.createProRequest(req);
    setProRequests((prev) => [req, ...prev]);
    await addNotification("admin", "Yangi PRO ariza", `${currentUser.name} PRO uchun to'lov chekini yubordi.`, "info");
    setProModalOpen(false);
    setProReceipt("");
    setProNote("");
    Alert.alert("Yuborildi", "Arizangiz yuborildi. Admin tasdiqlashini kuting.");
  }

  async function adminReviewProRequest(request, approve) {
    if (!request) return;
    const status = approve ? "approved" : "rejected";
    const updatedReq = await dbOperations.updateProRequestStatus(
      request.id,
      status,
      currentUser?.id || "admin",
      approve ? "Tasdiqlandi" : "Rad etildi"
    );
    setProRequests((prev) => prev.map((r) => (r.id === request.id ? updatedReq : r)));

    if (approve) {
      const updatedUser = await dbOperations.setUserPro(request.user_id, true, currentUser?.id || "admin");
      setAllUsers((prev) => prev.map((u) => (u.id === request.user_id ? updatedUser : u)));
      if (currentUser?.id === request.user_id) setCurrentUser(updatedUser);
      await addNotification(request.user_id, "PRO tasdiqlandi", "To'lovingiz tasdiqlandi. Endi cheksiz startup yarata olasiz.", "success");
    } else {
      await addNotification(request.user_id, "PRO rad etildi", "Chek tekshiruvdan o'tmadi. Qayta yuboring.", "danger");
    }
  }

  async function sendTeamMessage(startupId) {
    if (!currentUser) return setShowAuthModal(true);
    const text = teamChatInput.trim();
    if (!text) return;
    const startup = startups.find((s) => s.id === startupId);
    if (!startup || !hasStartupAccess(startup)) {
      return Alert.alert("Ruxsat yo'q", "Bu chatga yozish uchun loyiha a'zosi bo'lish kerak.");
    }
    await dbOperations.createStartupMessage(
      startupId,
      {
        user_id: currentUser.id,
        user_name: currentUser.name,
        text,
      },
      currentUser.id
    );
    if (startup) {
      const memberIds = (startup.a_zolar || [])
        .map((m) => m.user_id)
        .filter((uid) => uid && uid !== currentUser.id);
      for (const uid of memberIds) {
        await addNotification(uid, "Jamoa chat", `${currentUser.name}: ${text}`, "info");
      }
    }
    setTeamChatInput("");
    setStartups(await dbOperations.getStartups());
  }

  async function refreshStartupsState() {
    const refreshed = await dbOperations.getStartups();
    setStartups(refreshed);
    return refreshed;
  }

  async function withStartupUpdate(workFn) {
    try {
      const updatedStartup = await workFn();
      if (updatedStartup?.id) {
        setStartups((prev) => prev.map((startup) => (startup.id === updatedStartup.id ? updatedStartup : startup)));
      } else {
        await refreshStartupsState();
      }
      return true;
    } catch (error) {
      Alert.alert("Xatolik", error?.message || "Workspace amaliyotida xatolik bo'ldi.");
      return false;
    }
  }

  async function acceptSafekeepingAgreement(startupId) {
    if (!currentUser) return setShowAuthModal(true);
    await withStartupUpdate(() =>
      dbOperations.acceptSafekeepingAgreement(startupId, currentUser.id, currentUser.id)
    );
  }

  async function saveSafekeepingAgreement(startupId) {
    if (!currentUser) return setShowAuthModal(true);
    const text = String(workspaceDraft.agreementText || "").trim();
    if (!text) {
      Alert.alert("Xatolik", "Safekeeping matnini kiriting.");
      return;
    }
    await withStartupUpdate(() =>
      dbOperations.setSafekeepingAgreement(startupId, text, currentUser.id)
    );
  }

  async function saveSuccessFee(startupId) {
    if (!currentUser) return setShowAuthModal(true);
    const fee = clampMetric(Number(workspaceDraft.successFeePercent || 2), 1, 3);
    await withStartupUpdate(() =>
      dbOperations.setWorkspaceSuccessFee(startupId, fee, currentUser.id)
    );
    setWorkspaceDraft((prev) => ({ ...prev, successFeePercent: String(fee) }));
  }

  async function saveWorkspaceLifecycle(startupId, lifecycle) {
    if (!currentUser) return setShowAuthModal(true);
    await withStartupUpdate(() =>
      dbOperations.setWorkspaceLifecycle(startupId, lifecycle, currentUser.id)
    );
  }

  async function saveEquityEntry(startupId) {
    if (!currentUser) return setShowAuthModal(true);
    const userId = String(workspaceDraft.equityMemberId || "").trim();
    if (!userId) return Alert.alert("Xatolik", "A'zoni tanlang.");
    const percent = Number(workspaceDraft.equityPercent || 0);
    if (!Number.isFinite(percent) || percent <= 0) {
      return Alert.alert("Xatolik", "Equity foizi noto'g'ri.");
    }
    const memberName =
      (selectedStartup?.a_zolar || []).find((member) => member.user_id === userId)?.name || "Unknown";

    const ok = await withStartupUpdate(() =>
      dbOperations.upsertEquityEntry(
        startupId,
        {
          user_id: userId,
          user_name: memberName,
          percent,
          role: String(workspaceDraft.equityRole || "Contributor"),
          vesting_months: Number(workspaceDraft.equityVestingMonths || 12),
        },
        currentUser.id
      )
    );
    if (ok) {
      setWorkspaceDraft((prev) => ({ ...prev, equityPercent: "", equityRole: prev.equityRole || "Contributor" }));
    }
  }

  async function removeEquityEntry(startupId, userId) {
    if (!currentUser) return setShowAuthModal(true);
    await withStartupUpdate(() => dbOperations.removeEquityEntry(startupId, userId, currentUser.id));
  }

  async function createWorkspaceDecision(startupId) {
    if (!currentUser) return setShowAuthModal(true);
    const title = String(workspaceDraft.decisionTitle || "").trim();
    if (!title) return Alert.alert("Xatolik", "Qaror nomini kiriting.");
    const ok = await withStartupUpdate(() =>
      dbOperations.createWorkspaceDecision(
        startupId,
        {
          title,
          description: workspaceDraft.decisionDescription,
          deadline: workspaceDraft.decisionDeadline,
          type: "governance",
        },
        currentUser.id
      )
    );
    if (ok) {
      setWorkspaceDraft((prev) => ({
        ...prev,
        decisionTitle: "",
        decisionDescription: "",
        decisionDeadline: "",
      }));
    }
  }

  async function voteWorkspaceDecision(startupId, decisionId, vote) {
    if (!currentUser) return setShowAuthModal(true);
    await withStartupUpdate(() =>
      dbOperations.castWorkspaceDecisionVote(
        startupId,
        decisionId,
        vote,
        { user_id: currentUser.id, user_name: currentUser.name },
        currentUser.id
      )
    );
  }

  async function closeWorkspaceDecision(startupId, decisionId) {
    if (!currentUser) return setShowAuthModal(true);
    await withStartupUpdate(() =>
      dbOperations.closeWorkspaceDecision(startupId, decisionId, currentUser.id)
    );
  }

  async function createFounderVote(startupId) {
    if (!currentUser) return setShowAuthModal(true);
    const targetUserId = String(workspaceDraft.founderVoteTargetId || "").trim();
    if (!targetUserId) return Alert.alert("Xatolik", "Kim uchun ovoz berilishini tanlang.");
    const targetMember = (selectedStartup?.a_zolar || []).find((member) => member.user_id === targetUserId);
    const ok = await withStartupUpdate(() =>
      dbOperations.createFounderVote(
        startupId,
        {
          target_user_id: targetUserId,
          target_user_name: targetMember?.name || "Unknown",
          reason: workspaceDraft.founderVoteReason,
        },
        currentUser.id
      )
    );
    if (ok) {
      setWorkspaceDraft((prev) => ({ ...prev, founderVoteReason: "" }));
    }
  }

  async function voteFounderVote(startupId, founderVoteId, vote) {
    if (!currentUser) return setShowAuthModal(true);
    await withStartupUpdate(() =>
      dbOperations.castFounderVote(
        startupId,
        founderVoteId,
        vote,
        { user_id: currentUser.id, user_name: currentUser.name },
        currentUser.id
      )
    );
  }

  async function closeFounderVote(startupId, founderVoteId) {
    if (!currentUser) return setShowAuthModal(true);
    await withStartupUpdate(() =>
      dbOperations.closeFounderVote(startupId, founderVoteId, currentUser.id)
    );
  }

  async function addInvestorLog(startupId) {
    if (!currentUser) return setShowAuthModal(true);
    const investorName = String(workspaceDraft.investorName || "").trim();
    if (!investorName) return Alert.alert("Xatolik", "Investor nomini kiriting.");
    const ok = await withStartupUpdate(() =>
      dbOperations.addInvestorIntroduction(
        startupId,
        {
          investor_name: investorName,
          contact: workspaceDraft.investorContact,
          stage: workspaceDraft.investorStage || "intro",
          note: workspaceDraft.investorNote,
          outcome: "open",
          introduced_by_id: currentUser.id,
          introduced_by_name: currentUser.name,
        },
        currentUser.id
      )
    );
    if (ok) {
      setWorkspaceDraft((prev) => ({
        ...prev,
        investorName: "",
        investorContact: "",
        investorStage: "intro",
        investorNote: "",
      }));
    }
  }

  async function setInvestorOutcome(startupId, logId, outcome) {
    if (!currentUser) return setShowAuthModal(true);
    await withStartupUpdate(() =>
      dbOperations.updateInvestorIntroductionOutcome(
        startupId,
        logId,
        outcome,
        "",
        currentUser.id
      )
    );
  }

  async function submitMemberReview(startupId) {
    if (!currentUser) return setShowAuthModal(true);
    const targetUserId = String(workspaceDraft.reviewTargetId || "").trim();
    if (!targetUserId) return Alert.alert("Xatolik", "Kimga baho berishni tanlang.");
    if (targetUserId === currentUser.id) return Alert.alert("Xatolik", "O'zingizga baho berolmaysiz.");
    const rating = clampMetric(Number(workspaceDraft.reviewRating || 5), 1, 5);
    const targetMember = (selectedStartup?.a_zolar || []).find((member) => member.user_id === targetUserId);
    const ok = await withStartupUpdate(() =>
      dbOperations.createMemberReview(
        startupId,
        {
          target_user_id: targetUserId,
          target_user_name: targetMember?.name || "Unknown",
          reviewer_id: currentUser.id,
          reviewer_name: currentUser.name,
          rating,
          comment: workspaceDraft.reviewComment,
        },
        currentUser.id
      )
    );
    if (ok) {
      setWorkspaceDraft((prev) => ({ ...prev, reviewComment: "", reviewRating: "5" }));
    }
  }

  async function markAllRead() {
    if (!currentUser) return;
    await dbOperations.markAllNotificationsAsRead(currentUser.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function markRead(id) {
    await dbOperations.markNotificationAsRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  async function sendAI() {
    if (!aiInput.trim() || aiLoading) return;
    const text = aiInput.trim();
    const userMsg = { id: `m_${Date.now()}`, sender: "user", text };
    setAiChat((prev) => [...prev, userMsg]);
    setAiInput("");
    setAiLoading(true);
    try {
      const history = aiChat.map((m) => ({ text: m.text, role: m.sender === "user" ? "user" : "model" }));
      const answer = await getAIMentorResponse(history, text);
      setAiChat((prev) => [...prev, { id: `a_${Date.now()}`, sender: "ai", text: answer }]);
    } catch {
      setAiChat((prev) => [...prev, { id: `e_${Date.now()}`, sender: "ai", text: "AI bilan bog'lanib bo'lmadi." }]);
    } finally {
      setAiLoading(false);
    }
  }

  const selectedStartup = useMemo(() => startups.find((s) => s.id === selectedStartupId), [startups, selectedStartupId]);
  const canManageSelectedStartup = useMemo(
    () => hasStartupAccess(selectedStartup),
    [selectedStartup, currentUser]
  );
  const canDeleteSelectedStartup = useMemo(
    () =>
      Boolean(
        currentUser &&
          selectedStartup &&
          (currentUser.role === "admin" || selectedStartup.egasi_id === currentUser.id)
      ),
    [selectedStartup, currentUser]
  );
  const myStartups = useMemo(() => (currentUser ? startups.filter((s) => s.egasi_id === currentUser.id || (s.a_zolar || []).some((m) => m.user_id === currentUser.id)) : []), [startups, currentUser]);
  const myOwnedStartupCount = useMemo(
    () => (currentUser ? startups.filter((s) => s.egasi_id === currentUser.id).length : 0),
    [startups, currentUser]
  );
  const isProActive = useMemo(
    () =>
      Boolean(
        currentUser &&
          (currentUser.role === "admin" ||
            (Boolean(appSettings.pro_enabled) && Boolean(currentUser.is_pro)))
      ),
    [currentUser, appSettings]
  );
  const myProRequests = useMemo(
    () => (currentUser ? proRequests.filter((r) => r.user_id === currentUser.id) : []),
    [proRequests, currentUser]
  );
  const myPendingProRequest = useMemo(
    () => myProRequests.find((r) => r.status === "pending"),
    [myProRequests]
  );
  const incomingRequests = useMemo(() => (currentUser ? joinRequests.filter((r) => startups.find((s) => s.id === r.startup_id && s.egasi_id === currentUser.id)) : []), [joinRequests, startups, currentUser]);
  const userNotifications = useMemo(() => (currentUser ? notifications.filter((n) => n.user_id === currentUser.id || (currentUser.role === "admin" && n.user_id === "admin")) : []), [notifications, currentUser]);
  const unreadCount = userNotifications.filter((n) => !n.is_read).length;
  const filtered = useMemo(() => startups.filter((s) => s.status === "approved" && (selectedCategory === "All" || s.category === selectedCategory) && (`${s.nomi} ${s.tavsif}`.toLowerCase().includes(searchTerm.toLowerCase()))), [startups, selectedCategory, searchTerm]);
  const selectedProgress = useMemo(
    () => getStartupProgress(selectedStartup),
    [selectedStartup]
  );
  const selectedSmartMatches = useMemo(() => {
    if (!selectedStartup) return [];
    const memberIds = new Set((selectedStartup.a_zolar || []).map((m) => m.user_id));
    return allUsers
      .filter((u) => u.id !== "admin" && u.id !== selectedStartup.egasi_id && !memberIds.has(u.id) && !u.banned)
      .map((u) => ({ user: u, score: calculateSmartMatchScore(selectedStartup, u) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [selectedStartup, allUsers]);
  const selectedWorkspace = useMemo(
    () => (selectedStartup ? getStartupWorkspace(selectedStartup) : null),
    [selectedStartup]
  );
  const selectedEquitySignal = useMemo(
    () => getEquitySignal(selectedWorkspace, (selectedStartup?.a_zolar || []).length),
    [selectedWorkspace, selectedStartup]
  );
  const selectedCollaborationGraph = useMemo(
    () => buildStartupCollaborationGraph(selectedStartup),
    [selectedStartup]
  );
  const selectedAiInsight = useMemo(
    () => buildStartupAiInsight(selectedStartup),
    [selectedStartup]
  );
  const reputationByUser = useMemo(() => {
    const map = {};
    allUsers.forEach((user) => {
      map[user.id] = getUserReputationSummary(user, startups);
    });
    if (currentUser && !map[currentUser.id]) {
      map[currentUser.id] = getUserReputationSummary(currentUser, startups);
    }
    return map;
  }, [allUsers, startups, currentUser]);
  const currentUserReputation = useMemo(
    () => (currentUser ? reputationByUser[currentUser.id] || getUserReputationSummary(currentUser, startups) : null),
    [currentUser, reputationByUser, startups]
  );
  const selectedMemberReputation = useMemo(() => {
    if (!selectedStartup) return [];
    return (selectedStartup.a_zolar || []).map((member) => ({
      member,
      reputation: reputationByUser[member.user_id] || getUserReputationSummary(
        { id: member.user_id, name: member.name },
        startups
      ),
    }));
  }, [selectedStartup, reputationByUser, startups]);
  const startupProgressList = useMemo(
    () =>
      startups
        .map((s) => ({ startup: s, progress: getStartupProgress(s) }))
        .sort((a, b) => b.progress.completion - a.progress.completion)
        .slice(0, 6),
    [startups]
  );
  const tabs = useMemo(() => {
    const items = ["explore", "create"];
    if (currentUser) items.push("my-projects", "requests", "profile", "inbox");
    if (currentUser?.role === "admin") items.push("admin");
    return items;
  }, [currentUser]);
  const activeTabLabel = useMemo(() => TAB_META[activeTab] || "GarajHub", [activeTab]);
  const drawerItems = useMemo(() => {
    return tabs.map((key) => {
      let badge = null;
      if (key === "requests") badge = incomingRequests.length;
      if (key === "inbox") badge = unreadCount;
      if (key === "admin") badge = startups.filter((s) => s.status === "pending_admin").length + proRequests.filter((r) => r.status === "pending").length;
      return { key, label: TAB_META[key] || key, badge };
    });
  }, [tabs, incomingRequests.length, unreadCount, startups, proRequests]);
  const bottomTabs = useMemo(() => {
    if (!currentUser) return ["explore", "create"];
    const base = ["explore", "my-projects", "create", "inbox", "profile"];
    if (currentUser.role === "admin") {
      return ["explore", "admin", "create", "inbox", "profile"];
    }
    return base;
  }, [currentUser]);
  const tabBadge = (key) => {
    if (key === "inbox") return unreadCount;
    if (key === "admin") return startups.filter((s) => s.status === "pending_admin").length + proRequests.filter((r) => r.status === "pending").length;
    return 0;
  };

  const stats = adminStats || {
    users: allUsers.length,
    pro_users: allUsers.filter((u) => u.is_pro).length,
    startups: startups.length,
    pending_startups: startups.filter((s) => s.status === "pending_admin").length,
    join_requests: joinRequests.length,
    notifications: notifications.length,
    pro_requests_pending: proRequests.filter((r) => r.status === "pending").length,
  };
  const detailHeaderStyle = {
    opacity: detailsAnim,
    transform: [
      {
        translateY: detailsAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
      {
        scale: detailsAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1],
        }),
      },
    ],
  };
  const detailEnterStyle = (index = 0) => ({
    opacity: detailsAnim,
    transform: [
      {
        translateY: detailsAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18 + index * 4, 0],
        }),
      },
    ],
  });
  const isMobileWeb = IS_WEB && screenWidth <= 640;
  const showHeaderStats = !isMobileWeb;
  const showDecorativeOrbs = !isMobileWeb;
  const contentMaxWidth = isTabletLayout ? 860 : isMobileWeb ? 560 : 680;
  const screenContentStyle = {
    paddingHorizontal: isMobileWeb ? 12 : isCompact ? 10 : 16,
    paddingBottom: isMobileWeb ? 124 : isCompact ? 180 : 210,
    paddingTop: isVeryCompact ? 10 : 14,
    width: "100%",
    maxWidth: contentMaxWidth,
    alignSelf: "center",
  };
  const bottomTabInlineStyle = {
    left: isMobileWeb ? 10 : isCompact ? 8 : 14,
    right: isMobileWeb ? 10 : isCompact ? 8 : 14,
    bottom:
      Platform.OS === "ios"
        ? isCompact
          ? 10
          : 14
        : IS_WEB
        ? isCompact
          ? 10
          : 12
        : 16,
  };
  const aiFabInlineStyle = {
    right: isCompact ? 12 : 16,
    bottom:
      Platform.OS === "ios"
        ? isCompact
          ? 96
          : 104
        : IS_WEB
        ? isCompact
          ? 86
          : 92
        : 94,
  };
  const drawerWidth = Math.min(360, Math.max(292, screenWidth * 0.88));
  const drawerHiddenX = -drawerWidth - 28;
  const drawerScale = drawerX.interpolate({
    inputRange: [drawerHiddenX, 0],
    outputRange: [0.96, 1],
    extrapolate: "clamp",
  });
  const drawerOpacity = drawerX.interpolate({
    inputRange: [drawerHiddenX, 0],
    outputRange: [0.75, 1],
    extrapolate: "clamp",
  });
  const drawerBackdropOpacity = drawerX.interpolate({
    inputRange: [drawerHiddenX, 0],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  styles = isDarkMode ? darkThemeStyles : lightStyles;
  isDarkGlobal = isDarkMode;

  if (loading || showSplash) {
    return (
      <SafeAreaView style={styles.splashRoot}>
        <View style={styles.splashSpinnerOnly}>
          <ActivityIndicator size="large" color={isDarkMode ? "#30d158" : "#0f172a"} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View pointerEvents="none" style={styles.bgLayer}>
        {showDecorativeOrbs && (
          <>
            <View style={[styles.bgOrbLarge, isMobileWeb && styles.bgOrbLargeCompact]} />
            <View style={[styles.bgOrbMedium, isMobileWeb && styles.bgOrbMediumCompact]} />
          </>
        )}
      </View>
      <StatusBar
        barStyle={isDarkMode ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent={Platform.OS === "android"}
      />
      <View style={[styles.topSafeArea, isCompact && styles.topSafeAreaCompact]}>
        <View style={[styles.headerRow, isCompact && styles.headerRowCompact]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={openMenu}>
              <Ionicons name="menu-outline" size={20} color={isDarkMode ? "#f5f8ff" : "#0f172a"} />
            </TouchableOpacity>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>GarajHub</Text>
              <Text style={styles.topSubtitle}>{activeTabLabel}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={toggleTheme}>
              <Ionicons name={isDarkMode ? "sunny-outline" : "moon-outline"} size={18} color={isDarkMode ? "#fbfdff" : "#0f172a"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigateTo("inbox")}>
              <Ionicons name="notifications-outline" size={18} color={isDarkMode ? "#dde7fb" : "#0f172a"} />
              {unreadCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
        {showHeaderStats && (
          <View style={[styles.headerStatsRow, isCompact && styles.headerStatsRowCompact]}>
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.headerStatCard}
              onPress={() => navigateTo("explore")}
            >
              <Text style={styles.headerStatValue}>{startups.filter((s) => s.status === "approved").length}</Text>
              <Text style={styles.headerStatLabel}>Faol startup</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.headerStatCard}
              onPress={() => navigateTo("requests")}
            >
              <Text style={styles.headerStatValue}>{incomingRequests.length}</Text>
              <Text style={styles.headerStatLabel}>So'rovlar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.headerStatCard}
              onPress={() => navigateTo("profile")}
            >
              <Text style={styles.headerStatValue}>
                {currentUser ? (isProActive ? "PRO" : "FREE") : "Guest"}
              </Text>
              <Text style={styles.headerStatLabel}>Tarif</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={styles.drawerRoot}>
          <Animated.View
            style={[
              styles.drawerCard,
              {
                width: drawerWidth,
                opacity: drawerOpacity,
                transform: [{ translateX: drawerX }, { scale: drawerScale }],
              },
            ]}
          >
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerTitle}>GarajHub</Text>
                <Text style={styles.drawerSubtitle}>Startup platform</Text>
              </View>
              <Btn title="Yopish" small type="ghost" onPress={closeMenu} />
            </View>
            <ScrollView style={styles.drawerBody} contentContainerStyle={{ paddingBottom: 12 }}>
              {drawerItems.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => navigateTo(item.key)}
                  style={[styles.drawerItem, activeTab === item.key && styles.drawerItemActive]}
                >
                  <View style={styles.drawerItemLeft}>
                    <Ionicons
                      name={TAB_ICON[item.key] || "ellipse-outline"}
                      size={16}
                      color={activeTab === item.key ? "#fff" : isDarkMode ? "#f5f8ff" : "#5b6b88"}
                    />
                    <Text style={[styles.drawerItemText, activeTab === item.key && styles.drawerItemTextActive]}>
                      {item.label}
                    </Text>
                  </View>
                  {!!item.badge && item.badge > 0 && (
                    <View style={styles.drawerItemBadge}>
                      <Text style={styles.drawerItemBadgeText}>
                        {item.badge > 99 ? "99+" : item.badge}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.drawerFooter}>
              {currentUser ? (
                <>
                  <View style={styles.rowNoWrap}>
                    <Image source={{ uri: currentUser.avatar || getAvatar(currentUser.name) }} style={styles.drawerAvatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.drawerUserName}>{currentUser.name}</Text>
                      <Text style={styles.drawerUserEmail}>{currentUser.email}</Text>
                    </View>
                  </View>
                  <Btn title="Chiqish" type="danger" onPress={logout} />
                </>
              ) : (
                <Btn title="Kirish / Ro'yxat" onPress={() => closeMenu(() => setShowAuthModal(true))} />
              )}
            </View>
          </Animated.View>
          <AnimatedTouchable
            style={[styles.drawerBackdrop, { opacity: drawerBackdropOpacity }]}
            activeOpacity={1}
            onPress={closeMenu}
          />
        </View>
      </Modal>

      <ScrollView
        style={styles.screenScroll}
        contentContainerStyle={[styles.screenContent, screenContentStyle]}
      >
        <Animated.View
          style={[
            styles.contentAnimated,
            {
              opacity: contentFade,
              transform: [
                {
                  translateY: contentFade.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
        {activeTab === "explore" && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.h1}>Innovatsiyalarni kashf eting</Text>
                <Text style={styles.mutedLg}>O'zbekistondagi eng yaxshi startup jamoalari.</Text>
              </View>
              {currentUser && <Btn title="Loyiha yaratish" icon="add-circle-outline" onPress={() => navigateTo("create")} />}
            </View>
            <View style={styles.heroCard}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroEyebrow}>GARAJHUB INSIGHT</Text>
                  <Text style={styles.heroTitle}>Builderlar uchun yagona platforma</Text>
                  <Text style={styles.heroText}>
                    {startups.filter((s) => s.status === "approved").length} ta faol startup, {categories.length} ta kategoriya.
                  </Text>
                </View>
                <Badge
                  label={`${Math.max(filtered.length, 0)} TOPILDI`}
                  variant="active"
                  style={styles.heroBadge}
                  textStyle={styles.heroBadgeText}
                />
              </View>
              <View style={styles.heroStats}>
                <View style={styles.heroStatItem}>
                  <Text style={styles.heroStatValue}>{startups.length}</Text>
                  <Text style={styles.heroStatLabel}>Jami</Text>
                </View>
                <View style={styles.heroStatItem}>
                  <Text style={styles.heroStatValue}>{startups.filter((s) => s.status === "approved").length}</Text>
                  <Text style={styles.heroStatLabel}>Faol</Text>
                </View>
                <View style={styles.heroStatItem}>
                  <Text style={styles.heroStatValue}>{joinRequests.length}</Text>
                  <Text style={styles.heroStatLabel}>So'rov</Text>
                </View>
              </View>
            </View>
            <Field value={searchTerm} onChangeText={setSearchTerm} placeholder="Startup yoki ko'nikma qidirish..." />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsWrap}>
              {["All", ...categories].map((c) => (
                <TouchableOpacity key={c} onPress={() => setSelectedCategory(c)} style={[styles.chip, selectedCategory === c && styles.chipActive]}>
                  <Text style={[styles.chipText, selectedCategory === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ListEmptyComponent={
                <EmptyState
                  title="Startup topilmadi"
                  subtitle="Qidiruv yoki kategoriya filtrini o'zgartirib ko'ring."
                />
              }
              renderItem={({ item }) => (
                <View style={styles.startupCard}>
                  <View style={styles.startupTop}>
                    <Image source={{ uri: item.logo }} style={styles.logo} />
                    <Badge label={item.category || "Other"} />
                  </View>
                  <Text style={styles.startupTitle}>{item.nomi}</Text>
                  <Text numberOfLines={2} style={styles.cardDesc}>{item.tavsif}</Text>
                  <View style={styles.startupFooter}>
                    <View style={styles.memberStack}>
                      {(item.a_zolar || []).slice(0, 3).map((m, idx) => (
                        <View key={`${m.user_id}_${idx}`} style={[styles.memberBubble, idx > 0 && styles.memberOverlap]}>
                          <Text style={styles.memberBubbleText}>{(m.name || "?")[0]}</Text>
                        </View>
                      ))}
                      {(item.a_zolar || []).length > 3 && (
                        <View style={[styles.memberBubble, styles.memberMore]}>
                          <Text style={styles.memberMoreText}>+{item.a_zolar.length - 3}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.rowNoWrap}>
                      <Btn title="Batafsil" icon="eye-outline" small type="secondary" onPress={() => navigateTo("details", item.id)} />
                      <Btn title="Qo'shilish" icon="person-add-outline" small onPress={() => sendJoinRequest(item)} />
                    </View>
                  </View>
                </View>
              )}
            />
          </View>
        )}

        {activeTab === "create" && (
          <View style={styles.section}>
            <Text style={styles.h1}>Yangi startup yaratish</Text>
            {!currentUser ? (
              <EmptyState
                title="Kirish talab qilinadi"
                subtitle="Loyiha yaratish uchun tizimga kiring."
                action={<Btn title="Kirish" onPress={() => setShowAuthModal(true)} />}
              />
            ) : (
              <View style={styles.formCard}>
                <View style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>Tarif holati</Text>
                    <Badge label={isProActive ? "PRO" : "FREE"} variant={isProActive ? "success" : "default"} />
                  </View>
                  <Text style={styles.muted}>
                    {isProActive
                      ? "Cheksiz startup yaratish yoqilgan."
                      : `Free limit: ${myOwnedStartupCount}/${Math.max(1, Number(appSettings.startup_limit_free || 1))}`}
                  </Text>
                  {!isProActive && Boolean(appSettings.pro_enabled) && (
                    <Btn title="PRO ga o'tish" small type="secondary" onPress={() => setProModalOpen(true)} />
                  )}
                </View>
                <Field label="Nomi" value={createForm.nomi} onChangeText={(v) => setCreateForm((p) => ({ ...p, nomi: v }))} placeholder="Startup nomi" />
                <Field label="Tavsif" value={createForm.tavsif} onChangeText={(v) => setCreateForm((p) => ({ ...p, tavsif: v }))} placeholder="Qisqacha..." multiline />
                <View style={{ marginBottom: 10 }}>
                  <Text style={styles.label}>Kategoriya</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsWrap}>
                    {(categories.length > 0 ? categories : ["Other"]).map((categoryName) => (
                      <TouchableOpacity
                        key={`create_cat_${categoryName}`}
                        onPress={() => setCreateForm((p) => ({ ...p, category: categoryName }))}
                        style={[styles.chip, createForm.category === categoryName && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, createForm.category === categoryName && styles.chipTextActive]}>
                          {categoryName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <Field label="Mutaxassislar" value={createForm.specialists} onChangeText={(v) => setCreateForm((p) => ({ ...p, specialists: v }))} placeholder="Frontend, Backend" />
                <ImagePickerField
                  label="Startup logosi"
                  imageUri={createForm.logo}
                  onPick={() => pickImageAndSet((img) => setCreateForm((p) => ({ ...p, logo: img })))}
                  hint="Rasm fayldan tanlanadi"
                />
                <Field label="GitHub" value={createForm.github_url} onChangeText={(v) => setCreateForm((p) => ({ ...p, github_url: v }))} placeholder="https://..." />
                <Field label="Website" value={createForm.website_url} onChangeText={(v) => setCreateForm((p) => ({ ...p, website_url: v }))} placeholder="https://..." />
                <Btn title="Yaratish" icon="rocket-outline" onPress={createStartup} />
              </View>
            )}
          </View>
        )}

        {activeTab === "my-projects" && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderInline}>
              <Text style={styles.h1}>Loyihalarim</Text>
              <Badge label={String(myStartups.length)} variant="active" />
            </View>
            {myStartups.length === 0 ? (
              <EmptyState
                title="Hali loyiha yo'q"
                subtitle="G'oyangizni yarating va jamoa to'plang."
                action={<Btn title="Yangi loyiha" onPress={() => navigateTo("create")} />}
              />
            ) : myStartups.map((s) => (
              <View key={s.id} style={styles.projectRow}>
                <Image source={{ uri: s.logo }} style={styles.projectLogo} />
                <View style={{ flex: 1 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{s.nomi}</Text>
                    <Badge label={s.status} variant={STATUS_VARIANT[s.status] || "default"} />
                  </View>
                  <Text style={styles.muted}>
                    {s.category} • {(s.a_zolar || []).length} a'zo • {(s.tasks || []).length} vazifa
                  </Text>
                </View>
                <Btn title="Boshqarish" icon="build-outline" onPress={() => navigateTo("details", s.id)} small type="secondary" />
              </View>
            ))}
          </View>
        )}

        {activeTab === "details" && (
          <View style={styles.section}>
            {!selectedStartup ? (
              <EmptyState title="Loyiha topilmadi" action={<Btn title="Ortga" onPress={() => navigateTo("explore")} />} />
            ) : (
              <>
                <Animated.View style={[styles.detailsHeader, detailHeaderStyle]}>
                  <Image source={{ uri: selectedStartup.logo }} style={styles.detailsLogo} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h1}>{selectedStartup.nomi}</Text>
                    <Text style={styles.cardDesc}>{selectedStartup.tavsif}</Text>
                    <View style={styles.rowNoWrap}>
                      <Badge label={selectedStartup.category || "Other"} />
                      <Badge label={selectedStartup.status} variant={STATUS_VARIANT[selectedStartup.status] || "default"} />
                    </View>
                  </View>
                </Animated.View>
                <Animated.View style={[styles.rowNoWrap, detailEnterStyle(1)]}>
                  <Btn title="Loyihalarim" icon="arrow-back-outline" small type="ghost" onPress={() => navigateTo("my-projects")} />
                  {!!selectedStartup.github_url && <Btn title="GitHub" icon="logo-github" small type="secondary" onPress={() => openExternalLink(selectedStartup.github_url)} />}
                  {!!selectedStartup.website_url && <Btn title="Website" icon="globe-outline" small type="secondary" onPress={() => openExternalLink(selectedStartup.website_url)} />}
                </Animated.View>
                <Animated.View style={[styles.detailTabsWrap, detailEnterStyle(2)]}>
                  {["vazifalar", "jamoa", "workspace", "reputation", "ai-engine", "chat", "progress", "sozlamalar"].map((t) => (
                    <TouchableOpacity key={t} onPress={() => setActiveDetailTab(t)} style={[styles.detailTab, activeDetailTab === t && styles.detailTabActive]}>
                      <Text style={[styles.detailTabText, activeDetailTab === t && styles.detailTabTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </Animated.View>

                {activeDetailTab === "vazifalar" && STATUS.map((st, stIndex) => (
                  <Animated.View key={st} style={detailEnterStyle(stIndex + 3)}>
                    <View style={styles.card}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.cardTitle}>{STATUS_LABEL[st] || st}</Text>
                      <Badge label={String((selectedStartup.tasks || []).filter((t) => t.status === st).length)} />
                    </View>
                    {(selectedStartup.tasks || []).filter((t) => t.status === st).map((t) => (
                      <View key={t.id} style={styles.task}>
                        <Text style={styles.cardTitle}>{t.title}</Text>
                        <Text style={styles.muted}>{t.description || "-"}</Text>
                        <View style={styles.rowBetween}>
                          <Text style={styles.tinyMuted}>{t.assigned_to_name || "Belgilanmagan"}</Text>
                          <View style={styles.rowNoWrap}>
                            {canManageSelectedStartup && (
                              <Btn title="Keyingi" icon="arrow-forward-outline" small type="secondary" onPress={() => moveTask(t.id, nextStatus(t.status))} />
                            )}
                            {(currentUser?.id === selectedStartup.egasi_id || currentUser?.role === "admin") && (
                              <Btn title="Delete" icon="trash-outline" small type="danger" onPress={() => deleteTask(t.id)} />
                            )}
                          </View>
                        </View>
                      </View>
                    ))}
                    {canManageSelectedStartup && (
                      <Btn title="Vazifa qo'shish" icon="add-outline" small onPress={() => setTaskModal({ open: true, startupId: selectedStartup.id, title: "", description: "", deadline: "" })} />
                    )}
                    </View>
                  </Animated.View>
                ))}

                {activeDetailTab === "jamoa" && (
                  <View>
                    {(selectedStartup.a_zolar || []).map((m, i) => (
                      <Animated.View key={`${m.user_id}_${i}`} style={detailEnterStyle(i + 3)}>
                        <View style={styles.teamRow}>
                        <View style={styles.teamAvatar}>
                          <Text style={styles.teamAvatarText}>{(m.name || "?")[0]}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{m.name}</Text>
                          <Text style={styles.muted}>{m.role}</Text>
                        </View>
                        </View>
                      </Animated.View>
                    ))}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Smart Match tavsiyalar</Text>
                      <Text style={styles.muted}>Kerakli mutaxassislikka mos foydalanuvchilar.</Text>
                      <View style={{ height: 8 }} />
                      {selectedSmartMatches.length === 0 && (
                        <Text style={styles.muted}>Hozircha mos profil topilmadi.</Text>
                      )}
                      {selectedSmartMatches.map((item) => (
                        <View key={`match_${item.user.id}`} style={styles.rowBetween}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle}>{item.user.name}</Text>
                            <Text style={styles.muted}>
                              {(item.user.skills || []).join(", ") || "Skills yo'q"}
                            </Text>
                          </View>
                          <Badge label={`Score ${item.score}`} variant="active" />
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {activeDetailTab === "workspace" && (
                  <View>
                    <View style={styles.card}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.cardTitle}>Workspace holati</Text>
                        <Badge label={getWorkspaceLifecycleLabel(selectedWorkspace?.lifecycle)} variant={selectedWorkspace?.lifecycle === "closed" ? "danger" : "success"} />
                      </View>
                      <Text style={styles.muted}>Segment: {(selectedWorkspace?.segment_focus || "it_founder_developer").toUpperCase()}</Text>
                      <Text style={styles.muted}>Lock-in: {selectedWorkspace?.lock_in_enabled ? "Yoqilgan" : "O'chirilgan"}</Text>
                      <Text style={styles.muted}>Success fee: {selectedWorkspace?.success_fee_percent || 2}%</Text>
                      {canManageSelectedStartup && (
                        <View style={styles.rowNoWrap}>
                          <Btn title="Faol" small type="secondary" onPress={() => saveWorkspaceLifecycle(selectedStartup.id, "active")} />
                          <Btn title="Pause" small type="secondary" onPress={() => saveWorkspaceLifecycle(selectedStartup.id, "paused")} />
                          <Btn title="Yopish" small type="danger" onPress={() => saveWorkspaceLifecycle(selectedStartup.id, "closed")} />
                        </View>
                      )}
                    </View>

                    <View style={styles.card}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.cardTitle}>Safekeeping agreement</Text>
                        <Badge
                          label={`${(selectedWorkspace?.safekeeping_agreement?.accepted_user_ids || []).length}/${(selectedStartup.a_zolar || []).length}`}
                          variant="active"
                        />
                      </View>
                      <Text style={styles.muted}>
                        {selectedWorkspace?.safekeeping_agreement?.text || "Agreement matni yo'q"}
                      </Text>
                      {canManageSelectedStartup && (
                        <>
                          <Field
                            label="Agreement matni"
                            value={workspaceDraft.agreementText}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, agreementText: v }))}
                            placeholder="Agreement matni..."
                            multiline
                          />
                          <Btn title="Agreementni saqlash" small onPress={() => saveSafekeepingAgreement(selectedStartup.id)} />
                        </>
                      )}
                      {currentUser && (
                        <Btn
                          title="Men qabul qilaman"
                          small
                          type="secondary"
                          onPress={() => acceptSafekeepingAgreement(selectedStartup.id)}
                        />
                      )}
                    </View>

                    <View style={styles.card}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.cardTitle}>Equity tracking</Text>
                        <Badge label={`${selectedEquitySignal.total}%`} variant={selectedEquitySignal.variant} />
                      </View>
                      <Text style={styles.muted}>
                        Signal: {selectedEquitySignal.text} • Top share: {selectedEquitySignal.topShare}%
                      </Text>
                      {(selectedWorkspace?.equity_entries || []).length === 0 && (
                        <Text style={styles.muted}>Hali equity taqsimoti kiritilmagan.</Text>
                      )}
                      {(selectedWorkspace?.equity_entries || []).map((entry) => (
                        <View key={entry.id} style={styles.rowBetween}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle}>{entry.user_name}</Text>
                            <Text style={styles.muted}>
                              {entry.role} • {entry.percent}% • vesting {entry.vesting_months} oy
                            </Text>
                          </View>
                          {canManageSelectedStartup && (
                            <Btn title="Delete" small type="danger" onPress={() => removeEquityEntry(selectedStartup.id, entry.user_id)} />
                          )}
                        </View>
                      ))}

                      {canManageSelectedStartup && (
                        <>
                          <Text style={styles.label}>A'zo tanlash</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsWrap}>
                            {(selectedStartup.a_zolar || []).map((member) => (
                              <TouchableOpacity
                                key={`eq_member_${member.user_id}`}
                                onPress={() => setWorkspaceDraft((prev) => ({ ...prev, equityMemberId: member.user_id }))}
                                style={[styles.chip, workspaceDraft.equityMemberId === member.user_id && styles.chipActive]}
                              >
                                <Text style={[styles.chipText, workspaceDraft.equityMemberId === member.user_id && styles.chipTextActive]}>
                                  {member.name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                          <Field
                            label="Foiz"
                            value={workspaceDraft.equityPercent}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, equityPercent: v }))}
                            placeholder="10"
                          />
                          <Field
                            label="Roli"
                            value={workspaceDraft.equityRole}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, equityRole: v }))}
                            placeholder="CTO"
                          />
                          <Field
                            label="Vesting (oy)"
                            value={workspaceDraft.equityVestingMonths}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, equityVestingMonths: v }))}
                            placeholder="12"
                          />
                          <Btn title="Equityni saqlash" small onPress={() => saveEquityEntry(selectedStartup.id)} />
                        </>
                      )}
                    </View>

                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Qarorlar (vote engine)</Text>
                      {(selectedWorkspace?.decisions || []).length === 0 && (
                        <Text style={styles.muted}>Hali qarorlar yo'q.</Text>
                      )}
                      {(selectedWorkspace?.decisions || []).map((decision) => {
                        const yes = (decision.votes || []).filter((item) => item.vote === "yes").length;
                        const no = (decision.votes || []).filter((item) => item.vote === "no").length;
                        const abstain = (decision.votes || []).filter((item) => item.vote === "abstain").length;
                        return (
                          <View key={decision.id} style={styles.task}>
                            <View style={styles.rowBetween}>
                              <Text style={styles.cardTitle}>{decision.title}</Text>
                              <Badge
                                label={decision.status}
                                variant={decision.status === "accepted" ? "success" : decision.status === "rejected" ? "danger" : "default"}
                              />
                            </View>
                            <Text style={styles.muted}>{decision.description || "-"}</Text>
                            <Text style={styles.tinyMuted}>Yes {yes} • No {no} • Abstain {abstain}</Text>
                            {decision.status === "open" && currentUser && (
                              <View style={styles.rowNoWrap}>
                                <Btn title="Ha" small type="secondary" onPress={() => voteWorkspaceDecision(selectedStartup.id, decision.id, "yes")} />
                                <Btn title="Yo'q" small type="secondary" onPress={() => voteWorkspaceDecision(selectedStartup.id, decision.id, "no")} />
                                <Btn title="Betaraf" small type="secondary" onPress={() => voteWorkspaceDecision(selectedStartup.id, decision.id, "abstain")} />
                                {canManageSelectedStartup && (
                                  <Btn title="Yopish" small type="ghost" onPress={() => closeWorkspaceDecision(selectedStartup.id, decision.id)} />
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}
                      {canManageSelectedStartup && (
                        <>
                          <Field
                            label="Qaror nomi"
                            value={workspaceDraft.decisionTitle}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, decisionTitle: v }))}
                            placeholder="Masalan: MVP scope freeze"
                          />
                          <Field
                            label="Izoh"
                            value={workspaceDraft.decisionDescription}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, decisionDescription: v }))}
                            placeholder="Qaror tafsiloti"
                            multiline
                          />
                          <Field
                            label="Deadline"
                            value={workspaceDraft.decisionDeadline}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, decisionDeadline: v }))}
                            placeholder="2026-03-10"
                          />
                          <Btn title="Qaror yaratish" small onPress={() => createWorkspaceDecision(selectedStartup.id)} />
                        </>
                      )}
                    </View>

                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Founder vote (kim qoladi/kim chiqadi)</Text>
                      {(selectedWorkspace?.founder_votes || []).length === 0 && (
                        <Text style={styles.muted}>Founder vote yo'q.</Text>
                      )}
                      {(selectedWorkspace?.founder_votes || []).map((voteItem) => {
                        const keep = (voteItem.votes || []).filter((item) => item.vote === "keep").length;
                        const remove = (voteItem.votes || []).filter((item) => item.vote === "remove").length;
                        return (
                          <View key={voteItem.id} style={styles.task}>
                            <View style={styles.rowBetween}>
                              <Text style={styles.cardTitle}>{voteItem.target_user_name}</Text>
                              <Badge
                                label={voteItem.status}
                                variant={voteItem.status === "remove" ? "danger" : voteItem.status === "keep" ? "success" : "default"}
                              />
                            </View>
                            <Text style={styles.muted}>{voteItem.reason || "-"}</Text>
                            <Text style={styles.tinyMuted}>Keep {keep} • Remove {remove}</Text>
                            {voteItem.status === "open" && currentUser && (
                              <View style={styles.rowNoWrap}>
                                <Btn title="Qolsin" small type="secondary" onPress={() => voteFounderVote(selectedStartup.id, voteItem.id, "keep")} />
                                <Btn title="Chiqsin" small type="danger" onPress={() => voteFounderVote(selectedStartup.id, voteItem.id, "remove")} />
                                <Btn title="Betaraf" small type="ghost" onPress={() => voteFounderVote(selectedStartup.id, voteItem.id, "abstain")} />
                                {canManageSelectedStartup && (
                                  <Btn title="Yopish" small type="ghost" onPress={() => closeFounderVote(selectedStartup.id, voteItem.id)} />
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}
                      {canManageSelectedStartup && (
                        <>
                          <Text style={styles.label}>Target a'zo</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsWrap}>
                            {(selectedStartup.a_zolar || [])
                              .filter((member) => member.user_id !== selectedStartup.egasi_id)
                              .map((member) => (
                                <TouchableOpacity
                                  key={`vote_member_${member.user_id}`}
                                  onPress={() => setWorkspaceDraft((prev) => ({ ...prev, founderVoteTargetId: member.user_id }))}
                                  style={[styles.chip, workspaceDraft.founderVoteTargetId === member.user_id && styles.chipActive]}
                                >
                                  <Text style={[styles.chipText, workspaceDraft.founderVoteTargetId === member.user_id && styles.chipTextActive]}>
                                    {member.name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                          <Field
                            label="Sabab"
                            value={workspaceDraft.founderVoteReason}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, founderVoteReason: v }))}
                            placeholder="Masalan: 3 sprint davomida contribution yo'q"
                            multiline
                          />
                          <Btn title="Founder vote ochish" small onPress={() => createFounderVote(selectedStartup.id)} />
                        </>
                      )}
                    </View>

                    <View style={styles.card}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.cardTitle}>Investor introduction log</Text>
                        <Badge label={String((selectedWorkspace?.investor_logs || []).length)} variant="active" />
                      </View>
                      {(selectedWorkspace?.investor_logs || []).length === 0 && (
                        <Text style={styles.muted}>Hali investor intro logi yo'q.</Text>
                      )}
                      {(selectedWorkspace?.investor_logs || []).map((log) => (
                        <View key={log.id} style={styles.task}>
                          <View style={styles.rowBetween}>
                            <Text style={styles.cardTitle}>{log.investor_name}</Text>
                            <Badge label={log.outcome || "open"} variant={log.outcome === "funded" ? "success" : log.outcome === "rejected" ? "danger" : "default"} />
                          </View>
                          <Text style={styles.muted}>{log.contact || "-"}</Text>
                          <Text style={styles.tinyMuted}>
                            Stage: {log.stage || "intro"} • By: {log.introduced_by_name || "Unknown"}
                          </Text>
                          {canManageSelectedStartup && (
                            <View style={styles.rowNoWrap}>
                              <Btn title="Meeting" small type="secondary" onPress={() => setInvestorOutcome(selectedStartup.id, log.id, "meeting")} />
                              <Btn title="Interested" small type="secondary" onPress={() => setInvestorOutcome(selectedStartup.id, log.id, "interested")} />
                              <Btn title="Funded" small onPress={() => setInvestorOutcome(selectedStartup.id, log.id, "funded")} />
                              <Btn title="Rejected" small type="danger" onPress={() => setInvestorOutcome(selectedStartup.id, log.id, "rejected")} />
                            </View>
                          )}
                        </View>
                      ))}
                      {canManageSelectedStartup && (
                        <>
                          <Field
                            label="Investor nomi"
                            value={workspaceDraft.investorName}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, investorName: v }))}
                            placeholder="Seed Angels"
                          />
                          <Field
                            label="Kontakt"
                            value={workspaceDraft.investorContact}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, investorContact: v }))}
                            placeholder="email yoki telegram"
                          />
                          <Field
                            label="Stage"
                            value={workspaceDraft.investorStage}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, investorStage: v }))}
                            placeholder="intro / meeting / term-sheet"
                          />
                          <Field
                            label="Izoh"
                            value={workspaceDraft.investorNote}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, investorNote: v }))}
                            placeholder="Qisqa izoh"
                            multiline
                          />
                          <Btn title="Investor log qo'shish" small onPress={() => addInvestorLog(selectedStartup.id)} />
                        </>
                      )}
                    </View>

                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Success fee (platform monetizatsiyasi)</Text>
                      <Text style={styles.muted}>Platforma success fee oralig'i: 1% - 3%</Text>
                      {canManageSelectedStartup && (
                        <>
                          <Field
                            label="Success fee %"
                            value={workspaceDraft.successFeePercent}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, successFeePercent: v }))}
                            placeholder="2"
                          />
                          <Btn title="Success fee saqlash" small onPress={() => saveSuccessFee(selectedStartup.id)} />
                        </>
                      )}
                    </View>
                  </View>
                )}

                {activeDetailTab === "reputation" && (
                  <View>
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Reputatsiya grafigi</Text>
                      <Text style={styles.muted}>Profil = real ishlangan loyihalar + real baholar.</Text>
                      <View style={{ height: 8 }} />
                      {selectedMemberReputation.map(({ member, reputation }) => (
                        <View key={`rep_${member.user_id}`} style={styles.rowBetween}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle}>{member.name}</Text>
                            <Text style={styles.muted}>
                              Score {reputation.score} ({reputation.tier}) • Task done {reputation.doneTasks}/{reputation.assignedTasks}
                            </Text>
                          </View>
                          <Badge label={`#${reputation.score}`} variant={reputation.score >= 70 ? "success" : reputation.score >= 45 ? "default" : "danger"} />
                        </View>
                      ))}
                    </View>

                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Hamkorlik edge'lari</Text>
                      {(selectedCollaborationGraph.edges || []).length === 0 && (
                        <Text style={styles.muted}>Hali collaboration edge shakllanmagan.</Text>
                      )}
                      {(selectedCollaborationGraph.edges || []).slice(0, 8).map((edge) => {
                        const fromName = (selectedStartup.a_zolar || []).find((m) => m.user_id === edge.from)?.name || edge.from;
                        const toName = (selectedStartup.a_zolar || []).find((m) => m.user_id === edge.to)?.name || edge.to;
                        return (
                          <View key={edge.id} style={styles.rowBetween}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.cardTitle}>{fromName} ↔ {toName}</Text>
                              <Text style={styles.muted}>Shared {edge.shared_days} kun • Rating {edge.avg_rating}</Text>
                            </View>
                            <Badge label={`S ${edge.strength}`} variant={edge.strength >= 55 ? "success" : "default"} />
                          </View>
                        );
                      })}
                    </View>

                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Jamoa bahosi (peer review)</Text>
                      {(selectedStartup.member_reviews || []).length === 0 && (
                        <Text style={styles.muted}>Hali baholar yo'q.</Text>
                      )}
                      {(selectedStartup.member_reviews || []).slice(0, 14).map((review) => (
                        <View key={review.id} style={styles.task}>
                          <View style={styles.rowBetween}>
                            <Text style={styles.cardTitle}>{review.reviewer_name} → {review.target_user_name}</Text>
                            <Badge label={`${review.rating}/5`} variant={review.rating >= 4 ? "success" : review.rating >= 3 ? "default" : "danger"} />
                          </View>
                          <Text style={styles.muted}>{review.comment || "Izoh qoldirilmagan."}</Text>
                          <Text style={styles.tinyMuted}>{new Date(review.created_at).toLocaleString()}</Text>
                        </View>
                      ))}
                      {currentUser && canManageSelectedStartup && (
                        <>
                          <Text style={styles.label}>Kimga baho berasiz</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsWrap}>
                            {(selectedStartup.a_zolar || [])
                              .filter((member) => member.user_id !== currentUser.id)
                              .map((member) => (
                                <TouchableOpacity
                                  key={`review_target_${member.user_id}`}
                                  onPress={() => setWorkspaceDraft((prev) => ({ ...prev, reviewTargetId: member.user_id }))}
                                  style={[styles.chip, workspaceDraft.reviewTargetId === member.user_id && styles.chipActive]}
                                >
                                  <Text style={[styles.chipText, workspaceDraft.reviewTargetId === member.user_id && styles.chipTextActive]}>
                                    {member.name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                          <Field
                            label="Reyting (1-5)"
                            value={workspaceDraft.reviewRating}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, reviewRating: v }))}
                            placeholder="5"
                          />
                          <Field
                            label="Izoh"
                            value={workspaceDraft.reviewComment}
                            onChangeText={(v) => setWorkspaceDraft((prev) => ({ ...prev, reviewComment: v }))}
                            placeholder="Contribution bo'yicha fikr..."
                            multiline
                          />
                          <Btn title="Baho yuborish" small onPress={() => submitMemberReview(selectedStartup.id)} />
                        </>
                      )}
                    </View>
                  </View>
                )}

                {activeDetailTab === "ai-engine" && (
                  <View>
                    <View style={styles.card}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.cardTitle}>AI Decision Engine</Text>
                        <Badge
                          label={`Risk ${selectedAiInsight.riskScore}`}
                          variant={selectedAiInsight.riskLevel === "high" ? "danger" : selectedAiInsight.riskLevel === "medium" ? "default" : "success"}
                        />
                      </View>
                      <Text style={styles.muted}>
                        Founder compatibility: {selectedAiInsight.founderCompatibility}% • Overdue ratio: {selectedAiInsight.overdueRatio}%
                      </Text>
                      <Text style={styles.muted}>
                        Pending decision: {selectedAiInsight.pendingDecisions} • Founder vote: {selectedAiInsight.pendingFounderVotes} • Inactive: {selectedAiInsight.inactiveDays} kun
                      </Text>
                    </View>

                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Signal va ogohlantirishlar</Text>
                      {(selectedAiInsight.warnings || []).map((warning) => (
                        <View key={warning.code} style={styles.rowBetween}>
                          <Text style={styles.muted}>{warning.text}</Text>
                          <Badge label={warning.code} variant={warning.variant || "default"} />
                        </View>
                      ))}
                    </View>

                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>AI tavsiyalari</Text>
                      {(selectedAiInsight.recommendations || []).map((item, index) => (
                        <Text key={`ai_rec_${index}`} style={styles.muted}>
                          {index + 1}. {item}
                        </Text>
                      ))}
                    </View>
                  </View>
                )}

                {activeDetailTab === "chat" && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Jamoa chat</Text>
                    <Text style={styles.muted}>Faqat loyiha jamoasi ichki muloqoti.</Text>
                    <ScrollView style={styles.teamChatList} contentContainerStyle={{ paddingTop: 8 }}>
                      {(selectedStartup.chat_messages || []).length === 0 && (
                        <Text style={styles.muted}>Hali xabarlar yo'q.</Text>
                      )}
                      {(selectedStartup.chat_messages || []).map((msg) => {
                        const mine = msg.user_id === currentUser?.id;
                        return (
                          <View key={msg.id} style={[styles.teamChatBubble, mine ? styles.teamChatMine : styles.teamChatOther]}>
                            {!mine && <Text style={styles.teamChatName}>{msg.user_name}</Text>}
                            <Text style={[styles.chatText, mine && { color: "#fff" }]}>{msg.text}</Text>
                            <Text style={styles.teamChatTime}>{new Date(msg.created_at).toLocaleTimeString()}</Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                    {canManageSelectedStartup ? (
                      <View style={styles.teamChatInputRow}>
                        <TextInput
                          value={teamChatInput}
                          onChangeText={setTeamChatInput}
                          placeholder="Xabar yozing..."
                          placeholderTextColor={isDarkMode ? "#7f93b6" : "#9cabcb"}
                          style={styles.teamChatInput}
                          onSubmitEditing={() => sendTeamMessage(selectedStartup.id)}
                        />
                        <TouchableOpacity style={styles.teamChatSendBtn} onPress={() => sendTeamMessage(selectedStartup.id)}>
                          <Ionicons name="send" size={15} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.muted}>Chatga yozish uchun jamoa a'zosi bo'lish kerak.</Text>
                    )}
                  </View>
                )}

                {activeDetailTab === "progress" && (
                  <View style={styles.card}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.cardTitle}>Loyiha progress dashboard</Text>
                      <Badge label={`${selectedProgress.completion}%`} variant="active" />
                    </View>
                    <View style={styles.progressTrackLg}>
                      <View style={[styles.progressFillLg, { width: `${selectedProgress.completion}%` }]} />
                    </View>
                    <View style={styles.statsGrid}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{selectedProgress.total}</Text>
                        <Text style={styles.statLabel}>Jami Task</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{selectedProgress.done}</Text>
                        <Text style={styles.statLabel}>Done</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{selectedProgress.inProgress}</Text>
                        <Text style={styles.statLabel}>In progress</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{selectedProgress.overdue}</Text>
                        <Text style={styles.statLabel}>Overdue</Text>
                      </View>
                    </View>
                  </View>
                )}

                {activeDetailTab === "sozlamalar" && (
                  canDeleteSelectedStartup
                    ? <Btn title="Loyihani o'chirish" icon="trash-outline" type="danger" onPress={() => deleteStartup(selectedStartup.id)} />
                    : <Text style={styles.muted}>Faqat loyiha egasi yoki admin uchun.</Text>
                )}
              </>
            )}
          </View>
        )}

        {activeTab === "requests" && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderInline}>
              <Text style={styles.h1}>So'rovlar</Text>
              <Badge label={String(incomingRequests.length)} variant="active" />
            </View>
            {incomingRequests.length === 0 ? (
              <EmptyState title="Yangi so'rovlar yo'q" />
            ) : incomingRequests.map((r) => (
              <View key={r.id} style={styles.requestCard}>
                <View style={styles.requestAvatar}>
                  <Text style={styles.requestAvatarText}>{(r.user_name || "?")[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{r.user_name}</Text>
                  <Text style={styles.muted}>{r.startup_name}</Text>
                  <View style={styles.rowNoWrap}>
                    <Badge label={r.specialty || "Builder"} variant="active" />
                  </View>
                </View>
                <View style={styles.requestActions}>
                  <Btn title="Qabul" icon="checkmark-outline" small onPress={() => requestAction(r.id, "accept")} />
                  <Btn title="Rad" icon="close-outline" small type="danger" onPress={() => requestAction(r.id, "decline")} />
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === "profile" && currentUser && (
          <View style={styles.section}>
            <Text style={styles.h1}>Profil</Text>
            <View style={styles.profileCard}>
              <View style={styles.rowNoWrap}>
                <Image source={{ uri: currentUser.avatar || getAvatar(currentUser.name) }} style={styles.avatar} />
                <View style={{ flex: 1 }}>
                  <View style={styles.rowNoWrap}>
                    <Text style={styles.cardTitle}>{currentUser.name}</Text>
                    {isProActive && <Badge label="PRO" variant="success" />}
                  </View>
                  <Text style={styles.muted}>{currentUser.email}</Text>
                  {!!currentUser.phone && <Text style={styles.tinyMuted}>{currentUser.phone}</Text>}
                </View>
              </View>
              <View style={styles.rowNoWrap}>
                <Btn title="Tahrirlash" icon="create-outline" small type="secondary" onPress={() => { setEditedUser(currentUser); setEditModalOpen(true); }} />
                {!!currentUser.portfolio_url && <Btn title="Portfolio" icon="link-outline" small onPress={() => openExternalLink(currentUser.portfolio_url)} />}
              </View>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{myStartups.length}</Text>
                <Text style={styles.statLabel}>Loyihalar</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{incomingRequests.length}</Text>
                <Text style={styles.statLabel}>So'rovlar</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{userNotifications.length}</Text>
                <Text style={styles.statLabel}>Notiflar</Text>
              </View>
            </View>
            {!!currentUserReputation && (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Reputatsiya profili</Text>
                  <Badge
                    label={`Score ${currentUserReputation.score}`}
                    variant={currentUserReputation.score >= 70 ? "success" : currentUserReputation.score >= 45 ? "default" : "danger"}
                  />
                </View>
                <Text style={styles.muted}>
                  Tier: {currentUserReputation.tier} • Collaborator: {currentUserReputation.collaborators} • Ishlagan kun: {currentUserReputation.daysWorked}
                </Text>
                <Text style={styles.muted}>
                  Task: {currentUserReputation.doneTasks}/{currentUserReputation.assignedTasks} done • Missed: {currentUserReputation.missedTasks}
                </Text>
                <Text style={styles.muted}>
                  Review: {currentUserReputation.avgRating}/5 ({currentUserReputation.ratingsCount} ta)
                </Text>
                <View style={{ height: 8 }} />
                {(currentUserReputation.history || []).slice(0, 6).map((item) => (
                  <View key={`hist_${item.startup_id}`} style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{item.startup_name}</Text>
                      <Text style={styles.tinyMuted}>
                        {item.lifecycle} • completion {item.completion}% • task {item.tasks_done}/{item.tasks_total}
                      </Text>
                    </View>
                    <Badge label={`${item.completion}%`} variant={item.completion >= 60 ? "success" : "default"} />
                  </View>
                ))}
              </View>
            )}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>GarajHub PRO</Text>
                <Badge label={isProActive ? "Faol" : "Free"} variant={isProActive ? "success" : "default"} />
              </View>
              <Text style={styles.muted}>
                {isProActive
                  ? "Sizda PRO faol: cheksiz startup yaratish yoqilgan."
                  : `Free limit: ${myOwnedStartupCount}/${Math.max(1, Number(appSettings.startup_limit_free || 1))}`}
              </Text>
              <Text style={styles.muted}>
                Narx: {Number(appSettings.pro_price_uzs || 0).toLocaleString("uz-UZ")} UZS
              </Text>
              <Text style={styles.muted}>To'lov karta: {appSettings.payment_card}</Text>
              <Text style={styles.muted}>Qabul qiluvchi: {appSettings.payment_holder}</Text>
              {!!myPendingProRequest && (
                <Badge label="Ariza: pending" variant="default" style={{ marginTop: 6 }} />
              )}
              {!isProActive && appSettings.pro_enabled && (
                <Btn title="PRO sotib olish" icon="diamond-outline" small onPress={() => setProModalOpen(true)} />
              )}
              {!appSettings.pro_enabled && (
                <Text style={styles.tinyMuted}>PRO modul vaqtincha admin tomonidan o'chirilgan.</Text>
              )}
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Ko'nikmalar</Text>
              <View style={styles.skillWrap}>
                {(currentUser.skills || []).length === 0 ? (
                  <Text style={styles.muted}>Ko'nikmalar kiritilmagan.</Text>
                ) : (currentUser.skills || []).map((skill, index) => (
                  <Badge key={`${skill}_${index}`} label={`# ${skill}`} />
                ))}
              </View>
            </View>
          </View>
        )}

        {activeTab === "inbox" && (
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.h1}>Bildirishnomalar</Text>
              {unreadCount > 0 && <Btn title="Barchasini o'qish" icon="mail-open-outline" small type="secondary" onPress={markAllRead} />}
            </View>
            {userNotifications.map((n) => (
              <TouchableOpacity key={n.id} style={[styles.notifCard, !n.is_read && styles.notifUnread]} onPress={() => markRead(n.id)}>
                <Text style={styles.cardTitle}>{n.title}</Text>
                <Text style={styles.muted}>{n.text}</Text>
                <Text style={styles.tinyMuted}>{new Date(n.created_at).toLocaleString()}</Text>
              </TouchableOpacity>
            ))}
            {userNotifications.length === 0 && <EmptyState title="Bildirishnoma yo'q" />}
          </View>
        )}

        {activeTab === "admin" && currentUser?.role === "admin" && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderInline}>
              <Text style={styles.h1}>Admin panel</Text>
              <Badge label={String((stats.pending_startups || 0) + (stats.pro_requests_pending || 0))} variant="danger" />
            </View>
            <View style={styles.adminTabsWrap}>
              {["dashboard", "moderation", "users", "startups", "categories", "pro", "audit"].map((t) => (
                <TouchableOpacity key={t} onPress={() => setAdminTab(t)} style={[styles.adminTab, adminTab === t && styles.adminTabActive]}>
                  <Text style={[styles.adminTabText, adminTab === t && styles.adminTabTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {adminTab === "dashboard" && (
              <>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.users}</Text>
                    <Text style={styles.statLabel}>Users</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.pro_users || 0}</Text>
                    <Text style={styles.statLabel}>PRO Users</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.startups}</Text>
                    <Text style={styles.statLabel}>Startups</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.pending_startups}</Text>
                    <Text style={styles.statLabel}>Pending</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.pro_requests_pending || 0}</Text>
                    <Text style={styles.statLabel}>PRO Pending</Text>
                  </View>
                </View>
                <View style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>PRO modul holati</Text>
                    <Badge label={appSettings.pro_enabled ? "Enabled" : "Disabled"} variant={appSettings.pro_enabled ? "success" : "danger"} />
                  </View>
                  <Text style={styles.muted}>Narx: {Number(appSettings.pro_price_uzs || 0).toLocaleString("uz-UZ")} UZS</Text>
                  <Text style={styles.muted}>Karta: {appSettings.payment_card}</Text>
                </View>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Startup progress</Text>
                  <View style={{ height: 8 }} />
                  {startupProgressList.map(({ startup, progress }) => (
                    <View key={`pg_${startup.id}`} style={{ marginBottom: 10 }}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.cardTitle}>{startup.nomi}</Text>
                        <Text style={styles.tinyMuted}>{progress.completion}%</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${progress.completion}%` }]} />
                      </View>
                      <Text style={styles.muted}>
                        Done {progress.done}/{progress.total} • Overdue {progress.overdue}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {adminTab === "moderation" && (
              startups.filter((s) => s.status === "pending_admin").length === 0 ? (
                <EmptyState title="Moderatsiya kutayotgan ariza yo'q" />
              ) : startups.filter((s) => s.status === "pending_admin").map((s) => (
                <View key={s.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{s.nomi}</Text>
                    <Badge label={s.category || "Other"} />
                  </View>
                  <Text style={styles.muted}>{s.egasi_name}</Text>
                  <View style={styles.rowNoWrap}>
                    <Btn
                      title="Approve"
                      icon="checkmark-circle-outline"
                      small
                      disabled={moderationBusyId === s.id}
                      onPress={() => adminSetStartupStatus(s.id, "approved")}
                    />
                    <Btn
                      title="Reject"
                      icon="close-circle-outline"
                      small
                      type="danger"
                      disabled={moderationBusyId === s.id}
                      onPress={() => adminSetStartupStatus(s.id, "rejected")}
                    />
                  </View>
                </View>
              ))
            )}

            {adminTab === "users" && allUsers.map((u) => (
              <View key={u.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{u.name}</Text>
                  <View style={styles.rowNoWrap}>
                    <Badge label={u.role} variant={u.role === "admin" ? "active" : "default"} />
                    {u.is_pro && <Badge label="PRO" variant="success" />}
                  </View>
                </View>
                <Text style={styles.muted}>{u.email}</Text>
                <View style={styles.rowNoWrap}>
                  <Btn title={u.role === "admin" ? "role:user" : "role:admin"} icon="swap-horizontal-outline" small type="secondary" onPress={() => adminUserRole(u.id, u.role === "admin" ? "user" : "admin")} />
                  {u.id !== "admin" && <Btn title={u.is_pro ? "PRO OFF" : "PRO ON"} icon="diamond-outline" small type="secondary" onPress={() => adminToggleUserPro(u.id, !u.is_pro)} />}
                  <Btn title={u.banned ? "Unban" : "Ban"} icon="ban-outline" small type="danger" onPress={() => adminUserBan(u.id, !u.banned)} />
                  <Btn title="Delete" icon="trash-outline" small type="ghost" onPress={() => adminUserDelete(u.id)} />
                </View>
              </View>
            ))}

            {adminTab === "startups" && startups.map((s) => (
              <View key={s.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{s.nomi}</Text>
                  <Badge label={s.status} variant={STATUS_VARIANT[s.status] || "default"} />
                </View>
                <Text style={styles.muted}>{s.egasi_name}</Text>
                <View style={styles.rowNoWrap}>
                  {s.status === "pending_admin" ? (
                    <>
                      <Btn
                        title="Approve"
                        icon="checkmark-circle-outline"
                        small
                        disabled={moderationBusyId === s.id}
                        onPress={() => adminSetStartupStatus(s.id, "approved")}
                      />
                      <Btn
                        title="Reject"
                        icon="close-circle-outline"
                        small
                        type="danger"
                        disabled={moderationBusyId === s.id}
                        onPress={() => adminSetStartupStatus(s.id, "rejected")}
                      />
                    </>
                  ) : (
                    <Text style={styles.tinyMuted}>Ko'rib chiqilgan</Text>
                  )}
                  <Btn title="Delete" icon="trash-outline" small type="ghost" onPress={() => adminDeleteStartup(s.id)} />
                </View>
              </View>
            ))}

            {adminTab === "categories" && (
              <View style={styles.card}>
                <Field
                  label="Yangi kategoriya"
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder="Kategoriya nomi"
                />
                <Btn title="Qo'shish" small onPress={() => addCategory(newCategoryName)} />
                <View style={{ height: 8 }} />
                {categories.map((c) => (
                  <View key={c} style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{c}</Text>
                    <Btn title="Delete" small type="danger" onPress={() => deleteCategory(c)} />
                  </View>
                ))}
              </View>
            )}

            {adminTab === "pro" && (
              <>
                <View style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>PRO modul</Text>
                    <Badge label={appSettings.pro_enabled ? "ON" : "OFF"} variant={appSettings.pro_enabled ? "success" : "danger"} />
                  </View>
                  <Btn
                    title={appSettings.pro_enabled ? "PRO modulni o'chirish" : "PRO modulni yoqish"}
                    small
                    type={appSettings.pro_enabled ? "danger" : "primary"}
                    onPress={toggleProModule}
                  />
                  <Field
                    label="PRO narxi (UZS)"
                    value={proSettingsDraft.pro_price_uzs}
                    onChangeText={(v) => setProSettingsDraft((p) => ({ ...p, pro_price_uzs: v }))}
                    placeholder="79000"
                  />
                  <Field
                    label="Karta raqam"
                    value={proSettingsDraft.payment_card}
                    onChangeText={(v) => setProSettingsDraft((p) => ({ ...p, payment_card: v }))}
                    placeholder="8600 0000 0000 0000"
                  />
                  <Field
                    label="Ism familiya"
                    value={proSettingsDraft.payment_holder}
                    onChangeText={(v) => setProSettingsDraft((p) => ({ ...p, payment_holder: v }))}
                    placeholder="MAMATOV OZODBEK"
                  />
                  <Field
                    label="Free startup limiti"
                    value={proSettingsDraft.startup_limit_free}
                    onChangeText={(v) => setProSettingsDraft((p) => ({ ...p, startup_limit_free: v }))}
                    placeholder="1"
                  />
                  <Btn title="PRO sozlamalarini saqlash" small onPress={saveProSettings} />
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>PRO to'lov arizalari</Text>
                  <View style={{ height: 8 }} />
                  {proRequests.length === 0 && <Text style={styles.muted}>Arizalar yo'q.</Text>}
                  {proRequests.map((req) => (
                    <View key={req.id} style={[styles.card, { marginBottom: 10 }]}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.cardTitle}>{req.user_name}</Text>
                        <Badge
                          label={req.status}
                          variant={req.status === "approved" ? "success" : req.status === "rejected" ? "danger" : "default"}
                        />
                      </View>
                      <Text style={styles.muted}>{req.user_email}</Text>
                      <Text style={styles.muted}>Summa: {Number(req.amount_uzs || 0).toLocaleString("uz-UZ")} UZS</Text>
                      {!!req.note && <Text style={styles.muted}>Izoh: {req.note}</Text>}
                      {!!req.receipt_image && (
                        <Image source={{ uri: req.receipt_image }} style={styles.receiptImage} />
                      )}
                      {req.status === "pending" && (
                        <View style={styles.rowNoWrap}>
                          <Btn title="Tasdiqlash" small onPress={() => adminReviewProRequest(req, true)} />
                          <Btn title="Rad etish" small type="danger" onPress={() => adminReviewProRequest(req, false)} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}

            {adminTab === "stats" && (
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.users}</Text>
                  <Text style={styles.statLabel}>Users</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.startups}</Text>
                  <Text style={styles.statLabel}>Startups</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.pending_startups}</Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.join_requests}</Text>
                  <Text style={styles.statLabel}>Requests</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.notifications}</Text>
                  <Text style={styles.statLabel}>Notifications</Text>
                </View>
              </View>
            )}

            {adminTab === "audit" && auditLogs.map((log) => (
              <View key={log.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{log.action}</Text>
                  <Text style={styles.tinyMuted}>{new Date(log.created_at).toLocaleString()}</Text>
                </View>
                <Text style={styles.muted}>{log.entity_type} / {log.entity_id}</Text>
              </View>
            ))}
          </View>
        )}
        </Animated.View>
      </ScrollView>

      <Modal visible={showOnboarding} transparent animationType="fade">
        <View style={styles.onboardingOverlay}>
          <View style={styles.onboardingCard}>
            <Animated.View
              style={[
                styles.onboardingSlide,
                { opacity: onboardingOpacity, transform: [{ translateX: onboardingShiftX }] },
              ]}
              {...onboardingPanResponder.panHandlers}
            >
              <View style={styles.onboardingTop}>
                <View style={styles.onboardingIconWrap}>
                  <Ionicons name={ONBOARDING_PAGES[onboardingStep].icon} size={34} color="#0a84ff" />
                </View>
                <TouchableOpacity onPress={finishOnboarding} style={styles.onboardingSkipBtn} activeOpacity={0.7}>
                  <Text style={styles.onboardingSkipText}>O'tkazib yuborish</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.onboardingTitle}>{ONBOARDING_PAGES[onboardingStep].title}</Text>
              <Text style={styles.onboardingText}>{ONBOARDING_PAGES[onboardingStep].text}</Text>
              <View style={styles.onboardingDots}>
                {ONBOARDING_PAGES.map((_, idx) => (
                  <View key={idx} style={[styles.onboardingDot, idx === onboardingStep && styles.onboardingDotActive]} />
                ))}
              </View>
            </Animated.View>
            <View style={styles.onboardingActionsRow}>
              {onboardingStep > 0 ? (
                <Btn
                  title="Orqaga"
                  onPress={prevOnboardingStep}
                  type="secondary"
                  small
                  style={styles.onboardingBackBtn}
                />
              ) : (
                <View style={styles.onboardingSpacer} />
              )}
              <Btn
                title={onboardingStep === ONBOARDING_PAGES.length - 1 ? "Boshlash" : "Keyingisi"}
                onPress={nextOnboardingStep}
                style={styles.onboardingActionBtn}
              />
            </View>
            <Text style={styles.onboardingHint}>Chap yoki o'ngga surib sahifani almashtiring</Text>
          </View>
        </View>
      </Modal>

      <View style={[styles.bottomTabWrap, isCompact && styles.bottomTabWrapCompact, bottomTabInlineStyle]}>
        {bottomTabs.map((key) => {
          const meta = BOTTOM_TAB_META[key] || { label: key, icon: "ellipse-outline", iconActive: "ellipse" };
          const active = activeTab === key;
          const badge = tabBadge(key);
          const isCreate = key === "create";
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.bottomTabItem,
                active && styles.bottomTabItemActive,
                isCreate && styles.bottomTabItemCreate,
                isVeryCompact && styles.bottomTabItemCompact,
              ]}
              onPress={() => (key === "create" && !currentUser ? setShowAuthModal(true) : navigateTo(key))}
              activeOpacity={0.85}
            >
              <View style={styles.bottomTabIconWrap}>
                <Ionicons
                  name={active ? meta.iconActive : meta.icon}
                  size={isCreate ? 24 : 20}
                  color={active ? "#0a84ff" : isDarkMode ? "#9eb0cf" : "#6b7a99"}
                />
                {badge > 0 && (
                  <View style={styles.bottomTabBadge}>
                    <Text style={styles.bottomTabBadgeText}>{badge > 99 ? "99+" : badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.bottomTabLabel, active && styles.bottomTabLabelActive, isVeryCompact && styles.bottomTabLabelCompact]}>{meta.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <AnimatedTouchable
        style={[
          styles.aiFab,
          showAI && styles.aiFabActive,
          isCompact && styles.aiFabCompact,
          aiFabInlineStyle,
          { transform: [{ scale: aiPulse }] },
        ]}
        onPress={() => setShowAI((v) => !v)}
        activeOpacity={0.9}
      >
        <Ionicons name={showAI ? "close" : "sparkles-outline"} size={20} color="#fff" />
      </AnimatedTouchable>

      <Modal visible={showAuthModal} transparent animationType="slide">
        <View style={styles.authOverlay}>
          <View style={styles.authCard}>
            <Text style={styles.h1}>{authMode === "login" ? "Kirish" : "Ro'yxat"}</Text>
            {authMode === "register" && (
              <>
                <Field label="Ism" value={authForm.name} onChangeText={(v) => setAuthForm((p) => ({ ...p, name: v }))} placeholder="Ism" />
                <Field label="Telefon" value={authForm.phone} onChangeText={(v) => setAuthForm((p) => ({ ...p, phone: v }))} placeholder="+998..." />
                <ImagePickerField
                  label="Profil rasmi"
                  imageUri={authForm.avatar}
                  onPick={() => pickImageAndSet((img) => setAuthForm((p) => ({ ...p, avatar: img })))}
                  hint="Ixtiyoriy"
                />
              </>
            )}
            <Field label="Email" value={authForm.email} onChangeText={(v) => setAuthForm((p) => ({ ...p, email: v }))} placeholder="email@mail.com" />
            <Field label="Parol" value={authForm.password} onChangeText={(v) => setAuthForm((p) => ({ ...p, password: v }))} placeholder="******" secureTextEntry />
            <Btn title={authMode === "login" ? "Kirish" : "Ro'yxatdan o'tish"} onPress={handleAuth} />
            <Btn title={authMode === "login" ? "Ro'yxatdan o'tish" : "Kirishga o'tish"} type="secondary" onPress={() => setAuthMode((m) => (m === "login" ? "register" : "login"))} />
            <Btn title="Yopish" type="ghost" onPress={() => setShowAuthModal(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={editModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.h1}>Profilni tahrirlash</Text>
            <Field label="Ism" value={editedUser.name || ""} onChangeText={(v) => setEditedUser((p) => ({ ...p, name: v }))} placeholder="Ism" />
            <Field label="Telefon" value={editedUser.phone || ""} onChangeText={(v) => setEditedUser((p) => ({ ...p, phone: v }))} placeholder="+998..." />
            <Field label="Bio" value={editedUser.bio || ""} onChangeText={(v) => setEditedUser((p) => ({ ...p, bio: v }))} placeholder="Bio" multiline />
            <Field label="Skills" value={(editedUser.skills || []).toString()} onChangeText={(v) => setEditedUser((p) => ({ ...p, skills: v }))} placeholder="React, Node.js" />
            <ImagePickerField
              label="Profil rasmi"
              imageUri={editedUser.avatar || currentUser?.avatar}
              onPick={() => pickImageAndSet((img) => setEditedUser((p) => ({ ...p, avatar: img })))}
            />
            <Btn title="Saqlash" onPress={updateProfile} />
            <Btn title="Bekor" type="secondary" onPress={() => setEditModalOpen(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={taskModal.open} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.h1}>Yangi vazifa</Text>
            <Field label="Nomi" value={taskModal.title} onChangeText={(v) => setTaskModal((p) => ({ ...p, title: v }))} placeholder="Task title" />
            <Field label="Tavsif" value={taskModal.description} onChangeText={(v) => setTaskModal((p) => ({ ...p, description: v }))} placeholder="Description" multiline />
            <Field label="Deadline" value={taskModal.deadline} onChangeText={(v) => setTaskModal((p) => ({ ...p, deadline: v }))} placeholder="2026-03-01" />
            <Btn title="Qo'shish" onPress={addTask} />
            <Btn title="Bekor" type="secondary" onPress={() => setTaskModal({ open: false, startupId: "", title: "", description: "", deadline: "" })} />
          </View>
        </View>
      </Modal>

      <Modal visible={proModalOpen} transparent animationType="slide" onRequestClose={() => setProModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>
            <View style={styles.modalCard}>
              <Text style={styles.h1}>GarajHub PRO</Text>
              <Text style={styles.muted}>
                Narx: {Number(appSettings.pro_price_uzs || 0).toLocaleString("uz-UZ")} UZS
              </Text>
              <Text style={styles.muted}>Karta: {appSettings.payment_card}</Text>
              <Text style={styles.muted}>Ism familiya: {appSettings.payment_holder}</Text>
              <ImagePickerField
                label="To'lov cheki rasmi"
                imageUri={proReceipt}
                onPick={() => pickImageAndSet(setProReceipt)}
                hint="Chek skrinshot yoki foto yuboring"
              />
              <Field
                label="Izoh (ixtiyoriy)"
                value={proNote}
                onChangeText={setProNote}
                placeholder="To'lov vaqti yoki izoh..."
                multiline
              />
              <Btn title="Arizani yuborish" onPress={submitProRequest} />
              <Btn title="Bekor qilish" type="secondary" onPress={() => setProModalOpen(false)} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showAI} transparent animationType="slide">
        <View style={styles.aiOverlay}>
          <View style={[styles.aiCard, { maxHeight: Math.max(360, screenHeight * 0.78) }]}>
            <View style={styles.aiHeader}>
              <View style={styles.aiHeaderLeft}>
                <View style={styles.aiHeaderIcon}>
                  <Ionicons name="sparkles-outline" size={16} color={isDarkMode ? "#30d158" : "#0a84ff"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aiTitle}>AI Mentor</Text>
                  <Text style={styles.aiSubtitle}>Savolingizga aniq va tez javob</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.aiCloseBtn} onPress={() => setShowAI(false)}>
                <Ionicons name="close" size={18} color={isDarkMode ? "#c8d5f1" : "#5b6b88"} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.aiMessages}
              contentContainerStyle={styles.aiMessagesContent}
              showsVerticalScrollIndicator={false}
            >
              {aiChat.map((m) => (
                <View key={m.id} style={[styles.chat, m.sender === "user" ? styles.chatUser : styles.chatAi]}>
                  <Text style={[styles.chatText, m.sender === "user" && { color: "#fff" }]}>{m.text}</Text>
                </View>
              ))}
              {aiLoading && (
                <View style={[styles.chat, styles.chatAi, styles.aiTypingWrap]}>
                  <ActivityIndicator size="small" color={isDarkMode ? "#30d158" : "#0a84ff"} />
                </View>
              )}
            </ScrollView>

            <View style={styles.aiInputRow}>
              <TextInput
                value={aiInput}
                onChangeText={setAiInput}
                placeholder="Savol yozing..."
                placeholderTextColor={isDarkMode ? "#7f93b6" : "#9cabcb"}
                style={styles.aiInput}
                onSubmitEditing={sendAI}
                returnKeyType="send"
              />
              <TouchableOpacity
                onPress={sendAI}
                disabled={aiLoading}
                style={[styles.aiSendBtn, aiLoading && styles.aiSendBtnDisabled]}
                activeOpacity={0.8}
              >
                {aiLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const lightStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eef3ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#eef3ff" },
  bgLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  bgOrbLarge: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 260,
    backgroundColor: "rgba(90,200,250,0.24)",
    top: -90,
    right: -120,
  },
  bgOrbLargeCompact: {
    width: 250,
    height: 250,
    top: -78,
    right: -95,
    opacity: 0.7,
  },
  bgOrbMedium: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 240,
    backgroundColor: "rgba(10,132,255,0.18)",
    bottom: 60,
    left: -130,
  },
  bgOrbMediumCompact: {
    width: 180,
    height: 180,
    bottom: 94,
    left: -74,
    opacity: 0.6,
  },

  topSafeArea: {
    backgroundColor: "transparent",
    paddingTop:
      Platform.OS === "android"
        ? StatusBar.currentHeight || 8
        : IS_WEB
        ? 8
        : 0,
    paddingHorizontal: 14,
    paddingBottom: 2,
    zIndex: 20,
  },
  topSafeAreaCompact: {
    paddingHorizontal: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#d3dcef",
    shadowColor: "#0f172a",
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: IS_ANDROID ? 0 : 12,
  },
  headerRowCompact: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  headerStatsRow: {
    marginTop: 9,
    flexDirection: "row",
    gap: 8,
  },
  headerStatsRowCompact: {
    gap: 6,
  },
  headerStatCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0a84ff",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: IS_ANDROID ? 0 : 4,
  },
  headerStatValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0a84ff",
    letterSpacing: -0.2,
  },
  headerStatLabel: {
    marginTop: 2,
    fontSize: 9,
    textTransform: "uppercase",
    fontWeight: "800",
    color: "#6b7a99",
    letterSpacing: 0.4,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 8 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  headerIconBtn: {
    minHeight: 36,
    minWidth: 38,
    width: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d3dcef",
    backgroundColor: "#f1f5ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  headerIconText: { fontSize: 10, fontWeight: "900", color: "#0f172a" },
  headerBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#0a84ff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    alignItems: "center",
    justifyContent: "center",
  },
  headerBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  createHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#0a84ff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { flex: 1, paddingRight: 8 },
  title: { fontSize: 20, fontWeight: "900", color: "#0f172a", letterSpacing: -0.3, fontFamily: FONT_DISPLAY },
  topSubtitle: { fontSize: 10, color: "#6b7a99", marginTop: 1, fontWeight: "700", textTransform: "uppercase", backgroundColor: "transparent", fontFamily: FONT_ACCENT },
  drawerRoot: { flex: 1, flexDirection: "row" },
  drawerBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.46)" },
  drawerCard: {
    width: 280,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#d3dcef",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 8 : 16,
    paddingHorizontal: 12,
    paddingBottom: 10,
    shadowColor: "#020617",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 4, height: 0 },
    elevation: IS_ANDROID ? 0 : 18,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#d3dcef",
    paddingBottom: 10,
    marginBottom: 10,
  },
  drawerTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a", letterSpacing: -0.2, fontFamily: FONT_DISPLAY },
  drawerSubtitle: { fontSize: 11, color: "#6b7a99", marginTop: 2, fontWeight: "700", fontFamily: FONT_BODY },
  drawerBody: { flex: 1 },
  drawerItem: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 14,
    paddingHorizontal: 11,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
  },
  drawerItemLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  drawerItemActive: { backgroundColor: "#0a84ff", borderColor: "#0a84ff" },
  drawerItemText: { color: "#0f172a", fontWeight: "800", fontSize: 12, fontFamily: FONT_ACCENT },
  drawerItemTextActive: { color: "#fff" },
  drawerItemBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 14,
    paddingHorizontal: 5,
    backgroundColor: "#0066d6",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerItemBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900", fontFamily: FONT_ACCENT },
  drawerFooter: { borderTopWidth: 1, borderTopColor: "#d3dcef", paddingTop: 10 },
  drawerAvatar: { width: 42, height: 42, borderRadius: 20, marginRight: 10, backgroundColor: "#dde7fb" },
  drawerUserName: { fontSize: 13, fontWeight: "900", color: "#0f172a", fontFamily: FONT_ACCENT },
  drawerUserEmail: { fontSize: 11, color: "#6b7a99", fontFamily: FONT_BODY },

  screenScroll: { flex: 1 },
  screenContent: { width: "100%" },
  contentAnimated: { width: "100%" },
  section: { marginBottom: 14, width: "100%" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 },
  sectionHeaderInline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },

  h1: { fontSize: 21, fontWeight: "800", marginBottom: 6, color: "#0f172a", letterSpacing: -0.35, backgroundColor: "transparent", fontFamily: FONT_DISPLAY },
  mutedLg: { fontSize: 12, color: "#6b7a99", marginBottom: 2, backgroundColor: "transparent", fontFamily: FONT_BODY },
  muted: { fontSize: 11, color: "#6b7a99", backgroundColor: "transparent", fontFamily: FONT_BODY },
  tinyMuted: { fontSize: 9, color: "#9cabcb", marginTop: 2, backgroundColor: "transparent", fontFamily: FONT_BODY },
  label: { fontSize: 10, color: "#5b6b88", marginBottom: 4, fontWeight: "800", textTransform: "uppercase", backgroundColor: "transparent", fontFamily: FONT_ACCENT },
  heroCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    shadowColor: "#0a84ff",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: IS_ANDROID ? 0 : 4,
  },
  heroEyebrow: {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    fontWeight: "900",
    color: "#6b7a99",
    marginBottom: 4,
  },
  heroTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a", marginBottom: 4, fontFamily: FONT_DISPLAY },
  heroText: { fontSize: 12, color: "#5b6b88", lineHeight: 17, fontFamily: FONT_BODY },
  heroBadge: { paddingHorizontal: 9, paddingVertical: 5, marginLeft: 8 },
  heroBadgeText: { fontSize: 8, letterSpacing: 0.4 },
  heroStats: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  heroStatItem: {
    flex: 1,
    backgroundColor: "#eef3ff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 14,
    paddingVertical: 8,
    alignItems: "center",
  },
  heroStatValue: { fontSize: 14, fontWeight: "900", color: "#0f172a", fontFamily: FONT_DISPLAY },
  heroStatLabel: { fontSize: 9, fontWeight: "800", color: "#6b7a99", marginTop: 2, textTransform: "uppercase", fontFamily: FONT_ACCENT },

  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: IS_WEB ? 16 : 14,
    ...(IS_WEB ? { outlineStyle: "none", outlineWidth: 0 } : {}),
  },
  textArea: { minHeight: 100, textAlignVertical: "top", paddingTop: 10 },
  imagePickerBox: {
    minHeight: 104,
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    backgroundColor: "#f6f8ff",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePickerPreview: { width: "100%", height: 140, resizeMode: "cover" },
  imagePickerEmpty: { minHeight: 92, alignItems: "center", justifyContent: "center" },
  imagePickerEmptyText: { marginTop: 6, fontSize: 11, color: "#5b6b88", fontWeight: "700" },

  chipsWrap: { paddingBottom: 8, paddingTop: 2 },
  chip: { borderWidth: 1, borderColor: "#d3dcef", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginRight: 8, backgroundColor: "#f6f8ff" },
  chipActive: { backgroundColor: "#0a84ff", borderColor: "#0a84ff" },
  chipText: { fontSize: 11, color: "#5b6b88", fontWeight: "800", fontFamily: FONT_ACCENT },
  chipTextActive: { color: "#fff" },

  startupCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    padding: 13,
    marginBottom: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: IS_ANDROID ? 0 : 4,
  },
  startupTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  startupTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 6, letterSpacing: -0.2, fontFamily: FONT_DISPLAY },
  startupFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  logo: { width: 48, height: 48, borderRadius: 14, marginRight: 8, backgroundColor: "#e6edff" },

  memberStack: { flexDirection: "row", alignItems: "center" },
  memberBubble: {
    width: 25,
    height: 25,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#fff",
    backgroundColor: "#dde7fb",
    justifyContent: "center",
    alignItems: "center",
  },
  memberOverlap: { marginLeft: -7 },
  memberBubbleText: { fontSize: 10, fontWeight: "900", color: "#22304f", fontFamily: FONT_ACCENT },
  memberMore: { backgroundColor: "#0a84ff" },
  memberMoreText: { fontSize: 9, fontWeight: "900", color: "#fff", fontFamily: FONT_ACCENT },

  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d3dcef",
    padding: 13,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: IS_ANDROID ? 0 : 3,
  },

  projectRow: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    padding: 11,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: IS_ANDROID ? 0 : 3,
  },
  projectLogo: { width: 54, height: 54, borderRadius: 14, backgroundColor: "#e6edff" },

  detailsHeader: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: IS_ANDROID ? 0 : 3,
  },
  detailsLogo: { width: 74, height: 74, borderRadius: 14, backgroundColor: "#e6edff" },
  detailTabsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
  detailTab: {
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 1000,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "#eef3ff",
  },
  detailTabActive: { backgroundColor: "#0a84ff", borderColor: "#0a84ff" },
  detailTabText: { fontSize: 11, color: "#5b6b88", fontWeight: "800", textTransform: "uppercase", fontFamily: FONT_ACCENT },
  detailTabTextActive: { color: "#fff" },

  requestCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    padding: 11,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: IS_ANDROID ? 0 : 3,
  },
  requestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#dde7fb",
    alignItems: "center",
    justifyContent: "center",
  },
  requestAvatarText: { fontSize: 14, fontWeight: "900", color: "#0f172a", fontFamily: FONT_ACCENT },
  requestActions: { marginLeft: 6 },

  profileCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    padding: 13,
    marginBottom: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: IS_ANDROID ? 0 : 3,
  },
  avatar: { width: 66, height: 66, borderRadius: 33, marginRight: 10, backgroundColor: "#dde7fb" },
  skillWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  statItem: {
    minWidth: 110,
    flexGrow: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: IS_ANDROID ? 0 : 2,
  },
  statValue: { fontSize: 18, fontWeight: "900", color: "#0f172a", backgroundColor: "transparent" },
  statLabel: { fontSize: 9, color: "#6b7a99", fontWeight: "800", textTransform: "uppercase", marginTop: 1, backgroundColor: "transparent" },
  progressTrack: { height: 8, borderRadius: 14, backgroundColor: "#dbe9ff", overflow: "hidden", marginBottom: 4 },
  progressFill: { height: "100%", borderRadius: 14, backgroundColor: "#0a84ff" },
  progressTrackLg: { height: 12, borderRadius: 20, backgroundColor: "#dbe9ff", overflow: "hidden", marginVertical: 10 },
  progressFillLg: { height: "100%", borderRadius: 20, backgroundColor: "#0a84ff" },
  receiptImage: {
    width: "100%",
    height: 180,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d3dcef",
    marginVertical: 8,
    resizeMode: "cover",
    backgroundColor: "#dde7fb",
  },
  teamChatList: { maxHeight: 280, marginTop: 8, marginBottom: 10 },
  teamChatBubble: { maxWidth: "85%", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  teamChatMine: { alignSelf: "flex-end", backgroundColor: "#0a84ff" },
  teamChatOther: { alignSelf: "flex-start", backgroundColor: "#fbfdff", borderWidth: 1, borderColor: "#dde7fb" },
  teamChatName: { fontSize: 10, fontWeight: "800", color: "#22304f", marginBottom: 3 },
  teamChatTime: { fontSize: 9, color: "#9cabcb", marginTop: 3 },
  teamChatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    backgroundColor: "#fbfdff",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  teamChatInput: {
    flex: 1,
    minHeight: 36,
    color: "#0f172a",
    fontSize: IS_WEB ? 16 : 14,
    paddingRight: 8,
    ...(IS_WEB ? { outlineStyle: "none", outlineWidth: 0 } : {}),
  },
  teamChatSendBtn: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a84ff",
  },

  notifCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    padding: 10,
    marginBottom: 8,
  },
  notifUnread: { borderColor: "#0a84ff", shadowColor: "#0a84ff", shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },

  teamRow: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 20,
    padding: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teamAvatar: { width: 36, height: 36, borderRadius: 20, backgroundColor: "#dde7fb", alignItems: "center", justifyContent: "center" },
  teamAvatarText: { fontSize: 13, fontWeight: "900", color: "#22304f", fontFamily: FONT_ACCENT },

  adminTabsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  adminTab: {
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#eef3ff",
  },
  adminTabActive: { backgroundColor: "#0a84ff", borderColor: "#0a84ff" },
  adminTabText: { fontSize: 11, color: "#5b6b88", fontWeight: "800", fontFamily: FONT_ACCENT },
  adminTabTextActive: { color: "#fff" },

  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    borderRadius: 22,
    padding: 11,
    marginBottom: 11,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: IS_ANDROID ? 0 : 2,
  },
  cardTitle: { fontSize: 13, fontWeight: "800", color: "#0f172a", backgroundColor: "transparent", fontFamily: FONT_ACCENT },
  cardDesc: { fontSize: 12, color: "#5b6b88", marginTop: 6, marginBottom: 6, backgroundColor: "transparent", fontFamily: FONT_BODY },
  task: { borderWidth: 1, borderColor: "#d3dcef", borderRadius: 16, padding: 9, marginTop: 8, backgroundColor: "#f6f8ff" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  rowNoWrap: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 6, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 6 },

  badge: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  badge_default: { backgroundColor: "#f1f5ff", borderColor: "#d3dcef" },
  badge_active: { backgroundColor: "#0a84ff", borderColor: "#0a84ff" },
  badge_success: { backgroundColor: "#ecfdf3", borderColor: "#a7f3d0" },
  badge_danger: { backgroundColor: "#fff1f2", borderColor: "#fecdd3" },
  badgeText: { fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.2, fontFamily: FONT_ACCENT },
  badgeText_default: { color: "#5b6b88" },
  badgeText_active: { color: "#fff" },
  badgeText_success: { color: "#047857" },
  badgeText_danger: { color: "#be123c" },

  btn: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, justifyContent: "center", alignItems: "center", borderWidth: 1, marginRight: 7, marginTop: 7 },
  btnSmall: { minHeight: 34, paddingHorizontal: 12, borderRadius: 13 },
  btnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  btnIcon: { marginRight: 5 },
  btn_primary: {
    backgroundColor: "#0a84ff",
    borderColor: "#0a84ff",
    shadowColor: "#0f172a",
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: IS_ANDROID ? 0 : 2,
  },
  btn_secondary: { backgroundColor: "#eef3ff", borderColor: "#d3dcef" },
  btn_danger: { backgroundColor: "#fff1f2", borderColor: "#fda4af" },
  btn_ghost: { backgroundColor: "#eef3ff", borderColor: "#d3dcef" },
  btnDisabled: { opacity: 0.55 },
  btnText: { fontSize: 11, fontWeight: "800", fontFamily: FONT_ACCENT },
  btnTextPrimary: { color: "#fff" },
  btnTextSecondary: { color: "#0f172a" },

  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 26, paddingHorizontal: 18 },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "#eef3ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyIconText: { fontSize: 24, fontWeight: "900", color: "#0f172a" },
  emptyTitle: { fontSize: 14, fontWeight: "900", color: "#0f172a", textAlign: "center", marginBottom: 4, fontFamily: FONT_DISPLAY },
  emptySubtitle: { fontSize: 11, color: "#6b7a99", textAlign: "center", marginBottom: 8, lineHeight: 16, fontFamily: FONT_BODY },

  splashRoot: { flex: 1, backgroundColor: "#eef3ff" },
  splashCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  splashSpinnerOnly: { flex: 1, alignItems: "center", justifyContent: "center" },
  splashGlass: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d3dcef",
    backgroundColor: "#ffffff",
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: IS_ANDROID ? 0 : 10,
  },
  splashOrb: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#0a84ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: IS_ANDROID ? 0 : 8,
  },
  splashOrbText: { color: "#fff", fontSize: 42, fontWeight: "900", letterSpacing: -0.8 },
  splashTitle: { color: "#0f172a", fontSize: 28, fontWeight: "900", letterSpacing: -0.5, marginBottom: 4, fontFamily: FONT_DISPLAY },
  splashSubtitle: { color: "#6b7a99", fontSize: 13, fontWeight: "600", marginBottom: 18, fontFamily: FONT_BODY },
  splashLoaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  splashLoaderText: { fontSize: 12, color: "#5b6b88", fontWeight: "700", fontFamily: FONT_ACCENT },
  splashDots: { flexDirection: "row", alignItems: "center", gap: 8 },
  splashDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#c8d5f1" },
  splashDotActive: { width: 20, borderRadius: 14, backgroundColor: "#0a84ff" },

  onboardingOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.34)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 30,
  },
  onboardingCard: {
    width: "100%",
    maxWidth: 430,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#d3dcef",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: IS_ANDROID ? 0 : 14,
  },
  onboardingSlide: { width: "100%" },
  onboardingTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  onboardingIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: "#f1f5ff",
    borderWidth: 1,
    borderColor: "#d3dcef",
    alignItems: "center",
    justifyContent: "center",
  },
  onboardingSkipBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  onboardingSkipText: { fontSize: 11, fontWeight: "700", color: "#6b7a99", textTransform: "uppercase" },
  onboardingTitle: { fontSize: 22, fontWeight: "900", color: "#0f172a", letterSpacing: -0.4, marginBottom: 8, fontFamily: FONT_DISPLAY },
  onboardingText: { fontSize: 13, lineHeight: 19, color: "#5b6b88", marginBottom: 14, fontFamily: FONT_BODY },
  onboardingDots: { flexDirection: "row", alignItems: "center", marginBottom: 14, gap: 6 },
  onboardingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#c8d5f1" },
  onboardingDotActive: { width: 20, borderRadius: 14, backgroundColor: "#0a84ff" },
  onboardingActionsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  onboardingBackBtn: { minWidth: 94 },
  onboardingSpacer: { width: 94 },
  onboardingActionBtn: { marginTop: 2, flex: 1 },
  onboardingHint: { marginTop: 10, fontSize: 10, color: "#6b7a99", textAlign: "center", fontWeight: "600", fontFamily: FONT_BODY },

  bottomTabWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 16,
    minHeight: 76,
    borderRadius: 30,
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "#d9e4fa",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: IS_ANDROID ? 0 : 16,
    zIndex: 18,
  },
  bottomTabWrapCompact: {
    minHeight: 64,
    borderRadius: 24,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  bottomTabItem: {
    minWidth: 56,
    maxWidth: 74,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 8,
    marginHorizontal: 2,
  },
  bottomTabItemCompact: {
    minWidth: 48,
    marginHorizontal: 1,
    paddingVertical: 4,
  },
  bottomTabItemActive: { backgroundColor: "#edf3ff" },
  bottomTabItemCreate: {
    backgroundColor: "#edf4ff",
    borderWidth: 1,
    borderColor: "#d9e4fa",
  },
  bottomTabIconWrap: { position: "relative", alignItems: "center", justifyContent: "center" },
  bottomTabLabel: { marginTop: 3, fontSize: 10, fontWeight: "700", color: "#6b7a99", fontFamily: FONT_ACCENT },
  bottomTabLabelCompact: { fontSize: 9, marginTop: 2 },
  bottomTabLabelActive: { color: "#0a84ff", fontWeight: "800" },
  bottomTabBadge: {
    position: "absolute",
    top: -7,
    right: -11,
    minWidth: 15,
    height: 15,
    borderRadius: 20,
    backgroundColor: "#0f172a",
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: "#d3dcef",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomTabBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900" },

  aiFab: {
    position: "absolute",
    right: 16,
    bottom: 98,
    width: 60,
    height: 60,
    borderRadius: 24,
    backgroundColor: "#0a84ff",
    borderWidth: 1,
    borderColor: "#d9e4fa",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0a84ff",
    shadowOpacity: 0.26,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: IS_ANDROID ? 0 : 10,
    zIndex: 20,
  },
  aiFabCompact: {
    width: 52,
    height: 52,
    borderRadius: 20,
  },
  aiFabActive: { backgroundColor: "#0a84ff" },
  aiFabText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },

  authOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.28)", justifyContent: "center", padding: IS_WEB ? 10 : 14 },
  authCard: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 28,
    padding: 16,
    maxHeight: "92%",
    borderWidth: 1,
    borderColor: "#d9e4fa",
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.24)", justifyContent: "flex-end" },
  modalCard: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 14,
    maxHeight: "92%",
    borderTopWidth: 1,
    borderColor: "#d9e4fa",
  },
  aiOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.3)", justifyContent: "flex-end", alignItems: "flex-end", padding: 12 },
  aiCard: { width: "100%", maxWidth: 430, backgroundColor: "rgba(255,255,255,0.97)", borderRadius: 26, padding: 12, maxHeight: "80%", borderWidth: 1, borderColor: "#d9e4fa" },
  aiHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  aiHeaderLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  aiHeaderIcon: { width: 34, height: 34, borderRadius: 14, backgroundColor: "#f1f5ff", borderWidth: 1, borderColor: "#dbe9ff", alignItems: "center", justifyContent: "center", marginRight: 8 },
  aiTitle: { fontSize: 14, fontWeight: "900", color: "#0f172a", fontFamily: FONT_DISPLAY },
  aiSubtitle: { fontSize: 10, color: "#6b7a99", marginTop: 1, fontFamily: FONT_BODY },
  aiCloseBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: "#d3dcef", backgroundColor: "#fbfdff", alignItems: "center", justifyContent: "center" },
  aiMessages: { maxHeight: 280, borderWidth: 1, borderColor: "#dde7fb", borderRadius: 20, backgroundColor: "#f6f8ff" },
  aiMessagesContent: { padding: 10 },
  chat: { padding: 10, borderRadius: 20, marginBottom: 8, maxWidth: "88%" },
  chatUser: { alignSelf: "flex-end", backgroundColor: "#0a84ff" },
  chatAi: { alignSelf: "flex-start", backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dde7fb" },
  aiTypingWrap: { alignItems: "center", justifyContent: "center", minWidth: 64 },
  aiInputRow: { flexDirection: "row", alignItems: "center", marginTop: 10, backgroundColor: "#fbfdff", borderRadius: 20, borderWidth: 1, borderColor: "#dde7fb", paddingLeft: 12, paddingRight: 6, paddingVertical: 6 },
  aiInput: {
    flex: 1,
    minHeight: 36,
    color: "#0f172a",
    fontSize: IS_WEB ? 16 : 14,
    paddingVertical: 6,
    paddingRight: 8,
    ...(IS_WEB ? { outlineStyle: "none", outlineWidth: 0 } : {}),
  },
  aiSendBtn: { width: 36, height: 36, borderRadius: 14, backgroundColor: "#0a84ff", alignItems: "center", justifyContent: "center" },
  aiSendBtnDisabled: { backgroundColor: "#9cabcb" },
  chatText: { fontSize: 13, color: "#0f172a", fontFamily: FONT_BODY },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: "#0b1020" },
  center: { backgroundColor: "#0b1020" },
  bgOrbLarge: { backgroundColor: "rgba(10,132,255,0.24)" },
  bgOrbMedium: { backgroundColor: "rgba(90,200,250,0.17)" },
  topSafeArea: {
    backgroundColor: "transparent",
    borderBottomColor: "transparent",
    shadowOpacity: 0.14,
    elevation: 0,
  },
  headerRow: {
    backgroundColor: "rgba(19,29,50,0.92)",
    borderColor: "#3b4c72",
  },
  headerStatCard: {
    backgroundColor: "rgba(25,36,62,0.9)",
    borderColor: "#2f3e63",
    shadowOpacity: 0.22,
  },
  headerStatValue: { color: "#30d158" },
  headerStatLabel: { color: "#9eb0cf" },
  headerIconBtn: {
    backgroundColor: "rgba(34,48,79,0.95)",
    borderColor: "#3b4c72",
  },
  headerBadge: { borderColor: "#3b4c72" },
  createHeaderBtn: { backgroundColor: "#0a84ff" },
  title: { color: "#fbfdff" },
  topSubtitle: { color: "#9eb0cf" },
  brandMark: { backgroundColor: "#14203a", borderColor: "#3b4c72" },

  drawerBackdrop: { backgroundColor: "rgba(2,6,23,0.52)" },
  drawerCard: {
    backgroundColor: "#121a2f",
    borderRightColor: "#3b4c72",
  },
  drawerHeader: { borderBottomColor: "rgba(148,163,184,0.2)" },
  drawerTitle: { color: "#fbfdff" },
  drawerSubtitle: { color: "#9cabcb" },
  drawerItem: { backgroundColor: "#121a2f", borderColor: "#3b4c72" },
  drawerItemActive: { backgroundColor: "#0a84ff", borderColor: "#0a84ff" },
  drawerItemText: { color: "#e7eeff" },
  drawerItemBadge: { backgroundColor: "rgba(15,118,110,0.35)" },
  drawerFooter: { borderTopColor: "rgba(148,163,184,0.2)" },
  drawerUserName: { color: "#fbfdff" },
  drawerUserEmail: { color: "#9eb0cf" },

  h1: { color: "#fbfdff" },
  mutedLg: { color: "#9eb0cf" },
  muted: { color: "#9eb0cf" },
  tinyMuted: { color: "#7f93b6" },
  label: { color: "#9eb0cf" },
  splashRoot: { backgroundColor: "#0b1020" },
  splashGlass: { backgroundColor: "#19213a", borderColor: "#2f3e63" },
  splashOrb: { backgroundColor: "#0a84ff" },
  splashTitle: { color: "#fbfdff" },
  splashSubtitle: { color: "#9eb0cf" },
  splashLoaderText: { color: "#c8d5f1" },
  splashDot: { backgroundColor: "#5b6b88" },
  splashDotActive: { backgroundColor: "#30d158" },

  heroCard: { backgroundColor: "#19213a", borderColor: "#2f3e63" },
  heroEyebrow: { color: "#9eb0cf" },
  heroTitle: { color: "#fbfdff" },
  heroText: { color: "#c8d5f1" },
  heroStatItem: { backgroundColor: "#10182d", borderColor: "#3b4c72" },
  heroStatValue: { color: "#fbfdff" },
  heroStatLabel: { color: "#9eb0cf" },

  input: {
    backgroundColor: "#10182d",
    borderColor: "#3b4c72",
    color: "#f5f8ff",
  },
  imagePickerBox: { backgroundColor: "#10182d", borderColor: "#3b4c72" },
  imagePickerEmptyText: { color: "#c8d5f1" },

  chip: { backgroundColor: "#19213a", borderColor: "#2f3e63" },
  chipActive: { backgroundColor: "#0a84ff", borderColor: "#0a84ff" },
  chipText: { color: "#e7eeff" },

  startupCard: { backgroundColor: "rgba(25,33,58,0.94)", borderColor: "#2f3e63", shadowOpacity: 0.14 },
  formCard: { backgroundColor: "rgba(25,33,58,0.94)", borderColor: "#2f3e63", shadowOpacity: 0.14 },
  projectRow: { backgroundColor: "rgba(25,33,58,0.94)", borderColor: "#2f3e63", shadowOpacity: 0.14 },
  detailsHeader: { backgroundColor: "rgba(25,33,58,0.94)", borderColor: "#2f3e63", shadowOpacity: 0.14 },
  requestCard: { backgroundColor: "rgba(25,33,58,0.94)", borderColor: "#2f3e63", shadowOpacity: 0.14 },
  profileCard: { backgroundColor: "rgba(25,33,58,0.94)", borderColor: "#2f3e63", shadowOpacity: 0.14 },
  statItem: { backgroundColor: "rgba(25,33,58,0.94)", borderColor: "#2f3e63", shadowOpacity: 0.14 },
  progressTrack: { backgroundColor: "#2f3e63" },
  progressTrackLg: { backgroundColor: "#2f3e63" },
  receiptImage: { borderColor: "#3b4c72", backgroundColor: "#0f172a" },
  notifCard: { backgroundColor: "#19213a", borderColor: "#2f3e63" },
  teamRow: { backgroundColor: "#19213a", borderColor: "#2f3e63" },
  teamChatOther: { backgroundColor: "#10182d", borderColor: "#3b4c72" },
  teamChatName: { color: "#e7eeff" },
  teamChatTime: { color: "#7f93b6" },
  teamChatInputRow: { backgroundColor: "#10182d", borderColor: "#3b4c72" },
  teamChatInput: { color: "#f5f8ff" },
  card: { backgroundColor: "rgba(25,33,58,0.94)", borderColor: "#2f3e63", shadowOpacity: 0.14 },
  task: { backgroundColor: "#10182d", borderColor: "#3b4c72" },
  cardTitle: { color: "#fbfdff" },
  cardDesc: { color: "#c8d5f1" },

  detailTab: { backgroundColor: "#10182d", borderColor: "#3b4c72" },
  detailTabActive: { backgroundColor: "#0a84ff", borderColor: "#0a84ff" },
  detailTabText: { color: "#e7eeff" },
  adminTab: { backgroundColor: "#10182d", borderColor: "#3b4c72" },
  adminTabActive: { backgroundColor: "#0a84ff", borderColor: "#0a84ff" },
  adminTabText: { color: "#e7eeff" },

  badge_default: { backgroundColor: "#10182d", borderColor: "#3b4c72" },
  badge_active: { backgroundColor: "#0a84ff", borderColor: "#0a84ff" },
  badgeText_default: { color: "#e7eeff" },

  btn_secondary: { backgroundColor: "#10182d", borderColor: "#3b4c72" },
  btn_danger: { backgroundColor: "#3f1d2e", borderColor: "#be365f" },
  btn_ghost: { backgroundColor: "#22304f", borderColor: "#3b4c72" },
  btnTextSecondary: { color: "#f5f8ff" },

  bottomTabWrap: {
    backgroundColor: "rgba(16,24,44,0.92)",
    borderColor: "#3b4c72",
  },
  bottomTabItemActive: { backgroundColor: "#243a61" },
  bottomTabItemCreate: {
    backgroundColor: "#1f3660",
    borderColor: "#2f3e63",
  },
  bottomTabLabel: { color: "#9eb0cf" },
  bottomTabLabelActive: { color: "#64b5ff" },
  bottomTabBadge: { borderColor: "#0f172a", backgroundColor: "#0a84ff" },

  onboardingOverlay: { backgroundColor: "rgba(2,6,23,0.62)" },
  onboardingCard: { backgroundColor: "#19213a", borderColor: "#2f3e63" },
  onboardingIconWrap: { backgroundColor: "#22304f", borderColor: "#2f3e63" },
  onboardingSkipText: { color: "#9eb0cf" },
  onboardingTitle: { color: "#fbfdff" },
  onboardingText: { color: "#c8d5f1" },
  onboardingDot: { backgroundColor: "#5b6b88" },
  onboardingDotActive: { backgroundColor: "#30d158" },
  onboardingHint: { color: "#9eb0cf" },

  emptyIcon: { backgroundColor: "#22304f" },
  emptyIconText: { color: "#e7eeff" },
  emptyTitle: { color: "#fbfdff" },
  emptySubtitle: { color: "#9eb0cf" },

  aiFab: { backgroundColor: "#0a84ff", borderColor: "#3b4c72" },
  aiFabActive: { backgroundColor: "#ef4444" },
  authOverlay: { backgroundColor: "rgba(2,6,23,0.5)" },
  modalOverlay: { backgroundColor: "rgba(2,6,23,0.44)" },
  aiOverlay: { backgroundColor: "rgba(2,6,23,0.46)" },
  authCard: { backgroundColor: "rgba(15,23,42,0.95)", borderColor: "#2f3e63" },
  modalCard: { backgroundColor: "rgba(15,23,42,0.96)", borderColor: "#2f3e63" },
  aiCard: { backgroundColor: "rgba(16,24,45,0.97)", borderColor: "#2f3e63" },
  aiHeaderIcon: { backgroundColor: "#22304f", borderColor: "#2f3e63" },
  aiTitle: { color: "#fbfdff" },
  aiSubtitle: { color: "#9eb0cf" },
  aiCloseBtn: { backgroundColor: "#22304f", borderColor: "#3b4c72" },
  aiMessages: { borderColor: "#2f3e63", backgroundColor: "#10182d" },
  chatAi: { backgroundColor: "#10182d", borderColor: "#3b4c72" },
  aiInputRow: { backgroundColor: "#10182d", borderColor: "#3b4c72" },
  aiInput: { color: "#f5f8ff" },
  aiSendBtnDisabled: { backgroundColor: "#5b6b88" },
  chatText: { color: "#f5f8ff" },
});

const darkThemeStyles = Object.keys({ ...lightStyles, ...darkStyles }).reduce((acc, key) => {
  const hasLight = Object.prototype.hasOwnProperty.call(lightStyles, key);
  const hasDark = Object.prototype.hasOwnProperty.call(darkStyles, key);
  if (hasLight && hasDark) {
    acc[key] = [lightStyles[key], darkStyles[key]];
  } else if (hasLight) {
    acc[key] = lightStyles[key];
  } else {
    acc[key] = darkStyles[key];
  }
  return acc;
}, {});
let styles = lightStyles;