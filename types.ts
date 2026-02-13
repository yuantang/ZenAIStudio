
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type MoodState = 'anxious' | 'sad' | 'restless' | 'tired' | 'neutral';
export type MeditationStyle = 'mindfulness' | 'zen' | 'yoga-nidra' | 'compassion';
export type AmbientHint = 'forest' | 'rain' | 'ocean' | 'fire' | 'space' | 'silence';

export interface MeditationPersonalization {
  experience: ExperienceLevel;
  mood: MoodState;
  style: MeditationStyle;
}

export interface MeditationScript {
  title: string;
  sections: {
    type: 'intro' | 'breathing' | 'body-scan' | 'visualization' | 'silence' | 'outro';
    content: string;
    pauseSeconds: number;
    /** AI 建议的该段理想声境 */
    ambientHint?: AmbientHint;
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

export interface CourseDay {
  day: number;
  title: string;
  theme: string;
  durationMinutes: number;
  description: string;
}

export interface MeditationCourse {
  id: string;
  title: string;
  description: string;
  icon: string;
  days: CourseDay[];
}
