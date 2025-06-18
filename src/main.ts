import { app, BrowserWindow, ipcMain, desktopCapturer, IpcMainInvokeEvent, globalShortcut } from 'electron';
import * as dotenv from 'dotenv';
import { GoogleGenerativeAI, GenerativeModel, GenerateContentResult } from '@google/generative-ai';
import * as Tesseract from 'tesseract.js';
import { setInterval, clearInterval } from 'timers';
import * as path from 'path';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as os from 'os';

dotenv.config();

let mainWindow: BrowserWindow | null = null;
let geminiModel: GenerativeModel | null = null;
let openaiClient: OpenAI | null = null;
let streamingInterval: NodeJS.Timeout | null = null;
let memoryInterval: NodeJS.Timeout | null = null;

// Debug mode
const isDebugMode = process.argv.includes('--debug') || process.env.DEBUG_MODE === 'true';
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
let ignoreMouseEvents = process.argv.includes('--ignore-mouse-events') || process.env.IGNORE_MOUSE_EVENTS === 'true';

// Memory management
interface MemoryEntry {
  timestamp: number;
  content: string;
}

let currentMemory: string = '';
let currentAudioTranscript: string = '';
const MEMORY_CAPTURE_INTERVAL = 5000; // 5 seconds

function logMemory(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[MEMORY ${timestamp}] ${message}`, data || '');
}

function logAudio(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[AUDIO ${timestamp}] ${message}`, data || '');
}
function createWindow(): void {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  const windowWidth = 400;
  const windowHeight = 600;
  const x = width - windowWidth - 20;
  const y = 40;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    frame: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,              // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    }
  });

  // Set window properties when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.setAlwaysOnTop(true, "floating");
    mainWindow?.setVisibleOnAllWorkspaces(true);
    mainWindow?.setFullScreenable(false);
    
    if (ignoreMouseEvents === true) {
      mainWindow?.setIgnoreMouseEvents(true);
    }
    
    mainWindow?.show();
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-react/index.html'));
  }
  if (ignoreMouseEvents === true) {
    mainWindow.setIgnoreMouseEvents(true);
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }

  
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
  
  // Only open DevTools in debug mode
  if (isDebugMode) {
    mainWindow.webContents.openDevTools();
  }
}

function initializeAI(): void {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  }
  
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (openaiApiKey) {
    openaiClient = new OpenAI({
      apiKey: openaiApiKey,
    });
    logAudio('OpenAI client initialized for audio transcription');
  } else {
    logAudio('Warning: OPENAI_API_KEY not found. Audio transcription will be disabled.');
  }
}

app.whenReady().then(() => {
  // Hide dock icon
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  
  createWindow();
  initializeAI();
  
  // Register global shortcut for Cmd+G to toggle mouse events
  globalShortcut.register('CommandOrControl+G', () => {
    if (mainWindow) {
      ignoreMouseEvents = !ignoreMouseEvents;
      mainWindow.setIgnoreMouseEvents(ignoreMouseEvents);
      console.log(`Mouse events ${ignoreMouseEvents ? 'ignored' : 'enabled'}`);
      
      // Send status to renderer if in debug mode
      if (isDebugMode) {
        mainWindow.webContents.send('mouse-events-toggled', ignoreMouseEvents);
      }
    }
  });
});

app.on('window-all-closed', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
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
    
    // Technical interview assistant system prompt
    const systemPrompt = `You are a concise technical interview assistant. You can see the screen and hear audio. Provide direct, short answers. Never say "the user wants" or similar phrases. Help with:

- Coding problems & algorithms
- System design questions  
- Debugging code
- Technical concepts
- Interview prep

Be brief and actionable.`;
    
    const parts: any[] = [
      { text: systemPrompt },
      { text: `Question: ${message}` }
    ];
    
    if (screenText) {
      parts.push({ text: `Screen content: ${screenText}` });
    }
    
    // Add memory context
    const memoryContext = getMemoryContext();
    if (memoryContext) {
      parts.push({ text: memoryContext });
    }
    
    // Add audio context
    const audioContext = getAudioContext();
    if (audioContext) {
      parts.push({ text: audioContext });
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

    // Use AI to update memory based on old memory + new content + audio context
    const audioContext = currentAudioTranscript ? `\n\nRecent audio: "${currentAudioTranscript}"` : '';
    
    const prompt = `Update technical session memory. Focus on code, problems, and key context.

Current: "${currentMemory || 'Empty'}"
Screen: "${content}"${audioContext}

Keep concise. Focus on:
- Code/algorithms being worked on
- Technical problems/solutions
- Important changes
- Interview context

Updated memory:`;

    const result = await geminiModel.generateContent(prompt);
    const updatedMemory = result.response.text().trim();
    
    currentMemory = updatedMemory;
    
    logMemory('Memory updated by AI (with audio context)', { 
      newContentPreview: content.substring(0, 50) + '...',
      audioContextLength: currentAudioTranscript.length,
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
  return `\n\nContext: ${currentMemory}`;
}

// Audio transcription functions
async function transcribeAudioFile(audioBuffer: Buffer, mimeType: string = 'audio/wav'): Promise<string> {
  if (!openaiClient) {
    logAudio('OpenAI client not available for transcription');
    return '';
  }

  try {
    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `temp_audio_${Date.now()}.wav`);
    
    // Write buffer to temporary file
    fs.writeFileSync(tempFile, audioBuffer);
    
    logAudio('Transcribing audio file', { fileSize: audioBuffer.length });
    
    // Transcribe using OpenAI Whisper
    const transcription = await openaiClient.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-1',
    });
    
    // Clean up temporary file
    fs.unlinkSync(tempFile);
    
    logAudio('Audio transcription completed', { 
      textLength: transcription.text.length,
      preview: transcription.text.substring(0, 100) + '...'
    });
    
    return transcription.text;
    
  } catch (error) {
    logAudio('Error transcribing audio', error);
    return '';
  }
}

async function addAudioToMemory(audioText: string): Promise<void> {
  if (!audioText.trim()) return;
  
  currentAudioTranscript = audioText;
  logAudio('Audio transcript updated', {
    textLength: audioText.length,
    preview: audioText.substring(0, 100) + '...'
  });
  
  // Notify frontend if in debug mode
  if (mainWindow && isDebugMode) {
    mainWindow.webContents.send('audio-transcript-updated', { 
      timestamp: Date.now(), 
      content: audioText 
    });
  }
}

function getAudioContext(): string {
  if (!currentAudioTranscript) return '';
  return `\n\nAudio: ${currentAudioTranscript}`;
}

// Audio transcription IPC handlers
ipcMain.handle('transcribe-audio', async (_event: IpcMainInvokeEvent, audioBuffer: ArrayBuffer, mimeType?: string): Promise<string> => {
  try {
    const buffer = Buffer.from(audioBuffer);
    const transcription = await transcribeAudioFile(buffer, mimeType || 'audio/wav');
    
    // Add to memory if transcription is successful
    if (transcription) {
      await addAudioToMemory(transcription);
    }
    
    return transcription;
  } catch (error) {
    logAudio('Error in transcribe-audio IPC handler', error);
    return '';
  }
});

ipcMain.handle('get-audio-transcript', async () => {
  return currentAudioTranscript;
});

// Memory management functions
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
