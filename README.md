# Edge EPUB Reader

A beautiful, functional EPUB reader inspired by the classic Microsoft Edge reading experience. Available as both a **Browser Extension** and a **Standalone Desktop Application**.

## ✨ Key Features

- **Premium Reading Experience**: Clean, modern UI with smooth page-turn animations.
- **Multiple Reading Modes**: Support for Light, Sepia, Dark (Night), and a specialized **Night Light** mode to reduce eye strain.
- **Advanced Typography**: 
  - Over 15+ system and included fonts (Literata, Inter, Georgia, etc.).
  - Adjustable font size, line spacing, and text justification.
- **Smart Tools**:
  - **Dictionary**: Instant word definitions via Google Dictionary.
  - **Translation**: Translate selected text directly within the reader.
  - **Estimated Reading Time**: Dynamic calculation based on your progress.
- **Library Management**: 
  - A visual bookshelf that stores your recently opened books.
  - **Persistent Access**: Uses the File System Access API to remember file references—open your books from the library without re-selecting files!
- **Navigation & Annotation**:
  - Full Table of Contents (TOC) support.
  - Text highlighting and persistent bookmarks.
  - Full-text search within the book.
- **Desktop Integration**: The Electron app supports opening `.epub` files directly from your operating system.

---

## 🌐 Browser Extension

### Installation
1. Download or clone this repository.
2. Open your browser's extension management page:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
3. Enable **Developer mode** (usually a toggle in the corner).
4. Click **Load unpacked** and select the project folder.

### Usage
- Click the extension icon in your toolbar to open the reader.
- Drag and drop any `.epub` file into the browser window or use the "Open EPUB File" button.

---

## 💻 Desktop Application

The desktop version provides a dedicated window and better OS integration.

### Quick Start
If you have the pre-packaged version:
- Navigate to `dist/Edge EPUB Reader-win32-x64/` and run `Edge EPUB Reader.exe`.

### Development / Run from Source
1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Launch the app:
   ```bash
   npm start
   ```

### Packaging
To create a new standalone version for Windows:
```bash
npm run dist
```

---

## 🛠 Tech Stack

- **Core**: HTML5, Vanilla CSS3, JavaScript (ES6+).
- **EPUB Engine**: [epub.js](https://github.com/futurepress/epub.js/) for rendering.
- **Archive Handling**: [jszip](https://stuk.github.io/jszip/) for parsing EPUB containers.
- **Desktop Wrapper**: [Electron](https://www.electronjs.org/).
- **Storage**: `IndexedDB` and `chrome.storage`/`localStorage` for settings and file handles.

## 📄 License

This project is licensed under the ISC License.
