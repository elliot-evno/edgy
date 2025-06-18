import { BrowserWindow, screen, globalShortcut } from 'electron';
import * as path from 'path';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private isDebugMode: boolean;
  private isDev: boolean;
  private ignoreMouseEvents: boolean;

  constructor(options: {
    isDebugMode: boolean;
    isDev: boolean;
    ignoreMouseEvents: boolean;
  }) {
    this.isDebugMode = options.isDebugMode;
    this.isDev = options.isDev;
    this.ignoreMouseEvents = options.ignoreMouseEvents;
  }

  createWindow(): void {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    const windowWidth = 400;
    const windowHeight = 600;
    const x = width - windowWidth - 20;
    const y = 40;

    this.mainWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: x,
      y: y,
      frame: false,
      resizable: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      fullscreenable: false,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload.js'),
        webSecurity: false
      }
    });

    this.setupWindowProperties();
    this.loadApp();
    this.setupPermissions();
    this.setupDebugMode();
  }

  private setupWindowProperties(): void {
    this.mainWindow?.once('ready-to-show', () => {
      this.mainWindow?.setAlwaysOnTop(true, "floating");
      this.mainWindow?.setVisibleOnAllWorkspaces(true);
      this.mainWindow?.setFullScreenable(false);
      
      if (this.ignoreMouseEvents) {
        this.mainWindow?.setIgnoreMouseEvents(true);
      }
      
      this.mainWindow?.show();
    });
  }

  private loadApp(): void {
    if (!this.mainWindow) return;

    if (this.isDev) {
      this.mainWindow.loadURL('http://localhost:3000');
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../../dist-react/index.html'));
    }

    if (this.ignoreMouseEvents) {
      this.mainWindow.setIgnoreMouseEvents(true);
    } else {
      this.mainWindow.setIgnoreMouseEvents(false);
    }
  }

  private setupPermissions(): void {
    this.mainWindow?.webContents.session.setPermissionRequestHandler((_, permission, callback) => {
      if (permission === 'media') {
        callback(true);
      } else {
        callback(false);
      }
    });
  }

  private setupDebugMode(): void {
    this.mainWindow?.webContents.once('did-finish-load', () => {
      this.mainWindow?.webContents.send('set-debug-mode', this.isDebugMode);
    });

    if (this.isDebugMode) {
      this.mainWindow?.webContents.openDevTools();
    }
  }

  getWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  toggleMouseEvents(): void {
    if (!this.mainWindow) return;
    
    this.ignoreMouseEvents = !this.ignoreMouseEvents;
    this.mainWindow.setIgnoreMouseEvents(this.ignoreMouseEvents);
    console.log(`Mouse events ${this.ignoreMouseEvents ? 'ignored' : 'enabled'}`);
    
    if (this.isDebugMode) {
      this.mainWindow.webContents.send('mouse-events-toggled', this.ignoreMouseEvents);
    }
  }

  resize(height: number): void {
    if (this.mainWindow) {
      const [width] = this.mainWindow.getSize();
      this.mainWindow.setSize(width, height);
    }
  }

  cleanup(): void {
    this.mainWindow = null;
  }
} 