import { ulid } from 'ulid';
import type { Language } from './i18n';

export interface Task {
  id: string;
  userId?: string | null; // Optional: used for data ownership check
  title: string;
  description?: string;
  status: 'todo' | 'done' | 'archived';
  priority: 'none' | 'low' | 'medium' | 'high';
  tags: string[];
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface OpLog {
  id: string;
  entity: 'task';
  entityId: string;
  opType: 'create' | 'update' | 'delete';
  changes: Partial<Task>;
  clientTs: number;
}

export interface SyncState {
  lastSyncVersion: number;
  lastSyncTime: number;
  token: string | null;
  serverUrl: string;
  userId: string | null;
  username: string | null;
  language: Language;
}

import { DEFAULT_SERVER_URL } from '../config';

const DEFAULT_SYNC_STATE: SyncState = {
  lastSyncVersion: 0,
  lastSyncTime: 0,
  token: null,
  serverUrl: DEFAULT_SERVER_URL,
  userId: null,
  username: null,
  language: 'en',
};

// Helper to wrap chrome.storage.local
export const storage = {
  async getTasks(): Promise<Task[]> {
    const result = await chrome.storage.local.get('tasks');
    return (result.tasks as Task[]) || [];
  },

  async saveTask(task: Task): Promise<void> {
    const tasks = await this.getTasks();
    const index = tasks.findIndex((t) => t.id === task.id);
    const syncState = await this.getSyncState();
    
    // Assign current user if available and task doesn't have one
    if (!task.userId && syncState.userId) {
      task.userId = syncState.userId;
    }
    
    // Determine opType and changes
    let opType: OpLog['opType'] = 'create';
    let changes: Partial<Task> = task;

    if (index >= 0) {
      opType = 'update';
      // Simple diff (optional, but good for bandwidth)
      // For now, send full object as changes for update is easier for LWW on text fields
      // But backend expects partial changes. 
      // Let's send the important fields that might have changed.
      changes = {
        title: task.title,
        status: task.status,
        description: task.description,
        priority: task.priority,
        // dueDate: (task as any).dueDate,
        tags: task.tags,
        updatedAt: task.updatedAt
      };
      // Preserve existing userId if not present in update
      if (!task.userId && tasks[index].userId) {
        task.userId = tasks[index].userId;
      }
      tasks[index] = task;
    } else {
      tasks.unshift(task); // Add to top
    }
    
    await chrome.storage.local.set({ tasks });
    await this.logOp('task', task.id, opType, changes);
  },

  async deleteTask(id: string): Promise<void> {
    const tasks = await this.getTasks();
    const index = tasks.findIndex((t) => t.id === id);
    if (index >= 0) {
      tasks[index].deleted = true;
      tasks[index].updatedAt = Date.now();
      await chrome.storage.local.set({ tasks });
      await this.logOp('task', id, 'delete', {});
    }
  },

  // Log operation for Sync
  async logOp(entity: 'task', entityId: string, opType: OpLog['opType'], changes: Partial<Task>) {
    const result = await chrome.storage.local.get('opLogs');
    const opLogs: OpLog[] = (result.opLogs as OpLog[]) || [];
    
    opLogs.push({
      id: crypto.randomUUID(),
      entity,
      entityId,
      opType,
      changes,
      clientTs: Date.now()
    });
    
    await chrome.storage.local.set({ opLogs });
    
    // Trigger sync immediately if online? Or let background handle it?
    // Let's notify background
    chrome.runtime.sendMessage({ type: 'sync_trigger' }).catch(() => {});
  },

  async getOpLogs(): Promise<OpLog[]> {
    const result = await chrome.storage.local.get('opLogs');
    return (result.opLogs as OpLog[]) || [];
  },

  async clearOpLogs(ids: string[]): Promise<void> {
    const logs = await this.getOpLogs();
    const remaining = logs.filter(l => !ids.includes(l.id));
    await chrome.storage.local.set({ opLogs: remaining });
  },

  // Methods for Sync (Bypass OpLog)
  async applySyncTask(id: string, changes: Partial<Task>, userId?: string) {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    const syncState = await this.getSyncState();
    const currentUserId = syncState.userId;
    
    if (index >= 0) {
      // If task exists, update it.
      tasks[index] = { ...tasks[index], ...changes };
      // Ensure userId is updated if provided from sync
      if (userId && !tasks[index].userId) {
         tasks[index].userId = userId;
      }
    } else {
      // New task from server
      if (changes.title) {
         const newTask = {
            id,
            title: changes.title || 'Untitled',
            status: changes.status || 'todo',
            priority: changes.priority || 'none',
            tags: changes.tags || [],
            createdAt: changes.createdAt || Date.now(),
            updatedAt: changes.updatedAt || Date.now(),
            ...changes,
         } as Task;
         
         // CRITICAL: Tasks coming from server MUST have userId.
         // Priority 1: Use userId passed explicitly from sync (OpLog level)
         // Priority 2: Use currentUserId from state (Fallback)
         if (userId) {
            newTask.userId = userId;
         } else if (!newTask.userId && currentUserId) {
            newTask.userId = currentUserId;
         }
         
         tasks.push(newTask);
      }
    }
    
    // Sort tasks: Offline (no userId) usually newest? Or just sort by createdAt desc?
    tasks.sort((a, b) => b.createdAt - a.createdAt);
    
    await chrome.storage.local.set({ tasks });
  },

  async applySyncDelete(id: string) {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index >= 0) {
      tasks[index].deleted = true;
      await chrome.storage.local.set({ tasks });
    }
  },

  async getSyncState(): Promise<SyncState> {
    const result = await chrome.storage.local.get('syncState');
    return { ...DEFAULT_SYNC_STATE, ...(result.syncState as Partial<SyncState>) };
  },

  async setSyncState(state: Partial<SyncState>): Promise<void> {
    const current = await this.getSyncState();
    await chrome.storage.local.set({ syncState: { ...current, ...state } });
  },

  async getOfflineTasksCount(): Promise<number> {
    const tasks = await this.getTasks();
    // Count tasks that don't have a userId (meaning they were created offline/guest)
    return tasks.filter(t => !t.userId).length;
  },

  async assignTasksToUser(userId: string): Promise<void> {
    const tasks = await this.getTasks();
    let hasChanges = false;
    
    tasks.forEach(task => {
      if (!task.userId) {
        task.userId = userId;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      await chrome.storage.local.set({ tasks });
      // We don't need to update OpLogs because they will be pushed with the new user's token
      // and the backend will assign the user ID to the new records.
    }
  },

  async discardOfflineTasks(): Promise<void> {
    const tasks = await this.getTasks();
    // Keep only tasks that have a userId (synced tasks)
    const remainingTasks = tasks.filter(t => !!t.userId);
    
    // We should also clear opLogs that are related to these discarded tasks
    // But since opLogs don't have userId directly, we assume all pending opLogs are for offline tasks?
    // Not necessarily true if we have mixed state, but in our current flow:
    // We just pulled user tasks. Any local opLogs must be from the offline session.
    // So clearing opLogs is safe/correct here.
    
    await chrome.storage.local.set({ tasks: remainingTasks, opLogs: [] });
  },

  async handleLogoutCleanup(): Promise<void> {
    // Completely clear all user data upon logout
    // This ensures no data leakage between users and strictly follows "Logout = Clear" policy
    await this.clearUserData();
  },

  async clearUserData(): Promise<void> {
    // Keep serverUrl, clear everything else
    const syncState = await this.getSyncState();
    const serverUrl = syncState.serverUrl;
    
    // Clear tasks, opLogs, and syncState
    await chrome.storage.local.remove(['tasks', 'opLogs', 'syncState']);
    
    // Restore serverUrl and reset sync state
    await this.setSyncState({ 
      ...DEFAULT_SYNC_STATE,
      serverUrl 
    });
  },
  
  // Debug
  async clearAll() {
    await chrome.storage.local.clear();
  }
};
