interface RecordedChunk {
    data: BlobPart;
    timestamp: number;
}

// Use the exposed electronAPI from preload.js
  let currentScreenText = '';
  let currentImageDataURL = '';
  
  // Elements
  const screenPreview = document.getElementById('screenPreview');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const chatMessages = document.getElementById('chatMessages');
  
  const captureBtn = document.getElementById('captureBtn');
  const screenVideo = document.getElementById('screenVideo');

  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: RecordedChunk[] = [];
  let recordedVideoBlob: Blob | null = null;
  let isRecording = false;
  const RECORDING_DURATION = 10000; // 10 seconds in milliseconds

  captureBtn?.addEventListener('click', async () => {
      if (!mediaStream) {
          try {
              const { ipcRenderer } = require('electron');
              const sourceId = await ipcRenderer.invoke('get-screen-source-id');
              
              mediaStream = await navigator.mediaDevices.getUserMedia({
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
              
              console.log('MediaStream received:', mediaStream);
              console.log('MediaStream type:', typeof mediaStream);
              console.log('Has getTracks:', !!mediaStream.getTracks);
              (screenVideo as HTMLVideoElement).srcObject = mediaStream as unknown as MediaStream;
              
              // Initialize MediaRecorder for continuous recording
              mediaRecorder = new MediaRecorder(mediaStream, {
                  mimeType: 'video/webm;codecs=vp9'
              });
              
              mediaRecorder.ondataavailable = (event) => {
                  if (event.data.size > 0) {
                      recordedChunks.push({
                          data: event.data,
                          timestamp: Date.now()
                      });
                      
                      // Keep only last 10 seconds of chunks
                      const cutoffTime = Date.now() - RECORDING_DURATION;
                      recordedChunks = recordedChunks.filter(chunk => chunk.timestamp > cutoffTime);
                  }
              };
              
              // Start continuous recording with small intervals
              mediaRecorder.start(1000); // Record in 1-second chunks
              isRecording = true;
              (captureBtn as HTMLButtonElement).textContent = '🛑 Stop Recording';
          } catch (err) {
              console.error('Error capturing screen:', err);
          }
      } else {
          // Stop all recording
          if (mediaRecorder && mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
          }
          
          // Stop all tracks to end the stream
          if (mediaStream && mediaStream.getTracks) {
              mediaStream.getTracks().forEach(track => track.stop());
          }
          mediaStream = null;
          mediaRecorder = null;
          isRecording = false;
          recordedChunks = [];
          (captureBtn as HTMLButtonElement).textContent = '🎥 Start Screen Recording';
          
          // Clear preview
          (screenVideo as HTMLVideoElement).srcObject = null as unknown as MediaStream;
          (screenVideo as HTMLVideoElement).src = '';
          (screenVideo as HTMLVideoElement).controls = false;
          const existingPreview = screenPreview?.querySelector('video[controls]');
          if (existingPreview) {
              existingPreview.remove();
          }
      }
  });
  
  // Send message
  async function sendMessage() {
      const message = (chatInput as HTMLInputElement).value.trim();
      if (!message) return;
      
      // Add user message
      addMessage(message, 'user');
      (chatInput as HTMLInputElement).value = '';
      
      sendBtn?.classList.add('loading');
      (sendBtn as HTMLButtonElement).textContent = 'Thinking...';
      
      // Capture last 10 seconds if recording
      let videoDataURL = currentImageDataURL;
      if (isRecording && recordedChunks.length > 0) {
          try {
              const videoBlob = new Blob(recordedChunks.map(chunk => chunk.data), {
                  type: 'video/webm'
              });
              
              // Convert to base64 for Gemini
              const reader = new FileReader();
              videoDataURL = await new Promise((resolve) => {
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(videoBlob);
              });
              
              addMessage('📹 Analyzing last 10 seconds of screen recording...', 'ai');
          } catch (err) {
              console.error('Error capturing last 10 seconds for Gemini:', err);
          }
      }
      
      try {
          const { ipcRenderer } = require('electron');
          const response = await ipcRenderer.invoke('chat-gemini', {
              message,
              screenText: currentScreenText,
              imageDataURL: videoDataURL
          });
          addMessage(response, 'ai');
      } catch (error) {
          addMessage('Sorry, there was an error processing your message.', 'ai');
      } finally {
          sendBtn?.classList.remove('loading');
          (sendBtn as HTMLButtonElement).textContent = 'Send';
      }
  }
  
  // Add message to chat
  function addMessage(text: string, type: string) {
      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${type}-message`;
      messageDiv.textContent = text;
      chatMessages?.appendChild(messageDiv);
      (chatMessages as HTMLElement).scrollTop = (chatMessages as HTMLElement).scrollHeight;
  }
  
  // Event listeners
  sendBtn?.addEventListener('click', sendMessage);
  chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
  });