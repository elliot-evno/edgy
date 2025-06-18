import { app, BrowserWindow, ipcMain, desktopCapturer, IpcMainInvokeEvent } from 'electron';
import * as dotenv from 'dotenv';
import { GoogleGenerativeAI, GenerativeModel, GenerateContentResult } from '@google/generative-ai';
import * as Tesseract from 'tesseract.js';
import { setInterval, clearInterval } from 'timers';

dotenv.config();

let mainWindow: BrowserWindow | null = null;
let geminiModel: GenerativeModel | null = null;
let streamingInterval: NodeJS.Timeout | null = null;
let memoryInterval: NodeJS.Timeout | null = null;

// Debug mode
const isDebugMode = process.argv.includes('--debug') || process.env.DEBUG_MODE === 'true';

// Memory management
interface MemoryEntry {
  timestamp: number;
  content: string;
}

let currentMemory: string = '';
const MEMORY_CAPTURE_INTERVAL = 5000; // 5 seconds

function logMemory(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[MEMORY ${timestamp}] ${message}`, data || '');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: require('path').join(__dirname, 'preload.js'),
      webSecurity: false
    }
  });

  mainWindow.loadFile('index.html');
  
  // Handle permissions for screen capture
  mainWindow.webContents.session.setPermissionRequestHandler((_, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
  
  // Send debug mode to renderer when ready
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.send('set-debug-mode', isDebugMode);
    
    // Auto-start memory capture
    logMemory('Starting automatic memory capture');
    startMemoryCapture();
  });
  
  if (process.argv.includes('--dev') || isDebugMode) {
    mainWindow.webContents.openDevTools();
  }
}

function initializeAI(): void {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  }
}

app.whenReady().then(() => {
  createWindow();
  initializeAI();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Capture screen
ipcMain.handle('capture-screen', async (): Promise<{ dataURL: string } | null> => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });
    
    if (sources.length === 0) return null;
    const dataURL = sources[0].thumbnail.toDataURL();
    return { dataURL };
  } catch (error) {
    console.error('Error capturing screen:', error);
    return null;
  }
});

// Extract text from screen
ipcMain.handle('extract-text', async (_event: IpcMainInvokeEvent, imageDataURL: string): Promise<string> => {
  if (!imageDataURL || typeof imageDataURL !== 'string' || !imageDataURL.startsWith('data:image')) {
    throw new Error('Invalid imageDataURL provided to extract-text');
  }
  try {
    const { data: { text } } = await Tesseract.recognize(imageDataURL, 'eng');
    return text;
  } catch (error) {
    console.error('Error extracting text:', error);
    return '';
  }
});

// Chat with Gemini
interface ChatGeminiArgs {
  message: string;
  screenText?: string;
  imageDataURL?: string;
}

ipcMain.handle('chat-gemini', async (
  _event: IpcMainInvokeEvent,
  { message, screenText, imageDataURL }: ChatGeminiArgs
): Promise<string> => {
  try {
    if (!geminiModel) {
      return 'Error: Gemini API not initialized. Please check your API key in .env file.';
    }
    
    const parts: any[] = [{ text: `User: ${message}` }];
    
    if (screenText) {
      parts.push({ text: `Current screen content: ${screenText}` });
    }
    
    // Add memory context
    const memoryContext = getMemoryContext();
    if (memoryContext) {
      parts.push({ text: memoryContext });
    }
    
    if (imageDataURL) {
      const base64Data = imageDataURL.split(',')[1];
      const mimeType = imageDataURL.split(';')[0].split(':')[1];
      
      // Check if it's a video or image
      if (mimeType.startsWith('video/')) {
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
        parts.push({ text: 'Please analyze this screen recording and describe what you see happening in the video.' });
      } else {
        parts.push({
          inlineData: {
            mimeType: mimeType || 'image/png',
            data: base64Data
          }
        });
      }
    }
    
    const result: GenerateContentResult = await geminiModel.generateContent(parts);
    return result.response.text();
  } catch (error: any) {
    console.error('Error with Gemini:', error);
    return `Error: ${error.message}`;
  }
});

ipcMain.handle('start-screen-stream', async (event) => {
  if (streamingInterval) return;
  streamingInterval = setInterval(async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 }
      });
      if (sources.length === 0) return;
      const dataURL = sources[0].thumbnail.toDataURL();
      event.sender.send('screen-frame', dataURL);
    } catch (error) {
      console.error('Error streaming screen:', error);
    }
  }, 200);
});

ipcMain.handle('stop-screen-stream', () => {
  if (streamingInterval) {
    clearInterval(streamingInterval);
    streamingInterval = null;
  }
});

// Get screen source ID for recording
ipcMain.handle('get-screen-source-id', async () => {
  try {
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'],
      thumbnailSize: { width: 150, height: 150 }
    });
    if (sources.length === 0) throw new Error('No screen sources found');
    return sources[0].id;
  } catch (error) {
    console.error('Error getting screen sources:', error);
    throw error;
  }
});

// Memory management functions
function startMemoryCapture(): void {
  if (memoryInterval) {
    logMemory('Memory capture already running');
    return;
  }
  
  logMemory('Starting memory capture', { interval: MEMORY_CAPTURE_INTERVAL });
  
  memoryInterval = setInterval(async () => {
    try {
      // Capture screenshot
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });
      
      if (sources.length === 0) {
        logMemory('No screen sources available');
        return;
      }
      
      const dataURL = sources[0].thumbnail.toDataURL();
      
      // Extract text using OCR
      const { data: { text } } = await Tesseract.recognize(dataURL, 'eng');
      
      if (text.trim()) {
        await addToMemory(text.trim());
        logMemory('Screen content captured and processed', { 
          textLength: text.length,
          totalEntries: currentMemory.length 
        });
      }
    } catch (error) {
      logMemory('Error in memory capture', error);
    }
  }, MEMORY_CAPTURE_INTERVAL);
}

function stopMemoryCapture(): void {
  if (memoryInterval) {
    clearInterval(memoryInterval);
    memoryInterval = null;
    logMemory('Memory capture stopped');
  }
}

async function addToMemory(content: string): Promise<void> {
  try {
    if (!geminiModel) {
      // Fallback: just replace the memory
      currentMemory = content;
      logMemory('Updated memory (no AI available)', { 
        contentPreview: content.substring(0, 50) + '...',
        memoryLength: currentMemory.length 
      });
      return;
    }

    // Use AI to update memory based on old memory + new content
    const prompt = `You are maintaining a memory of what's happening on the user's screen. 

Current memory: "${currentMemory || 'No previous memory'}"

New screen content: "${content}"

Please update the memory to incorporate the new information. Keep it concise but comprehensive. Focus on:
- Important changes or new information
- Current state and context
- Remove outdated information
- Maintain continuity

Respond with just the updated memory content (no explanations):`;

    const result = await geminiModel.generateContent(prompt);
    const updatedMemory = result.response.text().trim();
    
    currentMemory = updatedMemory;
    
    logMemory('Memory updated by AI', { 
      newContentPreview: content.substring(0, 50) + '...',
      updatedMemoryPreview: updatedMemory.substring(0, 100) + '...',
      memoryLength: currentMemory.length 
    });
    
    // Notify frontend if in debug mode
    if (mainWindow && isDebugMode) {
      mainWindow.webContents.send('memory-updated', { timestamp: Date.now(), content: updatedMemory });
    }
  } catch (error) {
    logMemory('Error updating memory with AI, using simple replacement', error);
    // Fallback: just replace the memory
    currentMemory = content;
  }
}

function getMemoryContext(): string {
  if (!currentMemory) return '';
  return `\n\nCurrent screen memory:\n${currentMemory}`;
}

// Memory management IPC handlers (only available in debug mode)
if (isDebugMode) {
  ipcMain.handle('start-memory-capture', async () => {
    startMemoryCapture();
    return 'Memory capture started';
  });

  ipcMain.handle('stop-memory-capture', async () => {
    stopMemoryCapture();
    return 'Memory capture stopped';
  });

  ipcMain.handle('get-memory-entries', async () => {
    return currentMemory;
  });

  ipcMain.handle('clear-memory', async () => {
    logMemory('Memory cleared via debug interface');
    currentMemory = '';
    return 'Memory cleared';
  });
}

// Always available IPC handlers
ipcMain.handle('get-debug-mode', async () => {
  return isDebugMode;
});
