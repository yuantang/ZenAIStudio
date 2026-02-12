
export interface MeditationScript {
  title: string;
  sections: {
    type: 'intro' | 'breathing' | 'body-scan' | 'visualization' | 'outro';
    content: string;
    // pauseSeconds specifies the duration of silence in seconds to follow this section
    pauseSeconds: number;
  }[];
}

export interface BackgroundTrack {
  id: string;
  name: string;
  url: string;
  icon: string;
}

export interface MeditationResult {
  id: string;
  theme: string;
  script: MeditationScript;
  audioBlob: Blob | null;
  createdAt: number;
  duration?: number;
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  WRITING = 'WRITING',
  VOICING = 'VOICING',
  MIXING = 'MIXING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  BATCH_PROCESSING = 'BATCH_PROCESSING'
}

export interface BatchItem {
  theme: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: MeditationResult;
}
