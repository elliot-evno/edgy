import React, { useState, useEffect, useCallback } from 'react';
import ChatPanel from './components/ChatPanel';
import DebugPanel from './components/DebugPanel';
import './App.css';

const App: React.FC = () => {
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [assistantStarted, setAssistantStarted] = useState(false);
  const [messages, setMessages] = useState<Array<{ text: string; type: 'user' | 'ai' | 'system' }>>([
    { text: "Hi! I'm monitoring your screen and learning from your activity. Ask me anything about what you're working on!", type: 'ai' }
  ]);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      const debugMode = await (window as any).electronAPI.getDebugMode();
      setIsDebugMode(debugMode);
      
      addMessage('🤖 AI Assistant ready! Memory capture is running automatically.', 'system');
      if (debugMode) {
        addMessage('🔧 Debug mode enabled - showing advanced controls.', 'system');
      }
    } catch (error) {
      console.error('Error initializing app:', error);
      addMessage('❌ Error initializing assistant', 'system');
    }
  };

  const addMessage = useCallback((text: string, type: 'user' | 'ai' | 'system') => {
    setMessages(prev => [...prev, { text, type }]);
  }, []);

  const toggleAssistant = () => {
    setAssistantStarted(!assistantStarted);
    
    if (!assistantStarted) {
      addMessage('✅ Assistant activated! I\'m now monitoring your screen.', 'system');
    } else {
      addMessage('⏸️ Assistant paused.', 'system');
    }
  };

  return (
    <div className="main-container">
      <div className="header">
        <h1>🤖 AI Screen Assistant</h1>
        <button 
          className="start-btn" 
          onClick={toggleAssistant}
          style={{ backgroundColor: assistantStarted ? '#dc3545' : '#28a745' }}
        >
          {assistantStarted ? '⏹️ Stop Assistant' : '🚀 Start Assistant'}
        </button>
      </div>
      
      {isDebugMode && (
        <DebugPanel addMessage={addMessage} />
      )}
      
      <ChatPanel 
        messages={messages} 
        addMessage={addMessage}
        assistantStarted={assistantStarted}
      />
    </div>
  );
};

export default App; 