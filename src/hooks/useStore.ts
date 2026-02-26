import { create } from 'zustand';
import { storage } from '../lib/storage';
import type { Task, SyncState } from '../lib/storage';
import { ulid } from 'ulid';
import { sync } from '../lib/sync';
import { translations, type Language } from '../lib/i18n';

interface StoreState {
  tasks: Task[];
  syncState: SyncState | null;
  isLoading: boolean;
  isSyncing: boolean; // Add sync loading state
  
  loadTasks: () => Promise<void>;
  addTask: (title: string, description?: string) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateSettings: (settings: Partial<SyncState>) => Promise<void>;
  handleLogoutCleanup: () => Promise<void>;
  clearUserData: () => Promise<void>;
  triggerSync: () => Promise<void>; // Manual sync
  pullOnly: () => Promise<void>; // Only pull data from server
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, params?: Record<string, any>) => string;
}

export const useStore = create<StoreState>((set, get) => ({
  tasks: [],
  syncState: null,
  isLoading: true,
  isSyncing: false,

  setLanguage: async (lang: Language) => {
    await storage.setSyncState({ language: lang });
    const newState = await storage.getSyncState();
    set({ syncState: newState });
  },

  t: (key: string, params?: Record<string, any>) => {
    const lang = get().syncState?.language || 'en';
    const bundle = (translations as any)[lang] || (translations as any)['en'];
    let text = bundle[key] || key;
    
    if (params) {
      Object.keys(params).forEach(k => {
        text = text.replace(`{{${k}}}`, params[k]);
      });
    }
    return text;
  },

  loadTasks: async () => {
    set({ isLoading: true });
    const tasks = await storage.getTasks();
    const syncState = await storage.getSyncState();
    
    // Filter out deleted tasks for UI
    let visibleTasks = tasks.filter(t => !t.deleted);
    
    // If we are logged in, and we are in the "pending merge" state (which we can infer if there are offline tasks AND logged in)
    // Actually, store doesn't know about "pending merge". 
    // But the user requested: "offline tasks should NOT appear in list" until merged.
    // So if syncState.userId is present, we should ONLY show tasks that belong to this user.
    // Unless... wait, if we merge, they become user's tasks.
    // So filtering by userId seems correct!
    
    if (syncState?.userId) {
       // Only show tasks that belong to the logged-in user
       // Offline tasks (userId is null) will be hidden until merged
       visibleTasks = visibleTasks.filter(t => t.userId === syncState.userId);
    }
    
    set({ tasks: visibleTasks, syncState, isLoading: false });
  },

  addTask: async (title: string, description?: string) => {
    const newTask: Task = {
      id: ulid(),
      title,
      description,
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

  updateTask: async (id: string, updates: Partial<Task>) => {
    const { tasks } = get();
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const updatedTask = {
      ...task,
      ...updates,
      updatedAt: Date.now()
    };

    set(state => ({
      tasks: state.tasks.map(t => t.id === id ? updatedTask : t)
    }));

    await storage.saveTask(updatedTask);
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
  },

  pullOnly: async () => {
    set({ isSyncing: true });
    try {
      await sync.pull();
      const tasks = await storage.getTasks();
      const visibleTasks = tasks.filter(t => !t.deleted);
      set({ tasks: visibleTasks });
    } finally {
      set({ isSyncing: false });
    }
  }
}));
