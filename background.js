// Background service worker for Edge EPUB Reader

// When the extension icon is clicked, open the reader page
chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('reader.html') });
});

// Intercept navigation to .epub files and redirect to reader
chrome.webNavigation?.onBeforeNavigate?.addListener((details) => {
    if (details.frameId === 0 && details.url.endsWith('.epub')) {
        const readerUrl = chrome.runtime.getURL('reader.html') + '?url=' + encodeURIComponent(details.url);
        chrome.tabs.update(details.tabId, { url: readerUrl });
    }
});

// Context menu to open .epub links
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus?.create({
        id: 'open-epub',
        title: 'Open with EPUB Reader',
        contexts: ['link'],
        targetUrlPatterns: ['*://*/*.epub', '*://*/*.epub?*']
    });
});

chrome.contextMenus?.onClicked?.addListener((info, tab) => {
    if (info.menuItemId === 'open-epub' && info.linkUrl) {
        const readerUrl = chrome.runtime.getURL('reader.html') + '?url=' + encodeURIComponent(info.linkUrl);
        chrome.tabs.create({ url: readerUrl });
    }
});
