/*
 * Madrasaty — AI Tutor Service
 * Streams Gemini responses + manages persistent conversations in Supabase
 */

import { getSupabaseClient } from '@/template';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AIContext {
  subjectAr?: string;
  subjectEn?: string;
  lessonTitle?: string;
  mode?: AIMode;
  grade?: string;
  stage?: string;
}

export interface TutorStreamError {
  code: string;
  message: string;
}

export type AIMode =
  | 'general'
  | 'explain'
  | 'quiz'
  | 'practice'
  | 'homework'
  | 'revision'
  | 'exam'
  | 'summary'
  | 'english';

export interface Conversation {
  id: string;
  title: string;
  subject_ar: string;
  lesson_title: string;
  mode: string;
  message_count: number;
  last_message: string;
  updated_at: string;
}

// Backward compat alias
export type SubjectContext = Pick<AIContext, 'subjectAr' | 'subjectEn' | 'lessonTitle'>;

// ─── Service ──────────────────────────────────────────────────────────────────

export const aiTutorService = {

  // ── Stream a message from the AI Teacher Edge Function ────────────────────

  async streamMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    context: AIContext | null,
    onChunk: (chunk: string) => void,
    onDone: (fullText: string) => void,
    onError: (error: TutorStreamError) => void,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        onError({ code: 'UNAUTHENTICATED', message: 'سجّل الدخول أولاً لاستخدام المعلم الذكي.' });
        return;
      }
      // getUser is a server-validated check; do not trust only locally persisted session data.
      const { data: { user }, error: userError } = await supabase.auth.getUser(session.access_token);
      if (userError || !user) {
        onError({ code: 'UNAUTHENTICATED', message: 'انتهت الجلسة. سجّل الدخول مرة أخرى.' });
        return;
      }

      const functionName = process.env.EXPO_PUBLIC_AI_TUTOR_FUNCTION_NAME ?? 'ai-tutor-v2';
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${functionName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            // This is the public Supabase project key, never a service-role key.
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
          },
          body: JSON.stringify({ messages, context }),
          signal,
        }
      );

      if (!response.ok) {
        let errMsg = `فشل الاتصال بالمعلم الذكي. (${response.status})`;
        try {
          const text = await response.text();
          const parsed = JSON.parse(text);
          if (parsed?.error) errMsg = parsed.error;
        } catch { /* silent */ }
        onError({ code: response.status === 401 ? 'UNAUTHENTICATED' : 'REQUEST_FAILED', message: errMsg });
        return;
      }

      let fullText = '';

      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const payload = frame.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5).trim();
            if (!payload) continue;
            try {
              const parsed = JSON.parse(payload);
              if (parsed?.type === 'done') { onDone(fullText); return; }
              if (parsed?.type === 'error') { onError(parsed); return; }
              // Supports the V2 contract and the old OpenAI-compatible tutor during rollback.
              const delta = parsed?.text ?? parsed?.choices?.[0]?.delta?.content ?? '';
              if (delta) { fullText += delta; onChunk(delta); }
            } catch { /* malformed line */ }
          }
        }
      } else {
        // Fallback for platforms without ReadableStream
        const text = await response.text();
        for (const frame of text.split(/\r?\n\r?\n/)) {
          const payload = frame.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5).trim();
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed?.type === 'done') break;
            if (parsed?.type === 'error') { onError(parsed); return; }
            const delta = parsed?.text ?? parsed?.choices?.[0]?.delta?.content ?? '';
            if (delta) { fullText += delta; onChunk(delta); }
          } catch { /* skip */ }
        }
      }

      onDone(fullText);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('[aiTutorService] streamMessage error:', err);
      onError({ code: 'NETWORK_ERROR', message: 'حدث خطأ في الاتصال. تحقق من اتصالك بالإنترنت وأعد المحاولة.' });
    }
  },

  // ── Conversations CRUD ────────────────────────────────────────────────────

  async getConversations(userId: string): Promise<{ data: Conversation[]; error: string | null }> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('id, title, subject_ar, lesson_title, mode, message_count, last_message, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(30);
      if (error) return { data: [], error: error.message };
      return { data: (data ?? []) as Conversation[], error: null };
    } catch {
      return { data: [], error: 'فشل تحميل المحادثات.' };
    }
  },

  async createConversation(
    userId: string,
    opts: { title?: string; subjectAr?: string; lessonTitle?: string; mode?: string }
  ): Promise<{ id: string | null; error: string | null }> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: userId,
          title: opts.title ?? 'محادثة جديدة',
          subject_ar: opts.subjectAr ?? '',
          lesson_title: opts.lessonTitle ?? '',
          mode: opts.mode ?? 'general',
        })
        .select('id')
        .single();
      if (error) return { id: null, error: error.message };
      return { id: data.id, error: null };
    } catch {
      return { id: null, error: 'فشل إنشاء المحادثة.' };
    }
  },

  async deleteConversation(conversationId: string): Promise<{ error: string | null }> {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('ai_conversations')
        .delete()
        .eq('id', conversationId);
      return { error: error?.message ?? null };
    } catch {
      return { error: 'فشل حذف المحادثة.' };
    }
  },

  // ── Messages CRUD ─────────────────────────────────────────────────────────

  async getMessages(conversationId: string): Promise<{ data: ChatMessage[]; error: string | null }> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('ai_messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) return { data: [], error: error.message };
      return {
        data: (data ?? []).map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.created_at),
        })),
        error: null,
      };
    } catch {
      return { data: [], error: 'فشل تحميل الرسائل.' };
    }
  },

  async saveMessage(
    conversationId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<{ error: string | null }> {
    try {
      const supabase = getSupabaseClient();
      const { error: messageError } = await supabase.from('ai_messages').insert({
        conversation_id: conversationId,
        user_id: userId,
        role,
        content,
      });
      if (messageError) return { error: messageError.message };
      // Message count remains database-owned (trigger/RPC). Never write an undefined value.
      const { error: conversationError } = await supabase
        .from('ai_conversations')
        .update({
          last_message: content.slice(0, 100),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
      return { error: conversationError?.message ?? null };
    } catch {
      return { error: 'فشل حفظ الرسالة.' };
    }
  },

  // ── Utility ───────────────────────────────────────────────────────────────

  buildConversationTitle(context: AIContext): string {
    if (context.lessonTitle) return context.lessonTitle.slice(0, 40);
    if (context.subjectAr) return `${context.subjectAr} - ${aiTutorService.getModeLabel(context.mode ?? 'general')}`;
    return 'محادثة تعليمية';
  },

  getModeLabel(mode: AIMode | string): string {
    const labels: Record<string, string> = {
      general: 'عام',
      explain: 'شرح',
      quiz: 'اختبار',
      practice: 'تدريب',
      homework: 'واجب',
      revision: 'مراجعة',
      exam: 'تحضير امتحان',
      summary: 'تلخيص',
      english: 'إنجليزية',
    };
    return labels[mode] ?? 'عام';
  },

  getModeIcon(mode: AIMode | string): string {
    const icons: Record<string, string> = {
      general: 'chat',
      explain: 'lightbulb',
      quiz: 'quiz',
      practice: 'fitness-center',
      homework: 'assignment',
      revision: 'auto-stories',
      exam: 'school',
      summary: 'summarize',
      english: 'language',
    };
    return icons[mode] ?? 'chat';
  },
};
