import { zodResolver } from '@hookform/resolvers/zod';
import { passwordRecoveryAcceptedSchema, passwordRecoveryCapabilitySchema, passwordRecoveryRequestSchema, passwordResetRequestSchema, passwordResetResultSchema } from '@campusflow/contracts';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, colors } from '@/components/ui';
import { api, ApiError, json } from '@/lib/api';
import { recoveryFormSchema, type RecoveryFormValues } from '@/features/recovery-form';
import { useSessionStore } from '@/store/session';

const empty: RecoveryFormValues = { email: '', code: '', newPassword: '', confirmation: '' };
export default function Recover() {
  const { next } = useLocalSearchParams<{ next?: string }>(), router = useRouter(), navigation = useNavigation();
  const sessionToken = useSessionStore(state => state.session?.accessToken);
  const [stage, setStage] = useState<'request' | 'code' | 'done'>('request');
  const [capability, setCapability] = useState<'loading' | 'available' | 'disabled' | 'error'>('loading');
  const [capabilityRetry, setCapabilityRetry] = useState(0), [message, setMessage] = useState<string>();
  const [acknowledgment, setAcknowledgment] = useState(false), [pending, setPending] = useState<'request' | 'reset' | null>(null);
  const [resendAt, setResendAt] = useState(0), [remaining, setRemaining] = useState(0);
  const mounted = useRef(false), revision = useRef(0), busy = useRef(false), activeRequest = useRef<AbortController | null>(null);
  const { control, handleSubmit, getValues, setValue, reset, clearErrors, formState: { errors } } = useForm<RecoveryFormValues>({
    resolver: zodResolver(recoveryFormSchema(stage === 'code')), defaultValues: empty,
  });
  const isCurrent = (epoch: number) => mounted.current && epoch === revision.current && !useSessionStore.getState().session;
  useEffect(() => {
    mounted.current = true; const epoch = ++revision.current;
    activeRequest.current?.abort(); busy.current = false; reset(empty); setStage('request'); setMessage(undefined);
    setPending(null); setAcknowledgment(false); setResendAt(0); setRemaining(0); setCapability('loading');
    if (!sessionToken) {
      const controller = new AbortController(); activeRequest.current = controller;
      const deadline = setTimeout(() => controller.abort(), 15_000);
      void api('/auth/recovery/capability', { cache: 'no-store', signal: controller.signal }).then(value => {
        if (isCurrent(epoch)) setCapability(passwordRecoveryCapabilitySchema.parse(value).available ? 'available' : 'disabled');
      }).catch(() => { if (isCurrent(epoch)) setCapability('error'); }).finally(() => clearTimeout(deadline));
    }
    return () => { mounted.current = false; ++revision.current; activeRequest.current?.abort(); busy.current = false; };
  }, [sessionToken, capabilityRetry, reset]);
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
  function clearSecrets() { setValue('code', ''); setValue('newPassword', ''); setValue('confirmation', ''); clearErrors(); }
  function leave() {
    if (busy.current) return;
    ++revision.current; activeRequest.current?.abort(); reset(empty);
    router.replace(next === 'account' ? '/auth?next=account' : '/auth');
  }
  async function submit(kind: 'request' | 'reset') {
    if (busy.current || capability !== 'available' || useSessionStore.getState().session) return;
    const values = getValues();
    const parsed = kind === 'request' ? passwordRecoveryRequestSchema.safeParse({ email: values.email })
      : passwordResetRequestSchema.safeParse({ email: values.email, code: values.code, newPassword: values.newPassword });
    if (!parsed.success) { setMessage(kind === 'request' ? 'Enter a valid account email.' : 'Enter the full code and a password of 12–128 characters.'); return; }
    if (kind === 'reset' && values.newPassword !== values.confirmation) { setMessage('The passwords must match.'); return; }
    const epoch = revision.current, controller = new AbortController(); activeRequest.current = controller;
    busy.current = true; setPending(kind); setMessage(undefined);
    const deadline = setTimeout(() => controller.abort(), 15_000);
    try {
      const value = await api(`/auth/recovery/${kind}`, { ...json('POST', parsed.data), cache: 'no-store', signal: controller.signal });
      if (!isCurrent(epoch)) return;
      if (kind === 'request') {
        passwordRecoveryAcceptedSchema.parse(value); clearErrors(); setValue('email', parsed.data.email);
        setAcknowledgment(true); setStage('code'); setResendAt(Date.now() + 60_000); setRemaining(60);
      } else {
        passwordResetResultSchema.parse(value); reset(empty); setStage('done'); setAcknowledgment(false); setResendAt(0);
      }
    } catch (error) {
      if (!isCurrent(epoch)) return;
      if (error instanceof ApiError && error.status === 429) setMessage('Too many attempts. Wait before trying again.');
      else if (error instanceof ApiError && error.status === 503) { setCapability('disabled'); setMessage(undefined); }
      else if (kind === 'reset' && error instanceof ApiError && error.status === 400) setMessage('This code is invalid or expired. Request a new code and try again.');
      else setMessage(kind === 'request' ? 'Couldn’t confirm the request. Check your connection and try again.'
        : 'Couldn’t confirm the password change. Try signing in with your new password, or retry this code.');
    } finally {
      clearTimeout(deadline);
      if (isCurrent(epoch)) { busy.current = false; setPending(null); activeRequest.current = null; }
    }
  }
  const error = errors.email?.message || errors.code?.message || errors.newPassword?.message || errors.confirmation?.message || message;
  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.brand}><Text style={styles.logo}>CampusFlow</Text><Text style={styles.subtitle}>Get back to your student day.</Text></View>
          <View style={styles.form}>
            <Text style={styles.eyebrow}>{stage === 'done' ? 'ACCOUNT RECOVERY' : stage === 'code' ? 'STEP 2 OF 2' : 'STEP 1 OF 2'}</Text>
            <Text accessibilityRole="header" style={styles.title}>{stage === 'done' ? 'Password changed' : stage === 'code' ? 'Set a new password' : 'Forgot your password?'}</Text>
            {stage === 'done' ? <>
              <Text style={styles.body}>Your saved student data is still here. Previous sessions have been signed out. Sign in with your new password to continue.</Text>
              <Button title="Return to sign in" onPress={leave}/>
            </> : capability === 'loading' ? <View style={styles.status}><ActivityIndicator color={colors.moss}/><Text style={styles.body}>Checking recovery availability…</Text></View>
              : capability !== 'available' ? <>
                <Text accessibilityRole="alert" style={styles.body}>{capability === 'disabled' ? 'Password recovery is currently unavailable. Try again later.' : 'Couldn’t check recovery. Check your connection and retry.'}</Text>
                <Button title="Check again" tone="plain" onPress={() => setCapabilityRetry(value => value + 1)}/>
              </> : <>
                <Text style={styles.body}>{stage === 'request' ? 'Enter your account email. We’ll send a code you can paste here.' : 'Paste the full code from your email. Each code expires 15 minutes after its request.'}</Text>
                {acknowledgment && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.body}>If an account uses this email, a code will arrive shortly. Check your spam folder, too.</Text></View>}
                <Controller control={control} name="email" render={({ field }) => <Field label="Account email" value={field.value} onChangeText={value => { field.onChange(value); clearSecrets(); setAcknowledgment(false); setMessage(undefined); }} placeholder="you@ualberta.ca" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!pending}/>}/>
                {stage === 'code' && <>
                  <Controller control={control} name="code" render={({ field }) => <Field label="Recovery code" value={field.value} onChangeText={field.onChange} placeholder="Five groups of six characters" autoCapitalize="characters" autoCorrect={false} editable={!pending}/>}/>
                  <Controller control={control} name="newPassword" render={({ field }) => <Field label="New password" value={field.value} onChangeText={field.onChange} placeholder="12–128 characters" secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!pending}/>}/>
                  <Controller control={control} name="confirmation" render={({ field }) => <Field label="Confirm new password" value={field.value} onChangeText={field.onChange} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!pending}/>}/>
                </>}
                {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <Button title={pending === 'reset' ? 'Changing password…' : pending === 'request' ? 'Requesting code…' : stage === 'code' ? 'Change password' : 'Request recovery code'} disabled={!!pending} onPress={() => { void handleSubmit(() => submit(stage === 'code' ? 'reset' : 'request'))(); }}/>
                {stage === 'code' ? <>
                  <Button title={remaining > 0 ? `Resend in ${remaining}s` : 'Request a new code'} tone="plain" disabled={!!pending || remaining > 0} onPress={() => { clearErrors(); void submit('request'); }}/>
                  <Text style={styles.hint}>Already changed your password, but didn’t see confirmation? Try signing in with the new password.</Text>
                </> : <Button title="I already have a code" tone="plain" disabled={!!pending} onPress={() => { clearSecrets(); setMessage(undefined); setStage('code'); }}/>}</>}
            {stage !== 'done' && <Button title="Back to sign in" tone="plain" disabled={!!pending} onPress={leave}/>}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, page: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 540, alignSelf: 'center', gap: 28 }, brand: { gap: 8 },
  logo: { color: colors.moss, fontSize: 32, fontWeight: '800' }, subtitle: { color: colors.muted, fontSize: 17 },
  form: { gap: 14, backgroundColor: colors.card, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 }, title: { color: colors.ink, fontSize: 23, fontWeight: '800' },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 }, hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  notice: { backgroundColor: colors.sage, borderRadius: 12, padding: 12 }, status: { gap: 12, alignItems: 'center', paddingVertical: 12 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
