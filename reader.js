/* ========================================================================
   Edge EPUB Reader — JavaScript
   Full-featured EPUB reader with Edge Legacy + Play Books UX
   ======================================================================== */

(function () {
    'use strict';

    // ─── State ───────────────────────────────────────────────────────────
    let book = null;
    let rendition = null;
    let currentCfi = null;
    let bookKey = null;
    let locations = null;
    let toc = [];
    let isReadAloudActive = false;
    let currentUtterance = null;
    let currentBookData = null; // raw ArrayBuffer for library re-open

    // ─── DOM References ──────────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const welcomeScreen = $('#welcomeScreen');
    const readerUI = $('#readerUI');
    const dropOverlay = $('#dropOverlay');
    const openFileBtn = $('#openFileBtn');
    const fileInput = $('#fileInput');
    const viewer = $('#viewer');
    const bookTitleEl = $('#bookTitle');

    // Toolbar buttons
    const libraryBtn = $('#libraryBtn');
    const tocBtn = $('#tocBtn');
    const searchBtn = $('#searchBtn');
    const nightLightBtn = $('#nightLightBtn');
    const readAloudBtn = $('#readAloudBtn');
    const bookmarkBtn = $('#bookmarkBtn');
    const settingsBtn = $('#settingsBtn');
    const fullscreenBtn = $('#fullscreenBtn');

    // Side panel
    const sidePanel = $('#sidePanel');
    const closePanelBtn = $('#closePanelBtn');
    const panelTabs = $$('.panel-tab');
    const panelContents = $$('.panel-content');
    const tocList = $('#tocList');
    const bookmarksList = $('#bookmarksList');
    const annotationsList = $('#annotationsList');
    const searchInput = $('#searchInput');
    const searchGoBtn = $('#searchGoBtn');
    const searchResults = $('#searchResults');

    // Settings
    const settingsPanel = $('#settingsPanel');
    const themeButtons = $$('.theme-btn');
    const fontSizeSlider = $('#fontSizeSlider');
    const fontSizeValue = $('#fontSizeValue');
    const fontFamilySelect = $('#fontFamilySelect');
    const lineSpacingSlider = $('#lineSpacingSlider');
    const lineSpacingValue = $('#lineSpacingValue');
    const layoutButtons = $$('.layout-btn');
    const flowButtons = $$('.flow-btn');
    const alignButtons = $$('.align-btn');
    const brightnessSlider = $('#brightnessSlider');
    const brightnessValueEl = $('#brightnessValue');
    const nightLightSlider = $('#nightLightSlider');
    const nightLightValueEl = $('#nightLightValue');
    const pageAnimToggle = $('#pageAnimToggle');

    // Navigation
    const prevPageBtn = $('#prevPage');
    const nextPageBtn = $('#nextPage');
    const progressSlider = $('#progressSlider');
    const currentChapterEl = $('#currentChapter');
    const pageIndicator = $('#pageIndicator');
    const readingTimeEl = $('#readingTime');
    const readerContent = $('#readerContent');

    // Read Aloud
    const readAloudBar = $('#readAloudBar');
    const raPlayPause = $('#raPlayPause');
    const raStop = $('#raStop');
    const raSpeedSelect = $('#raSpeedSelect');
    const raVoiceSelect = $('#raVoiceSelect');
    const raClose = $('#raClose');
    const raPlayIcon = $('#raPlayIcon');
    const raPauseIcon = $('#raPauseIcon');

    // Highlight menu
    const highlightMenu = $('#highlightMenu');
    const hlColors = $$('.hl-color');
    const hlNoteBtn = $('#hlNoteBtn');
    const hlRemoveBtn = $('#hlRemoveBtn');
    const hlDefineBtn = $('#hlDefineBtn');
    const hlTranslateBtn = $('#hlTranslateBtn');

    // Dictionary
    const dictPopup = $('#dictPopup');
    const dictWord = $('#dictWord');
    const dictPhonetic = $('#dictPhonetic');
    const dictContent = $('#dictContent');
    const dictClose = $('#dictClose');

    // Translation
    const translatePopup = $('#translatePopup');
    const translateOriginal = $('#translateOriginal');
    const translateResult = $('#translateResult');
    const translateLang = $('#translateLang');
    const translateClose = $('#translateClose');

    // Overlays
    const nightLightOverlay = $('#nightLightOverlay');
    const brightnessOverlay = $('#brightnessOverlay');

    // Library
    const librarySection = $('#librarySection');
    const libraryGrid = $('#libraryGrid');

    // ─── File Handle Storage (IndexedDB) ─────────────────────────────────
    const dbName = 'EpubReaderDB';
    const storeName = 'fileHandles';

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function storeFileHandle(key, handle) {
        try {
            const db = await initDB();
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(handle, key);
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) {
            console.warn('Could not store file handle:', e);
            return false;
        }
    }

    async function getFileHandle(key) {
        try {
            const db = await initDB();
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.warn('Could not get file handle:', e);
            return null;
        }
    }

    // ─── Storage Helper ──────────────────────────────────────────────────
    const Storage = {
        async get(key) {
            return new Promise(resolve => {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.local.get(key, (res) => resolve(res[key]));
                } else {
                    const val = localStorage.getItem(key);
                    resolve(val ? JSON.parse(val) : undefined);
                }
            });
        },
        async set(key, value) {
            return new Promise(resolve => {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.local.set({ [key]: value }, resolve);
                } else {
                    localStorage.setItem(key, JSON.stringify(value));
                    resolve();
                }
            });
        }
    };

    // ─── Settings Persistence ────────────────────────────────────────────
    const defaultSettings = {
        theme: 'dark',
        fontSize: 18,
        fontFamily: "'Literata', Georgia, serif",
        lineSpacing: 1.6,
        spread: 'double',
        flow: 'paginated',
        textAlign: 'justify',
        brightness: 100,
        nightLight: 0,
        pageAnimation: false
    };

    let settings = { ...defaultSettings };

    async function loadSettings() {
        const saved = await Storage.get('epubReaderSettings');
        if (saved) {
            settings = { ...defaultSettings, ...saved };
        }
        applySettings();
    }

    async function saveSettings() {
        await Storage.set('epubReaderSettings', settings);
    }

    function applySettings() {
        // Theme
        document.body.className = `theme-${settings.theme}`;
        document.body.setAttribute('data-spread', settings.spread);
        themeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.theme === settings.theme));

        // Font size
        fontSizeSlider.value = settings.fontSize;
        fontSizeValue.textContent = settings.fontSize;
        document.documentElement.style.setProperty('--font-size', settings.fontSize + 'px');

        // Font family
        fontFamilySelect.value = settings.fontFamily;
        document.documentElement.style.setProperty('--font-family', settings.fontFamily);

        // Line spacing
        lineSpacingSlider.value = settings.lineSpacing;
        lineSpacingValue.textContent = settings.lineSpacing;
        document.documentElement.style.setProperty('--line-height', settings.lineSpacing);

        // Spread
        layoutButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.spread === settings.spread));

        // Flow
        flowButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.flow === settings.flow));

        // Text align
        alignButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.align === settings.textAlign));

        // Brightness
        brightnessSlider.value = settings.brightness;
        brightnessValueEl.textContent = settings.brightness;
        const dimAmount = (100 - settings.brightness) / 100;
        brightnessOverlay.style.background = `rgba(0, 0, 0, ${dimAmount * 0.7})`;

        // Night Light
        nightLightSlider.value = settings.nightLight;
        nightLightValueEl.textContent = settings.nightLight;
        const nlOpacity = settings.nightLight / 100 * 0.35;
        nightLightOverlay.style.background = `rgba(255, 180, 50, ${nlOpacity})`;
        nightLightBtn.classList.toggle('night-active', settings.nightLight > 0);

        // Page animation
        pageAnimToggle.classList.toggle('active', settings.pageAnimation);

        // Apply to rendition if loaded
        if (rendition) {
            applyRenditionStyles();
            rendition.spread(settings.spread === 'double' ? 'auto' : 'none');
            if (rendition.settings && rendition.settings.flow !== settings.flow) {
                rendition.flow(settings.flow);
            }
        }
    }

    function applyRenditionStyles() {
        if (!rendition) return;

        const isDark = settings.theme === 'dark';
        const isSepia = settings.theme === 'sepia';

        let bgColor = '#FFFFFF';
        let textColor = '#1A1A1A';
        if (isDark) { bgColor = '#1E1E1E'; textColor = '#E0E0E0'; }
        if (isSepia) { bgColor = '#F5E6C8'; textColor = '#3B2E1A'; }

        rendition.themes.default({
            'html': {
                'background': bgColor + ' !important',
                'color': textColor + ' !important'
            },
            'body': {
                'background': bgColor + ' !important',
                'color': textColor + ' !important',
                'font-family': settings.fontFamily + ' !important',
                'font-size': settings.fontSize + 'px !important',
                'line-height': settings.lineSpacing + ' !important',
                'text-align': settings.textAlign + ' !important',
                'padding': '0 20px !important'
            },
            'p, div, span, li, td, th': {
                'color': textColor + ' !important',
                'font-family': settings.fontFamily + ' !important',
                'line-height': settings.lineSpacing + ' !important',
                'text-align': settings.textAlign + ' !important'
            },
            'h1, h2, h3, h4, h5, h6': {
                'color': textColor + ' !important',
                'font-family': settings.fontFamily + ' !important',
                'text-align': 'left !important'
            },
            'a': {
                'color': (isDark ? '#4FC3F7' : '#0078D4') + ' !important'
            },
            'img': {
                'max-width': '100% !important',
                'height': 'auto !important'
            }
        });
    }

    // ─── File Handling ───────────────────────────────────────────────────
    function init() {
        loadSettings();
        setupEventListeners();
        populateVoices();
        loadLibrary();

        // Check for Electron IPC file open event
        if (window.electronAPI) {
            window.electronAPI.onOpenFile(async (filePath) => {
                showLoading();
                welcomeScreen.classList.add('hidden');
                readerUI.classList.remove('hidden');

                const response = await window.electronAPI.readFile(filePath);
                if (response.success) {
                    bookKey = 'epub_' + response.fileName.replace(/\W/g, '_');
                    // Convert Node Buffer (which comes over IPC as a Uint8Array) to ArrayBuffer
                    const arrayBuffer = response.data.buffer.slice(response.data.byteOffset, response.data.byteOffset + response.data.byteLength);
                    currentBookData = arrayBuffer;
                    initBook(arrayBuffer, response.fileName);
                } else {
                    hideLoading();
                    viewer.innerHTML = `<div class="loading-spinner"><p>Failed to load book: ${response.error}</p></div>`;
                }
            });
        }

        // Check URL params for epub URL (standard web version)
        const params = new URLSearchParams(window.location.search);
        const epubUrl = params.get('url');
        if (epubUrl) {
            loadBookFromUrl(epubUrl);
        }
    }

    function setupEventListeners() {
        // Open file
        openFileBtn.addEventListener('click', async () => {
            try {
                if (window.showOpenFilePicker) {
                    const [fileHandle] = await window.showOpenFilePicker({
                        types: [{
                            description: 'EPUB Books',
                            accept: { 'application/epub+zip': ['.epub'] }
                        }],
                        excludeAcceptAllOption: true,
                        multiple: false
                    });
                    const file = await fileHandle.getFile();

                    // Set bookKey early to save the handle
                    const tempKey = 'epub_' + file.name.replace(/\W/g, '_');
                    await storeFileHandle(tempKey, fileHandle);

                    loadBookFromFile(file);
                } else {
                    // Fallback for browsers without File System Access API
                    fileInput.click();
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Error opening file:', err);
                }
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) loadBookFromFile(e.target.files[0]);
        });

        // Drag and Drop
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropOverlay.classList.remove('hidden');
        });
        document.addEventListener('dragleave', (e) => {
            if (e.relatedTarget === null) dropOverlay.classList.add('hidden');
        });
        document.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropOverlay.classList.add('hidden');

            // Try getting file handle from dataTransfer items
            if (window.showOpenFilePicker && e.dataTransfer.items) {
                for (const item of e.dataTransfer.items) {
                    if (item.kind === 'file') {
                        try {
                            const handle = await item.getAsFileSystemHandle();
                            if (handle && handle.kind === 'file' && handle.name.endsWith('.epub')) {
                                const file = await handle.getFile();
                                const tempKey = 'epub_' + file.name.replace(/\W/g, '_');
                                await storeFileHandle(tempKey, handle);
                                loadBookFromFile(file);
                                return; // Success
                            }
                        } catch (err) {
                            console.warn('Could not get file handle from drop:', err);
                        }
                    }
                }
            }

            // Fallback to older file drop method
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.epub')) {
                loadBookFromFile(file);
            }
        });

        // Toolbar
        libraryBtn.addEventListener('click', goToLibrary);
        tocBtn.addEventListener('click', () => togglePanel('toc'));
        searchBtn.addEventListener('click', () => togglePanel('search'));
        bookmarkBtn.addEventListener('click', toggleBookmark);
        settingsBtn.addEventListener('click', toggleSettings);
        fullscreenBtn.addEventListener('click', toggleFullscreen);
        readAloudBtn.addEventListener('click', toggleReadAloud);
        nightLightBtn.addEventListener('click', toggleNightLight);

        // Side panel
        closePanelBtn.addEventListener('click', closePanel);
        panelTabs.forEach(tab => {
            tab.addEventListener('click', () => switchPanelTab(tab.dataset.panel));
        });

        // Settings
        themeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                settings.theme = btn.dataset.theme;
                applySettings();
                saveSettings();
            });
        });

        fontSizeSlider.addEventListener('input', () => {
            settings.fontSize = parseInt(fontSizeSlider.value);
            fontSizeValue.textContent = settings.fontSize;
            applySettings();
            saveSettings();
        });

        fontFamilySelect.addEventListener('change', () => {
            settings.fontFamily = fontFamilySelect.value;
            applySettings();
            saveSettings();
        });

        lineSpacingSlider.addEventListener('input', () => {
            settings.lineSpacing = parseFloat(lineSpacingSlider.value);
            lineSpacingValue.textContent = settings.lineSpacing;
            applySettings();
            saveSettings();
        });

        // Text Alignment
        alignButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                settings.textAlign = btn.dataset.align;
                applySettings();
                saveSettings();
            });
        });

        // Page Layout
        layoutButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                settings.spread = btn.dataset.spread;
                applySettings();
                saveSettings();
            });
        });

        // Flow (paginated / scrolled)
        flowButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                settings.flow = btn.dataset.flow;
                applySettings();
                saveSettings();
                // Need to re-render for flow change
                if (rendition && currentCfi) {
                    rendition.flow(settings.flow);
                    rendition.display(currentCfi);
                }
            });
        });

        // Brightness
        brightnessSlider.addEventListener('input', () => {
            settings.brightness = parseInt(brightnessSlider.value);
            brightnessValueEl.textContent = settings.brightness;
            const dimAmount = (100 - settings.brightness) / 100;
            brightnessOverlay.style.background = `rgba(0, 0, 0, ${dimAmount * 0.7})`;
            saveSettings();
        });

        // Night Light slider
        nightLightSlider.addEventListener('input', () => {
            settings.nightLight = parseInt(nightLightSlider.value);
            nightLightValueEl.textContent = settings.nightLight;
            const nlOpacity = settings.nightLight / 100 * 0.35;
            nightLightOverlay.style.background = `rgba(255, 180, 50, ${nlOpacity})`;
            nightLightBtn.classList.toggle('night-active', settings.nightLight > 0);
            saveSettings();
        });

        // Page animation toggle
        pageAnimToggle.addEventListener('click', () => {
            settings.pageAnimation = !settings.pageAnimation;
            pageAnimToggle.classList.toggle('active', settings.pageAnimation);
            saveSettings();
        });

        // Navigation
        prevPageBtn.addEventListener('click', () => navigatePage('prev'));
        nextPageBtn.addEventListener('click', () => navigatePage('next'));
        progressSlider.addEventListener('input', onProgressSliderChange);

        // Search
        searchGoBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') performSearch();
        });

        // Read Aloud
        raPlayPause.addEventListener('click', togglePlayPauseRA);
        raStop.addEventListener('click', stopReadAloud);
        raClose.addEventListener('click', closeReadAloud);
        raSpeedSelect.addEventListener('change', () => {
            if (isReadAloudActive) { stopReadAloud(); startReadAloud(); }
        });

        // Highlight menu
        hlColors.forEach(btn => {
            btn.addEventListener('click', () => applyHighlight(btn.dataset.color));
        });
        hlNoteBtn.addEventListener('click', addAnnotationNote);
        hlRemoveBtn.addEventListener('click', removeHighlight);
        hlDefineBtn.addEventListener('click', defineSelectedWord);
        hlTranslateBtn.addEventListener('click', translateSelectedText);

        // Dictionary close
        dictClose.addEventListener('click', () => dictPopup.classList.add('hidden'));

        // Translation
        translateClose.addEventListener('click', () => translatePopup.classList.add('hidden'));
        translateLang.addEventListener('change', () => {
            if (translateOriginal.textContent) {
                performTranslation(translateOriginal.textContent, translateLang.value);
            }
        });

        // Close menus on outside click
        document.addEventListener('click', (e) => {
            if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
                settingsPanel.classList.add('hidden');
                settingsBtn.classList.remove('active');
            }
            if (!highlightMenu.contains(e.target)) {
                highlightMenu.classList.add('hidden');
            }
            if (!dictPopup.contains(e.target) && !hlDefineBtn.contains(e.target)) {
                dictPopup.classList.add('hidden');
            }
            if (!translatePopup.contains(e.target) && !hlTranslateBtn.contains(e.target)) {
                translatePopup.classList.add('hidden');
            }
        });

        // Close panels/settings when clicking reader content area
        readerContent.addEventListener('click', () => {
            dismissAllMenus();
        });

        // Mouse wheel page turning (debounced)
        let wheelTimeout = null;
        function handleWheel(e) {
            if (!rendition || settings.flow === 'scrolled') return;
            if (wheelTimeout) return;
            e.preventDefault();
            if (e.deltaY > 0) {
                navigatePage('next');
            } else if (e.deltaY < 0) {
                navigatePage('prev');
            }
            wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 400);
        }
        viewer.addEventListener('wheel', handleWheel, { passive: false });

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);
    }

    function handleKeyboard(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        if (e.key === 'ArrowLeft') { navigatePage('prev'); }
        else if (e.key === 'ArrowRight') { navigatePage('next'); }
        else if (e.ctrlKey && e.key === 'f') { e.preventDefault(); togglePanel('search'); searchInput.focus(); }
        else if (e.ctrlKey && e.key === 't') { e.preventDefault(); togglePanel('toc'); }
        else if (e.ctrlKey && e.key === 'd') { e.preventDefault(); toggleBookmark(); }
        else if (e.ctrlKey && e.key === ',') { e.preventDefault(); toggleSettings(); }
        else if (e.ctrlKey && e.shiftKey && e.key === 'U') { e.preventDefault(); toggleReadAloud(); }
        else if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
    }

    // ─── Page Navigation with Animation ──────────────────────────────────
    function navigatePage(direction) {
        if (!rendition) return;

        if (settings.pageAnimation && settings.flow === 'paginated') {
            const animClass = direction === 'next' ? 'page-turning-next' : 'page-turning-prev';
            readerContent.classList.add(animClass);
            setTimeout(() => readerContent.classList.remove(animClass), 450);
        }

        if (direction === 'next') {
            rendition.next();
        } else {
            rendition.prev();
        }
    }

    // ─── Night Light Quick Toggle ────────────────────────────────────────
    function toggleNightLight() {
        if (settings.nightLight > 0) {
            settings.nightLight = 0;
        } else {
            settings.nightLight = 40;
        }
        nightLightSlider.value = settings.nightLight;
        nightLightValueEl.textContent = settings.nightLight;
        const nlOpacity = settings.nightLight / 100 * 0.35;
        nightLightOverlay.style.background = `rgba(255, 180, 50, ${nlOpacity})`;
        nightLightBtn.classList.toggle('night-active', settings.nightLight > 0);
        saveSettings();
    }

    // ─── Book Loading ────────────────────────────────────────────────────
    function showLoading() {
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.id = 'loadingSpinner';
        spinner.innerHTML = '<div class="spinner"></div><p>Opening book...</p>';
        viewer.appendChild(spinner);
    }

    function hideLoading() {
        const spinner = $('#loadingSpinner');
        if (spinner) spinner.remove();
    }

    async function loadBookFromFile(file) {
        showLoading();
        welcomeScreen.classList.add('hidden');
        readerUI.classList.remove('hidden');

        const arrayBuffer = await file.arrayBuffer();
        bookKey = 'epub_' + file.name.replace(/\W/g, '_');
        currentBookData = arrayBuffer;
        initBook(arrayBuffer, file.name);
    }

    async function loadBookFromUrl(url) {
        showLoading();
        welcomeScreen.classList.add('hidden');
        readerUI.classList.remove('hidden');

        bookKey = 'epub_' + url.replace(/\W/g, '_').substring(0, 100);
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            currentBookData = arrayBuffer;
            initBook(arrayBuffer);
        } catch (err) {
            hideLoading();
            viewer.innerHTML = `<div class="loading-spinner"><p>Failed to load book: ${err.message}</p></div>`;
        }
    }

    function initBook(data, fileName) {
        // Clean up previous
        if (book) {
            book.destroy();
        }
        viewer.innerHTML = '';
        showLoading();

        book = ePub(data);

        rendition = book.renderTo(viewer, {
            width: '100%',
            height: '100%',
            spread: settings.spread === 'double' ? 'auto' : 'none',
            flow: settings.flow,
            allowScriptedContent: false
        });

        applyRenditionStyles();

        // Load saved location or start from beginning
        Storage.get(bookKey + '_location').then(savedCfi => {
            if (savedCfi) {
                rendition.display(savedCfi);
            } else {
                rendition.display();
            }
        });

        // Book ready
        book.ready.then(() => {
            hideLoading();

            // Set title
            const meta = book.packaging.metadata;
            const title = meta.title || 'Untitled Book';
            bookTitleEl.textContent = title;
            document.title = title + ' — EPUB Reader';

            // Load TOC
            toc = book.navigation.toc;
            renderTOC(toc);

            // Generate locations for progress
            book.locations.generate(1600).then(locs => {
                locations = locs;
                updateProgress();
                updateReadingTime();
            });

            // Load bookmarks
            loadBookmarks();
            // Load annotations
            loadAnnotations();

            // Save to library
            saveToLibrary(meta, fileName);
        });

        // Relocation handler
        rendition.on('relocated', (location) => {
            currentCfi = location.start.cfi;

            // Save position
            Storage.set(bookKey + '_location', currentCfi);

            // Update progress
            updateProgress();
            updateReadingTime();

            // Update chapter display
            updateCurrentChapter(location);

            // Update bookmark state
            updateBookmarkIcon();

            // Update library progress
            updateLibraryProgress();
        });

        // Handle text selection for highlights
        rendition.on('selected', (cfiRange, contents) => {
            showHighlightMenu(cfiRange, contents);
        });

        // Handle click to dismiss all menus
        rendition.on('click', () => {
            dismissAllMenus();
        });

        // Mouse wheel inside iframe for page turning
        rendition.hooks.content.register((contents) => {
            const iframeDoc = contents.document;
            let iframeWheelTimeout = null;
            iframeDoc.addEventListener('wheel', (e) => {
                if (!rendition || settings.flow === 'scrolled') return;
                if (iframeWheelTimeout) return;
                e.preventDefault();
                if (e.deltaY > 0) {
                    navigatePage('next');
                } else if (e.deltaY < 0) {
                    navigatePage('prev');
                }
                iframeWheelTimeout = setTimeout(() => { iframeWheelTimeout = null; }, 400);
            }, { passive: false });
        });

        // Keyboard in iframe
        rendition.on('keydown', handleKeyboard);
    }

    // ─── TOC ─────────────────────────────────────────────────────────────
    function renderTOC(items, parent) {
        const container = parent || tocList;
        container.innerHTML = '';

        items.forEach(item => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.textContent = item.label.trim();
            a.href = '#';
            a.addEventListener('click', (e) => {
                e.preventDefault();
                rendition.display(item.href);
                if (window.innerWidth < 768) closePanel();
            });
            li.appendChild(a);

            if (item.subitems && item.subitems.length) {
                const subUl = document.createElement('ul');
                renderTOC(item.subitems, subUl);
                li.appendChild(subUl);
            }

            container.appendChild(li);
        });
    }

    function updateCurrentChapter(location) {
        if (!toc.length) return;

        const href = location.start.href;
        let chapterTitle = '';

        function findChapter(items) {
            for (const item of items) {
                if (item.href && href.includes(item.href.split('#')[0])) {
                    chapterTitle = item.label.trim();
                }
                if (item.subitems) findChapter(item.subitems);
            }
        }

        findChapter(toc);
        currentChapterEl.textContent = chapterTitle;

        // Highlight active TOC item
        tocList.querySelectorAll('a').forEach(a => a.classList.remove('active'));
        tocList.querySelectorAll('a').forEach(a => {
            if (a.textContent.trim() === chapterTitle) {
                a.classList.add('active');
                a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        });
    }

    // ─── Progress ────────────────────────────────────────────────────────
    function updateProgress() {
        if (!rendition || !book || !locations) return;

        const location = rendition.currentLocation();
        if (!location || !location.start) return;

        const percent = book.locations.percentageFromCfi(location.start.cfi);
        const pct = Math.round(percent * 100);
        progressSlider.value = pct;

        const totalLocations = locations.length;
        const currentLoc = book.locations.locationFromCfi(location.start.cfi);
        pageIndicator.textContent = `${currentLoc + 1} of ${totalLocations} · ${pct}%`;
    }

    function onProgressSliderChange() {
        if (!book || !locations) return;
        const percent = progressSlider.value / 100;
        const cfi = book.locations.cfiFromPercentage(percent);
        rendition.display(cfi);
    }

    // ─── Reading Time Estimate ───────────────────────────────────────────
    function updateReadingTime() {
        if (!book || !locations || !rendition) return;

        const location = rendition.currentLocation();
        if (!location || !location.start) return;

        const percent = book.locations.percentageFromCfi(location.start.cfi);
        const totalLocations = locations.length;
        const remainingLocations = totalLocations - book.locations.locationFromCfi(location.start.cfi);

        // Estimate: ~250 words per location, 200 words per minute reading speed
        const wordsPerLocation = 250;
        const wpm = 200;
        const remainingWords = remainingLocations * wordsPerLocation;
        const remainingMinutes = Math.round(remainingWords / wpm);

        if (remainingMinutes < 60) {
            readingTimeEl.textContent = `⏱ ${remainingMinutes} min left`;
        } else {
            const hours = Math.floor(remainingMinutes / 60);
            const mins = remainingMinutes % 60;
            readingTimeEl.textContent = `⏱ ${hours}h ${mins}m left`;
        }
    }

    // ─── Side Panel ──────────────────────────────────────────────────────
    function togglePanel(panelName) {
        const isOpen = !sidePanel.classList.contains('hidden');
        const currentTab = sidePanel.querySelector('.panel-tab.active');

        if (isOpen && currentTab && currentTab.dataset.panel === panelName) {
            closePanel();
        } else {
            sidePanel.classList.remove('hidden', 'hiding');
            switchPanelTab(panelName);
            tocBtn.classList.toggle('active', panelName === 'toc');
            searchBtn.classList.toggle('active', panelName === 'search');
        }
    }

    function closePanel() {
        sidePanel.classList.add('hiding');
        setTimeout(() => {
            sidePanel.classList.add('hidden');
            sidePanel.classList.remove('hiding');
        }, 250);
        tocBtn.classList.remove('active');
        searchBtn.classList.remove('active');
    }

    function switchPanelTab(panelName) {
        panelTabs.forEach(t => t.classList.toggle('active', t.dataset.panel === panelName));
        panelContents.forEach(p => p.classList.toggle('active', p.id === panelName + 'Panel'));
        if (panelName === 'search') {
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    // ─── Settings Panel ──────────────────────────────────────────────────
    function toggleSettings() {
        settingsPanel.classList.toggle('hidden');
        settingsBtn.classList.toggle('active');
    }

    // ─── Fullscreen ──────────────────────────────────────────────────────
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    // ─── Go To Library ───────────────────────────────────────────────────
    function goToLibrary() {
        readerUI.classList.add('hidden');
        welcomeScreen.classList.remove('hidden');
        loadLibrary();
        // Stop read aloud if active
        if (isReadAloudActive) closeReadAloud();
    }

    // ─── Bookmarks ──────────────────────────────────────────────────────
    async function loadBookmarks() {
        const bookmarks = await Storage.get(bookKey + '_bookmarks') || [];
        renderBookmarks(bookmarks);
        updateBookmarkIcon();
    }

    async function toggleBookmark() {
        if (!currentCfi) return;

        let bookmarks = await Storage.get(bookKey + '_bookmarks') || [];
        const existingIdx = bookmarks.findIndex(b => b.cfi === currentCfi);

        if (existingIdx >= 0) {
            bookmarks.splice(existingIdx, 1);
        } else {
            const location = rendition.currentLocation();
            let chapterTitle = '';
            function findChapter(items) {
                for (const item of items) {
                    if (item.href && location.start.href.includes(item.href.split('#')[0])) {
                        chapterTitle = item.label.trim();
                    }
                    if (item.subitems) findChapter(item.subitems);
                }
            }
            findChapter(toc);

            bookmarks.push({
                cfi: currentCfi,
                chapter: chapterTitle || 'Unknown Chapter',
                date: new Date().toLocaleDateString(),
                percent: Math.round(book.locations.percentageFromCfi(currentCfi) * 100)
            });
        }

        await Storage.set(bookKey + '_bookmarks', bookmarks);
        renderBookmarks(bookmarks);
        updateBookmarkIcon();
    }

    async function updateBookmarkIcon() {
        if (!currentCfi) return;
        const bookmarks = await Storage.get(bookKey + '_bookmarks') || [];
        const isBookmarked = bookmarks.some(b => b.cfi === currentCfi);
        bookmarkBtn.classList.toggle('bookmarked', isBookmarked);
    }

    function renderBookmarks(bookmarks) {
        if (!bookmarks.length) {
            bookmarksList.innerHTML = '<p class="empty-state">No bookmarks yet. Press <kbd>Ctrl+D</kbd> to bookmark the current page.</p>';
            return;
        }

        bookmarksList.innerHTML = '';
        bookmarks.forEach((bm, i) => {
            const item = document.createElement('div');
            item.className = 'bookmark-item';
            item.innerHTML = `
        <div class="bookmark-info">
          <div class="bookmark-chapter">${bm.chapter} (${bm.percent}%)</div>
          <div class="bookmark-date">${bm.date}</div>
        </div>
        <button class="bookmark-delete" title="Remove bookmark">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;

            item.querySelector('.bookmark-info').addEventListener('click', () => {
                rendition.display(bm.cfi);
            });

            item.querySelector('.bookmark-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                let bms = await Storage.get(bookKey + '_bookmarks') || [];
                bms.splice(i, 1);
                await Storage.set(bookKey + '_bookmarks', bms);
                renderBookmarks(bms);
                updateBookmarkIcon();
            });

            bookmarksList.appendChild(item);
        });
    }

    // ─── Dismiss All Menus ───────────────────────────────────────────────
    function dismissAllMenus() {
        highlightMenu.classList.add('hidden');
        dictPopup.classList.add('hidden');
        translatePopup.classList.add('hidden');
        settingsPanel.classList.add('hidden');
        settingsBtn.classList.remove('active');
        if (!sidePanel.classList.contains('hidden')) {
            closePanel();
        }
    }

    // ─── Search ──────────────────────────────────────────────────────────
    async function performSearch() {
        const query = searchInput.value.trim();
        if (!query || !book) return;

        searchResults.innerHTML = '<div class="loading-spinner" style="position:static;padding:20px"><div class="spinner"></div><p>Searching...</p></div>';

        const results = [];
        const spineItems = book.spine.spineItems;

        for (let i = 0; i < spineItems.length; i++) {
            const item = spineItems[i];
            try {
                await item.load(book.load.bind(book));
                const found = item.find(query);
                if (found && found.length) {
                    let chapterTitle = item.href;
                    function findChapterForHref(items) {
                        for (const t of items) {
                            if (t.href && item.href.includes(t.href.split('#')[0])) {
                                chapterTitle = t.label.trim();
                            }
                            if (t.subitems) findChapterForHref(t.subitems);
                        }
                    }
                    findChapterForHref(toc);

                    found.forEach(match => {
                        results.push({
                            cfi: match.cfi,
                            excerpt: match.excerpt,
                            chapter: chapterTitle
                        });
                    });
                }
                item.unload();
            } catch (e) { /* skip */ }
            if (results.length > 100) break;
        }

        renderSearchResults(results, query);
    }

    function renderSearchResults(results, query) {
        if (!results.length) {
            searchResults.innerHTML = '<p class="empty-state">No results found.</p>';
            return;
        }

        searchResults.innerHTML = '';
        const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

        results.forEach(r => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <div class="chapter">${r.chapter}</div>
                <div class="excerpt">${r.excerpt.replace(re, '<mark>$1</mark>')}</div>
            `;
            item.addEventListener('click', () => {
                rendition.display(r.cfi);
                if (window.innerWidth < 768) closePanel();
            });
            searchResults.appendChild(item);
        });
    }

    // ─── Read Aloud ──────────────────────────────────────────────────────
    function populateVoices() {
        function loadVoices() {
            const voices = speechSynthesis.getVoices();
            raVoiceSelect.innerHTML = '';
            let soniaIndex = -1;
            voices.forEach((v, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = `${v.name} (${v.lang})`;
                if (v.name.toLowerCase().includes('sonia')) soniaIndex = i;
                raVoiceSelect.appendChild(opt);
            });
            // Prefer Microsoft Sonia, fallback to system default
            if (soniaIndex >= 0) {
                raVoiceSelect.value = soniaIndex;
            } else if (voices.length > 0) {
                const defaultIdx = voices.findIndex(v => v.default);
                if (defaultIdx >= 0) raVoiceSelect.value = defaultIdx;
            }
        }
        loadVoices();
        speechSynthesis.onvoiceschanged = loadVoices;
    }

    function toggleReadAloud() {
        if (readAloudBar.classList.contains('hidden')) {
            readAloudBar.classList.remove('hidden');
            readAloudBtn.classList.add('active');
            startReadAloud();
        } else {
            closeReadAloud();
        }
    }

    function startReadAloud() {
        if (!rendition) return;
        isReadAloudActive = true;

        const iframe = viewer.querySelector('iframe');
        if (!iframe) return;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const text = iframeDoc.body ? iframeDoc.body.innerText : '';
        if (!text.trim()) return;

        const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
        readSentences(sentences, 0);

        raPlayIcon.classList.add('hidden');
        raPauseIcon.classList.remove('hidden');
    }

    function readSentences(sentences, index) {
        if (index >= sentences.length || !isReadAloudActive) {
            if (isReadAloudActive && rendition) {
                rendition.next().then(() => {
                    setTimeout(() => startReadAloud(), 500);
                });
            }
            return;
        }

        const utterance = new SpeechSynthesisUtterance(sentences[index].trim());
        const voices = speechSynthesis.getVoices();
        const voiceIdx = parseInt(raVoiceSelect.value);
        if (voices[voiceIdx]) utterance.voice = voices[voiceIdx];
        utterance.rate = parseFloat(raSpeedSelect.value);

        utterance.onend = () => readSentences(sentences, index + 1);
        utterance.onerror = () => readSentences(sentences, index + 1);

        currentUtterance = utterance;
        speechSynthesis.speak(utterance);
    }

    function togglePlayPauseRA() {
        if (speechSynthesis.paused) {
            speechSynthesis.resume();
            raPlayIcon.classList.add('hidden');
            raPauseIcon.classList.remove('hidden');
        } else if (speechSynthesis.speaking) {
            speechSynthesis.pause();
            raPlayIcon.classList.remove('hidden');
            raPauseIcon.classList.add('hidden');
        } else {
            startReadAloud();
        }
    }

    function stopReadAloud() {
        isReadAloudActive = false;
        speechSynthesis.cancel();
        raPlayIcon.classList.remove('hidden');
        raPauseIcon.classList.add('hidden');
    }

    function closeReadAloud() {
        stopReadAloud();
        readAloudBar.classList.add('hidden');
        readAloudBtn.classList.remove('active');
    }

    // ─── Dictionary Lookup ───────────────────────────────────────────────
    function getSelectedText() {
        const iframe = viewer.querySelector('iframe');
        if (!iframe) return '';
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const selection = iframeDoc.getSelection();
        return selection ? selection.toString().trim() : '';
    }

    async function defineSelectedWord() {
        const text = getSelectedText();
        if (!text) return;

        // Get first word if multiple selected
        const word = text.split(/\s+/)[0].replace(/[^a-zA-Z'-]/g, '');
        if (!word) return;

        highlightMenu.classList.add('hidden');

        // Position popup
        const iframe = viewer.querySelector('iframe');
        const iframeRect = iframe.getBoundingClientRect();
        dictPopup.style.left = Math.max(10, iframeRect.left + iframeRect.width / 2 - 170) + 'px';
        dictPopup.style.top = Math.max(60, iframeRect.top + 100) + 'px';

        dictWord.textContent = word;
        dictPhonetic.textContent = '';
        dictContent.innerHTML = '<p style="color:var(--text-secondary);font-size:13px">Looking up...</p>';
        dictPopup.classList.remove('hidden');

        try {
            const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
            if (!resp.ok) throw new Error('Not found');

            const data = await resp.json();
            const entry = data[0];

            dictPhonetic.textContent = entry.phonetic || (entry.phonetics && entry.phonetics[0] && entry.phonetics[0].text) || '';

            let html = '';
            entry.meanings.forEach(m => {
                html += `<div class="dict-pos">${m.partOfSpeech}</div>`;
                m.definitions.slice(0, 3).forEach(d => {
                    html += `<div class="dict-def">${d.definition}</div>`;
                    if (d.example) html += `<div class="dict-example">"${d.example}"</div>`;
                });
            });

            dictContent.innerHTML = html || '<p style="color:var(--text-secondary)">No definitions found.</p>';
        } catch (e) {
            dictContent.innerHTML = `<p style="color:var(--text-secondary);font-size:13px">No definition found for "${word}".</p>`;
        }
    }

    // ─── Translation ─────────────────────────────────────────────────────
    async function translateSelectedText() {
        const text = getSelectedText();
        if (!text) return;

        highlightMenu.classList.add('hidden');

        // Position popup
        const iframe = viewer.querySelector('iframe');
        const iframeRect = iframe.getBoundingClientRect();
        translatePopup.style.left = Math.max(10, iframeRect.left + iframeRect.width / 2 - 180) + 'px';
        translatePopup.style.top = Math.max(60, iframeRect.top + 100) + 'px';

        translateOriginal.textContent = text.substring(0, 500);
        translateResult.textContent = 'Translating...';
        translatePopup.classList.remove('hidden');

        performTranslation(text, translateLang.value);
    }

    async function performTranslation(text, targetLang) {
        translateResult.textContent = 'Translating...';

        try {
            // Use MyMemory free translation API
            const resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.substring(0, 500))}&langpair=en|${targetLang}`);
            const data = await resp.json();

            if (data.responseData && data.responseData.translatedText) {
                translateResult.textContent = data.responseData.translatedText;
            } else {
                translateResult.textContent = 'Translation unavailable.';
            }
        } catch (e) {
            translateResult.textContent = 'Translation failed. Check your internet connection.';
        }
    }

    // ─── Annotations / Highlights ────────────────────────────────────────
    let pendingCfiRange = null;
    let pendingContents = null;

    function showHighlightMenu(cfiRange, contents) {
        pendingCfiRange = cfiRange;
        pendingContents = contents;

        const iframe = viewer.querySelector('iframe');
        if (!iframe) return;

        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const selection = iframeDoc.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const iframeRect = iframe.getBoundingClientRect();

        const x = iframeRect.left + rect.left + rect.width / 2;
        const y = iframeRect.top + rect.top - 50;

        highlightMenu.style.left = Math.max(10, x - 120) + 'px';
        highlightMenu.style.top = Math.max(10, y) + 'px';
        highlightMenu.classList.remove('hidden');
    }

    async function applyHighlight(color) {
        if (!pendingCfiRange || !rendition) return;

        const iframe = viewer.querySelector('iframe');
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const selection = iframeDoc.getSelection();
        const selectedText = selection ? selection.toString() : '';

        rendition.annotations.highlight(pendingCfiRange, {}, (e) => { }, '', {
            'fill': color, 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply'
        });

        let annotations = await Storage.get(bookKey + '_annotations') || [];
        annotations = annotations.filter(a => a.cfiRange !== pendingCfiRange);
        annotations.push({
            cfiRange: pendingCfiRange,
            text: selectedText.substring(0, 200),
            color: color,
            note: '',
            date: new Date().toLocaleDateString()
        });
        await Storage.set(bookKey + '_annotations', annotations);
        renderAnnotations(annotations);

        highlightMenu.classList.add('hidden');
        pendingCfiRange = null;
    }

    async function addAnnotationNote() {
        if (!pendingCfiRange) return;

        const note = prompt('Add a note:');
        if (note === null) return;

        await applyHighlight('#FFEB3B');

        let annotations = await Storage.get(bookKey + '_annotations') || [];
        const ann = annotations.find(a => a.cfiRange === pendingCfiRange);
        if (ann) {
            ann.note = note;
            await Storage.set(bookKey + '_annotations', annotations);
            renderAnnotations(annotations);
        }
    }

    async function removeHighlight() {
        if (!pendingCfiRange || !rendition) return;

        rendition.annotations.remove(pendingCfiRange, 'highlight');

        let annotations = await Storage.get(bookKey + '_annotations') || [];
        annotations = annotations.filter(a => a.cfiRange !== pendingCfiRange);
        await Storage.set(bookKey + '_annotations', annotations);
        renderAnnotations(annotations);

        highlightMenu.classList.add('hidden');
        pendingCfiRange = null;
    }

    async function loadAnnotations() {
        const annotations = await Storage.get(bookKey + '_annotations') || [];
        renderAnnotations(annotations);

        annotations.forEach(ann => {
            try {
                rendition.annotations.highlight(ann.cfiRange, {}, () => { }, '', {
                    'fill': ann.color, 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply'
                });
            } catch (e) { /* skip */ }
        });
    }

    function renderAnnotations(annotations) {
        if (!annotations.length) {
            annotationsList.innerHTML = '<p class="empty-state">Select text in the book to highlight and add notes.</p>';
            return;
        }

        annotationsList.innerHTML = '';
        annotations.forEach((ann, i) => {
            const item = document.createElement('div');
            item.className = 'annotation-item';
            item.style.borderLeftColor = ann.color;
            item.innerHTML = `
        <button class="annotation-delete" title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="annotation-text">"${ann.text}"</div>
        ${ann.note ? `<div class="annotation-note">📝 ${ann.note}</div>` : ''}
      `;

            item.addEventListener('click', () => rendition.display(ann.cfiRange));

            item.querySelector('.annotation-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                rendition.annotations.remove(ann.cfiRange, 'highlight');
                let anns = await Storage.get(bookKey + '_annotations') || [];
                anns.splice(i, 1);
                await Storage.set(bookKey + '_annotations', anns);
                renderAnnotations(anns);
            });

            annotationsList.appendChild(item);
        });
    }

    // ─── Library / Bookshelf ─────────────────────────────────────────────
    async function saveToLibrary(meta, fileName) {
        let library = await Storage.get('epubLibrary') || [];

        // Check if book already exists
        const existingIdx = library.findIndex(b => b.key === bookKey);
        const bookInfo = {
            key: bookKey,
            title: meta.title || fileName || 'Untitled',
            author: meta.creator || 'Unknown Author',
            lastOpened: Date.now(),
            progress: 0
        };

        // Try to extract cover
        try {
            const coverUrl = await book.coverUrl();
            if (coverUrl) {
                // Convert to data URL for storage
                const resp = await fetch(coverUrl);
                const blob = await resp.blob();
                const dataUrl = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                bookInfo.cover = dataUrl;
            }
        } catch (e) { /* no cover */ }

        if (existingIdx >= 0) {
            library[existingIdx] = { ...library[existingIdx], ...bookInfo };
        } else {
            library.unshift(bookInfo);
        }

        // Keep max 50 books
        library = library.slice(0, 50);
        await Storage.set('epubLibrary', library);
    }

    async function updateLibraryProgress() {
        if (!book || !locations || !currentCfi) return;

        const percent = Math.round(book.locations.percentageFromCfi(currentCfi) * 100);
        let library = await Storage.get('epubLibrary') || [];
        const idx = library.findIndex(b => b.key === bookKey);
        if (idx >= 0) {
            library[idx].progress = percent;
            library[idx].lastOpened = Date.now();
            await Storage.set('epubLibrary', library);
        }
    }

    async function loadLibrary() {
        const library = await Storage.get('epubLibrary') || [];

        if (library.length === 0) {
            librarySection.classList.add('hidden');
            return;
        }

        librarySection.classList.remove('hidden');
        libraryGrid.innerHTML = '';

        // Sort by last opened
        library.sort((a, b) => b.lastOpened - a.lastOpened);

        library.forEach((item, i) => {
            const card = document.createElement('div');
            card.className = 'library-card';
            card.innerHTML = `
        <button class="library-card-delete" title="Remove from library">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="library-card-cover">
          ${item.cover
                    ? `<img src="${item.cover}" alt="${item.title}">`
                    : `<svg class="cover-placeholder" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
                }
        </div>
        <div class="library-card-info">
          <div class="library-card-title">${item.title}</div>
          <div class="library-card-author">${item.author}</div>
          <div class="library-card-progress">
            <div class="library-card-progress-bar" style="width:${item.progress || 0}%"></div>
          </div>
        </div>
      `;

            // Click card to open
            card.addEventListener('click', async (e) => {
                if (e.target.closest('.library-card-delete')) return;

                bookKey = item.key;

                try {
                    if (window.showOpenFilePicker) {
                        const handle = await getFileHandle(bookKey);
                        if (handle) {
                            // Verify permission
                            const options = { mode: 'read' };
                            if ((await handle.queryPermission(options)) === 'granted') {
                                const file = await handle.getFile();
                                loadBookFromFile(file);
                                return;
                            }

                            // Request permission if not granted
                            if ((await handle.requestPermission(options)) === 'granted') {
                                const file = await handle.getFile();
                                loadBookFromFile(file);
                                return;
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Could not load from file handle:', err);
                }

                // Fallback: prompt for file
                fileInput.click();
            });

            // Delete from library
            card.querySelector('.library-card-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                let lib = await Storage.get('epubLibrary') || [];
                lib.splice(i, 1);
                await Storage.set('epubLibrary', lib);
                loadLibrary();
            });

            libraryGrid.appendChild(card);
        });
    }

    // ─── Initialize ──────────────────────────────────────────────────────
    init();

})();
