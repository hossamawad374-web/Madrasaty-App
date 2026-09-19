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
    onError: (error: string) => void
  ): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-tutor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ messages, context }),
        }
      );

      if (!response.ok) {
        let errMsg = `فشل الاتصال بالمعلم الذكي. (${response.status})`;
        try {
          const text = await response.text();
          const parsed = JSON.parse(text);
          if (parsed?.error) errMsg = parsed.error;
        } catch { /* silent */ }
        onError(errMsg);
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
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') { onDone(fullText); return; }
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed?.choices?.[0]?.delta?.content ?? '';
              if (delta) { fullText += delta; onChunk(delta); }
            } catch { /* malformed line */ }
          }
        }
      } else {
        // Fallback for platforms without ReadableStream
        const text = await response.text();
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed?.choices?.[0]?.delta?.content ?? '';
            if (delta) { fullText += delta; onChunk(delta); }
          } catch { /* skip */ }
        }
      }

      onDone(fullText);
    } catch (err: any) {
      console.error('[aiTutorService] streamMessage error:', err);
      onError('حدث خطأ في الاتصال. تحقق من اتصالك بالإنترنت وأعد المحاولة.');
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
  ): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      await supabase.from('ai_messages').insert({
        conversation_id: conversationId,
        user_id: userId,
        role,
        content,
      });
      // Update conversation summary
      await supabase
        .from('ai_conversations')
        .update({
          last_message: content.slice(0, 100),
          message_count: supabase.rpc ? undefined : undefined, // handled by counter below
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
    } catch { /* silent — not critical */ }
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
