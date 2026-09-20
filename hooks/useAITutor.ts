/*
 * Madrasaty — useAITutor Hook
 * Manages AI Teacher chat state with streaming + optional persistence
 */

import { useState, useCallback, useRef } from 'react';
import { aiTutorService, ChatMessage, AIContext, AIMode } from '@/services/aiTutorService';
import { useAuth } from '@/template';

let msgCounter = 0;
const nextId = () => `msg_${Date.now()}_${msgCounter++}`;

function buildWelcome(context: AIContext | null): ChatMessage {
  let body = 'مرحباً! أنا معلمك الذكي في مدرستي 👋\n\nأنا هنا لمساعدتك في الفهم والمراجعة والتدريب.\n\nاسألني عن أي درس أو مفهوم وسأشرح لك خطوة بخطوة! 📚✨';
  if (context?.lessonTitle) {
    body = `مرحباً! أنا معلمك الذكي 👋\n\nأرى أنك تدرس درس "${context.lessonTitle}"${context.subjectAr ? ` في مادة ${context.subjectAr}` : ''}.\n\nيمكنني شرح الدرس، اختبارك، أو مساعدتك في أي سؤال. بماذا تريد أن تبدأ؟ 📚`;
  } else if (context?.subjectAr) {
    body = `مرحباً! أنا معلمك الذكي في مادة ${context.subjectAr} 👋\n\nاسألني عن أي موضوع في هذه المادة وسأشرح لك بأسلوب مبسّط! 📚✨`;
  }
  return {
    id: 'welcome',
    role: 'assistant',
    content: body,
    timestamp: new Date(),
  };
}

export function useAITutor(initialContext: AIContext | null = null) {
  const { user } = useAuth();
  const [context, setContext] = useState<AIContext | null>(initialContext);
  const [messages, setMessages] = useState<ChatMessage[]>([buildWelcome(initialContext)]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Update welcome message when context changes
  const updateContext = useCallback((newContext: AIContext | null) => {
    setContext(newContext);
    setMessages([buildWelcome(newContext)]);
    setStreamingContent('');
    setIsStreaming(false);
    setConversationId(null);
    abortRef.current?.abort();
  }, []);

  const setMode = useCallback((mode: AIMode) => {
    setContext((prev) => ({ ...(prev ?? {}), mode }));
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingContent('');
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      // Ensure conversation exists in DB (if authenticated)
      let convId = conversationId;
      if (user && !convId) {
        const { id } = await aiTutorService.createConversation(user.id, {
          title: aiTutorService.buildConversationTitle(context ?? {}),
          subjectAr: context?.subjectAr,
          lessonTitle: context?.lessonTitle,
          mode: context?.mode ?? 'general',
        });
        if (id) {
          setConversationId(id);
          convId = id;
        }
      }

      // Persist user message
      if (user && convId) {
        aiTutorService.saveMessage(convId, user.id, 'user', text.trim());
      }

      // Build history for API (exclude welcome, keep last 16)
      const history = [...messages.filter((m) => m.id !== 'welcome'), userMsg]
        .slice(-16)
        .map(({ role, content }) => ({ role, content }));

      let accumulated = '';

      await aiTutorService.streamMessage(
        history,
        context,
        (chunk) => {
          if (controller.signal.aborted) return;
          accumulated += chunk;
          setStreamingContent(accumulated);
        },
        (fullText) => {
          if (controller.signal.aborted) return;
          const aiMsg: ChatMessage = {
            id: nextId(),
            role: 'assistant',
            content: fullText || accumulated,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, aiMsg]);
          setStreamingContent('');
          setIsStreaming(false);
          // Persist AI response
          if (user && convId) {
            aiTutorService.saveMessage(convId, user.id, 'assistant', aiMsg.content);
          }
        },
        (error) => {
          if (controller.signal.aborted) return;
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'assistant',
              content: `⚠️ ${error.message}\n\nاضغط على إعادة المحاولة أو اسأل سؤالاً آخر.`,
              timestamp: new Date(),
            },
          ]);
          setStreamingContent('');
          setIsStreaming(false);
        },
        controller.signal
      );
    },
    [messages, isStreaming, context, conversationId, user]
  );

  const retryLast = useCallback(() => {
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length === 0) return;
    const lastUser = userMessages[userMessages.length - 1];
    // Remove last AI error message
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === lastUser.id);
      return prev.slice(0, idx);
    });
    sendMessage(lastUser.content);
  }, [messages, sendMessage]);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([buildWelcome(context)]);
    setStreamingContent('');
    setIsStreaming(false);
    setConversationId(null);
  }, [context]);

  const loadConversation = useCallback(async (conv: import('@/services/aiTutorService').Conversation) => {
    setConversationId(conv.id);
    setContext({
      subjectAr: conv.subject_ar || undefined,
      lessonTitle: conv.lesson_title || undefined,
      mode: (conv.mode as AIMode) || 'general',
    });
    const { data } = await aiTutorService.getMessages(conv.id);
    if (data.length > 0) {
      setMessages(data);
    }
  }, []);

  return {
    messages,
    isStreaming,
    streamingContent,
    context,
    conversationId,
    sendMessage,
    retryLast,
    clearChat,
    updateContext,
    setMode,
    loadConversation,
  };
}
