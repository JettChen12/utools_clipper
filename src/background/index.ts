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
  // Extract tags if present in the selected text
  const tagsMatch = text.match(/#\S+/g);
  const extractedTags = tagsMatch ? tagsMatch.map(t => t.slice(1)) : [];
  
  // Clean text
  const cleanText = text.replace(/#\S+/g, '').trim();

  const newTask = {
    id: ulid(),
    title: cleanText, 
    // description: undefined, // Description only for metadata like URL
    status: 'todo' as const,
    priority: 'none' as const,
    tags: [...new Set(['quick-add', ...extractedTags])], // Merge quick-add with extracted tags
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await storage.saveTask(newTask);
  // Trigger sync
  sync.push().then(() => sync.pull());
}

// Helper to create task from page
async function createTaskFromPage(title: string, url: string) {
  // Extract tags if present in the page title
  const tagsMatch = title.match(/#\S+/g);
  const extractedTags = tagsMatch ? tagsMatch.map(t => t.slice(1)) : [];
  
  // Clean title
  const cleanTitle = title.replace(/#\S+/g, '').trim();

  const newTask = {
    id: ulid(),
    title: cleanTitle, 
    description: url, // Store URL in description
    status: 'todo' as const,
    priority: 'none' as const,
    tags: [...new Set(['website', ...extractedTags])], // Merge website with extracted tags
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
