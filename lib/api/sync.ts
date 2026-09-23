import type { Database } from "@/lib/db/connection";
import { listAllActivityLogs, saveActivityLog, softDeleteActivityLog, type LogApiError } from "@/lib/api/logs";
import type { ActivityLog } from "@/lib/domain";

export async function syncActivityLogs(database: Database, user: { id: string; name: string }, logs: ActivityLog[]) {
  const before = await listAllActivityLogs(database, user.id);
  const serverById = new Map(before.map((log) => [log.id, log]));
  const synced: string[] = [];
  const conflicts: Array<{ id: string; server: ActivityLog }> = [];

  for (const log of logs) {
    const server = serverById.get(log.id);
    if (log.deletedAt) {
      if (!server) { synced.push(log.id); continue; }
      if (server.deletedAt) {
        if (server.version >= log.version) synced.push(log.id);
        else conflicts.push({ id: log.id, server });
        continue;
      }
      if (log.version !== server.version + 1) { conflicts.push({ id: log.id, server }); continue; }
      try {
        await softDeleteActivityLog(database, user, log.id, server.version);
        synced.push(log.id);
      } catch (error) {
        const current = (await listAllActivityLogs(database, user.id)).find((entry) => entry.id === log.id);
        if (current) conflicts.push({ id: log.id, server: current });
        else throw error;
      }
      continue;
    }

    try {
      await saveActivityLog(database, user, log);
      synced.push(log.id);
    } catch (error) {
      if ((error as LogApiError).status !== 409) throw error;
      const current = (await listAllActivityLogs(database, user.id)).find((entry) => entry.id === log.id);
      if (current) conflicts.push({ id: log.id, server: current });
      else throw error;
    }
  }

  const current = await listAllActivityLogs(database, user.id);
  return { synced, conflicts, logs: current };
}
