"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock3, Download, Home, Moon, MoreHorizontal, Plus, Settings, Sparkles, Trash2, UserRound, Volume2, X } from "lucide-react";
import { ACHIEVEMENTS } from "@/content/achievements";
import { EVENTS } from "@/content/events";
import { HERO_BY_NO, HEROES } from "@/content/heroes";
import { ITEMS } from "@/content/items";
import { QUESTS } from "@/content/quests";
import { REGIONS } from "@/content/regions";
import { CATEGORIES, TRAITS, TRAIT_NAMES, getCategory, type ActivityLog, type AppState, type CategoryDefinition, type Trait } from "@/lib/domain";
import { evaluateGrowth } from "@/lib/game/growth";
import { evaluateLogEvents } from "@/lib/game/events";
import { extractFeatures } from "@/lib/game/features";
import { visibleSettlements, settleDatesForLog, ensureLocalSettlements, settleLocalDay } from "@/lib/game/settlement";
import { characterLevel, calculateDayXp } from "@/lib/game/xp";
import { localDateKey, localClock, localDateTimeToInstant, sleepAttributedDate, splitIntervalByLocalDate, formatDate, addDateDays } from "@/lib/game/time";
import { clearOfflineWrites, countOfflineWrites, createInitialState, deleteLocalAccount, exportCsv, exportJson, listOfflineWrites, loadState, persistState, queueOfflineWrite } from "@/lib/storage";
import { validateActivityLog, validateActivityMetrics } from "@/lib/validation";
import { finishSignOut, startGitHubSignIn } from "@/app/actions";
import type { AuthenticatedUser } from "@/lib/auth/server-session";

type Tab = "home" | "chronicle" | "codex" | "adventurer";
type Modal = "log" | "settings" | "custom" | "event" | "settlement" | "hero" | null;
type DetailFields = Record<string, string | boolean>;
type SyncConflict = { id: string; local: ActivityLog; server: ActivityLog; canKeepLocal: boolean };
type SyncSnapshot = {
  logs: ActivityLog[];
  categories: CategoryDefinition[];
  pins: string[];
  favorites?: AppState["favorites"];
  account: {
    profile: { displayName: string; timezone: string; avatarId: number; titleId: string; createdAt: string };
    settings: AppState["settings"];
  };
};

const avatarOptions = ["🧙🏻", "🧝🏻‍♀️", "🧑🏻‍🚀", "🧑🏻‍🎨", "🧑🏻‍🌾", "🧑🏻‍🍳"];
const zones = ["Asia/Seoul", "Asia/Tokyo", "Asia/Singapore", "America/Los_Angeles", "America/New_York", "Europe/London", "Europe/Paris", "Australia/Sydney", "UTC"];
const todayKey = (zone: string) => localDateKey(new Date(), zone);
const currentClock = (zone: string) => localClock(new Date(), zone);
const shortNumber = (value: number) => new Intl.NumberFormat("ko-KR").format(Math.round(value));
const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);

function greeting(hour: number): string {
  if (hour < 5) return "깊은 밤에도 당신의 시간이 흐르고 있어요";
  if (hour < 11) return "고요한 아침, 첫 페이지를 열어 보세요";
  if (hour < 17) return "오늘의 빛을 차곡차곡 모으는 중이에요";
  if (hour < 21) return "저녁의 모험이 천천히 저물어 가요";
  return "별이 떠오르는 시간, 수고 많았어요";
}

function saveDownload(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function readApiJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload as T;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sameActivityLog(left: ActivityLog, right: ActivityLog): boolean {
  return stableJson({ ...left, version: 0 }) === stableJson({ ...right, version: 0 });
}

function detailTitle(log: ActivityLog): string {
  const customName = String(log.details.project ?? log.details.subject ?? log.details.book ?? "");
  return customName && customName !== log.typeKey ? `${log.typeKey} · ${customName}` : log.typeKey;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

function timeInputFor(iso: string, zone: string): string {
  return localClock(new Date(iso), zone);
}

function getDateMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function GameApp({ initialViewer, cloudConfigured }: { initialViewer: AuthenticatedUser | null; cloudConfigured: boolean }) {
  const [state, setState] = useState<AppState | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncConflicts, setSyncConflicts] = useState<SyncConflict[]>([]);
  const [introComplete, setIntroComplete] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [chronicleSection, setChronicleSection] = useState<"calendar"|"timeline"|"archive">("calendar");
  const [codexSection, setCodexSection] = useState<"heroes"|"events"|"items"|"regions">("heroes");
  const [modal, setModal] = useState<Modal>(null);
  const [orbOpen, setOrbOpen] = useState(false);
  const [orbPage, setOrbPage] = useState(0);
  const [category, setCategory] = useState<CategoryDefinition | null>(null);
  const [activeLog, setActiveLog] = useState<ActivityLog | null>(null);
  const [activeHeroNo, setActiveHeroNo] = useState(1);
  const [selectedDate, setSelectedDate] = useState("");
  const [month, setMonth] = useState("");
  const [toast, setToast] = useState("");
  const [showMoreAdventure, setShowMoreAdventure] = useState<"quests" | "map" | "items" | "achievements">("quests");
  const [showRules, setShowRules] = useState(false);
  const [clockTick, setClockTick] = useState<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioShouldPlayRef = useRef(false);
  const syncActionRef = useRef<() => void>(() => {});
  const activeSleep = state?.logs.find((log) => !log.deletedAt && log.categoryKey === "sleep" && log.status === "in_progress");

  useEffect(() => {
    let alive = true;
    void loadState().then((stored) => {
      if (!alive) return;
      const settled = ensureLocalSettlements(stored);
      const date = todayKey(settled.profile.timezone);
      setSelectedDate(date);
      setMonth(date.slice(0, 7));
      setState(settled);
      setIntroComplete(Boolean(settled.profile.displayName && settled.settings.skipTitle));
      if (settled !== stored) void persistState(settled);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    void countOfflineWrites().then(setPendingWrites);
  }, []);

  useEffect(() => {
    if (!initialViewer || pendingWrites === 0 || syncConflicts.length > 0) return;
    const resumeSync = () => {
      if (navigator.onLine) syncActionRef.current();
    };
    window.addEventListener("online", resumeSync);
    if (navigator.onLine) window.setTimeout(resumeSync, 700);
    return () => window.removeEventListener("online", resumeSync);
  }, [initialViewer, pendingWrites, syncConflicts.length]);

  useEffect(() => {
    if (!state) return;
    void persistState(state);
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => () => {
    if (audioTimerRef.current) clearInterval(audioTimerRef.current);
    void audioRef.current?.close();
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      const context = audioRef.current;
      if (!context || !audioShouldPlayRef.current) return;
      if (document.visibilityState === "hidden") void context.suspend();
      else if (state?.settings.bgmEnabled && !activeSleep) void context.resume();
    }
    document.addEventListener("visibilitychange",onVisibilityChange);
    return () => document.removeEventListener("visibilitychange",onVisibilityChange);
  },[activeSleep,state?.settings.bgmEnabled]);

  useEffect(() => {
    if(!activeSleep)return;
    const tick=()=>setClockTick(Date.now());
    const firstTick=setTimeout(tick,1);
    const timer=setInterval(tick,60_000);
    return ()=>{clearTimeout(firstTick);clearInterval(timer);};
  },[activeSleep]);

  const categories = useMemo(() => [...CATEGORIES, ...(state?.customCategories ?? [])], [state?.customCategories]);
  const recentSettlements = useMemo(() => state ? visibleSettlements(state).slice(0, 2) : [], [state]);
  const currentDate = state ? todayKey(state.profile.timezone) : "";
  const activeDayLogs = state?.logs.filter((log) => !log.deletedAt && log.status === "completed" && log.attributedDate === currentDate) ?? [];
  const todayXp = state ? calculateDayXp(state.logs, currentDate, state.customCategories).total : 0;
  const totalMinutes = activeDayLogs.reduce((sum, log) => sum + log.durationMin, 0);
  const currentHour = state ? Number(currentClock(state.profile.timezone).slice(0, 2)) : 12;

  function queueLocalWrite(id: string, payload: unknown) {
    void queueOfflineWrite(id, payload).then(async () => setPendingWrites(await countOfflineWrites())).catch(() => {
      setSyncMessage("이 기기에서 동기화 대기 항목을 저장하지 못했어요. 기록은 기본 저장소에 보관했습니다.");
    });
  }

  function startMusic(enabled: boolean, volume: number) {
    if (!enabled || volume <= 0) return;
    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;
      if (!audioRef.current || audioRef.current.state === "closed") audioRef.current = new AudioContextConstructor();
      const context = audioRef.current;
      void context.resume();
      audioShouldPlayRef.current = true;
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      const playChord = () => {
        const now = context.currentTime;
        const frequencies = currentHour >= 19 || currentHour < 6 ? [174.61, 261.63, 349.23] : [196, 293.66, 392];
        frequencies.forEach((frequency, index) => {
          const osc = context.createOscillator();
          const gain = context.createGain();
          osc.type = index === 1 ? "sine" : "triangle";
          osc.frequency.value = frequency;
          osc.detune.value = index * 3 - 3;
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(Math.max(.0001, volume * .018), now + 2.2);
          gain.gain.linearRampToValueAtTime(.0001, now + 7.5);
          osc.connect(gain).connect(context.destination);
          osc.start(now);
          osc.stop(now + 7.6);
        });
      };
      playChord();
      audioTimerRef.current = setInterval(playChord, 7600);
    } catch {
      setToast("이 브라우저에서는 배경 음악을 시작할 수 없어요.");
    }
  }

  function updateSettings(patch: Partial<AppState["settings"]>) {
    if (!state) return;
    const settings = { ...state.settings, ...patch };
    setState({ ...state, settings, profile: { ...state.profile, timezone: settings.timezone } });
    queueLocalWrite("account-settings", { profile: state.profile, settings });
    if (patch.bgmEnabled !== undefined) {
      if (patch.bgmEnabled) startMusic(true, settings.bgmVolume);
      else if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null; audioShouldPlayRef.current=false; }
    }
    if (patch.bgmVolume !== undefined && settings.bgmEnabled) startMusic(true, settings.bgmVolume);
  }

  function openLogger(nextCategory: CategoryDefinition, log: ActivityLog | null = null) {
    setOrbOpen(false);
    setCategory(nextCategory);
    setActiveLog(log);
    setModal("log");
  }

  function startSleep() {
    if (!state || activeSleep) return;
    const now = new Date();
    const date = todayKey(state.profile.timezone);
    const hour = Number(localClock(now, state.profile.timezone).slice(0, 2));
    const type = hour >= 10 && hour < 18 ? "nap" : "night";
    const sleep: ActivityLog = { id: crypto.randomUUID(), categoryKey: "sleep", typeKey: type === "nap" ? "낮잠" : "밤잠", status: "in_progress", startedAt: now.toISOString(), endedAt: null, durationMin: 0, attributedDate: date, mood: null, details: { sleepType: type }, note: "", source: "timer", version: 1, deletedAt: null };
    setClockTick(now.getTime());
    setState({ ...state, logs: [...state.logs, sleep] });
    queueLocalWrite(`log:${sleep.id}`, sleep);
    if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null; audioShouldPlayRef.current=false;void audioRef.current?.suspend(); }
    setToast(type === "nap" ? "낮잠 기록을 시작했어요. 일어나면 기상 버튼을 눌러 주세요." : "좋은 꿈 꾸세요. 일어나면 기상 버튼을 눌러 주세요.");
  }

  function wakeFromSleep() {
    if (!state || !activeSleep) return;
    const now = new Date();
    const durationMin = Math.max(1, Math.round((now.getTime() - new Date(activeSleep.startedAt).getTime()) / 60_000));
    const hour = Number(localClock(new Date(activeSleep.startedAt), state.profile.timezone).slice(0, 2));
    const suggestedType = hour >= 10 && hour < 18 && durationMin < 180 ? "nap" : String(activeSleep.details.sleepType ?? "night");
    const completed = { ...activeSleep, status: "completed" as const, endedAt: now.toISOString(), durationMin, typeKey: suggestedType === "nap" ? "낮잠" : activeSleep.typeKey, details: { ...activeSleep.details, sleepType: suggestedType }, version: activeSleep.version + 1 };
    const category = getCategory("sleep", state.customCategories);
    if (category) openLogger(category, completed);
  }

  function saveLog(log: ActivityLog) {
    if (!state) return;
    const priorLog = state.logs.find((item) => item.id === log.id);
    const withoutOld = state.logs.filter((item) => item.id !== log.id);
    let next: AppState = { ...state, logs: [...withoutOld, log].sort((a, b) => a.startedAt.localeCompare(b.startedAt)) };
    const currentCategory = getCategory(log.categoryKey, next.customCategories);
    const favoriteValue = String(log.details.subject ?? log.details.project ?? log.details.book ?? log.details.menu ?? "").trim();
    if (favoriteValue && currentCategory) {
      const kind = log.details.subject ? "subject" : log.details.project ? "project" : log.details.book ? "book" : "menu";
      const existing = next.favorites.find((favorite) => favorite.kind === kind && favorite.value === favoriteValue);
      next = { ...next, favorites: existing
        ? next.favorites.map((favorite) => favorite === existing ? { ...favorite, useCount: favorite.useCount + 1, lastUsedAt: log.startedAt } : favorite)
        : [...next.favorites, { kind, value: favoriteValue, useCount: 1, lastUsedAt: log.startedAt }] };
    }
    next = evaluateGrowth(next, log);
    if(!priorLog||priorLog.status!=="completed")next = (awaitEvents(next, log));
    const impacts = new Set([...affectedDates(priorLog, next.profile.timezone), ...affectedDates(log, next.profile.timezone)]);
    const wasHistorical = [...impacts].some((date) => date < todayKey(next.profile.timezone));
    if(wasHistorical)setSelectedDate([...impacts].sort().at(-1)??log.attributedDate);
    for(const date of impacts) next = settleLocalDay(next,date);
    for(const date of new Set([priorLog?.attributedDate,log.attributedDate].filter((item):item is string=>Boolean(item)))) next = recomputeDateXp(next,date);
    const newEvents = next.events.filter((event) => event.triggerLogId === log.id && !state.events.some((oldEvent) => oldEvent.id === event.id && oldEvent.date === event.date));
    setState(next);
    queueLocalWrite(`log:${log.id}`, log);
    playSaveCue(next.settings.sfxEnabled,next.settings.sfxVolume);
    setModal(null);
    setActiveLog(null);
    setToast(wasHistorical ? "기록을 저장하고 지난 모험일지를 다시 계산했어요." : "오늘의 기록을 저장했어요. 오늘은 아직 결산 전이에요.");
    if (newEvents.length) setTimeout(() => setModal("event"), 150);
    else if (wasHistorical) setTimeout(() => setModal("settlement"), 150);
  }

  function playSaveCue(enabled:boolean,volume:number) {
    if(!enabled||volume<=0)return;
    try {
      const AudioContextConstructor=window.AudioContext;
      if(!AudioContextConstructor)return;
      if(!audioRef.current||audioRef.current.state==="closed")audioRef.current=new AudioContextConstructor();
      const context=audioRef.current;void context.resume();
      const oscillator=context.createOscillator();const gain=context.createGain();const now=context.currentTime;
      oscillator.type="sine";oscillator.frequency.setValueAtTime(660,now);oscillator.frequency.exponentialRampToValueAtTime(990,now+.11);
      gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume*.07),now+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+.2);
      oscillator.connect(gain).connect(context.destination);oscillator.start(now);oscillator.stop(now+.21);
    } catch { /* Audio is optional and the saved record remains authoritative. */ }
  }

  function deleteLog(log: ActivityLog) {
    if (!state) return;
    const deletedAt = new Date().toISOString();
    const nextLogs = state.logs.map((item) => item.id === log.id ? { ...item, deletedAt, version: item.version + 1 } : item);
    const deletedLog = nextLogs.find((item) => item.id === log.id);
    let next = { ...state, logs: nextLogs };
    next = recomputeDateXp(next, log.attributedDate);
    next = settleDatesForLog(next, { ...log, deletedAt });
    setState(next);
    if (deletedLog) queueLocalWrite(`log:${deletedLog.id}`, deletedLog);
    setModal(null);
    setToast("기록을 휴지통으로 옮겼어요.");
  }

  function addCustomCategory(name: string, group: CategoryDefinition["group"], primary: Trait, secondary: Trait, icon: string, color: string, metricSchemaKey: NonNullable<CategoryDefinition["metricSchemaKey"]>, tag: string) {
    if (!state || !name.trim()) return;
    const key = `custom-${crypto.randomUUID()}`;
    const nextCategory: CategoryDefinition = { key, name: name.trim(), icon, color, group, primary, secondary, types: [name.trim()], isCustom: true, tag: tag.trim() || "custom", metricSchemaKey };
    setState({ ...state, customCategories: [...state.customCategories, nextCategory], pins: [...state.pins, key] });
    queueLocalWrite(`category:${key}`, nextCategory);
    queueLocalWrite("account-pins", [...state.pins, key]);
    setModal(null);
    openLogger(nextCategory);
  }

  function download(kind: "json" | "csv") {
    if (!state) return;
    const text = kind === "json" ? exportJson(state) : exportCsv(state);
    saveDownload(`daily-daily-${todayKey(state.profile.timezone)}.${kind}`, text, kind === "json" ? "application/json" : "text/csv;charset=utf-8");
  }

  async function resetAccount() {
    const confirmed = window.confirm("이 기기의 데일리 데일리 기록과 설정을 모두 삭제할까요? 내보내기로 보관한 파일은 삭제되지 않습니다.");
    if (!confirmed) return;
    await deleteLocalAccount();
    const fresh = createInitialState(state?.settings.timezone);
    setState(fresh);
    setTab("home");
    setModal(null);
    setToast("이 기기의 기록을 모두 삭제했어요.");
  }

  function setName(name: string, avatar: number) {
    if (!state) return;
    setState({ ...state, profile: { ...state.profile, displayName: name.trim(), avatarId: avatar } });
    queueLocalWrite("account-profile", { ...state.profile, displayName: name.trim(), avatarId: avatar });
  }

  function beginAdventure(name:string,avatar:number,bgmEnabled:boolean) {
    if(!state)return;
    setState({...state,profile:{...state.profile,displayName:name.trim(),avatarId:avatar},settings:{...state.settings,bgmEnabled}});
    queueLocalWrite("account-profile", { ...state.profile, displayName: name.trim(), avatarId: avatar });
    queueLocalWrite("account-settings", { ...state.settings, bgmEnabled });
    setIntroComplete(true);
    startMusic(bgmEnabled,state.settings.bgmVolume);
  }

  async function syncNow() {
    if (!state || !initialViewer || !cloudConfigured || syncBusy) {
      setSyncMessage(!initialViewer ? "GitHub 계정을 연결하면 동기화할 수 있어요." : "동기화 서버 설정을 확인해 주세요.");
      return;
    }
    setSyncBusy(true);
    setSyncMessage("기록과 설정을 안전하게 맞추고 있어요…");
    try {
      let snapshot = await readApiJson<SyncSnapshot>(await fetch("/api/sync", { cache: "no-store" }));
      const cloudAccountIsEstablished = Date.parse(snapshot.account.profile.createdAt) + 60_000 < Date.parse(state.profile.createdAt);
      for (const custom of state.customCategories) {
        await readApiJson(await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: custom.key, name: custom.name, icon: custom.icon, color: custom.color, group: custom.group,
            primary: custom.primary, secondary: custom.secondary, typeNames: custom.types, metricSchemaKey: custom.metricSchemaKey ?? "duration", tag: custom.tag ?? "custom",
          }),
        }));
      }
      if (!cloudAccountIsEstablished) {
        await readApiJson(await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: state.profile.displayName, avatarId: state.profile.avatarId, titleId: state.profile.titleId,
            timezone: state.settings.timezone, bgmEnabled: state.settings.bgmEnabled, bgmVolume: state.settings.bgmVolume,
            sfxEnabled: state.settings.sfxEnabled, sfxVolume: state.settings.sfxVolume, skipTitle: state.settings.skipTitle,
            reducedEffects: state.settings.reducedEffects, eventEffects: state.settings.eventEffects,
          }),
        }));
      }
      const pins = state.pins.length ? state.pins : snapshot.pins;
      if (state.pins.length) {
        await readApiJson(await fetch("/api/pins", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys: state.pins }),
        }));
      }
      snapshot = await readApiJson<SyncSnapshot>(await fetch("/api/sync", { cache: "no-store" }));

      const remoteById = new Map(snapshot.logs.map((log) => [log.id, log]));
      const nextById = new Map(state.logs.map((log) => [log.id, log]));
      const conflicts = new Map<string, SyncConflict>();
      const uploads: ActivityLog[] = [];
      for (const remote of snapshot.logs) {
        const local = nextById.get(remote.id);
        if (!local) { nextById.set(remote.id, remote); continue; }
        if (local.version < remote.version) { nextById.set(remote.id, remote); continue; }
        if (local.version === remote.version) {
          if (!sameActivityLog(local, remote)) conflicts.set(local.id, { id: local.id, local, server: remote, canKeepLocal: !remote.deletedAt });
          else nextById.set(remote.id, remote);
          continue;
        }
        if (remote.deletedAt && local.deletedAt) { nextById.set(remote.id, remote); continue; }
        if (remote.deletedAt && !local.deletedAt) {
          conflicts.set(local.id, { id: local.id, local, server: remote, canKeepLocal: false });
          continue;
        }
        if (local.version === remote.version + 1) uploads.push(local);
        else conflicts.set(local.id, { id: local.id, local, server: remote, canKeepLocal: !remote.deletedAt });
      }
      for (const local of state.logs) {
        if (remoteById.has(local.id) || local.deletedAt) continue;
        uploads.push(local);
      }

      const syncedIds = new Set<string>();
      const serverAfter = new Map(snapshot.logs.map((log) => [log.id, log]));
      for (let offset = 0; offset < uploads.length; offset += 100) {
        const batch = uploads.slice(offset, offset + 100);
        const result = await readApiJson<{ synced: string[]; conflicts: Array<{ id: string; server: ActivityLog }>; logs: ActivityLog[] }>(await fetch("/api/sync", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logs: batch }),
        }));
        result.synced.forEach((id) => syncedIds.add(id));
        result.logs.forEach((log) => serverAfter.set(log.id, log));
        for (const conflict of result.conflicts) {
          const local = nextById.get(conflict.id);
          if (local) conflicts.set(conflict.id, { id: conflict.id, local, server: conflict.server, canKeepLocal: !conflict.server.deletedAt });
        }
      }
      for (const [id, server] of serverAfter) {
        const local = nextById.get(id);
        if (!local || syncedIds.has(id) || local.version < server.version) nextById.set(id, server);
      }
      for (const conflict of conflicts.values()) nextById.set(conflict.id, conflict.local);

      const remoteCustom = snapshot.categories.filter((item) => item.isCustom);
      const categoriesByKey = new Map([...remoteCustom, ...state.customCategories].map((item) => [item.key, item]));
      const finalCategories = [...categoriesByKey.values()];
      const nextState: AppState = {
        ...state,
        profile: cloudAccountIsEstablished ? {
          ...state.profile,
          displayName: snapshot.account.profile.displayName || state.profile.displayName,
          avatarId: snapshot.account.profile.avatarId,
          titleId: snapshot.account.profile.titleId,
          timezone: snapshot.account.profile.timezone,
        } : state.profile,
        settings: cloudAccountIsEstablished ? { ...state.settings, ...snapshot.account.settings } : state.settings,
        logs: [...nextById.values()].sort((left, right) => left.startedAt.localeCompare(right.startedAt)),
        customCategories: finalCategories,
        pins,
        favorites: snapshot.favorites?.map((favorite) => ({ ...favorite, lastUsedAt: String(favorite.lastUsedAt) })) ?? state.favorites,
      };
      setState(ensureLocalSettlements(nextState));
      setSyncConflicts([...conflicts.values()]);
      const outbox = await listOfflineWrites();
      const unresolved = new Set([...conflicts.keys()].map((id) => `log:${id}`));
      await clearOfflineWrites(outbox.filter((entry) => !unresolved.has(entry.id)).map((entry) => entry.id));
      setPendingWrites(await countOfflineWrites());
      setSyncMessage(conflicts.size ? `${conflicts.size}개 기록에 다른 기기의 수정이 있어 선택이 필요해요.` : `${syncedIds.size}개 기록을 동기화했어요.`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "동기화하지 못했어요. 네트워크와 계정 설정을 확인해 주세요.");
    } finally {
      setSyncBusy(false);
    }
  }

  useEffect(() => {
    syncActionRef.current = () => { void syncNow(); };
  });

  async function resolveSyncConflicts(choice: "local" | "server") {
    if (!state || !syncConflicts.length) return;
    try {
      const nextById = new Map(state.logs.map((log) => [log.id, log]));
      let remaining: SyncConflict[] = [];
      if (choice === "server") {
        for (const conflict of syncConflicts) nextById.set(conflict.id, conflict.server);
      } else {
        remaining = syncConflicts.filter((item) => !item.canKeepLocal);
        const replacements = syncConflicts.filter((conflict) => conflict.canKeepLocal).map((conflict) => ({
          ...conflict.local,
          version: conflict.server.version + 1,
        }));
        const response = await readApiJson<{ synced: string[]; conflicts: Array<{ id: string; server: ActivityLog }>; logs: ActivityLog[] }>(await fetch("/api/sync", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logs: replacements }),
        }));
        const servers = new Map(response.logs.map((log) => [log.id, log]));
        for (const id of response.synced) {
          const server = servers.get(id);
          if (server) nextById.set(id, server);
        }
        for (const conflict of response.conflicts) {
          const original = syncConflicts.find((item) => item.id === conflict.id);
          if (!original) continue;
          remaining = [...remaining.filter((item) => item.id !== conflict.id), { ...original, server: conflict.server, canKeepLocal: !conflict.server.deletedAt }];
          nextById.set(conflict.id, original.local);
        }
      }
      for (const conflict of remaining) nextById.set(conflict.id, conflict.local);
      setState({ ...state, logs: [...nextById.values()].sort((left, right) => left.startedAt.localeCompare(right.startedAt)) });
      setSyncConflicts(remaining);
      const keep = new Set(remaining.map((item) => `log:${item.id}`));
      await clearOfflineWrites(syncConflicts.filter((item) => !keep.has(`log:${item.id}`)).map((item) => `log:${item.id}`));
      setPendingWrites(await countOfflineWrites());
      setSyncMessage(remaining.length ? "일부 서버 기록은 복구할 수 없어 계정 기록을 유지했어요." : "충돌한 기록을 선택한 내용으로 정리했어요.");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "충돌을 해결하지 못했어요. 다시 동기화해 주세요.");
    }
  }

  async function deleteCloudAccount() {
    if (!window.confirm("이 계정의 서버 기록, 설정, 도감 데이터를 영구 삭제할까요? 내보낸 파일은 삭제되지 않습니다.")) return;
    try {
      await readApiJson(await fetch("/api/profile", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }),
      }));
      await deleteLocalAccount();
      const fresh = createInitialState(state?.settings.timezone);
      setState(fresh);
      setSyncConflicts([]);
      await finishSignOut();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "계정 데이터를 삭제하지 못했어요.");
    }
  }

  if (!state) return <main className="game-shell"><section className="game-frame"><div className="topline"><div className="wordmark"><span className="wordmark-mark">✦</span> DAILY DAILY</div></div><div className="empty-state">별빛을 모으고 있어요…</div></section></main>;
  if (!introComplete) return <TitleScreen state={state} onStart={beginAdventure} />;

  const sortedCategories = [...categories].sort((a, b) => {
    const pinDelta = Number(state.pins.includes(b.key)) - Number(state.pins.includes(a.key));
    if (pinDelta) return pinDelta;
    const uses = (key: string) => state.logs.filter((log) => !log.deletedAt && log.categoryKey === key && log.attributedDate >= addDateDays(currentDate, -14)).length;
    return uses(b.key) - uses(a.key);
  });
  const pageCount = Math.ceil(sortedCategories.length / 8);
  const orbPageItems = sortedCategories.slice(orbPage * 8, orbPage * 8 + 8);
  const visibleDays = getMonthDays(month);
  const selectedLogs = state.logs.filter((log) => !log.deletedAt && log.attributedDate === selectedDate).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const selectedSettlement = visibleSettlements(state).find((settlement) => settlement.date === selectedDate);
  const settlementForPopup = visibleSettlements(state).find((settlement) => settlement.date < currentDate);
  const activeEvents = state.events.filter((event) => !event.seen).slice(-3);

  return <main className="game-shell"><section className="game-frame">
    <header className="topline">
      <div className="wordmark"><span className="wordmark-mark">✦</span> DAILY DAILY</div>
      <div className="header-actions">
        <span className="top-caption"><span className="badge">오프라인 저장</span></span>
        <button className="icon-btn" aria-label="설정 열기" onClick={() => setModal("settings")}><Settings size={16} /></button>
      </div>
    </header>

    {tab === "home" && <div>
      <div className="screen-heading"><div><div className="eyebrow">ASTRAEA • {formatDate(currentDate, state.profile.timezone, { month: "long", day: "numeric", weekday: "long" })}</div><h1>안녕하세요, {state.profile.displayName}님</h1><div className="subtle">{greeting(currentHour)}</div></div><span className="badge">Lv. {characterLevel(state.traits)} 모험가</span></div>
      <div className={`hero-stage ${activeSleep?"sleeping-world":""}`}>
        <div className="stage-orbit" aria-hidden="true" />
        <div className="hero-figure"><div className="hero-halo" /><div className="hero-sprite" aria-label="모험가 캐릭터">{avatarOptions[state.profile.avatarId] ?? avatarOptions[0]}</div>{state.inventory["moti-pet"] ? <span className="moti" aria-label="아기 용 모치">🐉</span> : null}</div>
        <div className="stage-caption"><span><strong>{state.profile.titleId === "chronicler" ? "새벽의 기록자" : state.profile.titleId}</strong> · 에오스 마을</span><span>{activeSleep?"☾ 잠든 세계":currentHour >= 19 || currentHour < 6 ? "☾ 별이 뜬 밤" : "☼ 햇살이 머무는 낮"}</span></div>
      </div>
      {activeSleep?<div className="sleep-banner"><div><strong>잠든 세계</strong><span>{Math.floor(Math.max(0,(clockTick??new Date(activeSleep.startedAt).getTime())-new Date(activeSleep.startedAt).getTime())/3_600_000)}시간째 여정의 쉼표를 기록하고 있어요.</span></div><button className="primary-button" onClick={wakeFromSleep}>{clockTick!==null&&clockTick-new Date(activeSleep.startedAt).getTime()>=16*3_600_000?"기상 시각 입력":"기상"}</button></div>:<button className="sleep-start" onClick={startSleep}><Moon size={15}/> 잠자기 시작 <span>밤잠·낮잠 자동 추천</span></button>}
      <div className="summary-row">
        <div className="surface"><div className="surface-title"><span>오늘의 여정</span><Clock3 size={14} /></div><div className="stat-value">{formatMinutes(totalMinutes)}</div><div className="stat-label">{activeDayLogs.length}개의 기록 · 결산은 자정 이후</div></div>
        <div className="surface"><div className="surface-title"><span>오늘 얻은 경험치</span><Sparkles size={14} /></div><div className="stat-value">{shortNumber(todayXp)} <span style={{fontSize:11,color:"#c5b889"}}>XP</span></div><div className="stat-label">기록한 행동이 여섯 특성으로 이어져요</div></div>
      </div>
      <div className="trait-grid">{TRAITS.map((trait) => <TraitCard key={trait} trait={trait} xp={state.traits[trait].xp} level={state.traits[trait].level} />)}</div>
      <div className="section-head"><h2>오늘의 발자국</h2><button onClick={() => { setTab("chronicle"); setSelectedDate(currentDate); }}>연대기 보기 →</button></div>
      {activeDayLogs.length === 0 ? <div className="surface empty-state">작은 순간도 당신의 모험이에요.<br />아래의 + 를 눌러 첫 기록을 남겨 보세요.</div> : activeDayLogs.slice().sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,4).map((log) => <LogRow key={log.id} log={log} timezone={state.profile.timezone} category={getCategory(log.categoryKey, state.customCategories)} onEdit={() => openLogger(getCategory(log.categoryKey, state.customCategories)!, log)} onDelete={() => deleteLog(log)} />)}
      {activeEvents.map((event) => <button className="event-card" key={`${event.id}-${event.date}`} onClick={() => setModal("event")} style={{width:"100%",textAlign:"left",cursor:"pointer"}}><strong>{event.title}</strong><p>{event.body}</p></button>)}
      <div className="section-head"><h2>최근 결산</h2><button onClick={() => setTab("chronicle")}>모두 보기 →</button></div>
      {recentSettlements.length ? recentSettlements.map((settlement) => { const hero = HERO_BY_NO.get(settlement.heroNo); return <button className="surface" key={`${settlement.date}-${settlement.revision}`} onClick={() => { setSelectedDate(settlement.date); setTab("chronicle"); }} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",textAlign:"left",marginBottom:8,cursor:"pointer"}}><span><strong style={{fontSize:12}}>{formatDate(settlement.date, state.profile.timezone)}</strong><span className="subtle" style={{display:"block",marginTop:5}}>{hero?.name ?? "오늘의 용사"} · 발견한 하루</span></span><span style={{fontSize:23}}>✦</span></button>; }) : <div className="subtle" style={{padding:"0 3px"}}>첫 결산은 하루가 지난 뒤 열려요.</div>}
    </div>}

    {tab === "chronicle" && <div>
      <div className="screen-heading"><div><div className="eyebrow">YOUR CHRONICLE</div><h1>연대기</h1><div className="subtle">하루의 작은 장면들이 모여 나만의 이야기로 이어져요.</div></div><span className="badge">{state.settlements.filter((item)=>item.status==="final").length}개의 결산</span></div>
      <div className="segment-tabs" role="tablist" aria-label="연대기 보기 방식">{([["calendar","달력"],["timeline","연표"],["archive","보관함"]] as const).map(([key,label])=><button key={key} role="tab" aria-selected={chronicleSection===key} className={chronicleSection===key?"selected":""} onClick={()=>setChronicleSection(key)}>{label}</button>)}</div>
      {chronicleSection==="calendar"&&<>
      <div className="surface">
        <div className="section-head" style={{margin:"0 0 14px"}}><button aria-label="이전 달" onClick={() => setMonth(shiftMonth(month,-1))}><ChevronLeft size={17}/></button><h2>{formatMonth(month)}</h2><button aria-label="다음 달" onClick={() => setMonth(shiftMonth(month,1))}><ChevronRight size={17}/></button></div>
        <div className="day-grid">{["월","화","수","목","금","토","일"].map((day)=><div key={day} className="subtle" style={{textAlign:"center",fontSize:9,padding:"3px 0"}}>{day}</div>)}{visibleDays.map((date) => { if(date.startsWith("empty-"))return <div key={date} aria-hidden="true"/>;const hasLogs = state.logs.some((log)=>!log.deletedAt&&log.attributedDate===date); const hasSettlement = visibleSettlements(state).some((item)=>item.date===date); return <button key={date} className={`day-cell ${hasLogs||hasSettlement?"has-log":""} ${selectedDate===date?"selected":""}`} onClick={()=>setSelectedDate(date)}><span>{Number(date.slice(8))}</span>{hasSettlement?<span className="day-dot"/>:hasLogs?<span style={{fontSize:8}}>✦</span>:null}</button>; })}</div>
      </div>
      <div className="section-head"><h2>{selectedDate ? formatDate(selectedDate,state.profile.timezone) : "날짜를 선택하세요"}</h2>{selectedDate ? <button onClick={()=>{const cat=getCategory("study",state.customCategories);if(cat)openLogger(cat);}}>+ 기록 추가</button>:null}</div>
      {selectedSettlement ? <div className="event-card"><strong>✦ {HERO_BY_NO.get(selectedSettlement.heroNo)?.name} · {selectedSettlement.revision}번째 결산</strong><p>{selectedSettlement.narrative[1]} {selectedSettlement.narrative[2]}</p><button className="secondary-button" style={{marginTop:10}} onClick={()=>setModal("settlement")}>결산 카드 보기</button></div> : selectedDate < currentDate ? <div className="surface empty-state">이 날의 결산 기록은 아직 없어요. 활동 기록이 있으면 자동으로 만들어집니다.</div> : null}
      {selectedLogs.length ? selectedLogs.map((log)=><LogRow key={log.id} log={log} timezone={state.profile.timezone} category={getCategory(log.categoryKey,state.customCategories)} onEdit={()=>openLogger(getCategory(log.categoryKey,state.customCategories)!,log)} onDelete={()=>deleteLog(log)}/>) : <div className="subtle" style={{padding:"5px 2px"}}>이 날짜에 남긴 활동 기록이 없어요.</div>}
      {selectedSettlement ? <NarrativeCard settlement={selectedSettlement}/> : null}
      </>}
      {chronicleSection==="timeline"&&<div className="progress-list">{[...visibleSettlements(state).map((item)=>({date:item.date,title:HERO_BY_NO.get(item.heroNo)?.name??"하루 결산",body:item.narrative[1]??"하루를 모험으로 기록했어요.",kind:"settlement"})),...state.events.map((item)=>({date:item.date,title:item.title,body:item.body,kind:"event"})),...Object.entries(state.achievements).map(([id,date])=>({date,title:ACHIEVEMENTS.find((entry)=>entry.id===id)?.name??"업적 달성",body:"새로운 기록의 장을 열었습니다.",kind:"achievement"}))].sort((a,b)=>b.date.localeCompare(a.date)).map((item,index)=><button className="progress-item timeline-row" key={`${item.kind}-${item.date}-${index}`} onClick={()=>{setSelectedDate(item.date);setChronicleSection("calendar");}}><span className="badge">{formatDate(item.date,state.profile.timezone)}</span><strong>{item.title}</strong><p>{item.body}</p></button>)}</div>}
      {chronicleSection==="archive"&&<><div className="section-head"><h2>보관한 아이템</h2><span className="badge">{Object.values(state.inventory).reduce((sum,count)=>sum+count,0)}개</span></div>{ITEMS.filter((item)=>(state.inventory[item.id]??0)>0).map((item)=><div className="log-row" key={item.id}><div className="log-icon">{item.icon}</div><div className="log-copy"><strong>{item.name}</strong><span>{item.description}</span></div><span className="badge">×{state.inventory[item.id]}</span></div>)}<div className="section-head"><h2>만난 사건</h2><span className="badge">{state.events.length}개</span></div>{state.events.slice().reverse().map((event,index)=><div className="event-card" key={`${event.id}-${event.date}-${index}`}><strong>{event.title} <span className="badge">{event.rarity}</span></strong><p>{formatDate(event.date,state.profile.timezone)} · {event.body}</p></div>)}<div className="section-head"><h2>달성한 업적</h2></div>{Object.entries(state.achievements).map(([id,date])=><div className="log-row" key={id}><div className="log-icon">✦</div><div className="log-copy"><strong>{ACHIEVEMENTS.find((item)=>item.id===id)?.name??id}</strong><span>{formatDate(date,state.profile.timezone)}</span></div></div>)}</>}
    </div>}

    {tab === "codex" && <div>
      <div className="screen-heading"><div><div className="eyebrow">HERO CODEX</div><h1>용사 도감</h1><div className="subtle">당신의 생활에서 태어난 100가지 하루의 모습</div></div><span className="badge">{Object.keys(state.collection).length} / 100</span></div>
      <div className="segment-tabs" role="tablist" aria-label="도감 종류">{([["heroes","용사"],["events","이벤트"],["items","아이템"],["regions","지역·NPC"]] as const).map(([key,label])=><button key={key} role="tab" aria-selected={codexSection===key} className={codexSection===key?"selected":""} onClick={()=>setCodexSection(key)}>{label}</button>)}</div>
      {codexSection==="heroes"&&<>
      <div className="surface" style={{marginBottom:13}}><div className="surface-title"><span>발견한 용사</span><span>{Math.floor(Object.keys(state.collection).length/100*100)}%</span></div><div className="trait-track" style={{height:6,marginTop:11}}><div className="trait-fill" style={{width:`${Object.keys(state.collection).length}%`}}/></div><div className="stat-label" style={{marginTop:8}}>매일의 기록을 결산하면 그날의 용사를 만날 수 있어요.</div></div>
      <div className="hero-grid">{HEROES.map((hero) => { const discovered = Boolean(state.collection[hero.no]); return <button key={hero.no} className={`hero-card ${discovered?"":"locked"}`} onClick={()=>{setActiveHeroNo(hero.no);setModal("hero");}} aria-label={`${hero.no} ${discovered?hero.name:"미발견 용사"}`}><span>{discovered ? heroGlyph(hero.no) : "✦"}</span><strong>{discovered?hero.name:"미지의 용사"}</strong><small>{discovered?`#${String(hero.no).padStart(3,"0")} · ${state.collection[hero.no]?.count??1}회`:`#${String(hero.no).padStart(3,"0")}`}</small></button>; })}</div>
      <div className="section-head"><h2>최근 만난 용사</h2><button onClick={()=>setShowRules((value)=>!value)}>{showRules?"힌트 닫기":"판정 힌트"}</button></div>
      {showRules&&<div className="surface subtle">하루 결산은 자정 이후 열려요. 수면·식사·휴식도 소중한 생활 기록으로 계산되며, 수면이 짧은 날에는 일부 높은 희귀도 용사를 만나지 않도록 규칙이 적용됩니다.</div>}
      {recentSettlements.map((settlement)=>{const hero=HERO_BY_NO.get(settlement.heroNo);return <div className="log-row" key={settlement.date}><div className="log-icon">✦</div><div className="log-copy"><strong>{hero?.name}</strong><span>{formatDate(settlement.date,state.profile.timezone)} · {hero?.rarity}</span></div><span className="badge">발견</span></div>;})}
      </>}
      {codexSection==="events"&&<><div className="section-head"><h2>아스테리아의 사건</h2><span className="badge">{EVENTS.length}종</span></div><div className="progress-list">{EVENTS.map((event)=><div className="progress-item" key={event.id}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><strong>{event.title}</strong><span className="badge">{event.rarity}</span></div><p>{event.body[0]}</p><div className="stat-label">{event.npc}</div></div>)}</div></>}
      {codexSection==="items"&&<><div className="section-head"><h2>수집품</h2><span className="badge">{ITEMS.length}종</span></div><div className="progress-list">{ITEMS.map((item)=><div className="progress-item" key={item.id}><div style={{display:"flex",alignItems:"center",gap:9}}><span className="log-icon">{item.icon}</span><strong>{item.name}</strong><span className="badge">{state.inventory[item.id]??0}개</span></div><p>{item.description}</p></div>)}</div></>}
      {codexSection==="regions"&&<><div className="section-head"><h2>아스테리아의 지역과 NPC</h2><span className="badge">{state.regions.length} / {REGIONS.length}</span></div><div className="progress-list">{REGIONS.map((region)=><div className="progress-item" key={region.id}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><strong>{region.name}</strong><span className="badge">{state.regions.includes(region.id)?"개방":"잠김"}</span></div><p>{region.description}</p><div className="stat-label">안내자 · {region.npc}</div></div>)}</div></>}
    </div>}

    {tab === "adventurer" && <div>
      <div className="screen-heading"><div><div className="eyebrow">YOUR ADVENTURER</div><h1>모험가 기록</h1><div className="subtle">{state.profile.displayName} · {state.profile.titleId === "chronicler" ? "새벽의 기록자" : state.profile.titleId}</div></div><span style={{fontSize:34}}>{avatarOptions[state.profile.avatarId] ?? avatarOptions[0]}</span></div>
      <div className="trait-grid">{TRAITS.map((trait)=><TraitCard key={trait} trait={trait} xp={state.traits[trait].xp} level={state.traits[trait].level}/>)}</div>
      <div className="surface"><div className="surface-title"><span>여정의 기록</span><span className="badge">Lv. {characterLevel(state.traits)}</span></div><div className="summary-row" style={{marginTop:10}}><div><div className="stat-value" style={{fontSize:19}}>{state.logs.filter((log)=>!log.deletedAt).length}</div><div className="stat-label">남긴 발자국</div></div><div><div className="stat-value" style={{fontSize:19}}>{Object.keys(state.collection).length}</div><div className="stat-label">만난 용사</div></div></div><div className="stat-label" style={{marginTop:12}}>이번 모험의 내용은 이 기기에 비공개로 저장됩니다.</div></div>
      <div className="section-head"><h2>진행 중인 퀘스트</h2><button onClick={()=>setShowMoreAdventure(showMoreAdventure==="quests"?"achievements":"quests")}>모두 보기</button></div>
      <div className="progress-list">{QUESTS.map((quest)=>{const progress=state.quests[quest.id];const step=Math.min(progress?.step??0,quest.steps.length);const current=quest.steps[Math.min(step,quest.steps.length-1)];return <div className="progress-item" key={quest.id}><div style={{display:"flex",justifyContent:"space-between",gap:10}}><strong>{quest.name}</strong><span className="badge">{progress?.state==="done"?"완료":progress?.state==="expired"?"기한 만료":`${step}/${quest.steps.length}`}</span></div><p>{progress?.state==="done"?"약속을 지키고 보상을 받았어요.":current?`${quest.npc} · ${current.title} — ${current.description}`:`${quest.npc}의 이야기가 기록을 기다리고 있어요.`}</p><div className="trait-track"><div className="trait-fill" style={{width:`${step/quest.steps.length*100}%`}}/></div></div>;})}</div>
      <div className="section-head"><h2>아스테리아 지도</h2><button onClick={()=>setShowMoreAdventure(showMoreAdventure==="map"?"items":"map")}>지도 보기</button></div>
      <div className="surface"><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>{REGIONS.map((region)=>{const unlocked=state.regions.includes(region.id);return <div key={region.id} style={{padding:"10px 11px",borderRadius:12,background:unlocked?"rgba(142,187,166,.1)":"rgba(255,255,255,.025)",border:"1px solid var(--line)",opacity:unlocked?1:.62}}><div style={{fontSize:10,color:unlocked?"#d7d3b1":"#84909a"}}>{unlocked?"✦ 열림":"◇ 잠김"}</div><strong style={{display:"block",fontSize:10,marginTop:5}}>{region.name}</strong></div>;})}</div></div>
      <div className="section-head"><h2>업적과 보관함</h2><button onClick={()=>setShowMoreAdventure(showMoreAdventure==="items"?"achievements":"items")}>열기</button></div>
      {showMoreAdventure==="achievements"||showMoreAdventure==="quests"? <div className="progress-list">{ACHIEVEMENTS.map((achievement)=>{const unlocked=Boolean(state.achievements[achievement.id]);return <div key={achievement.id} className="progress-item"><strong>{unlocked||!achievement.secret?achievement.name:"???"}</strong><p>{unlocked||!achievement.secret?achievement.description:"비밀 업적 · 조건을 찾아보세요"}</p><div className="stat-label">{unlocked?`획득 · ${formatDate(state.achievements[achievement.id]!,state.profile.timezone)}`:`보상 ${achievement.rewardXp} XP`}</div></div>;})}</div>:<div className="progress-list">{ITEMS.filter((item)=>(state.inventory[item.id]??0)>0).length===0?<div className="surface empty-state">모험 보상이 이곳에 모여요. 첫 기록과 이벤트를 만나 보세요.</div>:ITEMS.filter((item)=>(state.inventory[item.id]??0)>0).map((item)=><div className="log-row" key={item.id}><div className="log-icon">{item.icon}</div><div className="log-copy"><strong>{item.name}</strong><span>{item.description}</span></div><span className="badge">×{state.inventory[item.id]}</span></div>)}</div>}
      <div className="section-head"><h2>모험 설정</h2><button onClick={()=>setModal("settings")}>열기</button></div>
    </div>}

    <nav className="bottom-nav" aria-label="주요 화면">
      <NavButton icon={<Home size={18}/>} label="홈" active={tab==="home"} onClick={()=>setTab("home")}/>
      <NavButton icon={<CalendarDays size={18}/>} label="연대기" active={tab==="chronicle"} onClick={()=>{setTab("chronicle");setSelectedDate(currentDate);}}/>
      <div className="nav-plus-wrap"><button className="nav-plus" aria-label="활동 기록 추가" onClick={()=>{setOrbPage(0);setOrbOpen(true);}}><Plus size={25}/></button></div>
      <NavButton icon={<BookOpen size={18}/>} label="도감" active={tab==="codex"} onClick={()=>setTab("codex")}/>
      <NavButton icon={<UserRound size={18}/>} label="모험가" active={tab==="adventurer"} onClick={()=>setTab("adventurer")}/>
    </nav>

    {orbOpen&&<><button className="orb-backdrop" aria-label="기록 메뉴 닫기" onClick={()=>setOrbOpen(false)}/><section className="orb-panel" aria-label="기록할 활동 선택"><div className="orb-header"><div><div className="eyebrow">CHOOSE YOUR FOOTPRINT</div><h2 style={{fontSize:18,margin:"5px 0 0",fontWeight:550}}>무엇을 기록할까요?</h2></div><button className="icon-btn" aria-label="닫기" onClick={()=>setOrbOpen(false)}><X size={16}/></button></div><div className="orb-grid">{orbPageItems.map((item)=><button className="orb-choice" key={item.key} onClick={()=>openLogger(item)}><span className="orb-ball">{item.icon}</span><span>{item.name}</span></button>)}{orbPage===pageCount-1&&<button className="orb-choice" onClick={()=>setModal("custom")}><span className="orb-ball">✚</span><span>새 행동 만들기</span></button>}</div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14}}><button className="secondary-button" onClick={()=>setOrbPage(Math.max(0,orbPage-1))} disabled={orbPage===0}>이전</button><span className="subtle">{orbPage+1} / {pageCount}</span><button className="secondary-button" onClick={()=>setOrbPage(Math.min(pageCount-1,orbPage+1))} disabled={orbPage>=pageCount-1}>더 보기 <MoreHorizontal size={14}/></button></div></section></>}

    {modal==="log"&&category&&<LogSheet category={category} state={state} initial={activeLog} onClose={()=>setModal(null)} onSave={saveLog} onDelete={activeLog?()=>deleteLog(activeLog):undefined}/>}
    {modal==="settings"&&<SettingsSheet state={state} viewer={initialViewer} cloudConfigured={cloudConfigured} pendingWrites={pendingWrites} syncBusy={syncBusy} syncMessage={syncMessage} conflictCount={syncConflicts.length} canKeepLocal={syncConflicts.length>0&&syncConflicts.every((item)=>item.canKeepLocal)} onSync={()=>void syncNow()} onResolveConflicts={(choice)=>void resolveSyncConflicts(choice)} onDeleteCloud={()=>void deleteCloudAccount()} onClose={()=>setModal(null)} onUpdate={updateSettings} onProfile={(name,avatar)=>setName(name,avatar)} onExport={download} onReset={()=>void resetAccount()}/>}
    {modal==="custom"&&<CustomCategorySheet onClose={()=>setModal(null)} onCreate={addCustomCategory}/>}
    {modal==="event"&&<EventSheet state={state} onClose={()=>{setState((prior)=>prior?{...prior,events:prior.events.map((event)=>({...event,seen:true}))}:prior);setModal(null);}}/>}
    {modal==="settlement"&&settlementForPopup&&<SettlementSheet state={state} settlement={selectedSettlement??settlementForPopup} onClose={()=>setModal(null)}/>}
    {modal==="hero"&&<HeroSheet state={state} heroNo={activeHeroNo} onClose={()=>setModal(null)}/>}
    {toast&&<div className="toast" role="status">{toast}</div>}
  </section></main>;

}

function awaitEvents(state: AppState, log: ActivityLog): AppState {
  const attributedDate = log.categoryKey === "sleep" ? sleepAttributedDate(log, state.profile.timezone) : log.attributedDate;
  const features = extractFeatures(state.logs, attributedDate, state.profile.timezone, state.events, state.profile.createdAt, state.customCategories);
  return evaluateLogEvents(state, log, features).state;
}

function recomputeDateXp(state: AppState, date: string): AppState {
  const result = calculateDayXp(state.logs, date, state.customCategories);
  const old = state.xpAwardsByDate[date] ?? {};
  const traits = { ...state.traits };
  for (const trait of TRAITS) {
    const delta = (result.byTrait[trait] ?? 0) - (old[trait] ?? 0);
    if (!delta) continue;
    if (delta > 0) {
      let left = delta;
      let level = traits[trait].level;
      let xp = traits[trait].xp;
      while (left > 0 && level < 99) {
        const need = Math.round(60 * Math.pow(level,1.5));
        const added = Math.min(left,need-xp);
        xp += added; left -= added;
        if (xp>=need) {level+=1;xp=0;}
      }
      traits[trait]={level,xp};
    } else traits[trait]={...traits[trait],xp:Math.max(0,traits[trait].xp+delta)};
  }
  const ledger = state.rewardLedger.find((entry)=>entry.sourceType==="log_xp"&&entry.sourceKey===date);
  return { ...state, traits, xpAwardsByDate:{...state.xpAwardsByDate,[date]:result.byTrait}, rewardLedger:ledger?state.rewardLedger.map((entry)=>entry===ledger?{...entry,xp:result.byTrait}:entry):[...state.rewardLedger,{sourceType:"log_xp",sourceKey:date,xp:result.byTrait,items:{},createdAt:new Date().toISOString()}] };
}

function affectedDates(log: ActivityLog | undefined, zone: string): string[] {
  if(!log)return[];
  if(log.categoryKey==="sleep")return [sleepAttributedDate(log,zone)];
  return log.endedAt?Object.keys(splitIntervalByLocalDate(log.startedAt,log.endedAt,zone)):[log.attributedDate];
}

function getMonthDays(month:string):string[] {
  if(!month)return[];
  const [year,mon]=month.split("-").map(Number);
  const first=new Date(year,mon-1,1);
  const start=(first.getDay()+6)%7;
  const count=new Date(year,mon,0).getDate();
  return [...Array(start).fill("").map((_,index)=>`empty-${index}`),...Array(count).fill("").map((_,index)=>`${month}-${String(index+1).padStart(2,"0")}`)];
}
function shiftMonth(month:string,delta:number):string { const [y,m]=month.split("-").map(Number);const d=new Date(y,m-1+delta,1);return getDateMonth(d); }
function formatMonth(month:string):string { const [y,m]=month.split("-").map(Number);return new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"long"}).format(new Date(y,m-1,15)); }
function heroGlyph(no:number):string { return ["🧙🏻","🛡️","🧝🏻","🧑🏻‍💻","🧘🏻","🌱","📚","⚒️","🦉","🌙"][no%10]??"✦"; }

function TraitCard({trait,xp,level}:{trait:Trait;xp:number;level:number}) {
  const needed=Math.round(60*Math.pow(level,1.5));
  return <div className="trait-card"><div className="trait-top"><span>{TRAIT_NAMES[trait]}</span><span className="trait-level">Lv. {level}</span></div><div className="trait-track"><div className="trait-fill" style={{width:`${Math.min(100,xp/needed*100)}%`}}/></div><div className="stat-label">{shortNumber(xp)} / {shortNumber(needed)} XP</div></div>;
}

function NavButton({icon,label,active,onClick}:{icon:React.ReactNode;label:string;active:boolean;onClick:()=>void}) {
  return <button className={`nav-button ${active?"active":""}`} onClick={onClick} aria-current={active?"page":undefined}><span className="nav-icon">{icon}</span><span>{label}</span></button>;
}

function LogRow({log,category,timezone,onEdit,onDelete}:{log:ActivityLog;category?:CategoryDefinition;timezone:string;onEdit:()=>void;onDelete:()=>void}) {
  return <div className="log-row"><div className="log-icon" style={{color:category?.color}}>{category?.icon??"✦"}</div><div className="log-copy"><strong>{detailTitle(log)}</strong><span>{category?.name??"생활"} · {timeInputFor(log.startedAt,timezone)} · {log.note||"오늘의 발자국"}</span></div><span className="log-duration">{formatMinutes(log.durationMin)}</span><button className="icon-btn" aria-label="기록 수정" onClick={onEdit} style={{width:32,height:32}}><Settings size={13}/></button><button className="icon-btn" aria-label="기록 삭제" onClick={onDelete} style={{width:32,height:32}}><Trash2 size={13}/></button></div>;
}

function TitleScreen({state,onStart}:{state:AppState;onStart:(name:string,avatar:number,bgmEnabled:boolean)=>void}) {
  const [name,setName]=useState(state.profile.displayName);
  const [avatar,setAvatar]=useState(state.profile.avatarId);
  const [music,setMusic]=useState(state.settings.bgmEnabled);
  const [error,setError]=useState("");
  function submit(event:FormEvent) { event.preventDefault();if(!name.trim()){setError("모험가 이름을 적어 주세요.");return;}onStart(name,avatar,music); }
  return <main className="game-shell auth-title"><section className="game-frame" style={{display:"flex",alignItems:"center"}}><div className="title-card"><div className="eyebrow" style={{textAlign:"center"}}>A SMALL RPG ABOUT YOUR REAL LIFE</div><div className="title-logo">DAILY <span style={{color:"#98bfae"}}>✦</span> DAILY</div><p className="title-sub">오늘을 기록하면, 당신만의 모험이 시작됩니다.</p><div className="title-hero">{avatarOptions[avatar]}<span style={{position:"absolute",fontSize:35,right:"23%",bottom:19}}>🐉</span></div><form onSubmit={submit}><div className="field"><label htmlFor="adventurer-name">모험가 이름</label><input id="adventurer-name" maxLength={16} placeholder="이름을 입력해 주세요" value={name} onChange={(event)=>setName(event.target.value)} autoComplete="nickname"/></div><div className="field" style={{marginTop:13}}><label>나의 모습</label><div className="pill-row">{avatarOptions.map((item,index)=><button type="button" className={`mood-dot ${avatar===index?"selected":""}`} key={item} aria-label={`아바타 ${index+1}`} onClick={()=>setAvatar(index)} style={{width:39,height:39,fontSize:19}}>{item}</button>)}</div></div>{error&&<div role="alert" className="subtle" style={{color:"#f1a894",marginTop:8}}>{error}</div>}<div className="setting-row" style={{marginTop:14,borderBottom:0}}><span style={{display:"flex",alignItems:"center",gap:8}}><Volume2 size={15}/>합성 배경 음악</span><button type="button" role="switch" aria-checked={music} className={`switch ${music?"on":""}`} onClick={()=>setMusic(!music)}/></div><button className="primary-button" style={{width:"100%",marginTop:8}} type="submit">모험 시작하기 <span aria-hidden="true">→</span></button><p className="subtle" style={{fontSize:9,textAlign:"center",margin:"13px 0 0"}}>기록은 이 기기에 저장됩니다. 언제든 설정에서 내보내거나 삭제할 수 있어요.</p></form></div></section></main>;
}

function LogSheet({category,state,initial,onClose,onSave,onDelete}:{category:CategoryDefinition;state:AppState;initial:ActivityLog|null;onClose:()=>void;onSave:(log:ActivityLog)=>void;onDelete?:()=>void}) {
  const zone=state.profile.timezone;
  const nowDate=todayKey(zone);
  const [date,setDate]=useState(initial?.attributedDate??nowDate);
  const [startTime,setStartTime]=useState(initial?timeInputFor(initial.startedAt,zone):currentClock(zone));
  const [duration,setDuration]=useState(String(initial?.durationMin??(category.key==="sleep"?480:category.key==="meal"?30:60)));
  const [type,setType]=useState(initial?.typeKey??category.types[0]??category.name);
  const [mood,setMood]=useState<number|null>(initial?.mood??null);
  const [note,setNote]=useState(initial?.note??"");
   const [details,setDetails]=useState<DetailFields>(()=>initial?Object.fromEntries(Object.entries(initial.details).map(([k,v])=>[k,String(v)])):{ sleepType:"night",quality:"",mealType:"",amount:"adequate",form:"home",withSomeone:false,subject:"",studyMethod:"독학",problems:"",correct:"",focus:"3",understanding:"3",project:"",result:"진행",solvedProblems:"",workType:"기능",exerciseType:"",metricType:"strength",distanceKm:"",sets:"",reps:"",weightKg:"",genre:"",purpose:"",target:"",recovery:"",creationType:"",leisureType:"",lifeType:"",count:"",quantity:"",repetitions:"",paceMinPerKm:"",checked:false,rating:"" });
  const [error,setError]=useState("");
  function setField(key:string,value:string|boolean){setDetails((prior)=>({...prior,[key]:value}));}
  const numeric=(key:string)=>numberOrNull(String(details[key]??""));
  function onSubmit(event:FormEvent) {
    event.preventDefault();setError("");
    const minutes=Math.round(Number(duration));
    if(!Number.isFinite(minutes)||minutes<0||minutes>1440){setError("시간은 0분에서 24시간 사이로 입력해 주세요.");return;}
    if(date>nowDate){setError("아직 오지 않은 날짜는 기록할 수 없어요.");return;}
    let started:Date;
    try { started=localDateTimeToInstant(date,startTime,zone); } catch { setError("시간대를 확인해 주세요.");return; }
    const ended=new Date(started.getTime()+minutes*60_000);
    const payload:Record<string,unknown>={};
    const textKeys=["subject","book","menu","studyMethod","project","result","workType","exerciseType","metricType","genre","purpose","target","recovery","creationType","leisureType","lifeType","restType","meditationType","sleepType","mealType","amount","form"];
    for(const key of textKeys) { const value=String(details[key]??"").trim();if(value)payload[key]=value; }
    if(category.key==="meal")payload.mealType=type;
    if(category.key==="reading"&&type==="완독")payload.completed=true;
    if(category.key==="rest"&&!payload.restType)payload.restType=type;
    if(category.key==="meditation"&&!payload.meditationType)payload.meditationType=type;
    if(category.key==="life"&&!payload.lifeType)payload.lifeType=type;
    if(category.key==="outing"&&!payload.purpose)payload.purpose=type;
    if(category.key==="relationship"&&!payload.target)payload.target=type;
    if(category.key==="creation"&&!payload.creationType)payload.creationType=type;
    if(category.key==="leisure"&&!payload.leisureType)payload.leisureType=type;
    if(category.key==="study"&&payload.studyMethod){payload.method=payload.studyMethod;delete payload.studyMethod;}
    const numberKeys=["quality","satisfaction","problems","correct","focus","understanding","solvedProblems","distanceKm","sets","reps","weightKg","rpe","count","quantity","repetitions","paceMinPerKm","rating"];
    for(const key of numberKeys){const value=numeric(key);if(value!==null&&Number.isFinite(value))payload[key]=value;}
    if(typeof details.withSomeone==="boolean")payload.withSomeone=details.withSomeone;
    if(typeof details.checked==="boolean")payload.checked=details.checked;
    const log:ActivityLog={id:initial?.id??crypto.randomUUID(),categoryKey:category.key,typeKey:type,status:"completed",startedAt:started.toISOString(),endedAt:ended.toISOString(),durationMin:minutes,attributedDate:date,mood,note:note.trim(),details:payload,source:"detailed",version:(initial?.version??0)+1,deletedAt:null,customTraits:category.isCustom?(category.primary===category.secondary?{[category.primary]:1}:{[category.primary]:0.7,[category.secondary]:0.3}):undefined,customTag:category.isCustom?(category.tag??"custom"):undefined};
    log.attributedDate=category.key==="sleep"?sleepAttributedDate(log,zone):date;
    const validated=validateActivityLog(log);
    if(!validated.success){setError(validated.message);return;}
    const metricCheck=validateActivityMetrics(log,category.metricSchemaKey??"duration",Boolean(category.isCustom));
    if(!metricCheck.success){setError(metricCheck.message);return;}
    onSave(validated.data);
  }
  return <div className="sheet-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="log-heading"><div className="sheet-handle"/><div className="sheet-head"><div><div className="eyebrow">{category.icon} {category.name.toUpperCase()} RECORD</div><h2 id="log-heading">{initial?"기록 다듬기":"새 발자국 남기기"}</h2></div><button className="icon-btn" aria-label="닫기" onClick={onClose}><X size={16}/></button></div><form onSubmit={onSubmit}><div className="form-grid">
    <div className="field full"><label htmlFor="log-type">어떤 활동이었나요?</label><select id="log-type" value={type} onChange={(event)=>setType(event.target.value)}>{[...new Set([...category.types,...(initial?[initial.typeKey]:[])])].map((item)=><option key={item}>{item}</option>)}</select></div>
    <div className="field"><label htmlFor="log-date">날짜</label><input id="log-date" type="date" value={date} max={nowDate} onChange={(event)=>setDate(event.target.value)}/></div>
    <div className="field"><label htmlFor="log-start">시작 시간</label><input id="log-start" type="time" value={startTime} onChange={(event)=>setStartTime(event.target.value)}/></div>
    <div className="field"><label htmlFor="log-duration">걸린 시간 (분)</label><input id="log-duration" type="number" min="0" max="1440" step="1" value={duration} onChange={(event)=>setDuration(event.target.value)}/></div>
    <div className="field"><label>기분 (선택)</label><div className="mood-dots" role="radiogroup" aria-label="기분">{[1,2,3,4,5].map((value)=><button className={`mood-dot ${mood===value?"selected":""}`} key={value} type="button" aria-label={`기분 ${value}`} aria-pressed={mood===value} onClick={()=>setMood(mood===value?null:value)}>{["☁","◔","◑","◕","☀"][value-1]}</button>)}</div></div>
    {category.key==="sleep"&&<><div className="field"><label>수면 구분</label><select value={String(details.sleepType??"night")} onChange={(event)=>setField("sleepType",event.target.value)}><option value="night">밤잠</option><option value="nap">낮잠</option><option value="powernap">쪽잠</option><option value="sleepless">선잠·밤샘 후</option></select></div><div className="field"><label>수면 만족도 (1–5)</label><select value={String(details.quality??"")} onChange={(event)=>setField("quality",event.target.value)}><option value="">선택 안 함</option>{[1,2,3,4,5].map((v)=><option key={v}>{v}</option>)}</select></div></>}
    {category.key==="meal"&&<><div className="field"><label>식사량</label><select value={String(details.amount??"adequate")} onChange={(event)=>setField("amount",event.target.value)}><option value="adequate">적당히</option><option value="hearty">든든히</option><option value="hardly">거의 못 먹음</option><option value="overeat">과식</option></select></div><div className="field"><label>식사 형태</label><select value={String(details.form??"home")} onChange={(event)=>setField("form",event.target.value)}><option value="home">집밥</option><option value="restaurant">외식</option><option value="delivery">배달</option><option value="snack">간식</option></select></div><TextField label="메뉴" value={String(details.menu??"")} onChange={(v)=>setField("menu",v)} placeholder="예: 된장찌개"/><div className="field"><label>식사 만족도 (1–5)</label><select value={String(details.satisfaction??"")} onChange={(event)=>setField("satisfaction",event.target.value)}><option value="">선택 안 함</option>{[1,2,3,4,5].map((v)=><option key={v}>{v}</option>)}</select></div><div className="field full"><label className="setting-row" style={{border:0,padding:0}}>누군가와 함께 먹었어요<input type="checkbox" checked={Boolean(details.withSomeone)} onChange={(event)=>setField("withSomeone",event.target.checked)}/></label></div></>}
    {category.key==="study"&&<><TextField label="과목" value={String(details.subject??"")} onChange={(v)=>setField("subject",v)} placeholder="예: 수학"/><div className="field"><label>공부 방식</label><select value={String(details.studyMethod??"독학")} onChange={(event)=>setField("studyMethod",event.target.value)}>{["독학","문제풀이","암기","복습","강의","스터디"].map((v)=><option key={v}>{v}</option>)}</select></div><NumberField label="문제 수" value={String(details.problems??"")} onChange={(v)=>setField("problems",v)}/><NumberField label="정답 수" value={String(details.correct??"")} onChange={(v)=>setField("correct",v)}/><SelectScale label="집중도 (1–5)" value={String(details.focus??"3")} onChange={(v)=>setField("focus",v)}/><SelectScale label="이해도 (1–5)" value={String(details.understanding??"3")} onChange={(v)=>setField("understanding",v)}/></>}
    {category.key==="development"&&<><TextField label="프로젝트" value={String(details.project??"")} onChange={(v)=>setField("project",v)} placeholder="예: Daily Daily"/><div className="field"><label>작업 종류</label><select value={String(details.workType??"기능")} onChange={(event)=>setField("workType",event.target.value)}>{category.types.map((v)=><option key={v}>{v}</option>)}</select></div><div className="field"><label>진행 결과</label><select value={String(details.result??"진행")} onChange={(event)=>setField("result",event.target.value)}>{["진행","완료","막힘","버그 해결","배포"].map((v)=><option key={v}>{v}</option>)}</select></div><NumberField label="해결한 문제 수" value={String(details.solvedProblems??"")} onChange={(v)=>setField("solvedProblems",v)}/></>}
    {category.key==="exercise"&&<><div className="field"><label>운동 구분</label><select value={String(details.metricType??"strength")} onChange={(event)=>setField("metricType",event.target.value)}><option value="strength">근력</option><option value="cardio">유산소</option><option value="flex">유연성</option><option value="sport">스포츠</option></select></div><div className="field"><label>운동 종류</label><select value={String(details.exerciseType||type)} onChange={(event)=>setField("exerciseType",event.target.value)}>{[...new Set(category.types)].map((v)=><option key={v}>{v}</option>)}</select></div>{details.metricType==="cardio"&&<NumberField label="거리 (km)" value={String(details.distanceKm??"")} onChange={(v)=>setField("distanceKm",v)}/ >}{details.metricType==="strength"&&<><NumberField label="세트 수" value={String(details.sets??"")} onChange={(v)=>setField("sets",v)}/><NumberField label="반복 수" value={String(details.reps??"")} onChange={(v)=>setField("reps",v)}/><NumberField label="중량 (kg)" value={String(details.weightKg??"")} onChange={(v)=>setField("weightKg",v)}/></>}<div className="field"><label htmlFor="exercise-rpe">운동 강도 RPE (1–10)</label><input id="exercise-rpe" type="number" min="1" max="10" value={String(details.rpe??"")} onChange={(event)=>setField("rpe",event.target.value)}/></div></>}
    {category.key==="reading"&&<><TextField label="책 제목" value={String(details.book??"")} onChange={(v)=>setField("book",v)} placeholder="읽은 책"/><TextField label="장르" value={String(details.genre??"")} onChange={(v)=>setField("genre",v)} placeholder="예: 소설"/></>}
     {category.isCustom&&category.metricSchemaKey==="count"&&<NumberField label="횟수" value={String(details.count??"")} onChange={(v)=>setField("count",v)}/>}
     {category.isCustom&&category.metricSchemaKey==="sets"&&<><NumberField label="세트 수" value={String(details.sets??"")} onChange={(v)=>setField("sets",v)}/><NumberField label="세트당 반복" value={String(details.reps??"")} onChange={(v)=>setField("reps",v)}/><NumberField label="중량 (kg)" value={String(details.weightKg??"")} onChange={(v)=>setField("weightKg",v)}/></>}
     {category.isCustom&&category.metricSchemaKey==="distance"&&<><NumberField label="거리 (km)" value={String(details.distanceKm??"")} onChange={(v)=>setField("distanceKm",v)}/><NumberField label="페이스 (분/km)" value={String(details.paceMinPerKm??"")} onChange={(v)=>setField("paceMinPerKm",v)}/></>}
     {category.isCustom&&category.metricSchemaKey==="check"&&<div className="field full"><label className="setting-row" style={{border:0,padding:0}}>완료했어요<input type="checkbox" checked={Boolean(details.checked)} onChange={(event)=>setField("checked",event.target.checked)}/></label></div>}
     {category.isCustom&&category.metricSchemaKey==="rating"&&<SelectScale label="평점 (1–5)" value={String(details.rating||"3")} onChange={(v)=>setField("rating",v)}/>}
     {category.key==="outing"&&<div className="field"><label>외출 목적</label><select value={String(details.purpose??type)} onChange={(event)=>setField("purpose",event.target.value)}>{category.types.map((v)=><option key={v}>{v}</option>)}</select></div>}
    {category.key==="relationship"&&<div className="field"><label>함께한 인연</label><select value={String(details.target??type)} onChange={(event)=>setField("target",event.target.value)}>{category.types.map((v)=><option key={v}>{v}</option>)}</select></div>}
    {category.key==="creation"&&<div className="field"><label>창작 종류</label><select value={String(details.creationType??type)} onChange={(event)=>setField("creationType",event.target.value)}>{category.types.map((v)=><option key={v}>{v}</option>)}</select></div>}
    {category.key==="leisure"&&<div className="field"><label>여가 활동</label><select value={String(details.leisureType??type)} onChange={(event)=>setField("leisureType",event.target.value)}>{category.types.map((v)=><option key={v}>{v}</option>)}</select></div>}
    {category.key==="rest"&&<div className="field"><label>휴식 방식</label><select value={String(details.restType??type)} onChange={(event)=>setField("restType",event.target.value)}>{category.types.map((v)=><option key={v}>{v}</option>)}</select></div>}
    {category.key==="meditation"&&<div className="field"><label>명상 방식</label><select value={String(details.meditationType??type)} onChange={(event)=>setField("meditationType",event.target.value)}>{category.types.map((v)=><option key={v}>{v}</option>)}</select></div>}
    {category.key==="life"&&<div className="field"><label>생활 활동</label><select value={String(details.lifeType??type)} onChange={(event)=>setField("lifeType",event.target.value)}>{category.types.map((v)=><option key={v}>{v}</option>)}</select></div>}
    <div className="field full"><label htmlFor="log-note">메모 (선택, 내 기기에만 저장)</label><textarea id="log-note" value={note} maxLength={500} onChange={(event)=>setNote(event.target.value)} placeholder="나중에 기억하고 싶은 내용을 적어 보세요."/></div>
    </div>{error&&<div role="alert" className="subtle" style={{color:"#ee9e8d",marginTop:10}}>{error}</div>}<div className="button-row">{onDelete&&<button type="button" className="secondary-button" onClick={onDelete}>삭제</button>}<button type="button" className="secondary-button" onClick={onClose}>취소</button><button className="primary-button" type="submit">기록 저장</button></div></form></section></div>;
}

function fieldId(label:string){return `field-${label.toLowerCase().replace(/[^a-z0-9가-힣]+/g,"-")}`;}
function TextField({label,value,onChange,placeholder}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string}) { const id=fieldId(label);return <div className="field"><label htmlFor={id}>{label}</label><input id={id} value={value} onChange={(event)=>onChange(event.target.value)} placeholder={placeholder}/></div>; }
function NumberField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) { const id=fieldId(label);return <div className="field"><label htmlFor={id}>{label}</label><input id={id} type="number" min="0" value={value} onChange={(event)=>onChange(event.target.value)}/></div>; }
function SelectScale({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) { const id=fieldId(label);return <div className="field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={(event)=>onChange(event.target.value)}>{[1,2,3,4,5].map((v)=><option key={v}>{v}</option>)}</select></div>; }

function SettingsSheet({state,onClose,onUpdate,onProfile,onExport,onReset,viewer,cloudConfigured,pendingWrites,syncBusy,syncMessage,conflictCount,canKeepLocal,onSync,onResolveConflicts,onDeleteCloud}:{
  state:AppState; onClose:()=>void; onUpdate:(patch:Partial<AppState["settings"]>)=>void; onProfile:(name:string,avatar:number)=>void;
  onExport:(kind:"json"|"csv")=>void; onReset:()=>void; viewer:AuthenticatedUser|null; cloudConfigured:boolean; pendingWrites:number;
  syncBusy:boolean; syncMessage:string; conflictCount:number; canKeepLocal:boolean; onSync:()=>void;
  onResolveConflicts:(choice:"local"|"server")=>void; onDeleteCloud:()=>void;
}) {
  const [name,setName]=useState(state.profile.displayName);
  const [avatar,setAvatar]=useState(state.profile.avatarId);
  return <div className="sheet-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-heading"><div className="sheet-handle"/><div className="sheet-head"><div><div className="eyebrow">YOUR PREFERENCES</div><h2 id="settings-heading">설정</h2></div><button className="icon-btn" aria-label="닫기" onClick={onClose}><X size={16}/></button></div>
    <div className="field"><label htmlFor="settings-name">모험가 이름</label><div style={{display:"flex",gap:8}}><input id="settings-name" value={name} maxLength={16} onChange={(event)=>setName(event.target.value)}/><button className="secondary-button" onClick={()=>onProfile(name,avatar)}>저장</button></div></div>
    <div className="field" style={{marginTop:12}}><label>아바타</label><div className="pill-row">{avatarOptions.map((item,index)=><button className={`mood-dot ${avatar===index?"selected":""}`} key={index} aria-label={`아바타 ${index+1}`} onClick={()=>setAvatar(index)}>{item}</button>)}</div></div>
    <div className="field" style={{marginTop:14}}><label htmlFor="timezone">기록 시간대 (IANA)</label><select id="timezone" value={state.settings.timezone} onChange={(event)=>onUpdate({timezone:event.target.value})}>{[...new Set([...zones,state.settings.timezone])].map((zone)=><option key={zone}>{zone}</option>)}</select><span className="stat-label">시간대를 바꾸어도 원래 기록 시각과 날짜는 보존돼요.</span></div>
    <SettingSwitch label="다음부터 타이틀 건너뛰기" checked={state.settings.skipTitle} onChange={(value)=>onUpdate({skipTitle:value})}/>
    <SettingSwitch label="배경 음악" checked={state.settings.bgmEnabled} onChange={(value)=>onUpdate({bgmEnabled:value})}/><SettingSwitch label="효과음" checked={state.settings.sfxEnabled} onChange={(value)=>onUpdate({sfxEnabled:value})}/><SettingSwitch label="간결한 이벤트 연출" checked={state.settings.reducedEffects} onChange={(value)=>onUpdate({reducedEffects:value,eventEffects:!value})}/>
    <div className="setting-row"><span>배경 음악 음량</span><input aria-label="배경 음악 음량" type="range" min="0" max="0.6" step="0.05" value={state.settings.bgmVolume} onChange={(event)=>onUpdate({bgmVolume:Number(event.target.value)})}/></div>
    <div className="setting-row"><span>효과음 음량</span><input aria-label="효과음 음량" type="range" min="0" max="1" step="0.1" value={state.settings.sfxVolume} onChange={(event)=>onUpdate({sfxVolume:Number(event.target.value)})}/></div>
    <div className="section-head" style={{marginTop:20}}><h2>계정 동기화</h2></div>
    {!cloudConfigured ? <><p className="subtle">동기화를 켜려면 서버의 데이터베이스와 GitHub 로그인 설정이 필요합니다. 현재 기록은 이 기기에 안전하게 보관돼요.</p><p className="setting-row" aria-live="polite">동기화 대기 <strong>{pendingWrites}개</strong></p></> : viewer ? <>
      <div className="setting-row"><span>연결된 계정</span><strong>{viewer.name || "GitHub"}</strong></div>
      <div className="setting-row"><span>동기화 대기</span><strong>{pendingWrites}개</strong></div>
      <div className="button-row"><button className="primary-button" onClick={onSync} disabled={syncBusy}>{syncBusy?"동기화 중…":"지금 동기화"}</button><form action={finishSignOut}><button className="secondary-button">로그아웃</button></form></div>
      {syncMessage&&<p className="subtle" role="status" aria-live="polite">{syncMessage}</p>}
      {conflictCount>0&&<div className="surface" style={{padding:12,marginTop:10}}><strong>{conflictCount}개 기록의 수정이 겹쳤어요.</strong><p className="subtle">어느 기기의 내용을 보관할지 선택해 주세요. 계정에서 삭제된 기록은 복구할 수 없어요.</p><div className="button-row"><button className="secondary-button" onClick={()=>onResolveConflicts("server")}>계정 기록 사용</button><button className="secondary-button" onClick={()=>onResolveConflicts("local")} disabled={!canKeepLocal}>이 기기 기록 사용</button></div></div>}
      <button className="secondary-button" onClick={onDeleteCloud} style={{width:"100%",marginTop:10,color:"#e8a995"}}>서버 계정 데이터 영구 삭제</button>
    </> : <>
      <p className="subtle">GitHub 계정을 연결하면 이 기기에 쌓인 기록을 계정에 동기화하고 다른 기기에서 이어갈 수 있어요.</p>
      <form action={startGitHubSignIn}><button className="primary-button">GitHub 계정 연결</button></form>
      {syncMessage&&<p className="subtle" role="status" aria-live="polite">{syncMessage}</p>}
    </>}
    <div className="section-head"><h2>내 데이터</h2></div><p className="subtle">기록은 이 기기에 먼저 저장됩니다. 계정을 연결하고 동기화하면 다른 기기에서도 이어갈 수 있어요.</p><div className="button-row"><button className="secondary-button" onClick={()=>onExport("json")}><Download size={14}/> JSON 내보내기</button><button className="secondary-button" onClick={()=>onExport("csv")}><Download size={14}/> CSV 내보내기</button></div><button className="secondary-button" onClick={onReset} style={{width:"100%",marginTop:10,color:"#e8a995"}}>이 기기의 기록과 계정 삭제</button><div className="stat-label" style={{marginTop:13}}>배경 음악은 Web Audio 합성음으로 재생됩니다. 외부 이미지·글꼴·음원은 사용하지 않습니다.</div>
    <div className="button-row"><button className="primary-button" onClick={()=>{onProfile(name,avatar);onClose();}}>완료</button></div>
  </section></div>;
}
function SettingSwitch({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}) { return <div className="setting-row"><span>{label}</span><button className={`switch ${checked?"on":""}`} role="switch" aria-checked={checked} aria-label={label} onClick={()=>onChange(!checked)}/></div>; }

function CustomCategorySheet({onClose,onCreate}:{onClose:()=>void;onCreate:(name:string,group:CategoryDefinition["group"],primary:Trait,secondary:Trait,icon:string,color:string,metricSchemaKey:NonNullable<CategoryDefinition["metricSchemaKey"]>,tag:string)=>void}) {
  const [name,setName]=useState("");const [primary,setPrimary]=useState<Trait>("calm");const [secondary,setSecondary]=useState<Trait>("recovery");const [group,setGroup]=useState<CategoryDefinition["group"]>("life");const [icon,setIcon]=useState("✦");const [color,setColor]=useState("#b9a071");const [metricSchemaKey,setMetricSchemaKey]=useState<NonNullable<CategoryDefinition["metricSchemaKey"]>>("duration");const [tag,setTag]=useState("custom");
  return <div className="sheet-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="custom-heading"><div className="sheet-handle"/><div className="sheet-head"><div><div className="eyebrow">CREATE A NEW ORB</div><h2 id="custom-heading">나만의 행동 만들기</h2></div><button className="icon-btn" aria-label="닫기" onClick={onClose}><X size={16}/></button></div><p className="subtle">이름과 표시를 고르고 기록 방식과 성장 특성을 정해 주세요. 경험치 곡선은 시스템 행동과 같아요.</p><div className="field"><label htmlFor="custom-name">행동 이름</label><input id="custom-name" value={name} maxLength={20} placeholder="예: 악기 연습" onChange={(event)=>setName(event.target.value)}/></div><div className="form-grid" style={{marginTop:10}}><div className="field"><label htmlFor="custom-icon">아이콘</label><input id="custom-icon" value={icon} maxLength={8} onChange={(event)=>setIcon(event.target.value)}/></div><div className="field"><label htmlFor="custom-color">색상</label><input id="custom-color" type="color" value={color} onChange={(event)=>setColor(event.target.value)}/></div><div className="field"><label htmlFor="custom-template">기록 템플릿</label><select id="custom-template" value={metricSchemaKey} onChange={(event)=>setMetricSchemaKey(event.target.value as NonNullable<CategoryDefinition["metricSchemaKey"]>)}>{[["duration","시간"],["count","횟수"],["sets","세트"],["distance","거리"],["check","체크"],["rating","평점"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label htmlFor="custom-tag">성격 태그</label><input id="custom-tag" value={tag} maxLength={100} onChange={(event)=>setTag(event.target.value)} placeholder="예: craft"/></div><div className="field"><label htmlFor="custom-group">판정 그룹</label><select id="custom-group" value={group} onChange={(event)=>setGroup(event.target.value as CategoryDefinition["group"])}>{["knowledge","body","craft","mind","recovery","life","social","leisure","explore"].map((item)=><option key={item} value={item}>{item}</option>)}</select></div><div className="field"><label htmlFor="custom-primary">첫 번째 특성</label><select id="custom-primary" value={primary} onChange={(event)=>setPrimary(event.target.value as Trait)}>{TRAITS.map((item)=><option key={item} value={item}>{TRAIT_NAMES[item]}</option>)}</select></div><div className="field"><label htmlFor="custom-secondary">두 번째 특성</label><select id="custom-secondary" value={secondary} onChange={(event)=>setSecondary(event.target.value as Trait)}>{TRAITS.map((item)=><option key={item} value={item}>{TRAIT_NAMES[item]}</option>)}</select></div></div><div className="button-row"><button className="secondary-button" onClick={onClose}>취소</button><button className="primary-button" disabled={!name.trim()||!icon.trim()} onClick={()=>onCreate(name,group,primary,secondary,icon,color,metricSchemaKey,tag)}>행동 만들기</button></div></section></div>;
}

function EventSheet({state,onClose}:{state:AppState;onClose:()=>void}) {
  const unseen=state.events.filter((event)=>!event.seen).slice(-3).reverse();
  return <div className="sheet-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="event-heading"><div className="sheet-handle"/><div className="sheet-head"><div><div className="eyebrow">A CHANCE ENCOUNTER</div><h2 id="event-heading">오늘 만난 인연</h2></div><button className="icon-btn" aria-label="닫기" onClick={onClose}><X size={16}/></button></div>{unseen.length?unseen.map((event)=><div className="event-card" key={`${event.id}-${event.date}`}><strong>{event.title} <span className="badge">{event.rarity}</span></strong><p>{event.body}</p><p style={{color:"#e3ce9e"}}>{event.npcLine}</p>{event.rewards&&<p style={{color:"#c4d5bc"}}>보상 · {event.rewards}</p>}</div>):<div className="empty-state">새로운 사건을 만나면 이곳에 기록돼요.</div>}<button className="primary-button" onClick={onClose} style={{width:"100%",marginTop:10}}>기록실로 돌아가기</button></section></div>;
}

function NarrativeCard({settlement}:{settlement:AppState["settlements"][number]}) {
  return <div className="surface" style={{marginTop:12}}><div className="surface-title"><span>하루의 이야기</span><span className="badge">기록실</span></div><div style={{marginTop:10}}>{settlement.narrative.map((line,index)=><p className="subtle" key={index} style={{margin:"7px 0"}}>{line}</p>)}</div></div>;
}
function SettlementSheet({state,settlement,onClose}:{state:AppState;settlement:AppState["settlements"][number];onClose:()=>void}) {
  const hero=HERO_BY_NO.get(settlement.heroNo);const features=settlement.features as {logCount?:number;totalActiveMin?:number;sleepMin?:number};
  return <div className="sheet-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="settlement-heading"><div className="sheet-handle"/><div className="sheet-head"><div><div className="eyebrow">DAILY SETTLEMENT · REVISION {settlement.revision}</div><h2 id="settlement-heading">{formatDate(settlement.date,state.profile.timezone)}의 모험</h2></div><button className="icon-btn" aria-label="닫기" onClick={onClose}><X size={16}/></button></div><div className="hero-stage" style={{minHeight:195}}><div className="stage-orbit"/><div style={{fontSize:74,zIndex:2,marginBottom:22}}>{heroGlyph(settlement.heroNo)}</div><div className="stage-caption"><span>{hero?.name}</span><strong>{hero?.rarity}</strong></div></div><div className="summary-row"><div className="surface"><div className="stat-value" style={{fontSize:18}}>{features.logCount??0}개</div><div className="stat-label">모은 발자국</div></div><div className="surface"><div className="stat-value" style={{fontSize:18}}>{formatMinutes(features.totalActiveMin??0)}</div><div className="stat-label">활동한 시간</div></div></div><NarrativeCard settlement={settlement}/><details style={{marginTop:12}}><summary className="subtle" style={{cursor:"pointer"}}>판정 이유 보기</summary><ul className="subtle">{settlement.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></details><button className="primary-button" onClick={onClose} style={{width:"100%",marginTop:14}}>연대기에 간직하기</button></section></div>;
}

function HeroSheet({state,heroNo,onClose}:{state:AppState;heroNo:number;onClose:()=>void}) {
  const hero=HERO_BY_NO.get(heroNo);if(!hero)return null;const collection=state.collection[heroNo];
  return <div className="sheet-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="hero-heading"><div className="sheet-handle"/><div className="sheet-head"><div><div className="eyebrow">HERO NO. {String(heroNo).padStart(3,"0")} · {hero.rarity.toUpperCase()}</div><h2 id="hero-heading">{collection?hero.name:"아직 만나지 못한 용사"}</h2></div><button className="icon-btn" aria-label="닫기" onClick={onClose}><X size={16}/></button></div><div className="title-hero">{collection?heroGlyph(heroNo):"✦"}</div><div className="surface"><div className="surface-title"><span>{collection?"나의 인연":"만남의 힌트"}</span>{collection&&<span className="badge">{collection.count}회 발견</span>}</div><p className="subtle">{collection?hero.concept:hero.hint}</p>{collection&&<p className="subtle">발견 조건 · {hero.condition}</p>}<p className="subtle">{collection?`처음 만난 날: ${formatDate(collection.firstDate,state.profile.timezone)}`:"하루 결산에서 만남의 기회가 열립니다."}</p>{collection?.dates.map((date)=><div key={date} className="setting-row"><span>{formatDate(date,state.profile.timezone)}</span><span className="badge">결산 기록</span></div>)}</div><button className="primary-button" onClick={onClose} style={{width:"100%",marginTop:14}}>도감으로 돌아가기</button></section></div>;
}
