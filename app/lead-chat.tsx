import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

type Message = {
  id: string;
  lead_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  seen_at: string | null;
};

type LeadInfo = {
  id: string;
  customer_id: string;
  service: string | null;
  status: string;
  accepted_business_id: string | null;
};

export default function LeadChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ leadId?: string }>();
  const { user } = useAuth();
  const leadId = typeof params.leadId === 'string' ? params.leadId : '';
  const scrollRef = useRef<ScrollView>(null);

  const [lead, setLead] = useState<LeadInfo | null>(null);
  const [partnerName, setPartnerName] = useState('Conversation');
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!user || !leadId) return;
    if (!silent) setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { data: leadData, error: leadError } = await supabase
        .from('gascars_leads')
        .select('id,customer_id,service,status,accepted_business_id')
        .eq('id', leadId)
        .single();

      if (leadError) throw leadError;
      const nextLead = leadData as LeadInfo;
      setLead(nextLead);

      if (nextLead.accepted_business_id) {
        const { data: business } = await supabase
          .from('gascars_businesses')
          .select('name,owner_id')
          .eq('id', nextLead.accepted_business_id)
          .maybeSingle();

        if (business) {
          setPartnerName(user.id === nextLead.customer_id ? business.name : 'Customer');
        }
      }

      const { data: rows, error: messagesError } = await supabase
        .from('gascars_lead_messages')
        .select('id,lead_id,sender_id,recipient_id,body,created_at,seen_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;
      setMessages((rows ?? []) as Message[]);

      await supabase.rpc('gascars_mark_lead_messages_seen', { p_lead_id: leadId });
      setError(null);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Could not load conversation.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [leadId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!leadId || !user) return;
    const supabase = getSupabaseClient();

    const channel = supabase
      .channel('lead-chat-' + leadId + '-' + user.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gascars_lead_messages', filter: 'lead_id=eq.' + leadId },
        async () => {
          await load(true);
          requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [leadId, load, user]);

  async function send() {
    const clean = body.trim();
    if (!clean || !leadId || sending) return;

    setSending(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: sendError } = await supabase.rpc('gascars_send_lead_message', {
        p_lead_id: leadId,
        p_body: clean,
      });
      if (sendError) throw sendError;

      setBody('');
      await load(true);
      void supabase.functions.invoke('gascars-email-worker').catch(() => undefined);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={colors.coral} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>GAS CAR'S CHAT</Text>
            <Text style={styles.title}>{partnerName}</Text>
            <Text style={styles.meta}>{lead?.service || 'Service request'} · {lead?.status.replaceAll('_', ' ')}</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Could not continue</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length ? messages.map((message) => {
            const mine = message.sender_id === user?.id;
            return (
              <View key={message.id} style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirsWrap]}>
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={[styles.body, mine && styles.mineBody]}>{message.body}</Text>
                  <Text style={[styles.time, mine && styles.mineTime]}>
                    {new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    {mine ? (message.seen_at ? ' · Seen' : ' · Sent') : ''}
                  </Text>
                </View>
              </View>
            );
          }) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Start the conversation</Text>
              <Text style={styles.emptyText}>Messages stay inside this accepted service request.</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Write a message..."
            placeholderTextColor="#92958D"
            style={styles.input}
            multiline
            maxLength={2000}
          />
          <Pressable
            disabled={!body.trim() || sending}
            onPress={() => void send()}
            style={({ pressed }) => [styles.sendButton, (!body.trim() || sending || pressed) && { opacity: 0.55 }]}
          >
            {sending ? <ActivityIndicator color={colors.white} /> : <Text style={styles.sendText}>Send</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.ink, fontSize: 28, lineHeight: 30 },
  headerText: { flex: 1 },
  kicker: { color: colors.coral, fontSize: 8.5, fontWeight: '950', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 18, fontWeight: '950', marginTop: 2 },
  meta: { color: colors.muted, fontSize: 9.5, marginTop: 3, textTransform: 'capitalize' },
  errorBox: { width: '100%', maxWidth: 900, alignSelf: 'center', marginHorizontal: 16, borderRadius: 14, backgroundColor: '#FFF0EC', borderWidth: 1, borderColor: '#F0B6A8', padding: 12 },
  errorTitle: { color: colors.ink, fontSize: 10.5, fontWeight: '950' },
  errorText: { color: colors.muted, fontSize: 9.5, marginTop: 3 },
  messages: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 16, paddingBottom: 24 },
  bubbleWrap: { marginBottom: 9, flexDirection: 'row' },
  mineWrap: { justifyContent: 'flex-end' },
  theirsWrap: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10 },
  mine: { backgroundColor: colors.ink, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 6 },
  body: { color: colors.ink, fontSize: 12, lineHeight: 17 },
  mineBody: { color: colors.white },
  time: { color: colors.muted, fontSize: 7.5, marginTop: 5 },
  mineTime: { color: '#BFC2B9' },
  empty: { marginTop: 80, alignItems: 'center', padding: 20 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '950' },
  emptyText: { color: colors.muted, fontSize: 10.5, marginTop: 4 },
  composer: { width: '100%', maxWidth: 900, alignSelf: 'center', flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.background },
  input: { flex: 1, minHeight: 48, maxHeight: 110, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 13, paddingVertical: 12, color: colors.ink, fontSize: 12 },
  sendButton: { width: 74, minHeight: 48, borderRadius: 16, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: colors.white, fontSize: 11, fontWeight: '950' },
});
