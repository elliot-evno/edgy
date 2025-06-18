import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioRecordingReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  startContinuousRecording: () => Promise<void>;
  stopContinuousRecording: () => void;
  error: string | null;
}

export const useAudioRecording = (): UseAudioRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const micMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const systemMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micAudioChunksRef = useRef<Blob[]>([]);
  const systemAudioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);

  const RECORDING_DURATION = 10000; // Record for 10 seconds at a time

  const processAudioChunks = useCallback(async (chunks: Blob[], source: 'mic' | 'system') => {
    if (chunks.length === 0) return;

    try {
      setIsTranscribing(true);
      
      // Create audio blob from chunks
      const audioBlob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
      
      if (audioBlob.size === 0) {
        setIsTranscribing(false);
        return;
      }
      
      console.log(`Processing ${source} audio chunk, size:`, audioBlob.size);
      
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Send to main process for transcription
      const transcription = await (window as any).electronAPI.transcribeAudio(
        arrayBuffer, 
        'audio/webm'
      );
      
      if (transcription && transcription.trim()) {
        console.log(`${source} audio transcribed:`, transcription.substring(0, 100) + '...');
        // The main process will handle adding this to memory
      }
      
      setIsTranscribing(false);
      
    } catch (error) {
      console.error(`Error processing ${source} audio chunks:`, error);
      setIsTranscribing(false);
      setError(`Failed to transcribe ${source} audio chunk`);
    }
  }, []);

  const startRecordingSession = useCallback(async () => {
    if (!micStreamRef.current && !systemStreamRef.current) return;

    try {
      // Start microphone recording
      if (micStreamRef.current) {
        const micMediaRecorder = new MediaRecorder(micStreamRef.current, {
          mimeType: 'audio/webm;codecs=opus'
        });
        
        micMediaRecorderRef.current = micMediaRecorder;
        micAudioChunksRef.current = [];
        
        micMediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            micAudioChunksRef.current.push(event.data);
          }
        };
        
        micMediaRecorder.onstop = () => {
          processAudioChunks(micAudioChunksRef.current, 'mic');
        };
        
        micMediaRecorder.start(250);
        
        setTimeout(() => {
          if (micMediaRecorder.state === 'recording') {
            micMediaRecorder.stop();
          }
        }, RECORDING_DURATION);
      }

      // Start system audio recording
      if (systemStreamRef.current) {
        const systemMediaRecorder = new MediaRecorder(systemStreamRef.current, {
          mimeType: 'audio/webm;codecs=opus'
        });
        
        systemMediaRecorderRef.current = systemMediaRecorder;
        systemAudioChunksRef.current = [];
        
        systemMediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            systemAudioChunksRef.current.push(event.data);
          }
        };
        
        systemMediaRecorder.onstop = () => {
          processAudioChunks(systemAudioChunksRef.current, 'system');
        };
        
        systemMediaRecorder.start(250);
        
        setTimeout(() => {
          if (systemMediaRecorder.state === 'recording') {
            systemMediaRecorder.stop();
          }
        }, RECORDING_DURATION);
      }
      
    } catch (error) {
      console.error('Error starting recording session:', error);
      setError('Failed to start recording session');
    }
  }, [processAudioChunks]);

  const startContinuousRecording = useCallback(async () => {
    try {
      setError(null);
      
      // Get microphone stream
      try {
        const micStream = await (window as any).electronAPI.getMicrophoneStream();
        micStreamRef.current = micStream;
        console.log('Microphone stream obtained');
      } catch (error) {
        console.warn('Failed to get microphone stream:', error);
        setError('Microphone access failed - continuing with system audio only');
      }
      
      // Get system audio stream (via screen capture with audio)
      try {
        const systemStream = await navigator.mediaDevices.getDisplayMedia({
          video: false,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 44100
          } as any
        });
        systemStreamRef.current = systemStream;
        console.log('System audio stream obtained');
      } catch (error) {
        console.warn('Failed to get system audio stream:', error);
        if (!micStreamRef.current) {
          throw new Error('Failed to get both microphone and system audio');
        }
      }
      
      if (!micStreamRef.current && !systemStreamRef.current) {
        throw new Error('No audio streams available');
      }
      
      setIsRecording(true);
      console.log('Continuous audio recording started');
      
      // Start first recording session
      await startRecordingSession();
      
      // Set up interval for continuous recording
      recordingIntervalRef.current = setInterval(() => {
        if (isRecording && !isTranscribing) {
          startRecordingSession();
        }
      }, RECORDING_DURATION + 1000); // Add 1 second buffer between recordings
      
    } catch (error) {
      console.error('Error starting continuous recording:', error);
      setError('Failed to start continuous recording. Please check audio permissions.');
      setIsRecording(false);
    }
  }, [startRecordingSession, isRecording, isTranscribing]);

  const stopContinuousRecording = useCallback(() => {
    console.log('Stopping continuous audio recording');
    
    // Clear interval
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    // Stop current recordings
    if (micMediaRecorderRef.current && micMediaRecorderRef.current.state === 'recording') {
      micMediaRecorderRef.current.stop();
    }
    if (systemMediaRecorderRef.current && systemMediaRecorderRef.current.state === 'recording') {
      systemMediaRecorderRef.current.stop();
    }
    
    // Stop streams
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach(track => track.stop());
      systemStreamRef.current = null;
    }
    
    setIsRecording(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopContinuousRecording();
    };
  }, [stopContinuousRecording]);

  return {
    isRecording,
    isTranscribing,
    startContinuousRecording,
    stopContinuousRecording,
    error
  };
}; 