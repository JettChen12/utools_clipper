import { ulid } from 'ulid';

export interface Task {
  id: string;
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
}

import { DEFAULT_SERVER_URL } from '../config';

const DEFAULT_SYNC_STATE: SyncState = {
  lastSyncVersion: 0,
  lastSyncTime: 0,
  token: null,
  serverUrl: DEFAULT_SERVER_URL,
  userId: null,
  username: null,
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
  async applySyncTask(id: string, changes: Partial<Task>) {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    
    if (index >= 0) {
      tasks[index] = { ...tasks[index], ...changes };
    } else {
      // If it's an update for a task we don't have, create it (if it has enough info)
      // Or if it's a create op from server
      // changes should contain all fields for create
      if (changes.title) {
         const newTask = {
            id,
            title: changes.title || 'Untitled',
            status: changes.status || 'todo',
            priority: changes.priority || 'none',
            tags: changes.tags || [],
            createdAt: changes.createdAt || Date.now(),
            updatedAt: changes.updatedAt || Date.now(),
            ...changes
         } as Task;
         tasks.unshift(newTask);
      }
    }
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
  
  // Debug
  async clearAll() {
    await chrome.storage.local.clear();
  }
};
