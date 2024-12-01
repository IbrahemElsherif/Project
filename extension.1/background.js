import TimeTrackerDB from './db.js';

const db = new TimeTrackerDB();
let startTime = {};
let tabUrls = {};
let intervalIds = {};
let trackingEnabled = {};

// Function to save time spent on a tab
async function saveTimeSpent(tabId, oldUrl) {
    try {
        if (startTime[tabId] === undefined || oldUrl === undefined || trackingEnabled[tabId] === undefined) {
            throw new Error('Missing required parameter');
        }

        if (trackingEnabled[tabId] && oldUrl && startTime[tabId]) {
            const duration = Date.now() - startTime[tabId];
            if (duration < 0) {
                throw new Error('Duration is negative');
            }
            if (duration === 0) {
                console.log('No time was spent on:', oldUrl);
                return;
            }
            await db.addTimeRecord(oldUrl, duration);
            console.log('Saved time for:', oldUrl, 'Duration:', duration);
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error('Error saving time:', error.message);
        } else {
            console.error('Error saving time:', error);
        }
    }
}

// Function to save all active tabs
async function saveAllActiveTabs() {
    try {
        const promises = Object.keys(trackingEnabled).map(async (tabId) => {
            if (trackingEnabled[tabId] && tabUrls[tabId]) {
                await saveTimeSpent(tabId, tabUrls[tabId]);
            }
        });
        await Promise.all(promises);
    } catch (error) {
        console.error('Error saving all tabs:', error);
    }
}

// Function to calculate and broadcast time
async function updateAndBroadcastTime(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        
        if (startTime[tabId] && tab.url === tabUrls[tabId] && trackingEnabled[tabId]) {
            const currentTime = Date.now() - startTime[tabId];
            
            // Save time periodically even if popup is closed
            if (currentTime > 0 && currentTime % (10 * 1000) === 0) { // Save every 10 seconds
                await db.addTimeRecord(tab.url, 10 * 1000);
                startTime[tabId] = Date.now(); // Reset start time
                console.log('Periodic save for:', tab.url);
            }
            
            // Broadcast time to any open popup
            chrome.runtime.sendMessage({
                action: 'timeUpdate',
                tabId: tabId,
                url: tab.url,
                hours: Math.floor(currentTime / (1000 * 60 * 60)),
                minutes: Math.floor((currentTime % (1000 * 60 * 60)) / (1000 * 60)),
                seconds: Math.floor((currentTime % (1000 * 60)) / 1000)
            }).catch(error => {
                // Popup might be closed, which is normal
                if (!error.message.includes('Could not establish connection')) {
                    console.error('Error sending message:', error);
                }
            });
        }
    } catch (error) {
        // Clean up if tab no longer exists
        if (error.message.includes('No tab with id')) {
            cleanupTab(tabId);
        }
    }
}

// Function to clean up tab data
async function cleanupTab(tabId) {
    try {
        // Save any remaining time before cleanup
        if (trackingEnabled[tabId] && tabUrls[tabId]) {
            await saveTimeSpent(tabId, tabUrls[tabId]);
        }
        
        if (intervalIds[tabId]) {
            clearInterval(intervalIds[tabId]);
            delete intervalIds[tabId];
        }
        delete startTime[tabId];
        delete tabUrls[tabId];
        delete trackingEnabled[tabId];
    } catch (error) {
        console.error('Error in cleanupTab:', error);
    }
}

// Function to save tracking state
async function saveTrackingState() {
    try {
        await chrome.storage.local.set({
            trackingEnabled: trackingEnabled,
            startTime: startTime,
            tabUrls: tabUrls
        });
        console.log('Tracking state saved');
    } catch (error) {
        console.error('Error saving tracking state:', error);
    }
}

// Function to restore tracking state
async function restoreTrackingState() {
    try {
        const data = await chrome.storage.local.get(['trackingEnabled', 'startTime', 'tabUrls']);
        if (data.trackingEnabled) {
            trackingEnabled = data.trackingEnabled;
            startTime = data.startTime;
            tabUrls = data.tabUrls;
            
            // Restart intervals for tracked tabs
            Object.keys(trackingEnabled).forEach(tabId => {
                if (trackingEnabled[tabId] && !intervalIds[tabId]) {
                    intervalIds[tabId] = setInterval(() => {
                        updateAndBroadcastTime(parseInt(tabId));
                    }, 1000);
                }
            });
            console.log('Tracking state restored');
        }
    } catch (error) {
        console.error('Error restoring tracking state:', error);
    }
}

// Initialize database when extension loads
chrome.runtime.onInstalled.addListener(async () => {
    try {
        await db.init();
        console.log('Database initialized successfully');
        
        // Restore previous tracking state
        await restoreTrackingState();
        
        // Initialize tracking for any existing tabs
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            if (!trackingEnabled[tab.id]) {
                tabUrls[tab.id] = tab.url;
                trackingEnabled[tab.id] = false;
            }
        });
    } catch (error) {
        console.error('Failed to initialize database:', error);
    }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startTracking' && message.tabId) {
        trackingEnabled[message.tabId] = true;
        startTime[message.tabId] = Date.now();
        
        // Save state when tracking starts
        saveTrackingState();
        
        // Start interval for active tab
        if (!intervalIds[message.tabId]) {
            intervalIds[message.tabId] = setInterval(() => {
                updateAndBroadcastTime(message.tabId);
            }, 1000); // Run every 1 second
        }
    } else if (message.action === 'stopTracking' && message.tabId) {
        // Save final time
        saveTimeSpent(message.tabId, tabUrls[message.tabId]);
        
        // Clean up tracking
        trackingEnabled[message.tabId] = false;
        if (intervalIds[message.tabId]) {
            clearInterval(intervalIds[message.tabId]);
            delete intervalIds[message.tabId];
        }
        delete startTime[message.tabId];
        
        // Save state when tracking stops
        saveTrackingState();
    }
});

// Initialize tracking when a tab becomes active
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        // Save time for previously active tabs
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
            if (tab.id !== activeInfo.tabId && trackingEnabled[tab.id]) {
                await saveTimeSpent(tab.id, tabUrls[tab.id]);
                startTime[tab.id] = Date.now(); // Reset start time for the tab
            }
        }

        // Set up tracking for newly active tab
        const tab = await chrome.tabs.get(activeInfo.tabId);
        tabUrls[activeInfo.tabId] = tab.url;
        
        // If tracking was enabled, start the interval
        if (trackingEnabled[activeInfo.tabId]) {
            startTime[activeInfo.tabId] = Date.now();
            if (!intervalIds[activeInfo.tabId]) {
                intervalIds[activeInfo.tabId] = setInterval(() => {
                    updateAndBroadcastTime(activeInfo.tabId);
                }, 1000);
            }
        }
    } catch (error) {
        console.error('Error in tab activation:', error);
    }
});

// Track when tab URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        try {
            // Save time for old URL if tracking was enabled
            if (trackingEnabled[tabId]) {
                await saveTimeSpent(tabId, tabUrls[tabId]);
                startTime[tabId] = Date.now(); // Reset start time for new URL
            }
            
            // Update URL
            tabUrls[tabId] = changeInfo.url;
        } catch (error) {
            console.error('Error in URL update:', error);
        }
    }
});

// Save time when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
    try {
        if (trackingEnabled[tabId]) {
            await saveTimeSpent(tabId, tabUrls[tabId]);
        }
        await cleanupTab(tabId);
    } catch (error) {
        console.error('Error in tab removal:', error);
    }
});

// Save data before extension unloads
chrome.runtime.onSuspend.addListener(async () => {
    console.log('Extension unloading - saving all data...');
    await saveAllActiveTabs();
    await saveTrackingState();
});