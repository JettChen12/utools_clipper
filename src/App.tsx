import { useEffect, useState } from 'react';
import { useStore } from './hooks/useStore';
import { storage } from './lib/storage';
import { Check, Trash2, Settings, Loader2, Plus, AlertCircle, RefreshCw, ChevronLeft, User, Globe, Info, X, Link2, ExternalLink } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import clsx from 'clsx';
import { DEFAULT_SERVER_URL } from './config';
import { LANGUAGES } from './lib/i18n';
import packageJson from '../package.json';

function App() {
  const { tasks, loadTasks, addTask, toggleTask, deleteTask, updateTask, syncState, updateSettings, clearUserData, handleLogoutCleanup, triggerSync, pullOnly, isSyncing, t, setLanguage } = useStore();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editTitle, setEditTitle] = useState(''); // Local state for editing task
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [tagInputText, setTagInputText] = useState('');
  const [view, setView] = useState<'list' | 'settings' | 'detail'>('list');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'account' | 'language' | 'about'>('account');

  // Settings form state
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Merge confirmation modal state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [pendingMergeUserId, setPendingMergeUserId] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);

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

  // Use an effect to handle the modal trigger safely after view change
  useEffect(() => {
    // Check if we need to show the modal
    if (view === 'list' && offlineCount > 0 && pendingMergeUserId) {
       // We are in list view, and we have pending merge
       console.log('Triggering Modal Visibility');
       setShowMergeModal(true);
    }
  }, [view, offlineCount, pendingMergeUserId]);

  const handleRegister = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const url = serverUrl.replace(/\/$/, '');
      const res = await fetch(`${url}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (!res.ok) {
        throw new Error('Registration failed. Username may be taken.');
      }
      
      const data = await res.json();
      toast.success('Registration successful! Logging in...');
      
      // Auto-login after successful registration
      // Just call handleLogin directly since state (username/password) is already set
      await handleLogin();
      
    } catch (err) {
      setAuthError('Registration failed. Username may be taken.');
    } finally {
      setAuthLoading(false);
    }
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
        // Defer merge prompt until we switch view
        setOfflineCount(offlineTasksCount);
        setPendingMergeUserId(userId);
        // We'll show the modal after view change
      }

      await updateSettings({ 
        serverUrl: url, 
        token: data.token, 
        userId,
        username 
      });
      // Clear password for security
      setPassword('');
      setView('list');
      
      // If we have offline tasks, show modal NOW, after view switch (in next render cycle effectively)
      console.log('Merge Check:', { offlineTasksCount, hasForeignTasks });
      if (offlineTasksCount > 0 && !hasForeignTasks) {
        
        // IMPORTANT: We must PULL user data first to show the user their existing cloud tasks
        // BUT we must NOT PUSH our offline tasks yet!
        // So we need a "Pull Only" sync here.
        await pullOnly();
        
        // After pull, force reload tasks to show the PULLed tasks
        // Note: loadTasks will now filter out offline tasks because userId is set!
        // This is exactly what the user wants: show ONLY account tasks, hide offline tasks.
        
        // setShowMergeModal(true); // Don't trigger directly, let useEffect handle it
        // Don't full sync yet, wait for user decision
        return; 
      }
      
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
     // Clear password for security
     setPassword('');
     // Force UI update
     await loadTasks();
  };

  const handleMergeDecision = async (merge: boolean) => {
    setShowMergeModal(false);
    
    if (merge && pendingMergeUserId) {
        await storage.assignTasksToUser(pendingMergeUserId);
        toast.success('Tasks merged successfully');
      } else {
        await storage.discardOfflineTasks();
        toast.success('Offline tasks discarded');
      }
    
    // After decision, proceed with sync
    await handleSync();
    await loadTasks();
    setPendingMergeUserId(null);
  };

  if (view === 'settings') {
    return (
      <div className="w-[350px] h-[500px] bg-gray-50 flex flex-col font-sans">
        <header className="px-4 py-3 bg-white border-b border-gray-200 flex items-center space-x-2 shrink-0">
           <button 
             onClick={() => setView('list')} 
             className="font-semibold text-gray-800 hover:text-gray-800 p-1 rounded-md hover:bg-gray-100 transition-colors"
             title="Back"
           >
             <ChevronLeft size={20} />
           </button>
           <h2 className="font-semibold text-gray-800 text-sm">{t('settings.title')}</h2>
        </header>
        
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-[100px] bg-gray-50 border-r border-gray-200 flex flex-col py-2 space-y-1">
            <button 
              onClick={() => setSettingsTab('account')}
              className={clsx(
                "w-full px-3 py-2 text-xs font-medium text-left flex items-center gap-2 transition-colors relative",
                settingsTab === 'account' ? "text-indigo-600 bg-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <User size={14} />
              {t('settings.menu.account')}
              {settingsTab === 'account' && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-600"></div>
              )}
            </button>
            <button 
              onClick={() => setSettingsTab('language')}
              className={clsx(
                "w-full px-3 py-2 text-xs font-medium text-left flex items-center gap-2 transition-colors relative",
                settingsTab === 'language' ? "text-indigo-600 bg-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Globe size={14} />
              {t('settings.menu.language')}
              {settingsTab === 'language' && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-600"></div>
              )}
            </button>
            <button 
              onClick={() => setSettingsTab('about')}
              className={clsx(
                "w-full px-3 py-2 text-xs font-medium text-left flex items-center gap-2 transition-colors relative",
                settingsTab === 'about' ? "text-indigo-600 bg-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Info size={14} />
              {t('settings.menu.about')}
              {settingsTab === 'about' && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-600"></div>
              )}
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-white p-4 overflow-y-auto">
            
            {/* Account Tab */}
            {settingsTab === 'account' && (
              syncState?.token ? (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                   <div className="w-12 h-12 bg-white text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-gray-100">
                     <User size={24} />
                   </div>
                   <p className="font-semibold text-gray-900 mb-1">{syncState.username}</p>
                   <div className="flex items-center justify-center gap-1.5 mb-4">
                     <span className="w-2 h-2 rounded-full bg-green-500"></span>
                     <p className="text-xs text-gray-500">Logged in</p>
                   </div>
                   <button 
                     onClick={handleLogout}
                     className="w-full py-2 px-4 bg-white border border-gray-200 text-red-600 rounded-lg hover:bg-red-50 hover:border-red-100 transition-all text-xs font-medium shadow-sm"
                   >
                     {t('settings.logout')}
                   </button>
                </div>
              ) : (
                <div className="space-y-3">
                   {/* Login/Register Form */}
                   <div>
                     <label className="block text-xs font-medium text-gray-700 mb-1">{t('settings.username')}</label>
                     <input 
                       type="text" 
                       value={username}
                       onChange={e => setUsername(e.target.value)}
                       className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                     />
                   </div>
                   <div>
                     <label className="block text-xs font-medium text-gray-700 mb-1">{t('settings.password')}</label>
                     <input 
                       type="password" 
                       value={password}
                       onChange={e => setPassword(e.target.value)}
                       className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                     />
                   </div>
                   
                   {authError && (
                     <div className="flex items-center text-red-500 text-xs gap-1.5 bg-red-50 p-2 rounded-lg border border-red-100">
                       <AlertCircle size={14} className="shrink-0" /> 
                       <span>{authError}</span>
                     </div>
                   )}
    
                   <button 
                     onClick={isRegistering ? handleRegister : handleLogin}
                     disabled={authLoading}
                     className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-medium flex items-center justify-center shadow-sm shadow-indigo-200 mt-2"
                   >
                     {authLoading ? <Loader2 size={16} className="animate-spin" /> : (isRegistering ? t('settings.register') : t('settings.login'))}
                   </button>
                   
                   <div className="text-center mt-3 pt-2 border-t border-gray-50">
                     <button
                       onClick={() => {
                         setIsRegistering(!isRegistering);
                         setAuthError('');
                       }}
                       className="text-xs text-gray-500 hover:text-indigo-600 font-medium hover:underline transition-colors"
                     >
                       {isRegistering ? t('settings.switch_to_login') : t('settings.switch_to_register')}
                     </button>
                   </div>
                </div>
              )
            )}

            {/* Language Tab */}
            {settingsTab === 'language' && (
              <div>
                 <label className="block text-xs font-medium text-gray-700 mb-2">{t('settings.language')}</label>
                 <div className="space-y-2">
                   {LANGUAGES.map(lang => (
                     <label 
                       key={lang.code} 
                       className={clsx(
                         "flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all",
                         (syncState?.language || 'en') === lang.code 
                           ? "bg-indigo-50 border-indigo-200 shadow-sm" 
                           : "bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                       )}
                     >
                       <div className="flex items-center gap-3">
                         <div className={clsx(
                           "w-4 h-4 rounded-full border flex items-center justify-center",
                           (syncState?.language || 'en') === lang.code ? "border-indigo-600" : "border-gray-300"
                         )}>
                           {(syncState?.language || 'en') === lang.code && <div className="w-2 h-2 rounded-full bg-indigo-600"></div>}
                         </div>
                         <span className={clsx(
                           "text-sm font-medium",
                           (syncState?.language || 'en') === lang.code ? "text-indigo-900" : "text-gray-700"
                         )}>{lang.label}</span>
                       </div>
                       <input 
                         type="radio" 
                         name="language" 
                         value={lang.code}
                         checked={(syncState?.language || 'en') === lang.code}
                         onChange={(e) => setLanguage(e.target.value as any)}
                         className="hidden"
                       />
                     </label>
                   ))}
                 </div>
              </div>
            )}

            {/* About Tab */}
            {settingsTab === 'about' && (
              <div className="text-center space-y-4 pt-2">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-indigo-200 shadow-lg mx-auto rotate-3">
                  QK
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">QKnot</h3>
                  <p className="text-xs text-gray-500 mt-1">v{packageJson.version}</p>
                </div>
                
                <p className="text-xs text-gray-600 leading-relaxed px-2">
                  {t('about.description')}
                </p>
                
                <div className="pt-4 border-t border-gray-50">
                  <a 
                    href="https://github.com/JettChen12" 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors bg-gray-50 px-3 py-1.5 rounded-full hover:bg-indigo-50"
                  >
                    <Globe size={12} />
                    GitHub
                  </a>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  if (view === 'detail' && selectedTaskId) {
    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) {
      setView('list');
      return null;
    }

    const tags = task.tags || [];

    const handleSaveTag = () => {
      const tag = tagInputText.trim();
      
      if (tag) {
        const newTags = [...tags];
        
        if (editingTagIndex !== null) {
          // Editing existing tag
          // Check for duplicates (excluding self)
          const isDuplicate = newTags.some((t, i) => i !== editingTagIndex && t === tag);
          if (!isDuplicate) {
            newTags[editingTagIndex] = tag;
            updateTask(task.id, { tags: newTags });
          }
        } else {
          // Adding new tag
          if (!newTags.includes(tag)) {
            updateTask(task.id, { tags: [...newTags, tag] });
          }
        }
      } else if (editingTagIndex !== null) {
        // If empty string when editing, remove the tag
        const newTags = tags.filter((_, i) => i !== editingTagIndex);
        updateTask(task.id, { tags: newTags });
      }

      // Reset state
      setTagInputText('');
      setIsAddingTag(false);
      setEditingTagIndex(null);
    };

    const handleRemoveTag = (tagToRemove: string) => {
      updateTask(task.id, { tags: tags.filter(t => t !== tagToRemove) });
    };

    return (
      <div className="w-[350px] h-[500px] bg-white flex flex-col font-sans">
        <header className="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
           <div className="flex items-center space-x-2">
             <button 
               onClick={() => {
                 updateTask(task.id, { title: editTitle });
                 setView('list');
               }} 
               className="font-semibold text-gray-800 hover:text-gray-800 p-1 rounded-md hover:bg-gray-100 transition-colors"
               title="Back"
             >
               <ChevronLeft size={20} />
             </button>
             <h2 className="font-semibold text-gray-800 text-sm">{t('task.edit_title')}</h2>
           </div>
           <button 
             onClick={() => {
                deleteTask(task.id);
                setView('list');
             }}
             className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors"
           >
             <Trash2 size={16} />
           </button>
        </header>

        <div className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-4 h-full flex flex-col">
            <div className="flex-1">
              <textarea
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => updateTask(task.id, { title: editTitle })}
                className="w-full h-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none"
                placeholder={t('task.add_placeholder')}
                autoFocus
                onFocus={(e) => {
                  const len = e.target.value.length;
                  e.target.setSelectionRange(len, len);
                }}
              />
            </div>

            {/* Link Display */}
            {task.description && (task.description.startsWith('http') || task.description.startsWith('www.')) && (
              <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                <Link2 size={14} className="text-indigo-400 flex-shrink-0" />
                <a
                  href={task.description}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-xs text-indigo-600 hover:text-indigo-700 truncate transition-colors"
                  title={task.description}
                >
                  {task.description}
                </a>
                <button
                  onClick={() => updateTask(task.id, { description: undefined })}
                  className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  title="Remove link"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            )}

            {/* Tags Management */}
            <div className="pt-2 border-t border-gray-100">
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, i) => (
                  editingTagIndex === i ? (
                    <div key={i} className="flex items-center">
                      <span className="text-gray-400 text-xs mr-1">#</span>
                      <input
                        type="text"
                        value={tagInputText}
                        onChange={(e) => setTagInputText(e.target.value)}
                        onBlur={handleSaveTag}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTag();
                          if (e.key === 'Escape') {
                            setEditingTagIndex(null);
                            setTagInputText('');
                          }
                        }}
                        maxLength={12}
                        className="w-24 px-2 py-1 bg-white border border-indigo-300 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div 
                      key={i} 
                      onClick={() => {
                        setEditingTagIndex(i);
                        setTagInputText(tag);
                      }}
                      className="group relative inline-flex items-center justify-center bg-indigo-50 text-indigo-700 rounded-full px-3 py-1 text-xs font-medium border border-indigo-100 hover:border-indigo-200 transition-all cursor-pointer select-none hover:bg-indigo-100"
                    >
                      <span>#{tag}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent triggering edit mode
                          handleRemoveTag(tag);
                        }}
                        className="absolute -top-1.5 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600 z-10"
                        title={t('task.remove_tag')}
                      >
                        <X size={8} strokeWidth={3} />
                      </button>
                    </div>
                  )
                ))}
                
                {isAddingTag ? (
                  <div className="flex items-center">
                    <span className="text-gray-400 text-xs mr-1">#</span>
                    <input
                      type="text"
                      value={tagInputText}
                      onChange={(e) => setTagInputText(e.target.value)}
                      onBlur={handleSaveTag}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTag();
                        if (e.key === 'Escape') {
                          setIsAddingTag(false);
                          setTagInputText('');
                        }
                      }}
                      maxLength={12}
                      className="w-24 px-2 py-1 bg-white border border-indigo-300 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder={t('task.tag_placeholder')}
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setIsAddingTag(true);
                      setTagInputText('');
                      setEditingTagIndex(null);
                    }}
                    className="flex items-center text-xs text-gray-500 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 px-2.5 py-1 rounded-full border border-gray-200 hover:border-indigo-200 transition-all border-dashed h-[26px]"
                  >
                    <Plus size={12} className="mr-1" />
                    {t('task.add_tag')}
                  </button>
                )}
              </div>
            </div>

            <div className="pt-2 text-xs text-gray-400 flex flex-col space-y-1">
              <span>{t('task.created', { date: new Date(task.createdAt).toLocaleString() })}</span>
              <span>{t('task.updated', { date: new Date(task.updatedAt).toLocaleString() })}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("w-[350px] h-[500px] bg-gray-50 flex flex-col font-sans relative", showMergeModal && "overflow-hidden")}>
      <Toaster position="bottom-center" />
      
      {/* Global Merge Modal Overlay */}
      {showMergeModal && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-[100] animate-in fade-in duration-200">
           {/* Modal Content */}
           <div className="bg-white rounded-xl shadow-2xl border border-gray-100 p-5 w-full max-w-[280px] animate-in zoom-in-95 duration-200">
              <div className="mb-4">
                <h3 className="font-bold text-gray-900 mb-1 text-sm">Sync Conflict</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  You have <span className="font-semibold text-gray-700">{offlineCount} offline tasks</span>. 
                  Merge them with your account?
                </p>
              </div>
              <div className="flex space-x-2">
                <button 
                  onClick={() => handleMergeDecision(false)}
                  className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium transition-colors"
                >
                  Discard
                </button>
                <button 
                  onClick={() => handleMergeDecision(true)}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200 rounded-lg text-xs font-medium transition-colors"
                >
                  Merge
                </button>
              </div>
            </div>
        </div>
      )}

      {/* Header */}
      <header className="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center text-white font-bold text-xs shadow-indigo-200 shadow-md">
            QK
          </div>
          <h1 className="font-bold text-gray-800 tracking-tight">{t('app.name')}</h1>
        </div>
        <div className="flex items-center space-x-2 text-gray-500">
           <button 
             onClick={() => setView('settings')}
             className="hover:text-gray-700 p-1.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
             title={t('settings.title')}
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
            placeholder={t('task.add_placeholder')} 
            // Disable autofocus if modal is open to prevent keyboard interaction
            className="w-full pl-3 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm transition-all shadow-sm"
            autoFocus={!showMergeModal}
            disabled={showMergeModal} // Disable input completely when modal is open
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
      <div className={clsx("flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-gray-200", showMergeModal && "pointer-events-none")}>
        {tasks.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm opacity-60">
             <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <Check size={32} className="text-gray-300" />
             </div>
             <p>{t('task.empty_state')}</p>
           </div>
        ) : (
          tasks
            .slice()
            .sort((a, b) => {
              if (a.status === b.status) return 0;
              return a.status === 'done' ? 1 : -1;
            })
            .map(task => {
            const tags = task.tags || [];
            const displayTitle = task.title;
            // Check if task has a URL description (basic check)
            const isLink = task.description && (task.description.startsWith('http') || task.description.startsWith('www.'));
            
            return (
            <div 
              key={task.id} 
              className={clsx(
                "group flex items-start p-3 bg-white rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md hover:border-gray-200 cursor-pointer",
                task.status === 'done' && "opacity-60 bg-gray-50"
              )}
              onClick={() => {
                setSelectedTaskId(task.id);
                // Initialize edit title without tags
                setEditTitle(task.title);
                setIsAddingTag(false);
                setEditingTagIndex(null);
                setTagInputText('');
                setView('detail');
              }}
            >
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTask(task.id);
                }}
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
                  "text-sm text-gray-800 break-words leading-snug transition-all line-clamp-3",
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
                        {t('link.text')}
                      </a>
                      {' ' + displayTitle}
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
                        #{tag.length > 12 ? tag.slice(0, 12) + '...' : tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTask(task.id);
                }}
                className="ml-1 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
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
             title={isSyncing ? t('status.syncing') : "Sync now"}
           >
             <RefreshCw size={14} className={clsx(isSyncing && "animate-spin")} />
           </button>
           
           <span>{t('status.tasks_pending', { count: tasks.filter(t => t.status === 'todo').length })}</span>
        </div>

        <span className="flex items-center space-x-1.5">
          <span className={clsx(
             "w-2 h-2 rounded-full",
             syncState?.token ? "bg-green-500 shadow-green-200 shadow-sm" : "bg-gray-300"
          )}></span>
          <span>{syncState?.token ? t('status.sync_active') : t('status.offline')}</span>
        </span>
      </div>
    </div>
  )
}

export default App
