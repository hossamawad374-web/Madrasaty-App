/*
 * Madrasaty — AI Teacher Screen (المعلم الذكي)
 * Production-ready: real Gemini streaming, modes, lesson context, conversation history
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAITutor } from '@/hooks/useAITutor';
import { useAuth } from '@/template';
import { aiTutorService, ChatMessage, AIMode, AIContext, Conversation } from '@/services/aiTutorService';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadows } from '@/constants/theme';

const { width } = Dimensions.get('window');

// ── AI Modes configuration ────────────────────────────────────────────────────

const AI_MODES: { mode: AIMode; label: string; icon: string; color: string }[] = [
  { mode: 'general',   label: 'عام',          icon: 'chat',           color: Colors.primary },
  { mode: 'explain',   label: 'شرح',          icon: 'lightbulb',      color: '#00897B' },
  { mode: 'quiz',      label: 'اختبار',        icon: 'quiz',           color: '#E53935' },
  { mode: 'practice',  label: 'تدريب',         icon: 'fitness-center', color: '#F57C00' },
  { mode: 'homework',  label: 'واجب',          icon: 'assignment',     color: '#6A1B9A' },
  { mode: 'revision',  label: 'مراجعة',        icon: 'auto-stories',   color: '#1565C0' },
  { mode: 'exam',      label: 'امتحان',        icon: 'school',         color: '#C62828' },
  { mode: 'summary',   label: 'تلخيص',         icon: 'summarize',      color: '#2E7D32' },
  { mode: 'english',   label: 'إنجليزية',      icon: 'language',       color: '#0277BD' },
];

// ── Suggested questions by mode ───────────────────────────────────────────────

const SUGGESTIONS: Record<AIMode, string[]> = {
  general:  ['اشرح لي هذا الموضوع', 'ما الفرق بين...؟', 'أعطني مثالاً', 'ما أهمية هذا الموضوع؟'],
  explain:  ['اشرح لي هذا الدرس', 'لا أفهم هذا المفهوم', 'اشرح بمثال من الحياة', 'ما الفكرة الأساسية؟'],
  quiz:     ['اختبرني بسؤال', 'أسئلة صعبة من هذا الدرس', 'اختبار شامل للوحدة', 'صحّح إجابتي'],
  practice: ['أعطني تمريناً', 'حل معي هذا التمرين', 'تمارين متدرجة الصعوبة', 'مسائل للتطبيق'],
  homework: ['ساعدني في الواجب', 'كيف أحل هذه المسألة؟', 'أعطني تلميحاً', 'فسّر لي الخطوات'],
  revision: ['لخّص النقاط المهمة', 'ما أهم ما يجب حفظه؟', 'أسئلة المراجعة', 'ذكّرني بالقواعد'],
  exam:     ['ما أكثر الأسئلة تكراراً؟', 'نصائح للامتحان', 'حل نموذج سابق', 'جدول مراجعة'],
  summary:  ['لخّص الدرس', 'أهم نقاط الوحدة', 'ملخص في نقاط', 'الأفكار الرئيسية'],
  english:  ['How do I improve my English?', 'Explain this grammar rule', 'Give me vocabulary words', 'Practice conversation'],
};

// ─────────────────────────────────────────────────────────────────────────────

export default function TutorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  // Accept lesson context from navigation params (when opened from lesson screen)
  const params = useLocalSearchParams<{
    subjectAr?: string;
    lessonTitle?: string;
    mode?: string;
  }>();

  const initialContext: AIContext | null =
    params.subjectAr
      ? {
          subjectAr: params.subjectAr,
          lessonTitle: params.lessonTitle,
          mode: (params.mode as AIMode) ?? 'explain',
        }
      : null;

  const {
    messages,
    isStreaming,
    streamingContent,
    context,
    sendMessage,
    retryLast,
    clearChat,
    updateContext,
    setMode,
    loadConversation,
  } = useAITutor(initialContext);

  const [inputText, setInputText]               = useState('');
  const [showModes, setShowModes]               = useState(false);
  const [showHistory, setShowHistory]           = useState(false);
  const [conversations, setConversations]       = useState<Conversation[]>([]);
  const [historyLoading, setHistoryLoading]     = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const currentMode = context?.mode ?? 'general';
  const modeConfig  = AI_MODES.find((m) => m.mode === currentMode) ?? AI_MODES[0];

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (messages.length > 0 || streamingContent) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages, streamingContent]);

  // Load conversation history
  const openHistory = useCallback(async () => {
    if (!user) return;
    setHistoryLoading(true);
    setShowHistory(true);
    const { data } = await aiTutorService.getConversations(user.id);
    setConversations(data);
    setHistoryLoading(false);
  }, [user]);

  const handleLoadConversation = useCallback(
    async (conv: Conversation) => {
      setShowHistory(false);
      await loadConversation(conv);
    },
    [loadConversation]
  );

  const handleDeleteConversation = useCallback(async (id: string) => {
    await aiTutorService.deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isStreaming) return;
    setInputText('');
    sendMessage(text);
  }, [inputText, isStreaming, sendMessage]);

  const handleSuggestion = useCallback(
    (q: string) => {
      if (isStreaming) return;
      sendMessage(q);
    },
    [isStreaming, sendMessage]
  );

  const handleModeSelect = useCallback(
    (mode: AIMode) => {
      setMode(mode);
      setShowModes(false);
    },
    [setMode]
  );

  const displayMessages: ChatMessage[] = streamingContent
    ? [
        ...messages,
        {
          id: 'streaming',
          role: 'assistant',
          content: streamingContent,
          timestamp: new Date(),
        },
      ]
    : messages;

  const suggestions = SUGGESTIONS[currentMode] ?? SUGGESTIONS.general;

  // Check if there's a last user message to retry
  const hasUserMessages = messages.some((m) => m.role === 'user');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[Colors.primaryDarker, Colors.primaryDark, Colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        {/* Decorative rings */}
        <View style={styles.headerRing1} />
        <View style={styles.headerRing2} />

        <View style={styles.headerRow}>
          {/* History button */}
          <TouchableOpacity
            onPress={openHistory}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="سجل المحادثات"
          >
            <MaterialIcons name="history" size={22} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>

          {/* Center: avatar + name */}
          <View style={styles.headerCenter}>
            <View style={styles.aiAvatarHeader}>
              <MaterialIcons name="psychology" size={24} color="#FFFFFF" />
              {isStreaming ? (
                <View style={styles.streamingBadge}>
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ transform: [{ scale: 0.5 }] }} />
                </View>
              ) : (
                <View style={styles.onlineBadgeDot} />
              )}
            </View>
            <View>
              <Text style={styles.headerTitle}>المعلم الذكي</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: isStreaming ? '#FFD54F' : '#69F0AE' }]} />
                <Text style={styles.statusText}>
                  {isStreaming ? 'يكتب...' : 'متاح الآن'}
                </Text>
              </View>
            </View>
          </View>

          {/* New chat */}
          <TouchableOpacity
            onPress={clearChat}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="محادثة جديدة"
          >
            <MaterialIcons name="add-comment" size={22} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>

        {/* Context pill */}
        {context?.subjectAr ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.contextPill}>
            <MaterialIcons name="menu-book" size={13} color="#FFFFFF" />
            <Text style={styles.contextPillText} numberOfLines={1}>
              {context.lessonTitle
                ? `${context.subjectAr} — ${context.lessonTitle}`
                : context.subjectAr}
            </Text>
          </Animated.View>
        ) : null}
      </LinearGradient>

      {/* ── Mode bar ── */}
      <View style={styles.modeBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modeBarContent}
        >
          {AI_MODES.map((m) => {
            const isActive = m.mode === currentMode;
            return (
              <Pressable
                key={m.mode}
                onPress={() => handleModeSelect(m.mode)}
                style={[
                  styles.modeChip,
                  isActive && { backgroundColor: m.color, borderColor: m.color },
                ]}
                accessibilityRole="button"
              >
                <MaterialIcons
                  name={m.icon as any}
                  size={14}
                  color={isActive ? '#FFFFFF' : m.color}
                />
                <Text style={[styles.modeChipText, isActive && { color: '#FFFFFF' }]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ── Messages ── */}
        <FlatList
          ref={flatListRef}
          data={displayMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.messagesList,
            { paddingBottom: insets.bottom + 16 },
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <SuggestionsBar
              suggestions={suggestions}
              onSelect={handleSuggestion}
              disabled={isStreaming}
              modeColor={modeConfig.color}
            />
          }
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isStreaming={item.id === 'streaming'}
            />
          )}
          ListFooterComponent={
            hasUserMessages && !isStreaming ? (
              <RetryButton onPress={retryLast} />
            ) : null
          }
        />

        {/* ── Input Bar ── */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="اسأل معلمك عن أي شيء..."
            placeholderTextColor={Colors.textHint}
            multiline
            maxLength={600}
            textAlign="right"
            writingDirection="rtl"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            editable={!isStreaming}
          />
          <Pressable
            onPress={handleSend}
            disabled={!inputText.trim() || isStreaming}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: modeConfig.color },
              (!inputText.trim() || isStreaming) && styles.sendBtnDisabled,
              pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel="إرسال"
          >
            {isStreaming ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <MaterialIcons name="send" size={20} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* ── Conversation History Modal ── */}
      <ConversationHistoryModal
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        conversations={conversations}
        loading={historyLoading}
        onSelect={handleLoadConversation}
        onDelete={handleDeleteConversation}
      />
    </SafeAreaView>
  );
}

// ── Suggestions Bar ───────────────────────────────────────────────────────────

function SuggestionsBar({
  suggestions,
  onSelect,
  disabled,
  modeColor,
}: {
  suggestions: string[];
  onSelect: (q: string) => void;
  disabled: boolean;
  modeColor: string;
}) {
  return (
    <View style={sugStyles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={sugStyles.scroll}
      >
        {suggestions.map((q) => (
          <TouchableOpacity
            key={q}
            onPress={() => onSelect(q)}
            disabled={disabled}
            style={[sugStyles.chip, { borderColor: modeColor + '40' }, disabled && sugStyles.disabled]}
            activeOpacity={0.7}
          >
            <Text style={[sugStyles.text, { color: modeColor }]}>{q}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const sugStyles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  scroll: { gap: Spacing.xs, paddingVertical: 4 },
  chip: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderWidth: 1,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
      android: { elevation: 1 },
    }) as object),
  },
  disabled: { opacity: 0.45 },
  text: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    includeFontPadding: false,
  },
});

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming: boolean;
}) {
  const isUser = message.role === 'user';
  const dotOpacity = useSharedValue(0.4);

  useEffect(() => {
    if (isStreaming) {
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 500 }),
          withTiming(0.4, { duration: 500 })
        ),
        -1,
        true
      );
    } else {
      dotOpacity.value = 0;
    }
  }, [isStreaming]);

  const cursorStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  const time = message.timestamp.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Animated.View
      entering={FadeInDown.duration(220).springify()}
      style={[bubbleStyles.row, isUser ? bubbleStyles.rowUser : bubbleStyles.rowAI]}
    >
      {/* AI avatar */}
      {!isUser ? (
        <View style={bubbleStyles.aiAvatar}>
          <MaterialIcons name="psychology" size={17} color={Colors.primary} />
        </View>
      ) : null}

      <View style={[bubbleStyles.maxWidth, isUser ? bubbleStyles.maxUser : bubbleStyles.maxAI]}>
        <View
          style={[
            bubbleStyles.bubble,
            isUser ? bubbleStyles.bubbleUser : bubbleStyles.bubbleAI,
            isStreaming && bubbleStyles.bubbleStreaming,
          ]}
        >
          <Text
            style={[
              bubbleStyles.text,
              isUser ? bubbleStyles.textUser : bubbleStyles.textAI,
            ]}
            selectable={!isUser}
          >
            {message.content}
          </Text>
          {isStreaming ? (
            <Animated.View style={[bubbleStyles.cursor, cursorStyle]}>
              <View style={bubbleStyles.cursorBar} />
            </Animated.View>
          ) : null}
        </View>
        <Text style={[bubbleStyles.time, isUser ? bubbleStyles.timeUser : bubbleStyles.timeAI]}>
          {time}
        </Text>
      </View>

      {/* User avatar */}
      {isUser ? (
        <View style={bubbleStyles.userAvatar}>
          <MaterialIcons name="person" size={17} color="#FFFFFF" />
        </View>
      ) : null}
    </Animated.View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  rowUser: { justifyContent: 'flex-start' },
  rowAI:   { justifyContent: 'flex-end' },
  maxWidth:   { maxWidth: width * 0.78 },
  maxUser:    { alignItems: 'flex-start' },
  maxAI:      { alignItems: 'flex-end' },
  bubble: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4 },
      android: { elevation: 2 },
    }) as object),
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    borderBottomLeftRadius: Radius.xs,
  },
  bubbleAI: {
    backgroundColor: Colors.surface,
    borderBottomRightRadius: Radius.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleStreaming: {
    borderColor: Colors.primaryLight,
    borderWidth: 1.5,
  },
  text: {
    fontSize: FontSize.base,
    lineHeight: FontSize.base * 1.75,
    includeFontPadding: false,
    writingDirection: 'rtl',
  },
  textUser: { color: '#FFFFFF', textAlign: 'right' },
  textAI:   { color: Colors.textPrimary, textAlign: 'right' },
  cursor: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  cursorBar: {
    width: 2,
    height: 16,
    backgroundColor: Colors.primary,
    borderRadius: 1,
  },
  time: {
    fontSize: FontSize.xs - 1,
    color: Colors.textHint,
    marginTop: 3,
    includeFontPadding: false,
  },
  timeUser: { textAlign: 'left' },
  timeAI:   { textAlign: 'right' },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    flexShrink: 0,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

// ── Retry Button ──────────────────────────────────────────────────────────────

function RetryButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={retryStyles.btn} activeOpacity={0.7}>
      <MaterialIcons name="refresh" size={16} color={Colors.primary} />
      <Text style={retryStyles.text}>إعادة المحاولة</Text>
    </TouchableOpacity>
  );
}

const retryStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primaryLighter,
    marginTop: Spacing.sm,
  },
  text: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
});

// ── Conversation History Modal ─────────────────────────────────────────────────

function ConversationHistoryModal({
  visible,
  onClose,
  conversations,
  loading,
  onSelect,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  conversations: Conversation[];
  loading: boolean;
  onSelect: (c: Conversation) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={histStyles.container} edges={['top']}>
        {/* Header */}
        <View style={histStyles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={histStyles.closeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={histStyles.headerTitle}>سجل المحادثات</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <View style={histStyles.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={histStyles.hint}>جارٍ التحميل...</Text>
          </View>
        ) : conversations.length === 0 ? (
          <View style={histStyles.center}>
            <MaterialIcons name="chat-bubble-outline" size={52} color={Colors.textHint} />
            <Text style={histStyles.emptyTitle}>لا توجد محادثات سابقة</Text>
            <Text style={histStyles.hint}>ستظهر محادثاتك هنا بعد بدء التحدث مع المعلم الذكي</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(c) => c.id}
            contentContainerStyle={histStyles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item)}
                style={({ pressed }) => [histStyles.item, pressed && { opacity: 0.7 }]}
              >
                <View style={histStyles.itemIcon}>
                  <MaterialIcons
                    name={aiTutorService.getModeIcon(item.mode) as any}
                    size={20}
                    color={Colors.primary}
                  />
                </View>
                <View style={histStyles.itemText}>
                  <Text style={histStyles.itemTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={histStyles.itemSub} numberOfLines={1}>
                    {item.last_message || aiTutorService.getModeLabel(item.mode)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => onDelete(item.id)}
                  style={histStyles.deleteBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="delete-outline" size={20} color={Colors.error} />
                </TouchableOpacity>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const histStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  list: { padding: Spacing.md, gap: Spacing.sm },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  hint: {
    fontSize: FontSize.sm,
    color: Colors.textHint,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
    lineHeight: FontSize.sm * 1.7,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...(Shadows.sm as object),
  },
  itemIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemText: { flex: 1, alignItems: 'flex-end' },
  itemTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  itemSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    includeFontPadding: false,
    marginTop: 2,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

// ─── Main Screen Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    overflow: 'hidden',
    gap: Spacing.sm,
  },
  headerRing1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    top: -80,
    right: -40,
  },
  headerRing2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    bottom: -50,
    left: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  aiAvatarHeader: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    position: 'relative',
  },
  streamingBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primaryDarker,
  },
  onlineBadgeDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#69F0AE',
    borderWidth: 2,
    borderColor: Colors.primaryDarker,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.8)',
    includeFontPadding: false,
  },
  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    maxWidth: width - Spacing.xl * 2,
  },
  contextPillText: {
    fontSize: FontSize.xs,
    color: '#FFFFFF',
    fontWeight: FontWeight.medium,
    includeFontPadding: false,
  },

  // Mode bar
  modeBarWrapper: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    minHeight: 48,
  },
  modeBarContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    alignItems: 'center',
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  modeChipText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    includeFontPadding: false,
  },

  // Messages
  messagesList: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: 0,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
    ...(Platform.select({
      ios: { shadowColor: '#3F51B5', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.06, shadowRadius: 10 },
      android: { elevation: 6 },
    }) as object),
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    includeFontPadding: false,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.select({
      ios: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 4 },
    }) as object),
  },
  sendBtnDisabled: {
    backgroundColor: Colors.textHint + '!important',
    opacity: 0.55,
  },
});
