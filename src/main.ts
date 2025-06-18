import { app, BrowserWindow, ipcMain, desktopCapturer, IpcMainInvokeEvent } from 'electron';
import * as dotenv from 'dotenv';
import { GoogleGenerativeAI, GenerativeModel, GenerateContentResult } from '@google/generative-ai';
import * as Tesseract from 'tesseract.js';
import { setInterval, clearInterval } from 'timers';

dotenv.config();

let mainWindow: BrowserWindow | null = null;
let geminiModel: GenerativeModel | null = null;
let streamingInterval: NodeJS.Timeout | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
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
  
  if (process.argv.includes('--dev')) {
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
      parts.push({ text: `Screen content: ${screenText}` });
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
