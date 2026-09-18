/**
 * Thin API client.
 *
 * Two things it owns beyond fetch: the anonymous child id (section 32 -- no
 * sign-up wall, the device just holds an id from its first import) and the
 * paywall, which is surfaced as a typed error rather than a generic failure so
 * callers can show the upgrade sheet instead of an error toast.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type {
  Analysis,
  CompleteResult,
  Entitlement,
  Paywall,
  Profile,
  Question,
  ReviewResult,
  StudySession,
  Today,
  VocabularyDetail,
  VocabularyPage,
} from './types';

const CHILD_KEY = 'kidvocab.childId';

/**
 * Where the API lives.
 *
 * On a phone or an iPad, `127.0.0.1` is the device itself, so a hard-coded
 * localhost would always fail. The dev server already knows the right answer:
 * Expo puts the address that served the bundle into the manifest, and the API
 * runs on the same machine. Deriving the host from there means a parent can
 * scan the QR code and have it work without editing a file.
 *
 * Precedence, most explicit first:
 *   1. EXPO_PUBLIC_API_URL            -- a real deployment
 *   2. app.json -> extra.apiBaseUrl   -- a pinned address
 *   3. the machine that served the bundle, on extra.apiPort
 *   4. localhost                      -- web and simulator
 */
function resolveApiBaseUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string; apiPort?: number };
  const port = extra.apiPort ?? 8000;

  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const pinned = extra.apiBaseUrl?.trim();
  if (pinned) return pinned.replace(/\/$/, '');

  // Web runs in the same browser as the dev server, so localhost is correct.
  if (Platform.OS !== 'web') {
    // hostUri looks like "192.168.1.10:8081"; debuggerHost is the older field
    // still present in some Expo Go versions.
    const hostUri =
      Constants.expoConfig?.hostUri ??
      (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;
    const host = hostUri?.split('://').pop()?.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:${port}`;
    }
  }

  return `http://127.0.0.1:${port}`;
}

export const API_BASE_URL: string = resolveApiBaseUrl();

export class PaywallError extends Error {
  constructor(public readonly paywall: Paywall) {
    super(paywall.title);
    this.name = 'PaywallError';
  }
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

let childId: string | null = null;

export async function getChildId(): Promise<string | null> {
  if (childId) return childId;
  childId = await AsyncStorage.getItem(CHILD_KEY);
  return childId;
}

export async function setChildId(id: string): Promise<void> {
  childId = id;
  await AsyncStorage.setItem(CHILD_KEY, id);
}

/** Creates the anonymous child on first launch, then reuses it. */
export async function ensureChild(): Promise<string> {
  const existing = await getChildId();
  if (existing) return existing;
  const created = await request<{ child_id: string }>('POST', '/auth/anonymous', {}, false);
  await setChildId(created.child_id);
  return created.child_id;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  withChild = true,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withChild) {
    const id = await getChildId();
    if (id) headers['X-Child-Id'] = id;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = payload?.detail;
    if (response.status === 402 && detail?.error === 'quota_exhausted') {
      throw new PaywallError(detail as Paywall);
    }
    throw new ApiError(
      typeof detail === 'string' ? detail : detail?.title ?? '请求失败',
      response.status,
    );
  }
  return payload as T;
}

export const api = {
  // --- today ---------------------------------------------------------------
  today: () => request<Today>('GET', '/today'),
  session: () => request<StudySession>('GET', '/today/session'),
  review: (input: {
    child_vocabulary_id: string;
    question_type: string;
    answer?: string;
    hint_count?: number;
    response_time_ms?: number;
    question_payload?: Record<string, unknown>;
  }) => request<ReviewResult>('POST', '/reviews', input),
  complete: () => request<CompleteResult>('POST', '/today/complete'),

  // --- library -------------------------------------------------------------
  vocabulary: (params: { type?: string; q?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.type) search.set('type', params.type);
    if (params.q) search.set('q', params.q);
    const qs = search.toString();
    return request<VocabularyPage>('GET', `/vocabulary${qs ? `?${qs}` : ''}`);
  },
  vocabularyDetail: (id: string) => request<VocabularyDetail>('GET', `/vocabulary/${id}`),
  lookup: (text: string) =>
    request<{ lemma: string; type: string; meaning: string; phonetic: string | null }>(
      'GET',
      `/vocabulary/lookup?text=${encodeURIComponent(text)}`,
    ),
  manualAdd: (input: { text: string; meaning?: string | null; example?: string | null }) =>
    request<{
      id: string;
      lemma: string;
      type: string;
      meaning: string;
      phonetic: string | null;
      created: boolean;
      vocabulary_count: number;
    }>('POST', '/vocabulary/manual', input),

  // --- import --------------------------------------------------------------
  createSource: (sourceType: 'PHOTO' | 'ALBUM' | 'MANUAL') =>
    request<{ id: string; title: string }>('POST', '/sources', { source_type: sourceType }),

  uploadImages: async (sourceId: string, uris: string[]) => {
    const form = new FormData();
    uris.forEach((uri, index) => {
      const name = uri.split('/').pop() || `page-${index + 1}.jpg`;
      const ext = name.split('.').pop()?.toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'txt' ? 'text/plain' : 'image/jpeg';
      // React Native's FormData takes this shape for files.
      form.append('files', { uri, name, type: mime } as unknown as Blob);
    });

    const id = await getChildId();
    const response = await fetch(`${API_BASE_URL}/sources/${sourceId}/images`, {
      method: 'POST',
      headers: id ? { 'X-Child-Id': id } : undefined,
      body: form,
    });
    if (!response.ok) throw new ApiError('图片上传失败', response.status);
    return response.json();
  },

  analyze: (sourceId: string) =>
    request<Analysis>('POST', `/sources/${sourceId}/analyze`, {}),
  analysis: (sourceId: string) => request<Analysis>('GET', `/sources/${sourceId}/analysis`),
  confirm: (sourceId: string, candidateIds: string[] | null, extraItems: string[] = []) =>
    request<{
      added_count: number;
      merged_count: number;
      vocabulary_count: number;
      today_total: number;
    }>('POST', `/sources/${sourceId}/confirm`, {
      candidate_ids: candidateIds,
      extra_items: extraItems,
    }),

  // --- profile -------------------------------------------------------------
  profile: () => request<Profile>('GET', '/profile'),
  updateProfile: (input: Partial<Pick<Profile, 'nickname' | 'grade' | 'daily_goal' | 'sound_enabled'>>) =>
    request<Profile>('PUT', '/profile', input),
  entitlements: () => request<{ items: Entitlement[] }>('GET', '/entitlements'),

  // --- analytics (section 24A.8) ------------------------------------------
  track: (name: string, payload: Record<string, unknown> = {}) =>
    request<void>('POST', '/events', { name, payload }).catch(() => undefined),
};

export type { Question };
