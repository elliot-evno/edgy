import { app, globalShortcut } from 'electron';
import * as dotenv from 'dotenv';
import { WindowManager } from './native/WindowManager';
import { ScreenManager } from './native/ScreenManager';
import { MemoryManager } from './native/MemoryManager';
import { IPCManager } from './native/IPCManager';

dotenv.config();

// Debug mode
const isDebugMode = process.argv.includes('--debug') || process.env.DEBUG_MODE === 'true';
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const ignoreMouseEvents = process.argv.includes('--ignore-mouse-events') || process.env.IGNORE_MOUSE_EVENTS === 'true';

// Managers
let windowManager: WindowManager;
let screenManager: ScreenManager;
let memoryManager: MemoryManager;
let ipcManager: IPCManager;

function initializeApp(): void {
  // Initialize managers
  windowManager = new WindowManager({
    isDebugMode,
    isDev,
    ignoreMouseEvents
  });
  
  // Create the main window first
  windowManager.createWindow();
  
  // Initialize other managers
  screenManager = new ScreenManager(windowManager);
  memoryManager = new MemoryManager(screenManager, isDebugMode);
  
  ipcManager = new IPCManager(
    windowManager,
    screenManager,
    memoryManager,
    isDebugMode
  );
  
  // Register global shortcuts
  globalShortcut.register('CommandOrControl+G', () => {
    windowManager.toggleMouseEvents();
  });

  // Focus input shortcut (Cmd + I)
  globalShortcut.register('CommandOrControl+I', () => {
    windowManager.focusInput();
  });

  // Toggle collapse shortcut (Cmd + Shift + C)
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    windowManager.toggleCollapse();
  });

  // Toggle visibility shortcut (Cmd + K)
  globalShortcut.register('CommandOrControl+K', () => {
    windowManager.toggleVisibility();
  });
}

app.whenReady().then(() => {
  // Hide dock icon on macOS
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  
  initializeApp();
});

app.on('window-all-closed', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
