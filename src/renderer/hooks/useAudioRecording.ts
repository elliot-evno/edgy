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
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const RECORDING_DURATION = 10000; // Record for 10 seconds at a time

  const processAudioChunks = useCallback(async () => {
    if (audioChunksRef.current.length === 0) return;

    try {
      setIsTranscribing(true);
      
      // Create audio blob from chunks
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
      
      if (audioBlob.size === 0) {
        setIsTranscribing(false);
        return;
      }
      
      console.log('Processing audio chunk, size:', audioBlob.size);
      
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Send to main process for transcription
      const transcription = await (window as any).electronAPI.transcribeAudio(
        arrayBuffer, 
        'audio/webm'
      );
      
      if (transcription && transcription.trim()) {
        console.log('Audio transcribed:', transcription.substring(0, 100) + '...');
        // The main process will handle adding this to memory
      }
      
      setIsTranscribing(false);
      
    } catch (error) {
      console.error('Error processing audio chunks:', error);
      setIsTranscribing(false);
      setError('Failed to transcribe audio chunk');
    }
  }, []);

  const startRecordingSession = useCallback(async () => {
    if (!streamRef.current) return;

    try {
      // Create new MediaRecorder for this session
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      // Handle data availability
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Handle recording stop
      mediaRecorder.onstop = () => {
        processAudioChunks();
      };
      
      // Start recording
      mediaRecorder.start(250); // Collect data every 250ms
      
      // Stop recording after duration
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, RECORDING_DURATION);
      
    } catch (error) {
      console.error('Error starting recording session:', error);
      setError('Failed to start recording session');
    }
  }, [processAudioChunks]);

  const startContinuousRecording = useCallback(async () => {
    try {
      setError(null);
      
      // Get microphone stream
      const stream = await (window as any).electronAPI.getMicrophoneStream();
      streamRef.current = stream;
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
      setError('Failed to start continuous recording. Please check microphone permissions.');
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
    
    // Stop current recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
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