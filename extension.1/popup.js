import TimeTrackerDB from './db.js';
// AI was used in helping to code this file
const db = new TimeTrackerDB();
let currentTabId = null;
let isTracking = false;

// Update time display
function updateTimeDisplay(hours, minutes, seconds) {
    document.querySelector('.time-box:nth-child(1) .time-number').textContent = 
        hours.toString().padStart(2, '0');
    document.querySelector('.time-box:nth-child(2) .time-number').textContent = 
        minutes.toString().padStart(2, '0');
    document.querySelector('.time-box:nth-child(3) .time-number').textContent = 
        seconds.toString().padStart(2, '0');
}

// Reset time display
function resetTimeDisplay() {
    updateTimeDisplay(0, 0, 0);
}

// Format time for display
function formatTime(milliseconds) {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
}

// Update history button text
async function updateHistoryButtonText() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            const history = await db.getRecordsByUrl(tab.url);
            const historyBtn = document.getElementById('history-btn');
            if (historyBtn) {
                if (history.length > 0) {
                    // Sort by date to get the most recent record
                    history.sort((a, b) => new Date(b.date) - new Date(a.date));
                    const lastRecord = history[0];
                    historyBtn.textContent = `History (${formatTime(lastRecord.duration)})`;
                } else {
                    historyBtn.textContent = 'History (0h 0m 0s)';
                }
            }
        }
    } catch (error) {
        console.error('Error updating history button:', error);
    }
}

// Check if current tab is being tracked
async function checkTrackingState() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            const data = await chrome.storage.local.get(['trackingEnabled']);
            if (data.trackingEnabled && data.trackingEnabled[tab.id]) {
                isTracking = true;
                const startStopBtn = document.getElementById('start-stop-btn');
                if (startStopBtn) {
                    startStopBtn.textContent = 'Stop';
                    startStopBtn.style.background = '#FF4444';
                }
            }
        }
    } catch (error) {
        console.error('Error checking tracking state:', error);
    }
}

// Listen for time updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'timeUpdate' && message.tabId === currentTabId) {
        updateTimeDisplay(message.hours, message.minutes, message.seconds);
    }
});

// Initialize start/stop button
function initializeStartStopButton() {
    const startStopBtn = document.getElementById('start-stop-btn');
    if (startStopBtn) {
        startStopBtn.addEventListener('click', async () => {
            isTracking = !isTracking;
            startStopBtn.textContent = isTracking ? 'Stop' : 'Start';
            startStopBtn.style.background = isTracking ? '#FF4444' : '#2C2C2C';
            
            // Send message to background script
            chrome.runtime.sendMessage({ 
                action: isTracking ? 'startTracking' : 'stopTracking',
                tabId: currentTabId
            });
            
            if (!isTracking) {
                resetTimeDisplay();
                await updateHistoryButtonText();
            }
        });
    }
}

// Show history view
async function showHistory() {
    const mainView = document.getElementById('main-view');
    const historyView = document.getElementById('history-view');
    const historyContainer = document.getElementById('history-container');
    
    mainView.style.display = 'none';
    historyView.style.display = 'block';
    
    // Clear previous history
    historyContainer.innerHTML = '';
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const history = await db.getRecordsByUrl(tab.url);
        
        if (history.length === 0) {
            historyContainer.innerHTML = '<div class="history-item">No history available for this URL</div>';
            return;
        }

        // Sort records by date, most recent first
        history.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Create history items for each record
        history.forEach((record) => {
            const date = new Date(record.date).toLocaleString();
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <div class="history-url">${new URL(tab.url).hostname}</div>
                <div class="history-details">
                    <span class="history-date">${date}</span>
                    <span class="history-time">${formatTime(record.duration)}</span>
                </div>
            `;
            historyContainer.appendChild(historyItem);
        });
    } catch (error) {
        console.error('Error showing history:', error);
        historyContainer.innerHTML = '<div class="history-item">Error loading history</div>';
    }
}

// Initialize back button
function initializeBackButton() {
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('history-view').style.display = 'none';
            document.getElementById('main-view').style.display = 'block';
        });
    }
}

// Initialize history button
function initializeHistoryButton() {
    const historyBtn = document.getElementById('history-btn');
    if (!historyBtn) {
        console.error('Error: History button not found');
        return;
    }
    if (historyBtn) {
        historyBtn.addEventListener('click', showHistory);
    }
}

// Initialize settings button
function initializeSettingsButton() {
    const settingsBtn = document.querySelector('.settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            // Open Chrome's extension settings page for this extension
            chrome.runtime.openOptionsPage();
            // If the extension doesn't have an options page, open the extensions page
            chrome.tabs.create({
                url: 'chrome://extensions/?id=' + chrome.runtime.id
            });
        });
    }
}

// Update current tab and request time
async function updateCurrentTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            currentTabId = tab.id;
            await updateHistoryButtonText();
            await checkTrackingState(); // Check if this tab is being tracked
        }
    } catch (error) {
        console.error('Error updating current tab:', error);
    }
}

// Initialize everything when the document is loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize database
        await db.init();
        
        // Initialize buttons
        initializeStartStopButton();
        initializeHistoryButton();
        initializeBackButton();
        initializeSettingsButton();
        
        // Update current tab
        await updateCurrentTab();
    } catch (error) {
        console.error('Error initializing popup:', error);
    }
});