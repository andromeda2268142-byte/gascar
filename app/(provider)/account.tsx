import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { getSupabaseClient } from '@/lib/supabase';
import { loadOwnedProviderBusiness, providerTypeLabel, type ProviderBusiness } from '@/lib/provider';
import { useAuth } from '@/providers/auth';

type ProviderReview = {
  id: string;
  rating: number;
  comment: string | null;
  reviewer_name: string;
  service_name: string | null;
  created_at: string;
};

export default function ProviderAccountScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [reviews, setReviews] = useState<ProviderReview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const ownedBusiness = await loadOwnedProviderBusiness(user.id);
      if (!ownedBusiness) {
        router.replace('/business');
        return;
      }

      setBusiness(ownedBusiness);

      const { data: reviewRows, error: reviewError } = await getSupabaseClient()
        .from('gascars_reviews')
        .select('id,rating,comment,reviewer_name,service_name,created_at')
        .eq('business_id', ownedBusiness.id)
        .eq('is_visible', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (reviewError) throw reviewError;
      setReviews((reviewRows ?? []) as ProviderReview[]);
    } catch (error) {
      Alert.alert('Could not load business account', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [router, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!business) return;

    const supabase = getSupabaseClient();
    const channel = supabase
      .channel('provider-reviews-' + business.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gascars_reviews', filter: 'business_id=eq.' + business.id },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [business?.id, load]);

  async function logout() {
    await signOut();
    router.replace('/auth');
  }

  if (loading && !business) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loading}><ActivityIndicator color={colors.coral} /></View>
      </SafeAreaView>
    );
  }

  if (!business) return null;

  const active = business.status === 'active' && business.is_verified;
  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>PROVIDER ACCOUNT</Text>
        <Text style={styles.title}>{business.name}</Text>
        <Text style={styles.subtitle}>This is a provider account, separate from the regular driver experience.</Text>

        <View style={styles.identityCard}>
          <View style={styles.identityTop}>
            <View style={styles.logo}><Text style={styles.logoText}>{business.business_type === 'mechanic' ? '🔧' : business.business_type === 'towing' ? '🚚' : '⚙'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.businessName}>{business.name}</Text>
              <Text style={styles.businessType}>{providerTypeLabel(business.business_type)}</Text>
            </View>
            <View style={[styles.statusPill, active ? styles.statusActive : styles.statusPending]}>
              <Text style={styles.statusText}>{active ? 'ACTIVE' : business.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <InfoRow label="Account email" value={user?.email || '—'} />
          <InfoRow label="Business phone" value={business.phone || '—'} />
          <InfoRow label="Business email" value={business.email || '—'} />
          <InfoRow label="Address" value={[business.address, business.city, business.state, business.zip].filter(Boolean).join(', ') || '—'} />
          <InfoRow label="Service ZIPs" value={(business.service_zips ?? []).join(', ') || business.zip || '—'} />
        </View>

        <View style={styles.reviewsCard}>
          <View style={styles.reviewsHeader}>
            <View>
              <Text style={styles.reviewsKicker}>CUSTOMER REVIEWS</Text>
              <View style={styles.ratingRow}>
                <Text style={styles.ratingValue}>
                  {reviews.length ? averageRating.toFixed(1) : '—'}
                </Text>
                <Text style={styles.ratingStar}>★</Text>
              </View>
              <Text style={styles.ratingCount}>
                {reviews.length === 1 ? '1 completed-service review' : reviews.length + ' completed-service reviews'}
              </Text>
            </View>

            <View style={styles.ratingBadge}>
              <Text style={styles.ratingBadgeText}>
                {reviews.length ? 'VERIFIED JOBS' : 'NO REVIEWS YET'}
              </Text>
            </View>
          </View>

          {reviews.length ? (
            <View style={styles.reviewList}>
              {reviews.slice(0, 4).map((review) => (
                <View key={review.id} style={styles.reviewItem}>
                  <View style={styles.reviewItemTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewerName}>{review.reviewer_name}</Text>
                      <Text style={styles.reviewService}>{review.service_name || 'Completed service'}</Text>
                    </View>
                    <Text style={styles.reviewStars}>
                      {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                    </Text>
                  </View>
                  {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
                  <Text style={styles.reviewDate}>{new Date(review.created_at).toLocaleDateString()}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noReviewsText}>
              Reviews will appear here after customers rate completed jobs.
            </Text>
          )}
        </View>

        <View style={styles.approvalCard}>
          <Text style={styles.approvalTitle}>{active ? 'Provider approved' : 'Provider review required'}</Text>
          <Text style={styles.approvalText}>
            {active
              ? 'This business can receive matched leads based on its services, work mode and coverage.'
              : 'You can finish configuring services while the account is pending, but matched leads stay hidden until approval.'}
          </Text>
        </View>

        <View style={styles.scopeCard}>
          <Text style={styles.scopeTitle}>Provider navigation</Text>
          <Text style={styles.scopeText}>This account does not use the driver Garage or Request Service tabs. Its workspace is focused on leads, services, credits and business operations.</Text>
        </View>

        <Pressable onPress={() => void logout()} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 120 },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '950', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 30, lineHeight: 33, fontWeight: '950', letterSpacing: -1.1, marginTop: 5 },
  subtitle: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 7 },
  identityCard: { marginTop: 20, borderRadius: 21, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 15 },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.violetSoft, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 22 },
  businessName: { color: colors.ink, fontSize: 14, fontWeight: '950' },
  businessType: { color: colors.muted, fontSize: 9.5, marginTop: 3 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusActive: { backgroundColor: colors.limeSoft },
  statusPending: { backgroundColor: colors.sunSoft },
  statusText: { color: colors.ink, fontSize: 7.5, fontWeight: '950' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 13 },
  infoRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EFECE4' },
  infoLabel: { color: colors.muted, fontSize: 8.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { color: colors.ink, fontSize: 11.5, fontWeight: '800', marginTop: 4 },
  reviewsCard: { marginTop: 12, borderRadius: 21, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 15 },
  reviewsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  reviewsKicker: { color: colors.coral, fontSize: 8, fontWeight: '950', letterSpacing: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  ratingValue: { color: colors.ink, fontSize: 30, lineHeight: 34, fontWeight: '950', letterSpacing: -1 },
  ratingStar: { color: '#F5B63D', fontSize: 23 },
  ratingCount: { color: colors.muted, fontSize: 8.5, marginTop: 2 },
  ratingBadge: { borderRadius: 999, backgroundColor: colors.limeSoft, paddingHorizontal: 8, paddingVertical: 5 },
  ratingBadgeText: { color: colors.ink, fontSize: 7, fontWeight: '950', letterSpacing: 0.5 },
  reviewList: { marginTop: 14, gap: 8 },
  reviewItem: { borderRadius: 15, backgroundColor: '#F7F5EF', borderWidth: 1, borderColor: '#ECE8DE', padding: 11 },
  reviewItemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reviewerName: { color: colors.ink, fontSize: 10.5, fontWeight: '950' },
  reviewService: { color: colors.muted, fontSize: 8.2, marginTop: 2 },
  reviewStars: { color: '#F5B63D', fontSize: 12, letterSpacing: 1 },
  reviewComment: { color: colors.ink, fontSize: 9.5, lineHeight: 14, marginTop: 8 },
  reviewDate: { color: '#9B9E96', fontSize: 7.5, marginTop: 6 },
  noReviewsText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 13 },
  approvalCard: { marginTop: 12, borderRadius: 18, backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: '#D9EAB8', padding: 14 },
  approvalTitle: { color: colors.ink, fontSize: 12, fontWeight: '950' },
  approvalText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  scopeCard: { marginTop: 10, borderRadius: 18, backgroundColor: colors.violetSoft, borderWidth: 1, borderColor: '#D8CFF7', padding: 14 },
  scopeTitle: { color: colors.ink, fontSize: 12, fontWeight: '950' },
  scopeText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  signOutButton: { minHeight: 50, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  signOutText: { color: colors.white, fontSize: 12, fontWeight: '950' },
});
