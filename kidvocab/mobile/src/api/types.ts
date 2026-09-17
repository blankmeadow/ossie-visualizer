export type VocabType = 'WORD' | 'PHRASE';

export type QuestionType =
  | 'FIRST_LEARN'
  | 'T1_EN_TO_ZH'
  | 'T2_ZH_TO_EN'
  | 'T3_CLOZE'
  | 'T4_SPELL'
  | 'T5_SENTENCE';

export interface Today {
  total: number;
  estimated_minutes: number;
  streak_days: number;
  completed_today: boolean;
  answered_today: number;
  has_content: boolean;
}

export interface Question {
  child_vocabulary_id: string;
  question_type: QuestionType;
  lemma: string | null;
  type: VocabType;
  meaning: string | null;
  phonetic: string | null;
  audio_url: string | null;
  prompt: Record<string, any>;
  options: string[];
  hints: string[];
  example: Occurrence | null;
}

export interface StudySession {
  session_id: string;
  total: number;
  questions: Question[];
}

export interface ReviewResult {
  correct: boolean;
  correct_answer: string;
  lemma: string;
  meaning: string;
  phonetic: string | null;
  audio_url: string | null;
  example: Occurrence | null;
  requeue: boolean;
  requeue_question: Question | null;
}

export interface Occurrence {
  sentence: string;
  surface_form: string;
  start_offset: number;
  end_offset: number;
}

export interface VocabularyRow {
  id: string;
  lemma: string;
  type: VocabType;
  meaning: string;
  phonetic: string | null;
  audio_url: string | null;
  seen_count: number;
}

export interface VocabularyPage {
  total: number;
  word_count: number;
  phrase_count: number;
  items: VocabularyRow[];
}

export interface VocabularyDetail extends VocabularyRow {
  examples: Occurrence[];
  total_occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
}

export interface Candidate {
  id: string;
  lemma: string;
  type: VocabType;
  meaning: string;
  phonetic: string | null;
  recommended: boolean;
  already_in_library: boolean;
  selected: boolean;
  occurrences: Occurrence[];
}

export interface Analysis {
  source_id: string;
  status: 'DRAFT' | 'ANALYZING' | 'READY' | 'CONFIRMED' | 'FAILED' | 'EMPTY';
  found_count: number;
  sentence_count: number;
  candidates: Candidate[];
  entitlement: Entitlement | null;
  error: string | null;
}

export interface Entitlement {
  feature_code: string;
  quota_type: string;
  unlimited: boolean;
  quota_total: number;
  quota_used: number;
  remaining: number | null;
  available: boolean;
  period_end: string | null;
}

export interface Profile {
  child_id: string;
  nickname: string | null;
  grade: number;
  daily_goal: number;
  sound_enabled: boolean;
  streak_days: number;
  days_completed_this_week: number;
  vocabulary_count: number;
  entitlements: Entitlement[];
}

export interface Paywall {
  error: 'quota_exhausted';
  feature_code: string;
  title: string;
  body: string;
  primary_cta: string;
  secondary_cta: string;
  organized_count: number;
  remaining: number;
}

export interface CompleteResult {
  completed_count: number;
  answered_count: number;
  correct_count: number;
  accuracy: number;
  duration_minutes: number;
  streak_days: number;
}
