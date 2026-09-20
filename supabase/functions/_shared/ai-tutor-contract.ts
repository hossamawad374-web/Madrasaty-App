export const AI_TUTOR_MODES = [
  'general', 'explain', 'quiz', 'practice', 'homework', 'revision', 'exam', 'summary', 'english',
] as const;

export type AITutorMode = typeof AI_TUTOR_MODES[number];
export type AITutorRole = 'user' | 'assistant';

export interface AITutorMessage {
  role: AITutorRole;
  content: string;
}

export interface AITutorContext {
  subjectAr?: string;
  subjectEn?: string;
  lessonTitle?: string;
  grade?: string;
  stage?: string;
  mode?: AITutorMode;
}

export interface AITutorRequest {
  messages: AITutorMessage[];
  context?: AITutorContext;
}

export type AITutorStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; usage?: { promptTokens?: number; outputTokens?: number } }
  | { type: 'error'; code: string; message: string };

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_TOTAL_LENGTH = 40_000;

const stringField = (value: unknown, maxLength = 120): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

export function parseAITutorRequest(value: unknown): AITutorRequest | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.messages) || candidate.messages.length === 0 || candidate.messages.length > MAX_MESSAGES) return null;

  const messages: AITutorMessage[] = [];
  let totalLength = 0;
  for (const message of candidate.messages) {
    if (!message || typeof message !== 'object') return null;
    const entry = message as Record<string, unknown>;
    if ((entry.role !== 'user' && entry.role !== 'assistant') || typeof entry.content !== 'string') return null;
    const content = entry.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return null;
    totalLength += content.length;
    messages.push({ role: entry.role, content });
  }
  if (totalLength > MAX_TOTAL_LENGTH || messages.at(-1)?.role !== 'user') return null;

  const rawContext = candidate.context && typeof candidate.context === 'object'
    ? candidate.context as Record<string, unknown>
    : {};
  const mode = typeof rawContext.mode === 'string' && (AI_TUTOR_MODES as readonly string[]).includes(rawContext.mode)
    ? rawContext.mode as AITutorMode
    : undefined;

  return {
    messages,
    context: {
      subjectAr: stringField(rawContext.subjectAr),
      subjectEn: stringField(rawContext.subjectEn),
      lessonTitle: stringField(rawContext.lessonTitle),
      grade: stringField(rawContext.grade, 60),
      stage: stringField(rawContext.stage, 60),
      mode,
    },
  };
}

export function encodeSSE(event: AITutorStreamEvent): Uint8Array {
  return new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
