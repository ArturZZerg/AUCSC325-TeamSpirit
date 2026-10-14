import { zodResolver } from '@hookform/resolvers/zod';
import { authCapabilitySchema, authResultSchema } from '@campusflow/contracts';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, json } from '@/lib/api';
import { useSessionStore } from '@/store/session';
import { Button, Field, colors } from '@/components/ui';
import { authFormSchema, type AuthFormValues } from '@/features/auth-form';

export default function Auth() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const router = useRouter(), navigation = useNavigation();
  const [registering, setRegistering] = useState(false);
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
        <View style={styles.brand}><Text style={styles.logo}>CampusFlow</Text><Text style={styles.subtitle}>Your student day, in one calm place.</Text></View>
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
          <Controller control={control} name="email" render={({ field }) => <Field testID="auth-email" label="Email" value={field.value} onChangeText={field.onChange} placeholder="you@ualberta.ca" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!pending}/>}/>
          {registering && <Controller control={control} name="displayName" render={({ field }) => <Field label="Name" value={field.value} onChangeText={field.onChange} placeholder="Your name" editable={!pending}/>}/>}
          <Controller control={control} name="password" render={({ field }) => <Field testID="auth-password" label="Password" value={field.value} onChangeText={field.onChange} placeholder={registering ? 'At least 12 characters' : 'Your password'} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!pending}/>}/>
          {registering && <Controller control={control} name="timeZone" render={({ field }) => <Field label="Time zone" value={field.value} onChangeText={field.onChange} placeholder="America/Edmonton" autoCapitalize="none" autoCorrect={false} editable={!pending}/>}/>}
          {registering && <Text style={styles.body}>{capability === 'preview' ? 'Preview accounts don’t verify email. Use a test address.' : capability === 'verified' ? 'Verify your email before signing in. Your student data stays private.' : capability === 'closed' ? 'New accounts are currently unavailable. Existing users can still sign in.' : capability === 'error' ? 'Couldn’t check signup availability. Retry or sign in to an existing account.' : 'Checking signup availability…'}</Text>}
          {registering && capability === 'error' && <Button title="Check again" tone="plain" onPress={() => setCapabilityRetry(value => value + 1)}/>}
          <Text style={styles.error}>{errors.email?.message || errors.displayName?.message || errors.password?.message || errors.timeZone?.message || message}</Text>
          <Button title={pending ? 'Please wait…' : registering ? 'Create account' : 'Sign in'} onPress={() => { void handleSubmit(submit)(); }} disabled={pending || registering && !['preview', 'verified'].includes(capability)}/>
          {!registering && <Button title="Forgot password?" tone="plain" disabled={pending} onPress={() => { setValue('password', ''); router.push(next === 'account' ? '/recover?next=account' : '/recover'); }}/>}
          {!registering && <Button title="I have a verification code" tone="plain" disabled={pending} onPress={openVerification}/>}
          <Button tone="plain" title={registering ? 'I already have an account' : 'Create an account'} disabled={pending} onPress={() => { clearErrors(); setValue('password', ''); setMessage(undefined); setRegistering(!registering); }}/>
          </>}
        </View>
        <Button title="Help & data" tone="plain" disabled={pending} onPress={() => { if (!busy.current) { setValue('password', ''); router.push('/help'); } }}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, page: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 28, width: '100%', maxWidth: 588, alignSelf: 'center' }, brand: { gap: 8 }, logo: { color: colors.moss, fontSize: 36, fontWeight: '800' }, subtitle: { color: colors.muted, fontSize: 17 }, form: { gap: 14, backgroundColor: colors.card, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line }, title: { fontSize: 23, fontWeight: '800', color: colors.ink }, body: { color: colors.muted, fontSize: 15, lineHeight: 22 }, error: { minHeight: 20, color: colors.danger } });
