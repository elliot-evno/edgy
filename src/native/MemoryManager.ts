import { apiServer } from '../server/api';
import { ScreenManager } from './ScreenManager';

export class MemoryManager {
  private currentMemory: string = '';
  private currentAudioTranscript: string = '';
  private memoryInterval: NodeJS.Timeout | null = null;
  private readonly MEMORY_CAPTURE_INTERVAL = 5000; // 5 seconds
  private screenManager: ScreenManager;
  private isDebugMode: boolean;

  constructor(screenManager: ScreenManager, isDebugMode: boolean) {
    this.screenManager = screenManager;
    this.isDebugMode = isDebugMode;
  }

  private logMemory(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[MEMORY ${timestamp}] ${message}`, data || '');
  }

  private logAudio(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[AUDIO ${timestamp}] ${message}`, data || '');
  }

  startMemoryCapture(onMemoryUpdate?: (memory: string) => void): void {
    if (this.memoryInterval) {
      this.logMemory('Memory capture already running');
      return;
    }
    
    this.logMemory('Starting memory capture', { interval: this.MEMORY_CAPTURE_INTERVAL });
    
    this.memoryInterval = setInterval(async () => {
      try {
        const screenCapture = await this.screenManager.captureScreen();
        if (!screenCapture) {
          this.logMemory('No screen sources available');
          return;
        }
        
        const text = await this.screenManager.extractText(screenCapture.dataURL);
        
        if (text.trim()) {
          await this.addToMemory(text.trim());
          this.logMemory('Screen content captured and processed', { 
            textLength: text.length,
            totalEntries: this.currentMemory.length 
          });

          if (onMemoryUpdate) {
            onMemoryUpdate(this.currentMemory);
          }
        }
      } catch (error) {
        this.logMemory('Error in memory capture', error);
      }
    }, this.MEMORY_CAPTURE_INTERVAL);
  }

  stopMemoryCapture(): void {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
      this.logMemory('Memory capture stopped');
    }
  }

  async addToMemory(content: string): Promise<void> {
    try {
      if (!this.currentMemory) {
        this.currentMemory = content;
        this.logMemory('Updated memory (first entry)', { 
          contentPreview: content.substring(0, 50) + '...',
          memoryLength: this.currentMemory.length 
        });
        return;
      }

      const audioContext = this.currentAudioTranscript ? `\n\nRecent audio: "${this.currentAudioTranscript}"` : '';
      
      const prompt = `Update technical session memory. Focus on code, problems, and key context.

Current: "${this.currentMemory || 'Empty'}"
Screen: "${content}"${audioContext}

Keep concise. Focus on:
- Code/algorithms being worked on
- Technical problems/solutions
- Important changes
- Interview context

Updated memory:`;

      try {
        const responseStream = await apiServer.chatWithGemini({
          message: prompt,
          screenText: '',
          imageDataURL: ''
        });
        
        let updatedMemory = '';
        for await (const text of responseStream) {
          updatedMemory = text;
        }
        
        this.currentMemory = updatedMemory.trim();
        
        this.logMemory('Memory updated by AI (with audio context)', { 
          newContentPreview: content.substring(0, 50) + '...',
          audioContextLength: this.currentAudioTranscript.length,
          updatedMemoryPreview: updatedMemory.substring(0, 100) + '...',
          memoryLength: this.currentMemory.length 
        });
      } catch (error) {
        this.logMemory('Error updating memory with AI, using simple replacement', error);
        this.currentMemory = content;
      }
    } catch (error) {
      this.logMemory('Error updating memory, using simple replacement', error);
      this.currentMemory = content;
    }
  }

  async addAudioToMemory(audioText: string): Promise<void> {
    if (!audioText.trim()) return;
    
    this.currentAudioTranscript = audioText;
    this.logAudio('Audio transcript updated', {
      textLength: audioText.length,
      preview: audioText.substring(0, 100) + '...'
    });
  }

  getMemoryContext(): string {
    if (!this.currentMemory) return '';
    return `\n\nContext: ${this.currentMemory}`;
  }

  getAudioContext(): string {
    if (!this.currentAudioTranscript) return '';
    return `\n\nAudio: ${this.currentAudioTranscript}`;
  }

  getCurrentMemory(): string {
    return this.currentMemory;
  }

  getCurrentAudioTranscript(): string {
    return this.currentAudioTranscript;
  }

  clearMemory(): void {
    this.logMemory('Memory cleared');
    this.currentMemory = '';
  }
} 