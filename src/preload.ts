const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Basic IPC
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  
  // Window management
  resizeWindow: (height: number) => ipcRenderer.invoke('resize-window', height),
  expandWindowForCode: () => ipcRenderer.invoke('expand-window-for-code'),
  resetWindowWidth: () => ipcRenderer.invoke('reset-window-width'),
  
  // Listen for events with proper callback handling
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'gemini-stream',
      'mouse-events-toggled',
      'set-debug-mode',
      'memory-updated',
      'audio-transcript-updated',
      'focus-input',
      'toggle-collapse'
    ];
    if (validChannels.includes(channel)) {
      // Wrap the callback to prevent leaking ipcRenderer
      const subscription = (_event: any, ...args: any[]) => callback(...args);
      ipcRenderer.on(channel, subscription);
      
      // Return a cleanup function
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
  },
  
  // Remove all listeners for a channel
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  // Screen capture
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  extractText: (imageDataURL: string) => ipcRenderer.invoke('extract-text', imageDataURL),
  getScreenSourceId: () => ipcRenderer.invoke('get-screen-source-id'),
  
  // Screen streaming
  startScreenStream: () => ipcRenderer.invoke('start-screen-stream'),
  stopScreenStream: () => ipcRenderer.invoke('stop-screen-stream'),
  
  // Chat with streaming support
  chatGemini: async (args: any) => {
    // Use invoke for the initial request and let the main process handle streaming
    return ipcRenderer.invoke('chat-gemini', args);
  },
  
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