import { useState, useRef, useCallback, useEffect } from 'react';

interface UseScreenRecordingReturn {
  startScreenRecording: () => Promise<void>;
  stopScreenRecording: () => void;
  error: string | null;
}

export const useScreenRecording = (): UseScreenRecordingReturn => {
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const RECORDING_INTERVAL = 1000; // Send chunks every second
  const BUFFER_DURATION = 5000; // Keep 5 seconds of recording

  const startScreenRecording = useCallback(async () => {
    try {
      setError(null);

      // Get screen source ID
      const sourceId = await (window as any).electronAPI.getScreenSourceId();

      // Create screen capture stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 10
          }
        } as any
      });

      streamRef.current = stream;

      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      });

      mediaRecorderRef.current = mediaRecorder;

      // Handle data available
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          // Convert blob to buffer
          const arrayBuffer = await event.data.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // Send to main process
          await (window as any).electronAPI.addScreenRecordingChunk(buffer);
        }
      };

      // Start recording
      mediaRecorder.start();

      // Request data periodically
      recordingIntervalRef.current = setInterval(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.requestData();
        }
      }, RECORDING_INTERVAL);

      console.log('[useScreenRecording] Recording started');
    } catch (error) {
      console.error('[useScreenRecording] Error starting recording:', error);
      setError('Failed to start screen recording');
      throw error;
    }
  }, []);

  const stopScreenRecording = useCallback(() => {
    // Clear interval
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    console.log('[useScreenRecording] Recording stopped');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScreenRecording();
    };
  }, [stopScreenRecording]);

  return {
    startScreenRecording,
    stopScreenRecording,
    error
  };
}; 