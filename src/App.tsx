import { useEffect, useState } from 'react';
import { useStore } from './hooks/useStore';
import { storage } from './lib/storage';
import { Check, Trash2, Settings, Loader2, Plus, AlertCircle, RefreshCw, ChevronLeft } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import clsx from 'clsx';
import { DEFAULT_SERVER_URL } from './config';

function App() {
  const { tasks, loadTasks, addTask, toggleTask, deleteTask, syncState, updateSettings, clearUserData, handleLogoutCleanup, triggerSync, isSyncing } = useStore();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [view, setView] = useState<'list' | 'settings'>('list');

  // Settings form state
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    // Initial load from local storage
    loadTasks().then(() => {
      // Auto-pull on open (silent sync)
      // Only if we have a token
      if (syncState?.token) {
         triggerSync().catch(() => {
            // Silent fail for auto-sync
         });
      }
    });
  }, []); // Run once on mount

  useEffect(() => {
    if (syncState) {
      setServerUrl(syncState.serverUrl || DEFAULT_SERVER_URL);
      setUsername(syncState.username || '');
    }
  }, [syncState]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTaskTitle.trim()) {
      addTask(newTaskTitle.trim());
      setNewTaskTitle('');
    }
  };

  const handleSync = async () => {
    // Use the latest state from the store to avoid stale closure issues during login
    const state = useStore.getState();
    if (state.isSyncing || !state.syncState?.token) return;
    
    await toast.promise(state.triggerSync(), {
      loading: 'Syncing...',
      success: 'Sync complete',
      error: 'Sync failed'
    });
  };

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      // TODO: Move this to a proper API client
      const url = serverUrl.replace(/\/$/, ''); // Remove trailing slash
      const res = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (!res.ok) {
        throw new Error('Login failed');
      }
      
      const data = await res.json();
      
      // Parse userId from token
      let userId = null;
      try {
        const payload = JSON.parse(atob(data.token.split('.')[1]));
        userId = payload.id;
      } catch (e) {
        console.warn('Failed to parse token payload', e);
      }
      
      // Check for offline/guest tasks
      // 1. Identify tasks that belong to ANOTHER user (userId != newUserId) - MUST CLEAR
      // 2. Identify tasks that don't belong to any user (userId is null/undefined) - ASK MERGE
      
      const currentTasks = await storage.getTasks();
      const offlineTasksCount = await storage.getOfflineTasksCount();
      // Explicitly check for tasks that have a userId different from the one logging in
      const hasForeignTasks = currentTasks.some((t: any) => t.userId && t.userId !== userId);
      
      if (hasForeignTasks) {
        // SCENARIO: Tasks belong to another user (e.g. A didn't logout properly, or storage was manipulated)
        // MUST clear to prevent data leak. We do NOT offer merge for these.
        await clearUserData();
      } else if (offlineTasksCount > 0) {
        // SCENARIO: Anonymous tasks exist (Guest -> Login)
        // Ask user to merge
        const confirmMerge = window.confirm(
          `You have ${offlineTasksCount} offline tasks. Do you want to merge them into your account?\n\nCancel will discard these tasks.`
        );
        
        if (confirmMerge) {
          // Assign these tasks to the new user
          if (userId) {
            await storage.assignTasksToUser(userId);
          }
        } else {
          // User chose to discard - clear everything before setting new user
          await clearUserData();
        }
      }

      await updateSettings({ 
        serverUrl: url, 
        token: data.token, 
        userId,
        username 
      });
      setView('list');
      
      // Trigger sync immediately after login and wait for it
      await handleSync();
      
      // Force reload tasks to show updated state (merged or cleared)
      await loadTasks();
      
    } catch (err) {
      setAuthError('Login failed. Check credentials.');
    } finally {
      setAuthLoading(false);
    }
  };
  
  const handleLogout = async () => {
     await handleLogoutCleanup();
     // Force UI update
     await loadTasks();
  };

  if (view === 'settings') {
    return (
      <div className="w-[350px] h-[500px] bg-gray-50 flex flex-col font-sans">
        <header className="px-4 py-3 bg-white border-b border-gray-200 flex items-center space-x-2">
           <button 
             onClick={() => setView('list')} 
             className="font-semibold text-gray-800 hover:text-gray-800 p-1 rounded-md hover:bg-gray-100 transition-colors"
             title="Back"
           >
             <ChevronLeft size={20} />
           </button>
        </header>
        
        <div className="p-4 space-y-4">
          {syncState?.token ? (
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm text-center">
               <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-2">
                 <Check size={24} />
               </div>
               <p className="font-medium text-gray-900">Logged in as {syncState.username}</p>
               <p className="text-xs text-gray-500 mb-4"></p>
               <button 
                 onClick={handleLogout}
                 className="w-full py-2 px-4 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors text-sm font-medium"
               >
                 Logout
               </button>
            </div>
          ) : (
            <div className="space-y-3">
               {/* Hidden Server URL for "Built-in" experience */}
               <div>
                 <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
                 <input 
                   type="text" 
                   value={username}
                   onChange={e => setUsername(e.target.value)}
                   className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm"
                 />
               </div>
               <div>
                 <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                 <input 
                   type="password" 
                   value={password}
                   onChange={e => setPassword(e.target.value)}
                   className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm"
                 />
               </div>
               
               {authError && (
                 <div className="flex items-center text-red-500 text-xs gap-1">
                   <AlertCircle size={12} /> {authError}
                 </div>
               )}

               <button 
                 onClick={handleLogin}
                 disabled={authLoading}
                 className="w-full py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center justify-center"
               >
                 {authLoading ? <Loader2 size={16} className="animate-spin" /> : 'Login'}
               </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-[350px] h-[500px] bg-gray-50 flex flex-col font-sans">
      <Toaster position="bottom-center" />
      {/* Header */}
      <header className="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center text-white font-bold text-xs shadow-indigo-200 shadow-md">
            QK
          </div>
          <h1 className="font-bold text-gray-800 tracking-tight">QKnot</h1>
        </div>
        <div className="flex items-center space-x-2 text-gray-500">
           <button 
             onClick={() => setView('settings')}
             className="hover:text-gray-700 p-1.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
             title="Settings"
           >
             <Settings size={18} />
           </button>
        </div>
      </header>

      {/* Quick Add */}
      <div className="p-4 bg-white border-b border-gray-100">
        <div className="relative">
          <input 
            type="text" 
            value={newTaskTitle}
            onChange={e => setNewTaskTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a task..." 
            className="w-full pl-3 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm transition-all shadow-sm"
            autoFocus
          />
          <button 
             onClick={() => {
                if(newTaskTitle.trim()) {
                   addTask(newTaskTitle.trim());
                   setNewTaskTitle('');
                }
             }}
             className="absolute right-1.5 top-1.5 p-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
             <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-gray-200">
        {tasks.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm opacity-60">
             <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <Check size={32} className="text-gray-300" />
             </div>
             <p>All clear for now</p>
           </div>
        ) : (
          tasks.map(task => {
            const tags = task.title.match(/#\S+/g) || [];
            const displayTitle = task.title.replace(/#\S+/g, '').trim();
            const linkMatch = displayTitle.match(/^\[链接\]\s*(.*)/);
            const isLink = !!linkMatch;
            const linkText = linkMatch ? linkMatch[1] : displayTitle;
            
            return (
            <div 
              key={task.id} 
              className={clsx(
                "group flex items-start p-3 bg-white rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md hover:border-gray-200",
                task.status === 'done' && "opacity-60 bg-gray-50"
              )}
            >
              <button 
                onClick={() => toggleTask(task.id)}
                className={clsx(
                  "mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-all flex-shrink-0",
                  task.status === 'done' 
                    ? "bg-indigo-600 border-indigo-600 text-white" 
                    : "border-gray-300 hover:border-indigo-400 text-transparent"
                )}
              >
                <Check size={12} strokeWidth={3} />
              </button>
              
              <div className="ml-3 flex-1 min-w-0">
                <p className={clsx(
                  "text-sm text-gray-800 break-words leading-snug transition-all",
                  task.status === 'done' && "line-through text-gray-400"
                )}>
                  {isLink ? (
                    <>
                      <a 
                        href={task.description} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:underline text-indigo-600 font-medium cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        [链接]
                      </a>
                      {' ' + linkText}
                    </>
                  ) : (
                    displayTitle
                  )}
                </p>
                {/* Tags Display */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {tags.map((tag, i) => (
                      <span key={i} className="text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={() => deleteTask(task.id)}
                className="ml-2 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
            );
          })
        )}
      </div>

      {/* Footer / Status Bar */}
      <div className="px-4 py-2.5 bg-white border-t border-gray-100 text-[11px] text-gray-400 flex justify-between items-center font-medium">
        <div className="flex items-center space-x-2">
           {/* Sync Button */}
           <button 
             onClick={handleSync}
             disabled={isSyncing || !syncState?.token}
             className={clsx(
               "p-1.5 rounded-full transition-all",
               syncState?.token 
                 ? "hover:bg-gray-100 text-indigo-500 cursor-pointer" 
                 : "text-gray-300 cursor-not-allowed"
             )}
             title={isSyncing ? "Syncing..." : "Sync now"}
           >
             <RefreshCw size={14} className={clsx(isSyncing && "animate-spin")} />
           </button>
           
           <span>{tasks.filter(t => t.status === 'todo').length} tasks pending</span>
        </div>

        <span className="flex items-center space-x-1.5">
          <span className={clsx(
             "w-2 h-2 rounded-full",
             syncState?.token ? "bg-green-500 shadow-green-200 shadow-sm" : "bg-gray-300"
          )}></span>
          <span>{syncState?.token ? 'Sync Active' : 'Offline'}</span>
        </span>
      </div>
    </div>
  )
}

export default App
