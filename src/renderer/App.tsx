import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './App.css';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const initializeApp = async () => {
    try {
      const debugMode = await (window as any).electronAPI.getDebugMode();
      
      if (debugMode) {
        addMessage('🔧 Debug mode enabled - showing advanced controls.', 'system');
      }
    } catch (error) {
      console.error('Error initializing app:', error);
      addMessage('❌ Error initializing assistant', 'system');
    }
  };

  const addMessage = useCallback((text: string, type: 'user' | 'ai' | 'system') => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: type === 'user' ? 'user' : 'assistant',
      content: text
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await (window as any).electronAPI.chatGemini({
        message: input.trim()
      });
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="chat-container" ref={chatContainerRef}>
        {messages.map(message => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-content">
              {message.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    code({ node, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const inline = !match;
                      return !inline ? (
                        <SyntaxHighlighter
                          style={vscDarkPlus as any}
                          language={match[1]}
                          PreTag="div"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : (
                message.content
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="message-content">
              <div className="loading"></div>
            </div>
          </div>
        )}
      </div>
      
      <div className="input-container">
        <form onSubmit={handleSubmit} className="input-wrapper">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="chat-input"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !input.trim()} className="send-button">
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default App; 