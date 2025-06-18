interface RecordedChunk {
    data: BlobPart;
    timestamp: number;
}

interface MemoryEntry {
    timestamp: number;
    content: string;
    importance: number;
}

// Main state
let currentScreenText = '';
let currentImageDataURL = '';
let isMemoryCapturing = true; // Always capturing now
let isDebugMode = false;
let assistantStarted = false;

// Elements
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');
const startBtn = document.getElementById('startBtn');
const debugPanel = document.getElementById('debugPanel');

// Debug elements (may not exist in simple mode)
const screenPreview = document.getElementById('screenPreview');
const captureBtn = document.getElementById('captureBtn');
const screenVideo = document.getElementById('screenVideo');
const startMemoryBtn = document.getElementById('startMemoryBtn');
const stopMemoryBtn = document.getElementById('stopMemoryBtn');
const consolidateBtn = document.getElementById('consolidateBtn');
const clearMemoryBtn = document.getElementById('clearMemoryBtn');
const memoryStatus = document.getElementById('memoryStatus');
const memoryCount = document.getElementById('memoryCount');
const memoryEntries = document.getElementById('memoryEntries');

// Recording state
let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: RecordedChunk[] = [];
let recordedVideoBlob: Blob | null = null;
let isRecording = false;
const RECORDING_DURATION = 10000; // 10 seconds in milliseconds

// Initialize the app
async function initializeApp() {
    try {
        // Check if we're in debug mode
        isDebugMode = await (window as any).electronAPI.getDebugMode();
        console.log('Debug mode:', isDebugMode);
        
        if (isDebugMode && debugPanel) {
            debugPanel.style.display = 'block';
            setupDebugControls();
        }
        
        setupEventListeners();
        updateMemoryDisplay();
        
        addMessage('🤖 AI Assistant ready! Memory capture is running automatically.', 'system');
        if (isDebugMode) {
            addMessage('🔧 Debug mode enabled - showing advanced controls.', 'system');
        }
    } catch (error) {
        console.error('Error initializing app:', error);
        addMessage('❌ Error initializing assistant', 'system');
    }
}

// Setup debug controls
function setupDebugControls() {
    if (!isDebugMode) return;
    
    // Memory event listeners
    startMemoryBtn?.addEventListener('click', startMemoryCapture);
    stopMemoryBtn?.addEventListener('click', stopMemoryCapture);
    consolidateBtn?.addEventListener('click', consolidateMemory);
    clearMemoryBtn?.addEventListener('click', clearMemory);
    
    // Recording event listeners
    captureBtn?.addEventListener('click', toggleRecording);
    
    // Update memory display periodically in debug mode
    setInterval(updateMemoryDisplay, 5000);
}

// Setup basic event listeners
function setupEventListeners() {
    startBtn?.addEventListener('click', toggleAssistant);
    sendBtn?.addEventListener('click', sendMessage);
    chatInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

// Toggle assistant on/off
function toggleAssistant() {
    assistantStarted = !assistantStarted;
    
    if (startBtn) {
        startBtn.textContent = assistantStarted ? '⏹️ Stop Assistant' : '🚀 Start Assistant';
        startBtn.style.backgroundColor = assistantStarted ? '#dc3545' : '#28a745';
    }
    
    if (assistantStarted) {
        addMessage('✅ Assistant activated! I\'m now monitoring your screen.', 'system');
    } else {
        addMessage('⏸️ Assistant paused.', 'system');
    }
}

// Memory management functions (only work in debug mode)
async function startMemoryCapture() {
    if (!isDebugMode) return;
    try {
        await (window as any).electronAPI.startMemoryCapture();
        isMemoryCapturing = true;
        updateMemoryStatus();
        addMessage('🧠 Memory capture started manually', 'system');
    } catch (error) {
        console.error('Error starting memory capture:', error);
        addMessage('❌ Failed to start memory capture', 'system');
    }
}

async function stopMemoryCapture() {
    if (!isDebugMode) return;
    try {
        await (window as any).electronAPI.stopMemoryCapture();
        isMemoryCapturing = false;
        updateMemoryStatus();
        addMessage('🛑 Memory capture stopped manually', 'system');
    } catch (error) {
        console.error('Error stopping memory capture:', error);
    }
}

async function consolidateMemory() {
    if (!isDebugMode) return;
    try {
        await (window as any).electronAPI.consolidateMemory();
        addMessage('🗜️ Memory consolidated successfully', 'system');
        await updateMemoryDisplay();
    } catch (error) {
        console.error('Error consolidating memory:', error);
        addMessage('❌ Failed to consolidate memory', 'system');
    }
}

async function clearMemory() {
    if (!isDebugMode) return;
    try {
        await (window as any).electronAPI.clearMemory();
        addMessage('🗑️ Memory cleared', 'system');
        await updateMemoryDisplay();
    } catch (error) {
        console.error('Error clearing memory:', error);
    }
}

async function updateMemoryDisplay() {
    if (!isDebugMode) return;
    
    try {
        const entries: MemoryEntry[] = await (window as any).electronAPI.getMemoryEntries();
        
        if (memoryCount) {
            memoryCount.textContent = `Entries: ${entries.length}`;
        }
        
        if (memoryEntries) {
            memoryEntries.innerHTML = '';
            entries.slice(-5).forEach(entry => {
                const entryDiv = document.createElement('div');
                entryDiv.className = 'memory-entry';
                entryDiv.innerHTML = `
                    <div class="memory-time">${new Date(entry.timestamp).toLocaleTimeString()}</div>
                    <div class="memory-importance">Importance: ${entry.importance}/10</div>
                    <div class="memory-content">${entry.content.substring(0, 100)}${entry.content.length > 100 ? '...' : ''}</div>
                `;
                memoryEntries.appendChild(entryDiv);
            });
        }
    } catch (error) {
        console.error('Error updating memory display:', error);
    }
}

function updateMemoryStatus() {
    if (!isDebugMode || !memoryStatus) return;
    
    memoryStatus.textContent = `Memory: ${isMemoryCapturing ? 'Active' : 'Inactive'}`;
    memoryStatus.className = isMemoryCapturing ? 'active' : 'inactive';
}

// Simplified recording toggle for debug mode
async function toggleRecording() {
    if (!isDebugMode) return;
    
    if (!mediaStream) {
        try {
            const sourceId = await (window as any).electronAPI.getScreenSourceId();
            
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
            
            if (screenVideo) {
                (screenVideo as HTMLVideoElement).srcObject = mediaStream as unknown as MediaStream;
            }
            
            if (captureBtn) {
                (captureBtn as HTMLButtonElement).textContent = '🛑 Stop Recording';
            }
            
            addMessage('🎥 Screen recording started', 'system');
        } catch (err) {
            console.error('Error capturing screen:', err);
            addMessage('❌ Failed to start recording', 'system');
        }
    } else {
        // Stop recording
        if (mediaStream && mediaStream.getTracks) {
            mediaStream.getTracks().forEach(track => track.stop());
        }
        mediaStream = null;
        
        if (captureBtn) {
            (captureBtn as HTMLButtonElement).textContent = '🎥 Start Screen Recording';
        }
        
        if (screenVideo) {
            (screenVideo as HTMLVideoElement).srcObject = null as unknown as MediaStream;
        }
        
        addMessage('⏹️ Screen recording stopped', 'system');
    }
}

// Listen for memory updates - we'll need to set this up through the preload
// For now, we'll poll for updates periodically
setInterval(updateMemoryDisplay, 10000); // Update every 10 seconds

// Memory event listeners
startMemoryBtn?.addEventListener('click', startMemoryCapture);
stopMemoryBtn?.addEventListener('click', stopMemoryCapture);
consolidateBtn?.addEventListener('click', consolidateMemory);
clearMemoryBtn?.addEventListener('click', clearMemory);

// Initialize memory display
updateMemoryDisplay();
updateMemoryStatus();

// Send message
async function sendMessage() {
    if (!assistantStarted) {
        addMessage('❌ Please start the assistant first!', 'system');
        return;
    }
    
    const message = (chatInput as HTMLInputElement).value.trim();
    if (!message) return;
    
    // Add user message
    addMessage(message, 'user');
    (chatInput as HTMLInputElement).value = '';
    
    sendBtn?.classList.add('loading');
    (sendBtn as HTMLButtonElement).textContent = 'Thinking...';
    
    try {
        const response = await (window as any).electronAPI.chatGemini({
            message,
            screenText: currentScreenText,
            imageDataURL: currentImageDataURL
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
    
    if (type === 'system') {
        messageDiv.className = 'message system-message';
        messageDiv.style.fontStyle = 'italic';
        messageDiv.style.color = '#666';
    }
    
    messageDiv.textContent = text;
    chatMessages?.appendChild(messageDiv);
    (chatMessages as HTMLElement).scrollTop = (chatMessages as HTMLElement).scrollHeight;
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', initializeApp);