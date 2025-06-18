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
  importance: number; // 1-10 scale
}

let memoryEntries: MemoryEntry[] = [];
const MAX_MEMORY_ENTRIES = 50;
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
          totalEntries: memoryEntries.length 
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
    // Check if this content is significantly different from recent entries
    const recentEntries = memoryEntries.slice(-5);
    const isDuplicate = recentEntries.some(entry => 
      calculateSimilarity(entry.content, content) > 0.8
    );
    
    if (isDuplicate) {
      logMemory('Skipping duplicate content');
      return;
    }
    
    // Assess importance using AI
    const importance = await assessContentImportance(content);
    
    const entry: MemoryEntry = {
      timestamp: Date.now(),
      content,
      importance
    };
    
    memoryEntries.push(entry);
    logMemory('Added new memory entry', { 
      importance, 
      contentPreview: content.substring(0, 50) + '...',
      totalEntries: memoryEntries.length 
    });
    
    // Manage memory size
    if (memoryEntries.length > MAX_MEMORY_ENTRIES) {
      logMemory('Memory limit reached, consolidating');
      await consolidateMemory();
    }
    
    // Notify frontend if in debug mode
    if (mainWindow && isDebugMode) {
      mainWindow.webContents.send('memory-updated', entry);
    }
  } catch (error) {
    logMemory('Error adding to memory', error);
  }
}

async function assessContentImportance(content: string): Promise<number> {
  if (!geminiModel) return 5; // Default importance
  
  try {
    const prompt = `Rate the importance of this screen content from 1-10 (where 10 is most important):
    
Content: "${content}"

Consider:
- Is this actionable information?
- Does it contain important data, errors, or notifications?
- Is it repetitive/common UI elements?
- Does it represent a significant change in context?

Respond with only a number from 1-10.`;

    const result = await geminiModel.generateContent(prompt);
    const response = result.response.text().trim();
    const importance = parseInt(response);
    
    return isNaN(importance) ? 5 : Math.max(1, Math.min(10, importance));
  } catch (error) {
    console.error('Error assessing importance:', error);
    return 5;
  }
}

async function consolidateMemory(): Promise<void> {
  if (!geminiModel) {
    logMemory('No Gemini model available, using simple consolidation');
    // Simple fallback: remove oldest low-importance entries
    const originalCount = memoryEntries.length;
    memoryEntries = memoryEntries
      .sort((a, b) => b.importance - a.importance || b.timestamp - a.timestamp)
      .slice(0, MAX_MEMORY_ENTRIES);
    logMemory('Simple consolidation completed', { 
      before: originalCount, 
      after: memoryEntries.length 
    });
    return;
  }
  
  try {
    logMemory('Starting AI-powered memory consolidation');
    
    // Get all memory content
    const memoryContent = memoryEntries.map(entry => 
      `[${new Date(entry.timestamp).toLocaleTimeString()}] (Importance: ${entry.importance}) ${entry.content}`
    ).join('\n\n');
    
    const prompt = `Please consolidate and summarize this screen memory, keeping only the most important and relevant information. Remove duplicate, repetitive, or low-value content. Maintain chronological context where important.

Memory entries:
${memoryContent}

Provide a consolidated summary that captures the essential information, significant changes, and important events. Focus on actionable items, errors, important data, and context changes.`;

    const result = await geminiModel.generateContent(prompt);
    const consolidatedContent = result.response.text();
    
    const originalCount = memoryEntries.length;
    
    // Replace all entries with a single consolidated entry
    memoryEntries = [{
      timestamp: Date.now(),
      content: consolidatedContent,
      importance: 8 // High importance for consolidated memory
    }];
    
    logMemory('AI consolidation completed successfully', { 
      before: originalCount, 
      after: memoryEntries.length,
      consolidatedLength: consolidatedContent.length 
    });
  } catch (error) {
    logMemory('Error in AI consolidation, falling back to simple method', error);
    // Fallback to simple removal
    const originalCount = memoryEntries.length;
    memoryEntries = memoryEntries
      .sort((a, b) => b.importance - a.importance || b.timestamp - a.timestamp)
      .slice(0, Math.floor(MAX_MEMORY_ENTRIES / 2));
    logMemory('Fallback consolidation completed', { 
      before: originalCount, 
      after: memoryEntries.length 
    });
  }
}

function calculateSimilarity(text1: string, text2: string): number {
  // Simple similarity calculation using word overlap
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

function getMemoryContext(): string {
  if (memoryEntries.length === 0) return '';
  
  // Get recent high-importance entries
  const recentEntries = memoryEntries
    .filter(entry => entry.importance >= 6 || entry.timestamp > Date.now() - 300000) // High importance or last 5 minutes
    .slice(-10) // Last 10 entries
    .map(entry => `[${new Date(entry.timestamp).toLocaleTimeString()}] ${entry.content}`)
    .join('\n');
  
  return recentEntries ? `\n\nRecent screen context:\n${recentEntries}` : '';
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
    return memoryEntries.slice(-20); // Return last 20 entries
  });

  ipcMain.handle('clear-memory', async () => {
    logMemory('Memory cleared via debug interface');
    memoryEntries = [];
    return 'Memory cleared';
  });

  ipcMain.handle('consolidate-memory', async () => {
    logMemory('Manual consolidation triggered via debug interface');
    await consolidateMemory();
    return 'Memory consolidated';
  });
}

// Always available IPC handlers
ipcMain.handle('get-debug-mode', async () => {
  return isDebugMode;
});
