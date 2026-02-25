import { create } from 'zustand';
import { storage } from '../lib/storage';
import type { Task, SyncState } from '../lib/storage';
import { ulid } from 'ulid';
import { sync } from '../lib/sync';

interface StoreState {
  tasks: Task[];
  syncState: SyncState | null;
  isLoading: boolean;
  isSyncing: boolean; // Add sync loading state
  
  loadTasks: () => Promise<void>;
  addTask: (title: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateSettings: (settings: Partial<SyncState>) => Promise<void>;
  handleLogoutCleanup: () => Promise<void>;
  clearUserData: () => Promise<void>;
  triggerSync: () => Promise<void>; // Manual sync
}

export const useStore = create<StoreState>((set, get) => ({
  tasks: [],
  syncState: null,
  isLoading: true,
  isSyncing: false,

  loadTasks: async () => {
    set({ isLoading: true });
    const tasks = await storage.getTasks();
    const syncState = await storage.getSyncState();
    // Filter out deleted tasks for UI
    const visibleTasks = tasks.filter(t => !t.deleted);
    set({ tasks: visibleTasks, syncState, isLoading: false });
  },

  addTask: async (title: string) => {
    const newTask: Task = {
      id: ulid(),
      title,
      status: 'todo',
      priority: 'none',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    // Optimistic update
    set(state => ({ tasks: [newTask, ...state.tasks] }));
    
    await storage.saveTask(newTask);
  },

  toggleTask: async (id: string) => {
    const { tasks } = get();
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const updatedTask: Task = { 
      ...task, 
      status: task.status === 'done' ? 'todo' : 'done',
      updatedAt: Date.now()
    };

    set(state => ({
      tasks: state.tasks.map(t => t.id === id ? updatedTask : t)
    }));

    await storage.saveTask(updatedTask);
  },

  deleteTask: async (id: string) => {
    // Optimistic update
    set(state => ({ tasks: state.tasks.filter(t => t.id !== id) }));
    await storage.deleteTask(id);
  },

  updateSettings: async (settings) => {
    await storage.setSyncState(settings);
    const newState = await storage.getSyncState();
    set({ syncState: newState });
  },

  handleLogoutCleanup: async () => {
    await storage.handleLogoutCleanup();
    const newState = await storage.getSyncState();
    // Keep tasks in state, just update sync info
    set({ syncState: newState });
  },

  clearUserData: async () => {
    await storage.clearUserData();
    const newState = await storage.getSyncState();
    set({ tasks: [], syncState: newState });
  },

  triggerSync: async () => {
    set({ isSyncing: true });
    try {
      await sync.push();
      await sync.pull();
      // Reload tasks to reflect changes from server
      const tasks = await storage.getTasks();
      const visibleTasks = tasks.filter(t => !t.deleted);
      set({ tasks: visibleTasks });
    } finally {
      set({ isSyncing: false });
    }
  }
}));
