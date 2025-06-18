const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Basic IPC
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  
  // Listen for events
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, callback);
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  // Screen capture
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  extractText: (imageDataURL: string) => ipcRenderer.invoke('extract-text', imageDataURL),
  
  // Chat
  chatGemini: (args: any) => ipcRenderer.invoke('chat-gemini', args),
  
  // Audio transcription
  transcribeAudio: (audioBuffer: ArrayBuffer, mimeType?: string) => ipcRenderer.invoke('transcribe-audio', audioBuffer, mimeType),
  getAudioTranscript: () => ipcRenderer.invoke('get-audio-transcript'),
  
  // Memory management (debug mode)
  startMemoryCapture: () => ipcRenderer.invoke('start-memory-capture'),
  stopMemoryCapture: () => ipcRenderer.invoke('stop-memory-capture'),
  getMemoryEntries: () => ipcRenderer.invoke('get-memory-entries'),
  clearMemory: () => ipcRenderer.invoke('clear-memory'),
  
  // App state
  getDebugMode: () => ipcRenderer.invoke('get-debug-mode'),
  
  // Screen recording
  getScreenSourceId: () => ipcRenderer.invoke('get-screen-source-id'),
  
  // Screen streaming
  startScreenStream: () => ipcRenderer.invoke('start-screen-stream'),
  stopScreenStream: () => ipcRenderer.invoke('stop-screen-stream'),
  
  // Legacy method for backward compatibility
  getScreenStream: async () => {
    try {
      // Get the source ID from main process
      const sourceId = await ipcRenderer.invoke('get-screen-source-id');
      
      // Create the stream in renderer process
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: 1920,
            maxHeight: 1080
          }
        }
      } as any);
      
      console.log('Stream created successfully:', stream);
      return stream;
    } catch (error) {
      console.error('Error in getScreenStream:', error);
      throw error;
    }
  },
  
  // Get microphone stream for audio recording
  getMicrophoneStream: async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      
      console.log('Microphone stream created successfully:', stream);
      return stream;
    } catch (error) {
      console.error('Error in getMicrophoneStream:', error);
      throw error;
    }
  }
}); 