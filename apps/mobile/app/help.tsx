import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Screen, colors } from '@/components/ui';
import { findHelp, helpTopics, type HelpTopic } from '@/features/help-content';
import { useSessionStore } from '@/store/session';
import { publishedLink } from '../config/published-links.cjs';

export default function HelpScreen() {
  const router = useRouter(), { session, ready } = useSessionStore();
  const [search, setSearch] = useState(''), [topic, setTopic] = useState<HelpTopic>(), [expanded, setExpanded] = useState<string>();
  const [opening, setOpening] = useState(false), [message, setMessage] = useState<string>();
  const active = useRef(true), busy = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const privacy = publishedLink(process.env.EXPO_PUBLIC_PRIVACY_URL), support = publishedLink(process.env.EXPO_PUBLIC_SUPPORT_URL);
  const terms = publishedLink(process.env.EXPO_PUBLIC_TERMS_URL);
  const answers = findHelp(search, topic);
  async function openWebsite(url: string) {
    if (busy.current) return;
    busy.current = true; setOpening(true); setMessage(undefined);
    try { await Linking.openURL(url); }
    catch { if (active.current) setMessage('Couldn’t open the website. Check your connection and try again.'); }
    finally { busy.current = false; if (active.current) setOpening(false); }
  }
  return <Screen safeArea><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.heading}><Button title={session ? 'Back to CampusFlow' : 'Back to sign in'} tone="plain" disabled={!ready}
      onPress={() => router.replace(session ? '/today' : '/auth')}/><Text style={styles.kicker}>HELP & DATA</Text></View>
    <Text accessibilityRole="header" style={styles.title}>A little help for your day.</Text>
    <Text style={styles.copy}>Find an answer, understand your saved information, or jump back into your student tools. These guides work offline.</Text>
    <View style={styles.actions}>
      <View style={styles.action}><Button title="Account & privacy" disabled={!ready} onPress={() => router.push('/account')}/></View>
      {session && <View style={styles.action}><Button title="Notification settings" tone="plain" disabled={!ready} onPress={() => router.push('/settings')}/></View>}
    </View>
    <View style={styles.search}><Text style={styles.label}>Search help</Text><TextInput testID="help-search" accessibilityLabel="Search help" style={styles.input} value={search}
      onChangeText={value => { setSearch(value); setExpanded(undefined); }} maxLength={100} autoCapitalize="none" autoCorrect={false} returnKeyType="search"
      placeholder="Try offline, reminders or coursework" placeholderTextColor={colors.muted}/>
      {!!search && <Button title="Clear search" tone="plain" onPress={() => { setSearch(''); setExpanded(undefined); }}/>}</View>
    <View style={styles.filters}>{[undefined, ...helpTopics].map(value => <Pressable key={value ?? 'all'} accessibilityRole="button"
      accessibilityLabel={`Help topic: ${value ?? 'All'}`} accessibilityState={{ selected: topic === value }} onPress={() => { setTopic(value); setExpanded(undefined); }}
      style={[styles.chip, topic === value && styles.selected]}><Text style={[styles.chipText, topic === value && styles.selectedText]}>{value ?? 'All answers'}</Text></Pressable>)}</View>
    <Text accessibilityLiveRegion="polite" style={styles.count}>{answers.length} {answers.length === 1 ? 'answer' : 'answers'}</Text>
    {!answers.length && <Card><Text style={styles.question}>No matching answers.</Text><Text style={styles.copy}>Try a different phrase or browse every topic.</Text>
      <Button title="Show all answers" tone="plain" onPress={() => { setSearch(''); setTopic(undefined); setExpanded(undefined); }}/></Card>}
    {answers.map(article => <Card key={article.id}><Pressable accessibilityRole="button" accessibilityLabel={article.question}
      accessibilityState={{ expanded: expanded === article.id }} style={styles.article} onPress={() => setExpanded(expanded === article.id ? undefined : article.id)}>
      <View style={styles.articleText}><Text style={styles.topic}>{article.topic}</Text><Text style={styles.question}>{article.question}</Text></View>
      <Text accessible={false} importantForAccessibility="no" style={styles.expand}>{expanded === article.id ? '−' : '+'}</Text>
    </Pressable>{expanded === article.id && <><Text style={styles.answer}>{article.answer}</Text>
      {article.action && (session || article.action.path === '/account') && <Button title={article.action.label} tone="plain" disabled={!ready}
        onPress={() => { if (article.action) router.push(article.action.path); }}/>}</>}
    </Card>)}
    <Card><Text accessibilityRole="header" style={styles.section}>Policy & contact</Text>
      <Text style={styles.copy}>Published policy and support pages open in your browser. Searches here stay on this screen and aren’t sent to support.</Text>
      {privacy && <Button title="Read privacy policy" tone="plain" disabled={opening} onPress={() => void openWebsite(privacy)}/>}
      {terms && <Button title="Read terms of use" tone="plain" disabled={opening} onPress={() => void openWebsite(terms)}/>}
      {support && <Button title="Visit support" tone="plain" disabled={opening} onPress={() => void openWebsite(support)}/>}
      {(!privacy || !support) && <Text style={styles.copy}>{!privacy && !support ? 'Published policy and contact links are not yet available in this preview.'
        : !privacy ? 'The published privacy policy is not yet available in this preview.' : 'A support contact page is not yet available in this preview.'}</Text>}
      {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    </Card>
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
  heading: { alignItems: 'flex-start', gap: 12 }, kicker: { color: colors.moss, fontWeight: '800', fontSize: 12, letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '800' }, copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, action: { flexGrow: 1, flexBasis: 180 },
  search: { gap: 8, marginTop: 8 }, label: { color: colors.ink, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.card, color: colors.ink, padding: 12, fontSize: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, chipText: { color: colors.muted, fontWeight: '600' }, selectedText: { color: '#FFFFFF' },
  count: { color: colors.muted, fontSize: 13 }, article: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  articleText: { flex: 1, gap: 5 }, topic: { color: colors.moss, fontWeight: '600', fontSize: 12 }, question: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  expand: { color: colors.moss, fontSize: 26 }, answer: { color: colors.ink, fontSize: 15, lineHeight: 23 }, section: { color: colors.ink, fontSize: 18, fontWeight: '800' }, error: { color: colors.danger, lineHeight: 22 },
});
