import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { WindowManager } from './WindowManager';
import { ScreenManager } from './ScreenManager';
import { MemoryManager } from './MemoryManager';
import { apiServer } from '../server/api';

export class IPCManager {
  private windowManager: WindowManager;
  private screenManager: ScreenManager;
  private memoryManager: MemoryManager;
  private isDebugMode: boolean;

  constructor(
    windowManager: WindowManager,
    screenManager: ScreenManager,
    memoryManager: MemoryManager,
    isDebugMode: boolean
  ) {
    this.windowManager = windowManager;
    this.screenManager = screenManager;
    this.memoryManager = memoryManager;
    this.isDebugMode = isDebugMode;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Screen capture handlers
    ipcMain.handle('capture-screen', () => this.screenManager.captureScreen());
    ipcMain.handle('extract-text', (_event: IpcMainInvokeEvent, imageDataURL: string) => 
      this.screenManager.extractText(imageDataURL)
    );
    ipcMain.handle('get-screen-source-id', () => this.screenManager.getScreenSourceId());

    // Screen streaming handlers
    ipcMain.handle('start-screen-stream', (event) => {
      this.screenManager.startScreenStream((dataURL) => {
        event.sender.send('screen-frame', dataURL);
      });
    });
    ipcMain.handle('stop-screen-stream', () => this.screenManager.stopScreenStream());

    // Chat handlers
    ipcMain.handle('chat-gemini', async (_event: IpcMainInvokeEvent, args: {
      message: string;
      messageId?: string;
    }) => {
      try {
        const { message, messageId } = args;
        const streamId = messageId || Date.now().toString();
        
        // Take a screenshot for both memory and Gemini
        const screenCapture = await this.screenManager.captureScreen();
        let screenText = '';
        let imageDataURL = '';
        
        if (screenCapture) {
          imageDataURL = screenCapture.dataURL;
          screenText = await this.screenManager.extractText(screenCapture.dataURL);
          if (screenText.trim()) {
            await this.memoryManager.addToMemory(screenText.trim());
          }
        }
        
        // Get memory and audio context
        const memoryContext = this.memoryManager.getMemoryContext();
        const audioContext = this.memoryManager.getAudioContext();
        
        const responseStream = await apiServer.chatWithGemini({
          message,
          screenText,
          imageDataURL,
          memoryContext,
          audioContext
        });
        
        let fullResponse = '';
        const window = this.windowManager.getWindow();
        
        try {
          for await (const text of responseStream) {
            fullResponse = text;
            
            if (window && !window.isDestroyed()) {
              window.webContents.send('gemini-stream', {
                streamId,
                text: fullResponse,
                done: false
              });
            }
          }
          
          if (window && !window.isDestroyed()) {
            window.webContents.send('gemini-stream', {
              streamId,
              text: fullResponse,
              done: true
            });
          }
        } catch (error) {
          console.error('Error in stream:', error);
          if (window && !window.isDestroyed()) {
            window.webContents.send('gemini-stream', {
              streamId,
              text: 'Error: Failed to stream response.',
              done: true,
              error: true
            });
          }
        }
        
        return fullResponse;
      } catch (error: any) {
        console.error('Error with Gemini:', error);
        return `Error: ${error.message}`;
      }
    });

    // Audio handlers
    ipcMain.handle('transcribe-audio', async (_event: IpcMainInvokeEvent, audioBuffer: ArrayBuffer, mimeType?: string) => {
      try {
        const buffer = Buffer.from(audioBuffer);
        const transcription = await apiServer.transcribeAudio(buffer, mimeType || 'audio/wav');
        
        if (transcription) {
          await this.memoryManager.addAudioToMemory(transcription);
        }
        
        return transcription;
      } catch (error) {
        console.error('Error in transcribe-audio:', error);
        return '';
      }
    });

    // Window handlers
    ipcMain.handle('resize-window', (_event: IpcMainInvokeEvent, height: number) => {
      this.windowManager.resize(height);
    });

    // Window control handlers
    ipcMain.handle('toggle-visibility', () => {
      this.windowManager.toggleVisibility();
    });

    ipcMain.handle('set-click-through', (_event: IpcMainInvokeEvent, ignore: boolean) => {
      this.windowManager.setClickThrough(ignore);
    });

    ipcMain.handle('focus-input', () => {
      this.windowManager.focusInput();
    });

    ipcMain.handle('toggle-collapse', () => {
      this.windowManager.toggleCollapse();
    });

    // Debug handlers
    if (this.isDebugMode) {
      ipcMain.handle('start-memory-capture', () => {
        this.memoryManager.startMemoryCapture((memory) => {
          const window = this.windowManager.getWindow();
          if (window) {
            window.webContents.send('memory-updated', { 
              timestamp: Date.now(), 
              content: memory 
            });
          }
        });
        return 'Memory capture started';
      });

      ipcMain.handle('stop-memory-capture', () => {
        this.memoryManager.stopMemoryCapture();
        return 'Memory capture stopped';
      });

      ipcMain.handle('get-memory-entries', () => {
        return this.memoryManager.getCurrentMemory();
      });

      ipcMain.handle('clear-memory', () => {
        this.memoryManager.clearMemory();
        return 'Memory cleared';
      });
    }

    // Utility handlers
    ipcMain.handle('get-debug-mode', () => this.isDebugMode);
    ipcMain.handle('get-audio-transcript', () => this.memoryManager.getCurrentAudioTranscript());
  }
} 