import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

class APIServer {
  private geminiModel: GenerativeModel | null = null;
  private openaiClient: OpenAI | null = null;
  
  constructor() {
    this.initializeAPIs();
  }
  
  private initializeAPIs(): void {
    // Initialize Gemini
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      this.geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      console.log('[API Server] Gemini initialized');
    } else {
      console.warn('[API Server] Warning: GEMINI_API_KEY not found');
    }
    
    // Initialize OpenAI
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (openaiApiKey) {
      this.openaiClient = new OpenAI({ apiKey: openaiApiKey });
      console.log('[API Server] OpenAI initialized');
    } else {
      console.warn('[API Server] Warning: OPENAI_API_KEY not found');
    }
  }
  
  async chatWithGemini(params: {
    message: string;
    screenText?: string;
    imageDataURL?: string;
    memoryContext?: string;
    audioContext?: string;
  }): Promise<AsyncGenerator<string, void, unknown>> {
    if (!this.geminiModel) {
      throw new Error('Gemini API not initialized. Please check your API key in .env file.');
    }
    
    const systemPrompt = `You are a concise technical interview assistant. You can see the screen and hear audio. Provide direct, short answers. Never say "the user wants" or similar phrases. Help with:

- Coding problems & algorithms
- System design questions  
- Debugging code
- Technical concepts
- Interview prep

Be brief and actionable.`;
    
    const parts: any[] = [
      { text: systemPrompt },
      { text: `Question: ${params.message}` }
    ];
    
    if (params.screenText) {
      parts.push({ text: `Screen content: ${params.screenText}` });
    }
    
    if (params.memoryContext) {
      parts.push({ text: params.memoryContext });
    }
    
    if (params.audioContext) {
      parts.push({ text: params.audioContext });
    }
    
    if (params.imageDataURL) {
      const base64Data = params.imageDataURL.split(',')[1];
      const mimeType = params.imageDataURL.split(';')[0].split(':')[1];
      
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
    
    const result = await this.geminiModel.generateContentStream(parts);
    return this.streamResponse(result);
  }
  
  private async *streamResponse(result: any): AsyncGenerator<string, void, unknown> {
    let fullResponse = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullResponse += text;
      yield fullResponse;
    }
  }
  
  async transcribeAudio(audioBuffer: Buffer, mimeType: string = 'audio/wav'): Promise<string> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not available for transcription');
    }
    
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `temp_audio_${Date.now()}.wav`);
    
    try {
      // Write buffer to temporary file
      fs.writeFileSync(tempFile, audioBuffer);
      
      console.log('[API Server] Transcribing audio file', { fileSize: audioBuffer.length });
      
      // Transcribe using OpenAI Whisper
      const transcription = await this.openaiClient.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: 'whisper-1',
      });
      
      console.log('[API Server] Audio transcription completed', { 
        textLength: transcription.text.length,
        preview: transcription.text.substring(0, 100) + '...'
      });
      
      return transcription.text;
    } finally {
      // Clean up temporary file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
}

// Export singleton instance
export const apiServer = new APIServer(); 