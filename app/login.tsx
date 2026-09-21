/*
 * Madrasaty — Authentication Screen (Login + Register)
 * RTL Arabic, OTP-verified registration, secure error handling
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, useAlert } from '@/template';
import { useRouter as useRouterInner } from 'expo-router';
import { userService } from '@/services/userService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

const { width } = Dimensions.get('window');

// ─── Auth error messages (Arabic) ────────────────────────────────────────────
function mapAuthError(error: string): string {
  const e = (error || '').toLowerCase();

  if (e.includes('invalid login credentials') || e.includes('invalid credentials'))
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (e.includes('email not confirmed'))
    return 'يرجى تأكيد بريدك الإلكتروني أولاً. تحقق من صندوق الوارد.';
  if (e.includes('already registered') || e.includes('user already registered'))
    return 'هذا البريد الإلكتروني مسجّل مسبقاً. جرّب تسجيل الدخول.';
  if (e.includes('weak password') || e.includes('password should be'))
    return 'كلمة المرور ضعيفة. يجب أن تكون 6 أحرف على الأقل.';
  if (e.includes('rate limit') || e.includes('too many'))
    return 'تم تجاوز حد المحاولات. انتظر قليلاً ثم حاول مرة أخرى.';
  if (e.includes('email signups are disabled') || e.includes('signups not allowed'))
    return 'تسجيل الحسابات بالبريد الإلكتروني غير مفعّل في إعدادات المصادقة.';
  if (e.includes('email provider') || e.includes('smtp'))
    return 'خدمة إرسال البريد الإلكتروني غير مهيأة في Supabase لهذا المشروع.';
  if (e.includes('not authorized') || e.includes('not allowed'))
    return 'عنوان البريد الإلكتروني غير مسموح له باستلام رسائل المصادقة من المشروع.';
  if (e.includes('redirect url') || e.includes('redirect_to'))
    return 'إعدادات رابط العودة للمصادقة في Supabase غير صحيحة.';
  if (e.includes('network') || e.includes('fetch'))
    return 'تعذر الاتصال بخدمة المصادقة. تحقق من الإنترنت ثم حاول مرة أخرى.';
  if (e.includes('otp') || e.includes('token'))
    return 'رمز أو رابط التحقق غير صحيح أو منتهي الصلاحية.';

  return 'تعذر تنفيذ عملية المصادقة: ' + error;
}

// ─── Register Steps ───────────────────────────────────────────────────────────
type RegisterStep = 'form' | 'confirmation' | 'success';

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // Redirect to home as soon as the auth state resolves to a logged-in user
  useEffect(() => {
    if (!loading && user) {
      router.replace('/(tabs)');
    }
  }, [user, loading]);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const switchTab = (tab: 'login' | 'register') => {
    setActiveTab(tab);
    Animated.spring(slideAnim, {
      toValue: tab === 'login' ? 0 : 1,
      tension: 80,
      friction: 10,
      useNativeDriver: false,
    }).start();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* Header gradient */}
        <LinearGradient
          colors={[Colors.primaryDarker, Colors.primaryDark, Colors.primary]}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={[styles.headerInner, { paddingTop: insets.top + Spacing.md }]}>
            <View style={styles.logoSmallWrapper}>
              <Image
                source={require('@/assets/images/splash-logo.png')}
                style={styles.logoSmall}
                contentFit="contain"
                transition={200}
              />
            </View>
            <Text style={styles.headerTitle}>مدرستي</Text>
            <Text style={styles.headerSubtitle}>منصة التعلم الذكي</Text>
          </View>

          {/* Tab Switcher */}
          <View style={styles.tabContainer}>
            <Animated.View
              style={[
                styles.tabIndicator,
                {
                  left: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['2%', '50%'],
                  }),
                },
              ]}
            />
            <TouchableOpacity
              style={styles.tab}
              onPress={() => switchTab('login')}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'login' }}
            >
              <Text style={[styles.tabText, activeTab === 'login' && styles.tabTextActive]}>
                تسجيل الدخول
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tab}
              onPress={() => switchTab('register')}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'register' }}
            >
              <Text style={[styles.tabText, activeTab === 'register' && styles.tabTextActive]}>
                إنشاء حساب
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Form area */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'login' ? (
            <LoginForm />
          ) : (
            <RegisterForm onLoginSwitch={() => switchTab('login')} />
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Login Form ───────────────────────────────────────────────────────────────

function LoginForm() {
  const { signInWithPassword, operationLoading } = useAuth();
  const { showAlert } = useAlert();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const validate = () => {
    let valid = true;
    setEmailError('');
    setPasswordError('');
    if (!email.trim() || !email.includes('@')) {
      setEmailError('أدخل بريداً إلكترونياً صحيحاً');
      valid = false;
    }
    if (password.length < 6) {
      setPasswordError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      valid = false;
    }
    return valid;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    const { error, user } = await signInWithPassword(email.trim(), password);
    if (error) {
      const msg = mapAuthError(error);
      showAlert('خطأ في تسجيل الدخول', msg, [{ text: 'حسناً', style: 'default' }]);
      return;
    }
    // Navigation is handled by the useEffect in LoginScreen that watches `user`
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setEmailError('أدخل بريدك الإلكتروني أولاً لإرسال رابط إعادة التعيين');
      return;
    }
    setResetLoading(true);
    try {
      const { getSupabaseClient } = await import('@/template');
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: 'onspaceapp://auth',
      });
      if (error) {
        showAlert('خطأ', mapAuthError(error.message), [{ text: 'حسناً' }]);
      } else {
        setResetSent(true);
        showAlert(
          'تم الإرسال ✓',
          `تم إرسال رابط إعادة تعيين كلمة المرور إلى ${trimmedEmail}. تحقق من صندوق الوارد.`,
          [{ text: 'حسناً' }]
        );
      }
    } catch {
      showAlert('خطأ', 'فشل إرسال البريد. حاول مجدداً.', [{ text: 'حسناً' }]);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>مرحباً بعودتك 👋</Text>
      <Text style={styles.formSubtitle}>سجّل دخولك للمتابعة في رحلة التعلم</Text>

      <Input
        label="البريد الإلكتروني"
        value={email}
        onChangeText={setEmail}
        placeholder="example@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        leftIcon="email"
        error={emailError}
        textContentType="emailAddress"
      />

      <Input
        label="كلمة المرور"
        value={password}
        onChangeText={setPassword}
        placeholder="أدخل كلمة المرور"
        isPassword
        leftIcon="lock"
        error={passwordError}
        textContentType="password"
        onSubmitEditing={handleLogin}
        returnKeyType="done"
      />

      <Button
        label="تسجيل الدخول"
        onPress={handleLogin}
        loading={operationLoading}
        size="lg"
        style={styles.submitBtn}
      />

      {/* Forgot Password */}
      <TouchableOpacity
        onPress={handleForgotPassword}
        disabled={resetLoading}
        style={styles.forgotBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {resetLoading ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Text style={[styles.forgotText, resetSent && { color: Colors.success }]}>
            {resetSent ? '✓ تم إرسال رابط إعادة التعيين' : 'نسيت كلمة المرور؟'}
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.securityNote}>
        <MaterialIcons name="security" size={14} color={Colors.textMuted} />
        <Text style={styles.securityText}>
          اتصال آمن ومشفّر بالكامل
        </Text>
      </View>
    </View>
  );
}

// ─── Register Form (3-step) ───────────────────────────────────────────────────

function RegisterForm({ onLoginSwitch }: { onLoginSwitch: () => void }) {
  const { signUpWithPassword, operationLoading } = useAuth();
  const { showAlert } = useAlert();
  const router = useRouterInner();

  const [step, setStep] = useState<RegisterStep>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateStep = (callback: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      callback();
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  const validateForm = () => {
    let valid = true;
    setEmailError('');
    setPasswordError('');
    setConfirmError('');
    if (!email.trim() || !email.includes('@')) {
      setEmailError('أدخل بريداً إلكترونياً صحيحاً');
      valid = false;
    }
    if (password.length < 6) {
      setPasswordError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      valid = false;
    }
    if (password !== confirmPassword) {
      setConfirmError('كلمتا المرور غير متطابقتين');
      valid = false;
    }
    if (!privacyAccepted) {
      showAlert('الموافقة مطلوبة', 'يرجى الموافقة على سياسة الخصوصية وشروط الاستخدام للمتابعة.', [{ text: 'حسناً' }]);
      valid = false;
    }
    return valid;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    const { error, user, needsEmailConfirmation } = await signUpWithPassword(
      email.trim(),
      password,
    );

    if (error) {
      showAlert('خطأ في إنشاء الحساب', mapAuthError(error), [{ text: 'حسناً' }]);
      return;
    }

    // With email confirmation enabled, Supabase returns the new user without a session.
    // The password is already stored securely by Supabase; the email step only confirms ownership.
    if (needsEmailConfirmation) {
      animateStep(() => setStep('confirmation'));
      return;
    }

    // If email confirmation is disabled, the session is already active.
    if (user) {
      await userService.initializeAfterRegistration(user.id);
    }

    animateStep(() => setStep('success'));
  };

  return (
    <Animated.View style={[styles.form, { opacity: fadeAnim }]}>
      {/* Step indicator */}
      <View style={styles.stepIndicator}>
        {(['form', 'otp', 'success'] as RegisterStep[]).map((s, i) => (
          <View key={s} style={styles.stepRow}>
            <View style={[styles.stepDot, step === s && styles.stepDotActive,
              (step === 'otp' && i === 0) || (step === 'success' && i < 2)
                ? styles.stepDotDone : null]}>
              {((step === 'otp' && i === 0) || (step === 'success' && i < 2)) ? (
                <MaterialIcons name="check" size={12} color={Colors.textOnPrimary} />
              ) : (
                <Text style={styles.stepDotText}>{i + 1}</Text>
              )}
            </View>
            {i < 2 && <View style={[styles.stepLine, i < (['form', 'otp', 'success'].indexOf(step))
              ? styles.stepLineDone : null]} />}
          </View>
        ))}
      </View>

      {/* ── Step 1: Form ── */}
      {step === 'form' && (
        <>
          <Text style={styles.formTitle}>انضم إلى مدرستي 🎓</Text>
          <Text style={styles.formSubtitle}>أنشئ حسابك وابدأ رحلة التعلم اليوم</Text>

          <Input
            label="البريد الإلكتروني"
            value={email}
            onChangeText={setEmail}
            placeholder="example@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            leftIcon="email"
            error={emailError}
            textContentType="emailAddress"
          />

          <Input
            label="كلمة المرور"
            value={password}
            onChangeText={setPassword}
            placeholder="6 أحرف على الأقل"
            isPassword
            leftIcon="lock"
            error={passwordError}
            hint="يجب أن تكون كلمة المرور 6 أحرف على الأقل"
            textContentType="newPassword"
          />

          <Input
            label="تأكيد كلمة المرور"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="أعد كتابة كلمة المرور"
            isPassword
            leftIcon="lock-outline"
            error={confirmError}
            textContentType="newPassword"
            onSubmitEditing={handleRegister}
            returnKeyType="done"
          />

          {/* Privacy Policy Checkbox */}
          <Pressable
            style={styles.privacyRow}
            onPress={() => setPrivacyAccepted((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: privacyAccepted }}
          >
            <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
              {privacyAccepted ? (
                <MaterialIcons name="check" size={14} color="#FFFFFF" />
              ) : null}
            </View>
            <View style={styles.privacyTextRow}>
              <Text style={styles.privacyText}>أوافق على </Text>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/privacy', params: { returnAccept: 'true' } })}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text style={styles.privacyLink}>سياسة الخصوصية وشروط الاستخدام</Text>
              </TouchableOpacity>
            </View>
          </Pressable>

          <Button
            label="إنشاء الحساب وإرسال رسالة التفعيل"
            onPress={handleRegister}
            loading={operationLoading}
            disabled={!privacyAccepted}
            size="lg"
            style={[styles.submitBtn, !privacyAccepted && { opacity: 0.5 }]}
          />
        </>
      )}

      {/* ── Step 2: Email Confirmation ── */}
      {step === 'confirmation' && (
        <>
          <View style={styles.otpIconWrapper}>
            <MaterialIcons name="mark-email-read" size={56} color={Colors.primary} />
          </View>
          <Text style={styles.formTitle}>تأكيد البريد الإلكتروني</Text>
          <Text style={styles.otpDesc}>
            أرسلنا رسالة تفعيل إلى{'
'}
            <Text style={styles.otpEmail}>{email}</Text>
          </Text>

          <Text style={styles.confirmationText}>
            افتح رسالة التفعيل واضغط على رابط تأكيد البريد الإلكتروني. بعد تأكيد بريدك،
            ارجع إلى التطبيق وسجّل الدخول باستخدام بريدك الإلكتروني وكلمة المرور التي أنشأتهما.
          </Text>

          <Button
            label="العودة إلى تسجيل الدخول"
            onPress={onLoginSwitch}
            size="lg"
            style={styles.submitBtn}
          />

          <TouchableOpacity
            onPress={() => animateStep(() => setStep('form'))}
            style={styles.backBtn}
          >
            <MaterialIcons name="arrow-forward" size={16} color={Colors.primary} />
            <Text style={styles.backText}>تغيير البريد الإلكتروني</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Step 3: Success ── */}
      {step === 'success' && (
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <MaterialIcons name="check-circle" size={80} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>مرحباً بك في مدرستي! 🎉</Text>
          <Text style={styles.successText}>
            تم إنشاء حسابك بنجاح. أنت الآن جزء من مجتمع التعلم الذكي.
          </Text>
          <View style={styles.successBadge}>
            <Text style={styles.successBadgeText}>⭐ طالب جديد</Text>
          </View>
          <Text style={styles.successNote}>جارٍ توجيهك إلى لوحة التحكم...</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    paddingBottom: 0,
  },
  headerInner: {
    alignItems: 'center',
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  logoSmallWrapper: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  logoSmall: { width: 54, height: 54 },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: '#FFFFFF',
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
    marginTop: 2,
  },

  // Tab switcher
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    margin: Spacing.md,
    marginTop: Spacing.lg,
    borderRadius: Radius.lg,
    padding: 3,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    zIndex: 1,
  },
  tabText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: 'rgba(255,255,255,0.75)',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },

  // Scroll
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xxl,
  },

  // Form
  form: {
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  formTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
    includeFontPadding: false,
    marginBottom: Spacing.xs,
  },
  formSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    includeFontPadding: false,
    marginBottom: Spacing.lg,
    lineHeight: FontSize.md * 1.6,
  },
  submitBtn: {
    marginTop: Spacing.sm,
  },

  // Forgot password
  forgotBtn: {
    alignSelf: 'center',
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    includeFontPadding: false,
    textAlign: 'center',
    writingDirection: 'rtl',
    textDecorationLine: 'underline',
  },
  // Security note
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  securityText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },

  // Terms
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  termsText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
    lineHeight: FontSize.xs * 1.7,
    flex: 1,
  },

  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
  },
  stepDotDone: {
    backgroundColor: Colors.success,
  },
  stepDotText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  stepLine: {
    width: 48,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  stepLineDone: {
    backgroundColor: Colors.success,
  },

  // OTP step
  otpIconWrapper: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  otpDesc: {
    fontSize: FontSize.base,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
    marginBottom: Spacing.lg,
    lineHeight: FontSize.base * 1.7,
  },
  otpEmail: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
  },
  confirmationText: {
    fontSize: FontSize.base,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
    lineHeight: FontSize.base * 1.8,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  backText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    writingDirection: 'rtl',
    includeFontPadding: false,
  },

  // Success step
  successContainer: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
  },
  successIcon: {
    marginBottom: Spacing.lg,
  },
  successTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
    marginBottom: Spacing.md,
  },
  successText: {
    fontSize: FontSize.base,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
    lineHeight: FontSize.base * 1.7,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  successBadge: {
    backgroundColor: Colors.xpGoldLight,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.xpGold,
    marginBottom: Spacing.md,
  },
  successBadgeText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.xpGoldDark,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  successNote: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },

  // Privacy checkbox
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  privacyTextRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  privacyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  privacyLink: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
    textDecorationLine: 'underline',
    writingDirection: 'rtl',
  },
});
