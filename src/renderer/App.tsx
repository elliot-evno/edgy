import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useAudioRecording } from './hooks/useAudioRecording';
import './App.css';
import { RefreshCw } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeStreamRef = useRef<string | null>(null);
 
  const HEADER_HEIGHT = 30;
  const EXPANDED_HEIGHT = 600; // Default window height
  
  // Audio recording hook
  const { 
    startContinuousRecording, 
    error: audioError 
  } = useAudioRecording();

  useEffect(() => {
    initializeApp();
    
    // Set up Gemini streaming listener
    const cleanupGemini = (window as any).electronAPI.on('gemini-stream', (data: { streamId: string; text: string; done: boolean; error?: boolean }) => {
      // Only process if this is the active stream
      if (activeStreamRef.current === data.streamId) {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant') {
            lastMessage.content = data.text;
            return [...newMessages];
          }
          return prev;
        });

        // Auto-scroll to the latest message
        requestAnimationFrame(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        });

        // Clear active stream when done
        if (data.done) {
          activeStreamRef.current = null;
          setIsLoading(false);
        }
      }
    });

    // Set up keyboard shortcut listeners
    const cleanupFocusInput = (window as any).electronAPI.on('focus-input', () => {
      console.log('Focus input event received');
      if (inputRef.current) {
        inputRef.current.focus();
      }
    });

    const cleanupToggleCollapse = (window as any).electronAPI.on('toggle-collapse', () => {
      console.log('Toggle collapse event received');
      // Just update the UI state, window size is handled by main process
      setIsExpanded(prev => !prev);
    });
    
    return () => {
      if (cleanupGemini) cleanupGemini();
      if (cleanupFocusInput) cleanupFocusInput();
      if (cleanupToggleCollapse) cleanupToggleCollapse();
    };
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const initializeApp = async () => {
    try {
      console.log('Starting continuous audio recording...');
      await startContinuousRecording();
      console.log('Audio recording started successfully');
      
    } catch (error) {
      console.error('Error initializing app:', error);
      console.error('Failed to start audio recording:', error);
    }
  };

  // Log audio errors
  useEffect(() => {
    if (audioError) {
      console.error('Audio Error:', audioError);
    }
  }, [audioError]);

  const toggleChat = async () => {
    const newIsExpanded = !isExpanded;
    console.log('Toggling chat from UI:', { newIsExpanded });
    setIsExpanded(newIsExpanded);
    
    // Only resize when toggled from UI
    const newHeight = newIsExpanded ? EXPANDED_HEIGHT : HEADER_HEIGHT;
    try {
      await (window as any).electronAPI.resizeWindow(newHeight);
      console.log('Window resized successfully to:', newHeight);
    } catch (error) {
      console.error('Error resizing window:', error);
      // Revert state if resize fails
      setIsExpanded(!newIsExpanded);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    setInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    };
    
    const messageId = (Date.now() + 1).toString();
    activeStreamRef.current = messageId;

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Add an empty assistant message that will be updated via streaming
      const assistantMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: ''
      };
      setMessages(prev => [...prev, assistantMessage]);

      await (window as any).electronAPI.chatGemini({
        message: userMessage.content,
        messageId: messageId
      });
    } catch (error) {
      console.error('Error sending message:', error);
      activeStreamRef.current = null;
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.content = 'Sorry, I encountered an error. Please try again.';
          return [...newMessages];
        }
        return prev;
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="title-bar">
        <div style={{ marginRight: 'auto' }}>
          <button 
            className="toggle-button"
            onClick={toggleChat}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? '▼' : '▲'}
          </button>
        </div>

        <button 
          className="clear-button"
          onClick={clearHistory}
          title="Clear chat history"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <div className={`chat-section ${isExpanded ? 'expanded' : 'collapsed'}`}>
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
              ref={inputRef}
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
    </div>
  );
};

export default App; 