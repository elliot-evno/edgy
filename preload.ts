const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
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
  }
}); 