import { storage } from './storage';
import type { OpLog, Task } from './storage';
import { ulid } from 'ulid';

export const sync = {
  async push() {
    const syncState = await storage.getSyncState();
    if (!syncState.token || !syncState.serverUrl) return;

    // Get OpLogs (TODO: We need to implement opLogs storage first)
    // For MVP, we can just push all tasks that have been updated since last sync?
    // No, that's not efficient. We need OpLogs.
    
    // Let's implement a simple "dirty check" or assume we have OpLogs.
    // Since we skipped OpLog implementation in storage.ts, let's add it now.
    
    // ... Actually, let's implement a simpler "Push All Dirty" strategy for MVP if OpLogs are hard.
    // But backend expects OpLogs. So we must generate them.
    
    // In storage.ts, we need to save OpLogs.
    const opLogs = await storage.getOpLogs();
    if (opLogs.length === 0) return;

    try {
      const res = await fetch(`${syncState.serverUrl}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${syncState.token}`
        },
        body: JSON.stringify({
          client_id: await this.getClientId(),
          changes: opLogs.map(log => ({
             entity: log.entity,
             entity_id: log.entityId, // Map camelCase to snake_case
             op_type: log.opType,
             changes: log.changes,
             client_ts: log.clientTs
          }))
        })
      });

      if (res.ok) {
        // Clear pushed logs
        await storage.clearOpLogs(opLogs.map(l => l.id));
      } else {
        throw new Error(`Push failed: ${res.statusText}`);
      }
    } catch (err) {
      console.error('Push failed', err);
      throw err;
    }
  },

  async pull() {
    const syncState = await storage.getSyncState();
    if (!syncState.token || !syncState.serverUrl) return;

    try {
      const res = await fetch(`${syncState.serverUrl}/sync/pull?since_version=${syncState.lastSyncVersion}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${syncState.token}`
        }
      });

      if (!res.ok) {
        throw new Error(`Pull failed: ${res.statusText}`);
      }

      const data = await res.json() as { changes: OpLog[], current_version: number };
      
      if (data.changes.length > 0) {
        await this.applyChanges(data.changes);
      }
      
      await storage.setSyncState({ lastSyncVersion: data.current_version });

    } catch (err) {
      console.error('Pull failed', err);
      throw err;
    }
  },

  async applyChanges(changes: OpLog[]) {
    // Apply changes to local storage
    for (const change of changes) {
      const { entity, entityId, opType, changes: changeData } = change;
      if (entity === 'task') {
        if (opType === 'create' || opType === 'update') {
           // We need a way to update task without triggering new OpLog (loop prevention)
           // storage.saveTask(..., fromSync=true)
           await storage.applySyncTask(entityId, changeData as Partial<Task>);
        } else if (opType === 'delete') {
           await storage.applySyncDelete(entityId);
        }
      }
    }
  },

  async getClientId() {
    let clientId = (await chrome.storage.local.get('client_id')).client_id;
    if (!clientId) {
      clientId = ulid();
      await chrome.storage.local.set({ client_id: clientId });
    }
    return clientId;
  }
};
