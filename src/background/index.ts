import { sync } from '../lib/sync';
import { storage } from '../lib/storage';
import { ulid } from 'ulid';

console.log('Service Worker Loaded');

// Setup Alarms for Sync
chrome.alarms.create('sync', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync') {
    console.log('Triggering auto sync...');
    sync.push().then(() => sync.pull());
  }
});

// Listen for messages from Popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'sync_trigger') {
    console.log('Triggering manual sync...');
    sync.push().then(() => sync.pull());
  }
});

// Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'add-to-qknot',
      title: 'Add to QKnot',
      contexts: ['selection']
    });
    
    chrome.contextMenus.create({
      id: 'add-page-to-qknot',
      title: 'Add page to QKnot',
      contexts: ['page']
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'add-to-qknot' && info.selectionText) {
    const text = info.selectionText.trim();
    if (!text) return;

    // Create task
    const newTask = {
      id: ulid(),
      title: text.length > 50 ? text.substring(0, 50) + '...' : text,
      description: text.length > 50 ? text : undefined,
      status: 'todo' as const,
      priority: 'none' as const,
      tags: ['quick-add'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.saveTask(newTask);
    
    // Trigger sync
    sync.push().then(() => sync.pull());
  } else if (info.menuItemId === 'add-page-to-qknot') {
    const url = tab?.url || info.pageUrl;
    const title = tab?.title || url;
    
    if (!url) return;

    // Create task for page
    const newTask = {
      id: ulid(),
      title: `[链接] ${title}`,
      description: url,
      status: 'todo' as const,
      priority: 'none' as const,
      tags: ['website'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.saveTask(newTask);
    
    // Trigger sync
    sync.push().then(() => sync.pull());
  }
});
