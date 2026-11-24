import { zodResolver } from '@hookform/resolvers/zod';
import { authCapabilitySchema, authResultSchema } from '@campusflow/contracts';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, json } from '@/lib/api';
import { useSessionStore } from '@/store/session';
import { Button, Field, colors, design, typography } from '@/components/ui';
import { authFormSchema, type AuthFormValues } from '@/features/auth-form';
import { publishedLink } from '../config/published-links.cjs';

export default function Auth() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const wide = useWindowDimensions().width >= 980;
  const router = useRouter(), navigation = useNavigation();
  const termsUrl = publishedLink(process.env.EXPO_PUBLIC_TERMS_URL), privacyUrl = publishedLink(process.env.EXPO_PUBLIC_PRIVACY_URL);
  const [registering, setRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordInput = useRef<TextInput>(null);
  const [message, setMessage] = useState<string>();
  const [capability, setCapability] = useState<'preview' | 'verified' | 'closed' | 'loading' | 'error'>('loading');
  const [capabilityRetry, setCapabilityRetry] = useState(0), [verification, setVerification] = useState<{ codeRequested: boolean } | null>(null);
  const [pending, setPending] = useState(false), mounted = useRef(false), revision = useRef(0), busy = useRef(false), request = useRef<AbortController | null>(null);
  const { session, setSession, accountDeleted, sessionUnavailable, cleanupError, retryCleanup } = useSessionStore();
  // Opt-in only: a plain dev build or test run keeps real sign-in.
  const previewOnly = __DEV__ && process.env.EXPO_PUBLIC_LOCAL_PREVIEW === '1';
  const { control, handleSubmit, clearErrors, setValue, reset, formState: { errors } } = useForm<AuthFormValues>({
    resolver: zodResolver(authFormSchema(registering)),
    defaultValues: { email: '', displayName: '', password: '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
  });
  const openPolicy = (url: string, failure: string) => { void Linking.openURL(url).catch(() => { if (mounted.current) setMessage(failure); }); };
  const isCurrent = (epoch: number) => mounted.current && epoch === revision.current && !useSessionStore.getState().session;
  useEffect(() => {
    mounted.current = true; ++revision.current; busy.current = false; setPending(false); setVerification(null); setValue('password', '');
    return () => { mounted.current = false; ++revision.current; request.current?.abort(); };
  }, [session?.accessToken, setValue]);
  useEffect(() => {
    if (previewOnly) return;
    let active = true;
    const controller = new AbortController(), epoch = revision.current; setCapability('loading');
    const deadline = setTimeout(() => controller.abort(), 15_000);
    void api('/auth/capability', { cache: 'no-store', signal: controller.signal }).then(value => {
      if (active && isCurrent(epoch)) setCapability(authCapabilitySchema.parse(value).registration);
    }).catch(() => { if (active && isCurrent(epoch)) setCapability('error'); }).finally(() => clearTimeout(deadline));
    return () => { active = false; clearTimeout(deadline); controller.abort(); };
  }, [capabilityRetry, session?.accessToken, previewOnly]);
  useEffect(() => navigation.addListener('beforeRemove', event => {
    if (busy.current && !useSessionStore.getState().session) event.preventDefault();
  }), [navigation]);
  const submit = async (values: AuthFormValues) => {
    if (busy.current || useSessionStore.getState().session || registering && !['preview', 'verified'].includes(capability)) return;
    const epoch = revision.current, controller = new AbortController(); request.current = controller; busy.current = true; setPending(true);
    const deadline = setTimeout(() => controller.abort(), 15_000);
    try {
      setMessage(undefined);
      const result = authResultSchema.parse(await api(registering ? '/auth/register' : '/auth/login', {
        ...json('POST', registering ? values : { email: values.email, password: values.password }), cache: 'no-store', signal: controller.signal,
      }));
      if (!isCurrent(epoch)) return;
      if ('verificationRequired' in result) { setValue('password', ''); clearErrors(); setVerification({ codeRequested: result.codeRequested }); }
      else await setSession(result);
    } catch (error) {
      if (isCurrent(epoch)) setMessage(error instanceof ApiError ? error.message : registering
        ? 'Couldn’t confirm the account request. Try signing in before creating it again.' : 'Couldn’t confirm sign-in. Check your connection and retry.');
    } finally { clearTimeout(deadline); if (isCurrent(epoch)) { busy.current = false; setPending(false); request.current = null; } }
  };
  function openVerification() {
    if (busy.current) return; ++revision.current; reset(); setValue('password', '');
    router.replace(next === 'account' ? '/verify?next=account' : '/verify');
  }
  if (previewOnly) return <SafeAreaView style={styles.safe}>
    <View style={[styles.layout, wide && styles.layoutWide]}>
      {wide && <AuthStory/>}
      <ScrollView contentContainerStyle={[styles.previewPage, wide && styles.pageWide]}>
      {!wide && <Brand/>}
      <View style={styles.previewCard}>
        <Text style={styles.title}>Make room for your day.</Text>
        <Text style={styles.previewBadge}>Local preview</Text>
        <Text style={styles.body}>Your classes, tasks, and little everyday wins. Together in one thoughtful space.</Text>
        <View style={styles.previewFeatures}>
          {([['today-outline', 'A daily plan that makes sense'], ['checkmark-circle-outline', 'Less juggling. More doing.'], ['leaf-outline', 'Space for life beyond class']] as const).map(([icon, text]) =>
            <View key={icon} style={styles.point}><View style={styles.featureIcon}><Ionicons name={icon} size={18} color={colors.moss}/></View><Text style={styles.pointText}>{text}</Text></View>)}
        </View>
        <Button title="Continue to preview" onPress={() => void setSession({
          accessToken: 'local-preview',
          expiresAt: '2099-01-01T00:00:00.000Z',
          user: { id: '00000000-0000-4000-8000-000000000001', email: 'preview@campusflow.local',
            displayName: 'Preview Student', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            createdAt: '2026-01-01T00:00:00.000Z' },
        }).then(() => router.replace('/today'))}/>
        <Text style={styles.previewNote}>Sample data only. Your changes stay in this browser session and reset when you reload.</Text>
      </View>
      <Text style={styles.pageFoot}>A little structure. A lot more headspace.</Text>
      </ScrollView>
    </View>
  </SafeAreaView>;
  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
      <View style={[styles.layout, wide && styles.layoutWide]}>
      {wide && <AuthStory/>}
      <ScrollView contentContainerStyle={[styles.page, wide && styles.pageWide]} keyboardShouldPersistTaps="handled">
        {!wide && <View style={styles.brand}>
          {/* Keep the brand row compact: the sign-in fields must stay above the keyboard on small phones. */}
          <View style={styles.brandRow}><View style={styles.mark}><Ionicons name="leaf" size={22} color={colors.onAccent}/></View>
            <Text style={styles.logo}>CampusFlow</Text></View>
          <Text style={styles.subtitle}>Your student day, in one calm place.</Text>
          {registering && !verification && <View style={styles.points}>{([['today-outline', 'Deadlines, tasks and campus events in one daily plan'],
            ['flame-outline', 'Gentle routines with streaks and check-ins'], ['cloud-offline-outline', 'Your saved plan stays readable offline']] as const).map(([icon, text]) =>
            <View key={icon} style={styles.point}><Ionicons name={icon} size={18} color={colors.moss}/><Text style={styles.pointText}>{text}</Text></View>)}</View>}
        </View>}
        <View style={styles.form}>
          <Text style={styles.title}>{verification ? 'Check your email' : registering ? 'Create your account' : next === 'account' ? 'Sign in to manage your account' : 'Welcome back'}</Text>
          {!verification && <Text style={styles.formSubtitle}>{registering ? 'A fresh start for your student life.' : 'Pick up where you left off. You’ve got this.'}</Text>}
          {accountDeleted && <Text accessibilityRole="alert" style={{ color: colors.ink }}>Your account was deleted. All sessions have lost server access.</Text>}
          {sessionUnavailable && <Text accessibilityRole="alert" style={styles.body}>Your session is no longer available. Sign in again to continue. Your server-saved student data is retained. Unsaved device drafts aren’t kept when signing in again.</Text>}
          {cleanupError && <><Text accessibilityRole="alert" style={styles.error}>{cleanupError}</Text><Button title="Retry device cleanup" tone="plain" onPress={() => void retryCleanup()}/></>}
          {verification ? <>
            <Text style={styles.body}>{verification.codeRequested ? 'Verification is required before you can sign in. A code has been requested for your email.' : 'Verification is required before you can sign in. Code requests are temporarily limited. You can use a recent code or request one later.'}</Text>
            <Text style={styles.body}>Enter the code with your account password, then return to sign in.</Text>
            <Button title="Continue to verify email" onPress={openVerification}/>
            <Button title="Back to sign in" tone="plain" onPress={() => { setVerification(null); setRegistering(false); setMessage(undefined); }}/>
          </> : <>
          <Controller control={control} name="email" render={({ field }) => <Field testID="auth-email" label="Email" value={field.value} onChangeText={field.onChange} placeholder="you@ualberta.ca" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!pending}
            returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()}/>}/>
          {registering && <Controller control={control} name="displayName" render={({ field }) => <Field label="Name" value={field.value} onChangeText={field.onChange} placeholder="Your name" editable={!pending}/>}/>}
          <Controller control={control} name="password" render={({ field }) => <Field testID="auth-password" label="Password" value={field.value} onChangeText={field.onChange} placeholder={registering ? 'At least 12 characters' : 'Your password'} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} editable={!pending}
            inputRef={passwordInput} returnKeyType={registering ? 'done' : 'go'} onSubmitEditing={() => { if (!registering) void handleSubmit(submit)(); }}
            accessory={<Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} hitSlop={8} onPress={() => setShowPassword(value => !value)} style={styles.eye}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted}/></Pressable>}/>}/>
          {registering && <Controller control={control} name="timeZone" render={({ field }) => <Field label="Time zone" value={field.value} onChangeText={field.onChange} placeholder="America/Edmonton" autoCapitalize="none" autoCorrect={false} editable={!pending}/>}/>}
          {registering && <Text style={styles.body}>{capability === 'preview' ? 'Email isn’t verified and there’s no email password reset, so keep your password somewhere safe.' : capability === 'verified' ? 'Verify your email before signing in. Your student data stays private.' : capability === 'closed' ? 'New accounts are currently unavailable. Existing users can still sign in.' : capability === 'error' ? 'Couldn’t check signup availability. Retry or sign in to an existing account.' : 'Checking signup availability…'}</Text>}
          {registering && capability === 'error' && <Button title="Check again" tone="plain" onPress={() => setCapabilityRetry(value => value + 1)}/>}
          <Text style={styles.error}>{errors.email?.message || errors.displayName?.message || errors.password?.message || errors.timeZone?.message || message}</Text>
          {registering && termsUrl && privacyUrl && ['preview', 'verified'].includes(capability) && <View style={styles.consent}>
            <Text style={styles.body}>By creating an account, you agree to the</Text>
            <TextLink title="Terms of use" role="link" disabled={pending} onPress={() => openPolicy(termsUrl, 'Couldn’t open the terms. Check your connection and try again.')}/>
            <Text style={styles.body}>and</Text>
            <TextLink title="Privacy policy" role="link" disabled={pending} onPress={() => openPolicy(privacyUrl, 'Couldn’t open the privacy policy. Check your connection and try again.')}/>
          </View>}
          <Button title={pending ? 'Please wait…' : registering ? 'Create account' : 'Sign in'} onPress={() => { void handleSubmit(submit)(); }} disabled={pending || registering && !['preview', 'verified'].includes(capability)}/>
          {!registering && <View style={styles.links}>
            <TextLink title="Forgot password?" disabled={pending} onPress={() => { setValue('password', ''); router.push(next === 'account' ? '/recover?next=account' : '/recover'); }}/>
            <TextLink title="I have a verification code" disabled={pending} onPress={openVerification}/>
          </View>}
          <View style={styles.divider}/>
          <Text style={styles.switchPrompt}>{registering ? 'Already using CampusFlow?' : 'New to CampusFlow?'}</Text>
          <Button tone="plain" title={registering ? 'I already have an account' : 'Create an account'} disabled={pending} onPress={() => { clearErrors(); setValue('password', ''); setShowPassword(false); setMessage(undefined); setRegistering(!registering); }}/>
          </>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Help & data" disabled={pending} onPress={() => { if (!busy.current) { setValue('password', ''); router.push('/help'); } }} style={styles.help} hitSlop={6}>
          <Ionicons name="help-circle-outline" size={18} color={colors.moss}/><Text style={styles.helpText}>Help & data</Text></Pressable>
      </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
function TextLink({ title, disabled, onPress, role = 'button' }: { title: string; disabled?: boolean; onPress(): void; role?: 'button' | 'link' }) {
  return <Pressable accessibilityRole={role} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={8} style={styles.linkHit}>
    <Text style={[styles.link, disabled && styles.dim]}>{title}</Text></Pressable>;
}
function Brand() {
  return <View style={styles.brand}>
    <View style={styles.brandRow}><View style={styles.mark}><Ionicons name="leaf" size={21} color={colors.onAccent}/></View><Text style={styles.logo}>CampusFlow<Text style={styles.brandDot}>.</Text></Text></View>
    <Text style={styles.subtitle}>Your student day, in one calm place.</Text>
  </View>;
}

/** A decorative product vignette; the real account form remains the only interactive content. */
function AuthStory() {
  return <View style={styles.story}>
    <View style={styles.storyBrand}><View style={styles.storyMark}><Ionicons name="leaf" size={23} color={design.signalInk}/></View><Text style={styles.storyLogo}>CampusFlow.</Text></View>
    <View style={styles.storyContent}>
      <View style={styles.storyPill}><View style={styles.storyDot}/><Text style={styles.storyPillText}>Student life, in flow</Text></View>
      <Text style={styles.storyTitle}>A little structure.{'\n'}A lot more{'\n'}headspace.</Text>
      <Text style={styles.storyBody}>Bring your classes, plans, and personal goals into one calm, beautifully simple day.</Text>
      <View style={styles.vignette} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.vignetteTop}><View><Text style={styles.vignetteKicker}>Your daily plan</Text><Text style={styles.vignetteTitle}>One thing at a time.</Text></View><View style={styles.sun}><Ionicons name="sunny-outline" size={26} color={design.signalInk}/></View></View>
        <View style={styles.vignetteRow}><View style={styles.checked}><Ionicons name="checkmark" size={14} color={design.signalInk}/></View><Text style={styles.crossed}>Morning walk & a little fresh air</Text><Text style={styles.vignetteTime}>Done</Text></View>
        <View style={styles.vignetteRow}><View style={styles.unchecked}/><View style={styles.taskCopy}><Text style={styles.vignetteTask}>Make progress on your project</Text><Text style={styles.vignetteMeta}>A little focus goes a long way</Text></View><Ionicons name="arrow-forward" size={18} color="#52685C"/></View>
        <View style={styles.vignetteBottom}><Ionicons name="sparkles-outline" size={16} color="#426B50"/><Text style={styles.vignetteHint}>Small steps. A day that feels good.</Text></View>
      </View>
    </View>
    <View style={styles.storyFooter}><Text style={styles.storyFooterText}>Made for student life</Text><Text style={styles.storyFooterText}>Built around your day</Text></View>
  </View>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, layout: { flex: 1 }, layoutWide: { flexDirection: 'row' },
  page: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 36, gap: 28, width: '100%', maxWidth: 500, alignSelf: 'center' },
  pageWide: { paddingHorizontal: 60, maxWidth: 580, minHeight: '100%' },
  previewPage: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 28, width: '100%', maxWidth: 500, alignSelf: 'center' },
  previewCard: { gap: 20 },
  previewBadge: { ...typography, alignSelf: 'flex-start', color: colors.moss, backgroundColor: colors.sage, borderRadius: 7, fontSize: 11, fontWeight: '600', letterSpacing: .1, paddingHorizontal: 9, paddingVertical: 6 },
  previewFeatures: { gap: 16, marginVertical: 8 }, featureIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sage },
  previewNote: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  pageFoot: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 24 },
  brand: { gap: 10, marginBottom: 8 }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, mark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center' },
  logo: { color: colors.ink, fontSize: 27, fontWeight: '700', letterSpacing: -1 }, brandDot: { color: colors.moss }, subtitle: { color: colors.muted, fontSize: 14 },
  points: { gap: 10, marginTop: 12 }, point: { flexDirection: 'row', alignItems: 'center', gap: 10 }, pointText: { color: colors.ink, fontSize: 14, flexShrink: 1 },
  form: { gap: 16 },
  title: { ...typography, fontSize: 34, lineHeight: 41, fontWeight: '600', letterSpacing: -1.2, color: colors.ink }, formSubtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: -7, marginBottom: 12 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 23 }, error: { minHeight: 12, color: colors.danger, fontSize: 13 },
  eye: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }, consent: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 5 }, linkHit: { minHeight: 36, justifyContent: 'center' },
  link: { color: colors.moss, fontWeight: '600', fontSize: 12 }, dim: { opacity: 0.5 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 7 }, switchPrompt: { color: colors.muted, textAlign: 'center', fontSize: 13 },
  help: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46 }, helpText: { color: colors.muted, fontSize: 12 },
  story: { flex: 1, maxWidth: '49%', minWidth: 420, backgroundColor: design.chrome, padding: 40, justifyContent: 'space-between', overflow: 'hidden' },
  storyBrand: { flexDirection: 'row', alignItems: 'center', gap: 11 }, storyMark: { height: 36, width: 36, borderRadius: 11, backgroundColor: design.signal, alignItems: 'center', justifyContent: 'center' }, storyLogo: { ...typography, color: design.chromeText, fontSize: 24, letterSpacing: -0.9, fontWeight: '600' },
  storyContent: { gap: 20, paddingVertical: 32, maxWidth: 490 }, storyPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: design.chromeLine, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },
  storyDot: { height: 5, width: 5, borderRadius: 3, backgroundColor: design.signal }, storyPillText: { ...typography, color: design.chromeMuted, fontSize: 11, fontWeight: '500', letterSpacing: .1 },
  storyTitle: { ...typography, color: design.heroText, fontSize: 54, lineHeight: 59, fontWeight: '500', letterSpacing: -2.5 }, storyBody: { ...typography, color: design.heroMuted, fontSize: 15, lineHeight: 25, maxWidth: 340 },
  vignette: { backgroundColor: '#F3F8F4', borderRadius: 18, borderWidth: 1, borderColor: design.chromeLine, padding: 20, marginTop: 14, gap: 16, shadowColor: '#071F15', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24 },
  vignetteTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, vignetteKicker: { ...typography, color: '#617366', fontSize: 10, fontWeight: '500', letterSpacing: .1, marginBottom: 6 }, vignetteTitle: { color: '#243A2D', fontSize: 20, fontWeight: '600', letterSpacing: -0.5 },
  sun: { width: 40, height: 40, borderRadius: 20, backgroundColor: design.signal, alignItems: 'center', justifyContent: 'center' },
  vignetteRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#E0E5DA', paddingTop: 12 }, checked: { width: 19, height: 19, borderRadius: 6, backgroundColor: design.signal, alignItems: 'center', justifyContent: 'center' }, unchecked: { width: 19, height: 19, borderRadius: 6, borderWidth: 1, borderColor: '#BECABD' },
  crossed: { color: '#70806F', fontSize: 11, flex: 1, textDecorationLine: 'line-through' }, vignetteTime: { color: '#70806F', fontSize: 9 }, taskCopy: { gap: 5, flex: 1 }, vignetteTask: { color: '#2C4133', fontSize: 12, fontWeight: '600' }, vignetteMeta: { color: '#72816F', fontSize: 10 },
  vignetteBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 }, vignetteHint: { color: '#52694F', fontSize: 10 },
  storyFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, storyFooterText: { ...typography, color: design.chromeMuted, fontSize: 10, letterSpacing: .1 },
});
