import { zodResolver } from '@hookform/resolvers/zod';
import { authCapabilitySchema, emailVerificationConfirmSchema, emailVerificationRequestSchema, emailVerificationResultSchema, passwordRecoveryAcceptedSchema } from '@campusflow/contracts';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { z } from 'zod';
import { Button, Field, colors } from '@/components/ui';
import { api, ApiError, json } from '@/lib/api';
import { useSessionStore } from '@/store/session';

type Values = z.input<typeof emailVerificationConfirmSchema>;
const empty: Values = { email: '', password: '', code: '' };
export default function VerifyEmail() {
  const { next } = useLocalSearchParams<{ next?: string }>(), router = useRouter(), navigation = useNavigation();
  const sessionToken = useSessionStore(state => state.session?.accessToken);
  const [capability, setCapability] = useState<'loading' | 'available' | 'disabled' | 'error'>('loading');
  const [retry, setRetry] = useState(0), [done, setDone] = useState(false), [message, setMessage] = useState<string>();
  const [requested, setRequested] = useState(false), [pending, setPending] = useState<'request' | 'confirm' | null>(null);
  const [resendAt, setResendAt] = useState(0), [remaining, setRemaining] = useState(0);
  const mounted = useRef(false), revision = useRef(0), busy = useRef(false), activeRequest = useRef<AbortController | null>(null);
  const { control, handleSubmit, getValues, setValue, reset, clearErrors, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(emailVerificationConfirmSchema), defaultValues: empty,
  });
  const isCurrent = (epoch: number) => mounted.current && epoch === revision.current && !useSessionStore.getState().session;
  useEffect(() => {
    mounted.current = true; const epoch = ++revision.current;
    activeRequest.current?.abort(); busy.current = false; reset(empty); setDone(false); setMessage(undefined);
    setPending(null); setRequested(false); setResendAt(0); setRemaining(0); setCapability('loading');
    if (!sessionToken) {
      const controller = new AbortController(); activeRequest.current = controller; const deadline = setTimeout(() => controller.abort(), 15_000);
      void api('/auth/capability', { cache: 'no-store', signal: controller.signal }).then(value => {
        if (isCurrent(epoch)) setCapability(authCapabilitySchema.parse(value).verificationAvailable ? 'available' : 'disabled');
      }).catch(() => { if (isCurrent(epoch)) setCapability('error'); }).finally(() => clearTimeout(deadline));
    }
    return () => { mounted.current = false; ++revision.current; activeRequest.current?.abort(); busy.current = false; };
  }, [sessionToken, retry, reset]);
  useEffect(() => navigation.addListener('beforeRemove', event => {
    if (busy.current && !useSessionStore.getState().session) event.preventDefault();
  }), [navigation]);
  useEffect(() => {
    if (!resendAt) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => { const value = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)); setRemaining(value); if (!value && timer) clearInterval(timer); };
    tick(); if (resendAt > Date.now()) timer = setInterval(tick, 1000);
    return () => { if (timer) clearInterval(timer); };
  }, [resendAt]);
  function leave(recover = false) {
    if (busy.current) return;
    ++revision.current; activeRequest.current?.abort(); reset(empty);
    router.replace(recover ? next === 'account' ? '/recover?next=account' : '/recover' : next === 'account' ? '/auth?next=account' : '/auth');
  }
  async function submit(kind: 'request' | 'confirm') {
    if (busy.current || capability !== 'available' || done || useSessionStore.getState().session || kind === 'request' && remaining > 0) return;
    const values = getValues(), parsed = kind === 'request'
      ? emailVerificationRequestSchema.safeParse({ email: values.email, password: values.password }) : emailVerificationConfirmSchema.safeParse(values);
    if (!parsed.success) { setMessage(kind === 'request' ? 'Enter your account email and password to request a code.' : 'Enter your account email, password and full verification code.'); return; }
    const epoch = revision.current, controller = new AbortController(); activeRequest.current = controller;
    busy.current = true; setPending(kind); setMessage(undefined); const deadline = setTimeout(() => controller.abort(), 15_000);
    try {
      const value = await api(`/auth/verification/${kind}`, { ...json('POST', parsed.data), cache: 'no-store', signal: controller.signal });
      if (!isCurrent(epoch)) return;
      if (kind === 'request') {
        passwordRecoveryAcceptedSchema.parse(value); clearErrors(); setValue('email', parsed.data.email); setRequested(true);
        setResendAt(Date.now() + 60_000); setRemaining(60);
      } else { emailVerificationResultSchema.parse(value); reset(empty); setDone(true); setRequested(false); setResendAt(0); }
    } catch (error) {
      if (!isCurrent(epoch)) return;
      if (error instanceof ApiError && error.status === 503) { setCapability('disabled'); setMessage(undefined); }
      else if (error instanceof ApiError && error.status === 429) setMessage('Too many attempts. Wait before trying again.');
      else if (error instanceof ApiError && error.status === 401) setMessage('Check your email and account password. If you don’t know the password, use Forgot password.');
      else if (error instanceof ApiError && error.status === 400) setMessage('The code or password is invalid. Check them or request a new code.');
      else setMessage(kind === 'request' ? 'Couldn’t confirm the request. Check your connection and retry.' : 'Couldn’t confirm verification. Try signing in, or retry this code.');
    } finally { clearTimeout(deadline); if (isCurrent(epoch)) { busy.current = false; setPending(null); activeRequest.current = null; } }
  }
  const error = errors.email?.message || errors.password?.message || errors.code?.message || message;
  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.brand}><Text style={styles.logo}>CampusFlow</Text><Text style={styles.subtitle}>One small step before your student day.</Text></View>
          <View style={styles.form}>
            <Text style={styles.eyebrow}>YOUR ACCOUNT</Text><Text accessibilityRole="header" style={styles.title}>{done ? 'Email verified' : 'Verify your email'}</Text>
            {done ? <>
              <Text style={styles.body}>Your email is verified. Sign in with your account password to continue. Your saved student data is still here.</Text>
              <Button title="Continue to sign in" onPress={() => leave()}/>
            </> : capability === 'loading' ? <View style={styles.status}><ActivityIndicator color={colors.moss}/><Text style={styles.body}>Checking verification availability…</Text></View>
              : capability !== 'available' ? <>
                <Text accessibilityRole="alert" style={styles.body}>{capability === 'disabled' ? 'Email verification is currently unavailable. Try again later.' : 'Couldn’t check verification. Check your connection and retry.'}</Text>
                <Button title="Check again" tone="plain" onPress={() => setRetry(value => value + 1)}/>
              </> : <>
                <Text style={styles.body}>Check your inbox for a code. Enter it with the password you chose for this account. Each code expires 15 minutes after its request.</Text>
                {requested && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.body}>If verification is still needed and requests are available, a code will arrive shortly. Recent codes may still work. Check your spam folder, too.</Text></View>}
                <Controller control={control} name="email" render={({ field }) => <Field label="Account email" value={field.value} onChangeText={value => { field.onChange(value); setValue('password', ''); setValue('code', ''); clearErrors(); setRequested(false); setMessage(undefined); }} placeholder="you@ualberta.ca" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!pending}/>}/>
                <Controller control={control} name="password" render={({ field }) => <Field label="Account password" value={field.value} onChangeText={field.onChange} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!pending}/>}/>
                <Controller control={control} name="code" render={({ field }) => <Field label="Verification code" value={field.value} onChangeText={field.onChange} placeholder="Five groups of six characters" autoCapitalize="characters" autoCorrect={false} editable={!pending}/>}/>
                {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <Button title={pending === 'confirm' ? 'Verifying email…' : 'Verify email'} disabled={!!pending} onPress={() => { void handleSubmit(() => submit('confirm'))(); }}/>
                <Button title={pending === 'request' ? 'Requesting code…' : remaining > 0 ? `Resend in ${remaining}s` : 'Request a new code'} tone="plain" disabled={!!pending || remaining > 0} onPress={() => { clearErrors(); void submit('request'); }}/>
                <Text style={styles.hint}>Didn’t create this account or don’t know its password? Recover it first. Never use a password supplied by someone else.</Text>
                <Button title="Forgot password?" tone="plain" disabled={!!pending} onPress={() => leave(true)}/>
              </>}
            {!done && <Button title="Back to sign in" tone="plain" disabled={!!pending} onPress={() => leave()}/>}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, page: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 540, alignSelf: 'center', gap: 28 }, brand: { gap: 8 }, logo: { color: colors.moss, fontSize: 32, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 17 }, form: { gap: 14, backgroundColor: colors.card, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 }, title: { color: colors.ink, fontSize: 23, fontWeight: '800' },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 }, hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  notice: { backgroundColor: colors.sage, borderRadius: 12, padding: 12 }, status: { gap: 12, alignItems: 'center', paddingVertical: 12 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
