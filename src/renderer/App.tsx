import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useAudioRecording } from './hooks/useAudioRecording';
import { Copy, Check } from 'lucide-react';
import './App.css';
import { RefreshCw } from 'lucide-react';

// Create a custom theme based on vscDarkPlus but with transparency
const transparentTheme = {
  ...vscDarkPlus,
  'pre[class*="language-"]': {
    ...vscDarkPlus['pre[class*="language-"]'],
    background: 'none',
    margin: 0,
    padding: 0,
  },
  'code[class*="language-"]': {
    ...vscDarkPlus['code[class*="language-"]'],
    background: 'none',
    textShadow: 'none',
  },
  'pre[class*="language-"]::selection': {
    background: 'rgba(255, 255, 255, 0.1)',
  },
  'pre[class*="language-"] ::selection': {
    background: 'rgba(255, 255, 255, 0.1)',
  },
  'code[class*="language-"]::selection': {
    background: 'rgba(255, 255, 255, 0.1)',
  },
  'code[class*="language-"] ::selection': {
    background: 'rgba(255, 255, 255, 0.1)',
  },
  // Override all token backgrounds
  'token': {
    background: 'none !important',
  },
  'token.comment': { color: '#6A9955' },
  'token.string': { color: '#CE9178' },
  'token.keyword': { color: '#569CD6' },
  'token.function': { color: '#DCDCAA' },
  'token.number': { color: '#B5CEA8' },
  'token.operator': { color: '#D4D4D4' },
  'token.class-name': { color: '#4EC9B0' },
  'token.variable': { color: '#9CDCFE' },
  'token.property': { color: '#9CDCFE' },
  'token.punctuation': { color: '#D4D4D4' },
};

// Custom inline code style
const inlineCodeStyle = {
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '4px',
  padding: '2px 6px',
  fontFamily: 'monospace',
};

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const CodeBlock = ({ language, value }: { language: string; value: string }) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      
      // Reset copied state after 2 seconds
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="code-block-wrapper">
      <button 
        className="copy-button"
        onClick={handleCopy}
        title={copied ? "Copied!" : "Copy code"}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <SyntaxHighlighter
        style={transparentTheme as any}
        language={language || 'text'}
        PreTag="div"
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
};

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
    error: audioError,
    stopContinuousRecording
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
      console.error('Failed to start recording:', error);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopContinuousRecording();
    };
  }, [stopContinuousRecording]);

  // Function to check if message contains code blocks
  const hasCodeBlock = (content: string): boolean => {
    // Check for fenced code blocks (```code```)
    const fencedCodeBlock = /```[\s\S]+?```/;
    // Check for indented code blocks (4 spaces or tab)
    const indentedCodeBlock = /^( {4}|\t).+$/m;
    // Check for inline code blocks (`code`)
    const inlineCodeBlocks = /`[^`]+`/g;
    
    if (fencedCodeBlock.test(content)) return true;
    if (indentedCodeBlock.test(content)) return true;
    
    // Only count multiple inline code blocks as needing expansion
    const inlineMatches = content.match(inlineCodeBlocks);
    return inlineMatches ? inlineMatches.length > 2 : false;
  };

  // Effect to handle window width based on code blocks
  useEffect(() => {
    if (messages.length === 0) {
      (window as any).electronAPI.resetWindowWidth();
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'assistant' && hasCodeBlock(lastMessage.content)) {
      (window as any).electronAPI.expandWindowForCode();
    } else if (!messages.some(msg => msg.role === 'assistant' && hasCodeBlock(msg.content))) {
      (window as any).electronAPI.resetWindowWidth();
    }
  }, [messages]);

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
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        const code = String(children).replace(/\n$/, '');
                        
                        return !inline ? (
                          <CodeBlock
                            language={match ? match[1] : 'text'}
                            value={code}
                          />
                        ) : (
                          <code
                            style={inlineCodeStyle}
                            className={className}
                            {...props}
                          >
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