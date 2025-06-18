import React, { useState, useRef, useEffect } from 'react';

interface Message {
  text: string;
  type: 'user' | 'ai' | 'system';
}

interface ChatPanelProps {
  messages: Message[];
  addMessage: (text: string, type: 'user' | 'ai' | 'system') => void;
  assistantStarted: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, addMessage, assistantStarted }) => {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!assistantStarted) {
      addMessage('❌ Please start the assistant first!', 'system');
      return;
    }
    
    const message = inputValue.trim();
    if (!message) return;
    
    addMessage(message, 'user');
    setInputValue('');
    setIsLoading(true);
    
    try {
      const response = await (window as any).electronAPI.chatGemini({
        message,
        screenText: '', // This would be populated from screen capture
        imageDataURL: '' // This would be populated from screen capture
      });
      addMessage(response, 'ai');
    } catch (error) {
      addMessage('Sorry, there was an error processing your message.', 'ai');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  return (
    <div className="chat-panel">
      <h2>💬 Chat</h2>
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div 
            key={index} 
            className={`message ${msg.type}-message`}
            style={msg.type === 'system' ? { fontStyle: 'italic', color: '#666' } : {}}
          >
            {msg.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-container">
        <input 
          type="text" 
          className="chat-input" 
          placeholder="Ask about your screen or work..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
        />
        <button 
          className={`send-btn ${isLoading ? 'loading' : ''}`}
          onClick={sendMessage}
          disabled={isLoading}
        >
          {isLoading ? 'Thinking...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ChatPanel; 