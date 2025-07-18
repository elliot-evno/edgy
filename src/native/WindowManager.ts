import { BrowserWindow, screen, globalShortcut } from 'electron';
import * as path from 'path';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private isDebugMode: boolean;
  private isDev: boolean;
  private ignoreMouseEvents: boolean;
  private isVisible: boolean = true;
  private isCollapsed: boolean = false;
  private readonly HEADER_HEIGHT = 30;
  private readonly EXPANDED_HEIGHT = 600;
  private readonly DEFAULT_WIDTH = 400;
  private readonly CODE_BLOCK_WIDTH = 800;
  private isWidthExpanded: boolean = false;

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
    
    const windowWidth = this.DEFAULT_WIDTH;
    const windowHeight = this.EXPANDED_HEIGHT;
    const x = 20; // Positioned 20px from left edge
    const y = 40; // Positioned 40px from top edge

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
      this.mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
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
    if (!this.mainWindow) return;
    console.log('WindowManager: Resizing window to height:', height);
    const [width] = this.mainWindow.getSize();
    this.mainWindow.setSize(width, height);
    console.log('WindowManager: New window size:', this.mainWindow.getSize());
  }

  cleanup(): void {
    this.mainWindow = null;
  }

  toggleVisibility(): void {
    if (!this.mainWindow) return;
    
    this.isVisible = !this.isVisible;
    if (this.isVisible) {
      this.mainWindow.show();
      // Restore previous mouse event state
      this.mainWindow.setIgnoreMouseEvents(this.ignoreMouseEvents);
    } else {
      this.mainWindow.hide();
      // When invisible, always make it non-interactive
      this.mainWindow.setIgnoreMouseEvents(true);
    }
  }

  setClickThrough(ignore: boolean): void {
    if (!this.mainWindow) return;
    this.ignoreMouseEvents = ignore;
    this.mainWindow.setIgnoreMouseEvents(ignore);
  }

  focusInput(): void {
    if (!this.mainWindow) return;
    this.mainWindow.webContents.send('focus-input');
  }

  toggleCollapse(): void {
    if (!this.mainWindow) return;
    
    this.isCollapsed = !this.isCollapsed;
    console.log('WindowManager: Toggling collapse state:', { isCollapsed: this.isCollapsed });
    
    // Set new height based on collapsed state
    const newHeight = this.isCollapsed ? this.HEADER_HEIGHT : this.EXPANDED_HEIGHT;
    this.resize(newHeight);
    
    // Notify renderer
    this.mainWindow.webContents.send('toggle-collapse');
  }

  async temporarilyHideForScreenshot(): Promise<void> {
    if (!this.mainWindow) return;
    
    // Store current opacity
    const currentOpacity = this.mainWindow.getOpacity();
    
    // Hide window
    this.mainWindow.setOpacity(0);
    
    // Wait a tiny bit for the UI to update
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return new Promise((resolve) => {
      // Restore opacity in next tick
      setImmediate(() => {
        if (this.mainWindow) {
          this.mainWindow.setOpacity(currentOpacity);
        }
        resolve();
      });
    });
  }

  setWidth(width: number): void {
    if (!this.mainWindow) return;
    console.log('WindowManager: Setting window width:', width);
    const [, height] = this.mainWindow.getSize();
    this.mainWindow.setSize(width, height);
    
    // Keep the window right-aligned
    const [x, y] = this.mainWindow.getPosition();
    const display = screen.getDisplayNearestPoint({ x, y });
    const newX = display.workArea.x + display.workArea.width - width - 20;
    this.mainWindow.setPosition(newX, y);
  }

  expandForCode(): void {
    if (!this.mainWindow || this.isWidthExpanded) return;
    this.isWidthExpanded = true;
    this.setWidth(this.CODE_BLOCK_WIDTH);
  }

  resetWidth(): void {
    if (!this.mainWindow || !this.isWidthExpanded) return;
    this.isWidthExpanded = false;
    this.setWidth(this.DEFAULT_WIDTH);
  }
} 