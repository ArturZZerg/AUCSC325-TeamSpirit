import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, json } from '@/lib/api';
import type { Session } from '@/lib/types';
import { useSessionStore } from '@/store/session';
import { Button, Field, colors } from '@/components/ui';
import { authFormSchema, type AuthFormValues } from '@/features/auth-form';

export default function Auth() {
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<string>();
  const { setSession } = useSessionStore();
  const { control, handleSubmit, clearErrors, formState: { errors, isSubmitting } } = useForm<AuthFormValues>({
    resolver: zodResolver(authFormSchema(registering)),
    defaultValues: { email: '', displayName: '', password: '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
  });
  const submit = async (values: AuthFormValues) => {
    try {
      setMessage(undefined);
      const session = await api<Session>(registering ? '/auth/register' : '/auth/login', json('POST', registering ? values : { email: values.email, password: values.password }));
      await setSession(session);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed.');
    }
  };
  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}><Text style={styles.logo}>CampusFlow</Text><Text style={styles.subtitle}>Your student day, in one calm place.</Text></View>
        <View style={styles.form}>
          <Text style={styles.title}>{registering ? 'Create your account' : 'Welcome back'}</Text>
          <Controller control={control} name="email" render={({ field }) => <Field label="Email" value={field.value} onChangeText={field.onChange} placeholder="you@ualberta.ca" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />}/>
          {registering && <Controller control={control} name="displayName" render={({ field }) => <Field label="Name" value={field.value} onChangeText={field.onChange} placeholder="Your name"/>}/>}
          <Controller control={control} name="password" render={({ field }) => <Field label="Password" value={field.value} onChangeText={field.onChange} placeholder={registering ? 'At least 12 characters' : 'Your password'} secureTextEntry autoCapitalize="none" autoCorrect={false}/>}/>
          {registering && <Controller control={control} name="timeZone" render={({ field }) => <Field label="Time zone" value={field.value} onChangeText={field.onChange} placeholder="America/Edmonton" autoCapitalize="none" autoCorrect={false}/>}/>}
          <Text style={styles.error}>{errors.email?.message || errors.displayName?.message || errors.password?.message || errors.timeZone?.message || message}</Text>
          <Button title={isSubmitting ? 'Please wait…' : registering ? 'Create account' : 'Sign in'} onPress={handleSubmit(submit)} disabled={isSubmitting}/>
          <Button tone="plain" title={registering ? 'I already have an account' : 'Create an account'} disabled={isSubmitting} onPress={() => { clearErrors(); setMessage(undefined); setRegistering(!registering); }}/>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, page: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 40 }, brand: { gap: 8 }, logo: { color: colors.moss, fontSize: 36, fontWeight: '800' }, subtitle: { color: colors.muted, fontSize: 17 }, form: { gap: 14, backgroundColor: '#fff', borderRadius: 24, padding: 20 }, title: { fontSize: 23, fontWeight: '800', color: colors.ink }, error: { minHeight: 20, color: colors.coral } });
