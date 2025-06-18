import { desktopCapturer } from 'electron';
import * as Tesseract from 'tesseract.js';

export class ScreenManager {
  private streamingInterval: NodeJS.Timeout | null = null;

  async captureScreen(): Promise<{ dataURL: string } | null> {
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
  }

  async extractText(imageDataURL: string): Promise<string> {
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
  }

  async getScreenSourceId(): Promise<string> {
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
  }

  startScreenStream(callback: (dataURL: string) => void): void {
    if (this.streamingInterval) return;
    
    this.streamingInterval = setInterval(async () => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1280, height: 720 }
        });
        if (sources.length === 0) return;
        const dataURL = sources[0].thumbnail.toDataURL();
        callback(dataURL);
      } catch (error) {
        console.error('Error streaming screen:', error);
      }
    }, 200);
  }

  stopScreenStream(): void {
    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }
  }
} 