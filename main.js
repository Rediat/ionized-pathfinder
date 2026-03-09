const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function log(msg) {
    fs.appendFileSync(path.join(app.getPath('userData'), 'debug.log'), msg + '\n');
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // We disable nodeIntegration to keep it secure, and use standard web APIs where possible.
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true,
        title: "Edge EPUB Reader"
    });

    // Load the main app UI
    mainWindow.loadFile('reader.html');

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// Handle passing files that the app was launched with (e.g., drag and drop onto executable)
app.on('will-finish-launching', () => {
    app.on('open-file', (event, filePath) => {
        event.preventDefault();
        // If window is ready, send it, otherwise wait for it
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('open-file', filePath);
        } else {
            app.once('ready', () => {
                mainWindow.webContents.once('did-finish-load', () => {
                    mainWindow.webContents.send('open-file', filePath);
                });
            });
        }
    });
});

app.on('ready', () => {
    log('--- STARTING UP ---');
    createWindow();

    // Handle command line arguments on Windows/Linux
    if (process.argv.length >= 2) {
        let filePath = process.argv[1];
        if (filePath && filePath !== '.' && filePath.endsWith('.epub')) {
            mainWindow.webContents.once('did-finish-load', () => {
                mainWindow.webContents.send('open-file', filePath);
            });
        }
    }
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});

// IPC Handler for reading an absolute file path triggered by open-file
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const data = fs.readFileSync(filePath);
        return { success: true, fileName: path.basename(filePath), data: data };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
