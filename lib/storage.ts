import { TRAITS, type AppState } from "@/lib/domain";

const DATABASE_NAME = "daily-daily-local";
const DATABASE_VERSION = 1;
const STATE_STORE = "state";
const OUTBOX_STORE = "outbox";
const STORAGE_KEY = "daily-daily:state:v1";
const OUTBOX_STORAGE_KEY = "daily-daily:outbox:v1";

export type OfflineWrite = { id: string; payload: unknown; queuedAt: string };

function hydrateState(state: AppState): AppState {
  return { ...state, eventOutcomes: state.eventOutcomes ?? {} };
}

function localUserId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createInitialState(timeZone = "Asia/Seoul"): AppState {
  const createdAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    profile: { id: localUserId(), displayName: "", timezone: timeZone, avatarId: 0, titleId: "chronicler", createdAt },
    settings: { bgmEnabled: true, bgmVolume: 0.25, sfxEnabled: true, sfxVolume: 0.5, skipTitle: false, reducedEffects: false, timezone: timeZone, eventEffects: true },
    logs: [],
    settlements: [],
    collection: {},
    events: [],
    rewardLedger: [],
    inventory: {},
    achievements: {},
    quests: {},
    regions: ["eos"],
    favorites: [],
    pins: [],
    customCategories: [],
    traits: Object.fromEntries(TRAITS.map((trait) => [trait, { xp: 0, level: 1 }])) as AppState["traits"],
    dailyOrdinals: {},
    eventSeeds: {},
    eventOutcomes: {},
    dismissedSettlementDates: [],
    xpAwardsByDate: {},
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STATE_STORE)) database.createObjectStore(STATE_STORE);
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) database.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the local database"));
  });
}

function transactionValue<T>(database: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STATE_STORE, mode);
    const request = action(transaction.objectStore(STATE_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local save failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local transaction aborted"));
  });
}

export async function loadState(): Promise<AppState> {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
  try {
    const database = await openDatabase();
    const stored = await transactionValue<AppState | undefined>(database, "readonly", (store) => store.get("current"));
    database.close();
    if (stored?.schemaVersion === 1 && stored.profile?.id) return hydrateState(stored);
  } catch {
    // localStorage remains as a recovery copy if IndexedDB is unavailable or blocked.
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as AppState;
      if (state.schemaVersion === 1 && state.profile?.id) return hydrateState(state);
    }
  } catch {
    // Create a fresh profile after a corrupted local copy; no server data is affected.
  }
  return createInitialState(browserZone);
}

export async function persistState(state: AppState): Promise<"indexeddb" | "localstorage"> {
  try {
    const database = await openDatabase();
    await transactionValue(database, "readwrite", (store) => store.put(state, "current"));
    database.close();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* IndexedDB is the primary local copy. */ }
    return "indexeddb";
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return "localstorage";
  }
}

export async function queueOfflineWrite(id: string, payload: unknown): Promise<void> {
  const entry: OfflineWrite = { id, payload, queuedAt: new Date().toISOString() };
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OUTBOX_STORE, "readwrite");
      transaction.objectStore(OUTBOX_STORE).put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not store offline work"));
    });
    database.close();
  } catch {
    const queued = JSON.parse(localStorage.getItem(OUTBOX_STORAGE_KEY) ?? "[]") as OfflineWrite[];
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify([...queued.filter((item) => item.id !== id), entry]));
  }
}

export async function listOfflineWrites(): Promise<OfflineWrite[]> {
  try {
    const database = await openDatabase();
    const entries = await new Promise<OfflineWrite[]>((resolve, reject) => {
      const request = database.transaction(OUTBOX_STORE, "readonly").objectStore(OUTBOX_STORE).getAll();
      request.onsuccess = () => resolve(request.result as OfflineWrite[]);
      request.onerror = () => reject(request.error ?? new Error("Could not read pending work"));
    });
    database.close();
    return entries;
  } catch {
    try { return JSON.parse(localStorage.getItem(OUTBOX_STORAGE_KEY) ?? "[]") as OfflineWrite[]; }
    catch { return []; }
  }
}

export async function clearOfflineWrites(ids?: string[]): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OUTBOX_STORE, "readwrite");
      const store = transaction.objectStore(OUTBOX_STORE);
      if (ids) for (const id of ids) store.delete(id);
      else store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear synced work"));
    });
    database.close();
  } catch {
    const queued = await listOfflineWrites();
    const remaining = ids ? queued.filter((entry) => !ids.includes(entry.id)) : [];
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(remaining));
  }
}

export async function countOfflineWrites(): Promise<number> {
  return (await listOfflineWrites()).length;
}

export async function deleteLocalAccount(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(OUTBOX_STORAGE_KEY);
  await new Promise<void>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve();
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

export function exportJson(state: AppState): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), formatVersion: 1, ...state }, null, 2);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportCsv(state: AppState): string {
  const columns = ["id", "categoryKey", "typeKey", "startedAt", "endedAt", "durationMin", "attributedDate", "mood", "note", "details"] as const;
  return [columns.join(","), ...state.logs.filter((log) => !log.deletedAt).map((log) => columns.map((column) => csvCell(column === "details" ? JSON.stringify(log.details) : log[column])).join(","))].join("\r\n");
}
