import { zodResolver } from '@hookform/resolvers/zod';
import { authCapabilitySchema, authResultSchema } from '@campusflow/contracts';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, json } from '@/lib/api';
import { useSessionStore } from '@/store/session';
import { Button, Field, colors } from '@/components/ui';
import { authFormSchema, type AuthFormValues } from '@/features/auth-form';

export default function Auth() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const router = useRouter(), navigation = useNavigation();
  const [registering, setRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordInput = useRef<TextInput>(null);
  const [message, setMessage] = useState<string>();
  const [capability, setCapability] = useState<'preview' | 'verified' | 'closed' | 'loading' | 'error'>('loading');
  const [capabilityRetry, setCapabilityRetry] = useState(0), [verification, setVerification] = useState<{ codeRequested: boolean } | null>(null);
  const [pending, setPending] = useState(false), mounted = useRef(false), revision = useRef(0), busy = useRef(false), request = useRef<AbortController | null>(null);
  const { session, setSession, accountDeleted, sessionUnavailable, cleanupError, retryCleanup } = useSessionStore();
  const { control, handleSubmit, clearErrors, setValue, reset, formState: { errors } } = useForm<AuthFormValues>({
    resolver: zodResolver(authFormSchema(registering)),
    defaultValues: { email: '', displayName: '', password: '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
  });
  const isCurrent = (epoch: number) => mounted.current && epoch === revision.current && !useSessionStore.getState().session;
  useEffect(() => {
    mounted.current = true; ++revision.current; busy.current = false; setPending(false); setVerification(null); setValue('password', '');
    return () => { mounted.current = false; ++revision.current; request.current?.abort(); };
  }, [session?.accessToken, setValue]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController(), epoch = revision.current; setCapability('loading');
    const deadline = setTimeout(() => controller.abort(), 15_000);
    void api('/auth/capability', { cache: 'no-store', signal: controller.signal }).then(value => {
      if (active && isCurrent(epoch)) setCapability(authCapabilitySchema.parse(value).registration);
    }).catch(() => { if (active && isCurrent(epoch)) setCapability('error'); }).finally(() => clearTimeout(deadline));
    return () => { active = false; clearTimeout(deadline); controller.abort(); };
  }, [capabilityRetry, session?.accessToken]);
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
  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          {/* Keep the brand row compact: the sign-in fields must stay above the keyboard on small phones. */}
          <View style={styles.brandRow}><View style={styles.mark}><Ionicons name="leaf" size={22} color={colors.onAccent}/></View>
            <Text style={styles.logo}>CampusFlow</Text></View>
          <Text style={styles.subtitle}>Your student day, in one calm place.</Text>
          {registering && !verification && <View style={styles.points}>{([['today-outline', 'Deadlines, tasks and campus events in one daily plan'],
            ['flame-outline', 'Gentle routines with streaks and check-ins'], ['cloud-offline-outline', 'Your saved plan stays readable offline']] as const).map(([icon, text]) =>
            <View key={icon} style={styles.point}><Ionicons name={icon} size={18} color={colors.moss}/><Text style={styles.pointText}>{text}</Text></View>)}</View>}
        </View>
        <View style={styles.form}>
          <Text style={styles.title}>{verification ? 'Check your email' : registering ? 'Create your account' : next === 'account' ? 'Sign in to manage your account' : 'Welcome back'}</Text>
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
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
function TextLink({ title, disabled, onPress }: { title: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={8} style={styles.linkHit}>
    <Text style={[styles.link, disabled && styles.dim]}>{title}</Text></Pressable>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, page: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 24, width: '100%', maxWidth: 588, alignSelf: 'center' },
  brand: { gap: 8 }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center' },
  logo: { color: colors.ink, fontSize: 34, fontWeight: '800' }, subtitle: { color: colors.muted, fontSize: 17 },
  points: { gap: 8, marginTop: 8 }, point: { flexDirection: 'row', alignItems: 'center', gap: 10 }, pointText: { color: colors.ink, fontSize: 15, flexShrink: 1 },
  form: { gap: 14, backgroundColor: colors.card, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line },
  title: { fontSize: 23, fontWeight: '800', color: colors.ink }, body: { color: colors.muted, fontSize: 15, lineHeight: 22 }, error: { minHeight: 20, color: colors.danger },
  eye: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }, linkHit: { minHeight: 32, justifyContent: 'center' },
  link: { color: colors.moss, fontWeight: '700' }, dim: { opacity: 0.5 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 2 }, switchPrompt: { color: colors.muted, textAlign: 'center' },
  help: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }, helpText: { color: colors.moss, fontWeight: '700' },
});
