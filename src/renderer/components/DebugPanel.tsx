import React, { useState, useRef, useEffect } from 'react';

interface DebugPanelProps {
  addMessage: (text: string, type: 'user' | 'ai' | 'system') => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ addMessage }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [memoryContent, setMemoryContent] = useState('');
  const [memoryStatus, setMemoryStatus] = useState('Active');
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    updateMemoryDisplay();
    const interval = setInterval(updateMemoryDisplay, 5000);
    return () => clearInterval(interval);
  }, []);

  const updateMemoryDisplay = async () => {
    try {
      const content = await (window as any).electronAPI.getMemoryEntries();
      setMemoryContent(content || '');
    } catch (error) {
      console.error('Error updating memory display:', error);
    }
  };

  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        const sourceId = await (window as any).electronAPI.getScreenSourceId();
        
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
        
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        setIsRecording(true);
      } catch (err) {
        console.error('Error capturing screen:', err);
      }
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      setIsRecording(false);
    }
  };

  const startMemoryCapture = async () => {
    try {
      await (window as any).electronAPI.startMemoryCapture();
      setMemoryStatus('Active');
    } catch (error) {
      console.error('Error starting memory capture:', error);
    }
  };

  const stopMemoryCapture = async () => {
    try {
      await (window as any).electronAPI.stopMemoryCapture();
      setMemoryStatus('Inactive');
    } catch (error) {
      console.error('Error stopping memory capture:', error);
    }
  };

  const clearMemory = async () => {
    try {
      await (window as any).electronAPI.clearMemory();
      await updateMemoryDisplay();
    } catch (error) {
      console.error('Error clearing memory:', error);
    }
  };

  return (
    <div className="debug-panel">
      <div className="screen-panel">
        <h2>📺 Screen Capture</h2>
        <div className="screen-preview">
          <video 
            ref={videoRef}
            autoPlay 
            playsInline 
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          />
        </div>
        <button 
          className="capture-btn" 
          onClick={toggleRecording}
        >
          {isRecording ? '🛑 Stop Recording' : '🎥 Start Screen Recording'}
        </button>
        
        <div className="memory-controls">
          <h3>🧠 Memory System</h3>
          <div className="memory-buttons">
            <button className="memory-btn" onClick={startMemoryCapture}>
              🔄 Start Auto-Capture
            </button>
            <button className="memory-btn" onClick={stopMemoryCapture}>
              ⏹️ Stop Auto-Capture
            </button>
            <button className="memory-btn" onClick={clearMemory}>
              🗑️ Clear
            </button>
          </div>
          <div className="memory-status">
            <span className={memoryStatus === 'Active' ? 'active' : 'inactive'}>
              Memory: {memoryStatus}
            </span>
            <span>Memory size: {memoryContent.length} chars</span>
          </div>
          <div className="memory-entries">
            {memoryContent && (
              <div className="memory-entry">
                <div className="memory-time">{new Date().toLocaleTimeString()}</div>
                <div className="memory-content">
                  {memoryContent.substring(0, 500)}
                  {memoryContent.length > 500 ? '...' : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugPanel; 