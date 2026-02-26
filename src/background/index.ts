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

// Helper to create task from text
async function createTaskFromText(text: string) {
  const newTask = {
    id: ulid(),
    title: text, // Store full text in title, no truncation
    // description: undefined, // Description only for metadata like URL
    status: 'todo' as const,
    priority: 'none' as const,
    tags: ['quick-add'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await storage.saveTask(newTask);
  // Trigger sync
  sync.push().then(() => sync.pull());
}

// Helper to create task from page
async function createTaskFromPage(title: string, url: string) {
  const newTask = {
    id: ulid(),
    title: title, // Store clean title without prefix
    description: url, // Store URL in description
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

// Listen for messages from Content Script and Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'sync_trigger') {
    console.log('Triggering manual sync...');
    sync.push().then(() => sync.pull());
  } else if (message.type === 'ADD_TASK_FROM_CONTENT') {
    const text = message.text;
    if (text) {
      createTaskFromText(text).then(() => {
        sendResponse({ success: true });
      });
      return true; // Keep the message channel open for async response
    }
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
    await createTaskFromText(text);
  } else if (info.menuItemId === 'add-page-to-qknot') {
    const url = tab?.url || info.pageUrl;
    
    if (!url) return;

    const title = tab?.title || url;
    await createTaskFromPage(title, url);
  }
});
