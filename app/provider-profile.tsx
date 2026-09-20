import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { getSupabaseClient } from '@/lib/supabase';

type BusinessProfile = {
  id: string;
  name: string;
  business_type: 'mechanic' | 'towing' | 'parts';
  city: string | null;
  state: string | null;
  is_verified: boolean;
  status: string;
};

type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  reviewer_name: string;
  service_name: string | null;
  created_at: string;
};

export default function ProviderProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ businessId?: string | string[] }>();
  const businessId = Array.isArray(params.businessId) ? params.businessId[0] : params.businessId;

  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [serviceModes, setServiceModes] = useState<string[]>([]);
  const [completedJobs, setCompletedJobs] = useState(0);
  const [publicAverage, setPublicAverage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) {
      setLoading(false);
      return;
    }

    let active = true;

    async function load() {
      setLoading(true);
      const supabase = getSupabaseClient();

      const [businessResult, reviewsResult, offeringsResult, statsResult] = await Promise.all([
        supabase
          .from('gascars_businesses')
          .select('id,name,business_type,city,state,is_verified,status')
          .eq('id', businessId)
          .single(),
        supabase
          .from('gascars_reviews')
          .select('id,rating,comment,reviewer_name,service_name,created_at')
          .eq('business_id', businessId)
          .eq('is_visible', true)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('gascars_business_services')
          .select('service_id,service_mode')
          .eq('business_id', businessId)
          .eq('active', true),
        supabase.rpc('gascars_provider_public_stats', { p_business_id: businessId }),
      ]);

      if (!active) return;

      if (!businessResult.error) {
        setBusiness(businessResult.data as BusinessProfile);
      }

      if (!reviewsResult.error) {
        setReviews((reviewsResult.data ?? []) as PublicReview[]);
      }

      const offerings = offeringsResult.data ?? [];
      const serviceIds = offerings.map((row) => row.service_id);
      if (!offeringsResult.error) {
        const modes = Array.from(new Set(
          offerings
            .map((row) => row.service_mode)
            .filter((mode): mode is string => Boolean(mode)),
        ));
        setServiceModes(modes);
      }

      if (!statsResult.error) {
        const stats = Array.isArray(statsResult.data) ? statsResult.data[0] : statsResult.data;
        setCompletedJobs(Number(stats?.completed_jobs ?? 0));
        setPublicAverage(stats?.average_rating == null ? null : Number(stats.average_rating));
      }

      if (!offeringsResult.error && serviceIds.length) {
        const { data: serviceRows } = await supabase
          .from('gascars_services')
          .select('name')
          .in('id', serviceIds)
          .eq('active', true)
          .order('name', { ascending: true })
          .limit(12);

        if (active) setServices((serviceRows ?? []).map((row) => row.name));
      }

      if (active) setLoading(false);
    }

    void load();

    const supabase = getSupabaseClient();
    const channel = supabase
      .channel('public-provider-reviews-' + businessId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gascars_reviews', filter: 'business_id=eq.' + businessId },
        () => void load(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [businessId]);

  const average = useMemo(
    () => publicAverage ?? (reviews.length
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0),
    [publicAverage, reviews],
  );

  const modeLabels = useMemo(() => {
    const labels = new Set<string>();
    for (const mode of serviceModes) {
      if (mode === 'mobile') labels.add('Mobile service');
      else if (mode === 'shop') labels.add('Shop service');
      else if (mode === 'both') {
        labels.add('Mobile service');
        labels.add('Shop service');
      }
    }
    return Array.from(labels);
  }, [serviceModes]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}><ActivityIndicator color={colors.coral} /></View>
      </SafeAreaView>
    );
  }

  if (!business) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <Text style={styles.emptyTitle}>Provider profile unavailable</Text>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const location = [business.city, business.state].filter(Boolean).join(', ');
  const typeLabel = business.business_type === 'mechanic'
    ? 'Auto repair provider'
    : business.business_type === 'towing'
      ? 'Towing & roadside provider'
      : 'Auto parts provider';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>
              {business.business_type === 'mechanic' ? '🔧' : business.business_type === 'towing' ? '🚚' : '⚙'}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{business.name}</Text>
              {business.is_verified && business.status === 'active' ? (
                <View style={styles.verified}>
                  <Text style={styles.verifiedText}>✓ VERIFIED</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.type}>{typeLabel}{location ? ' · ' + location : ''}</Text>
          </View>
        </View>

        <View style={styles.ratingCard}>
          <View style={styles.ratingMain}>
            <Text style={styles.ratingKicker}>GAS CAR'S REPUTATION</Text>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingValue}>{reviews.length ? average.toFixed(1) : '—'}</Text>
              <Text style={styles.ratingStar}>★</Text>
            </View>
            <Text style={styles.ratingCount}>
              {reviews.length
                ? reviews.length + (reviews.length === 1 ? ' verified review' : ' verified reviews')
                : 'No reviews yet'}
            </Text>
          </View>
          <View style={styles.jobStat}>
            <Text style={styles.jobStatValue}>{completedJobs}</Text>
            <Text style={styles.jobStatLabel}>JOBS COMPLETED</Text>
          </View>
        </View>

        {modeLabels.length ? (
          <View style={styles.modeRow}>
            {modeLabels.map((mode) => (
              <View key={mode} style={styles.modeBadge}>
                <Text style={styles.modeBadgeText}>✓ {mode}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {services.length ? (
          <>
            <Text style={styles.sectionTitle}>Services</Text>
            <View style={styles.serviceChips}>
              {services.map((service) => (
                <View key={service} style={styles.serviceChip}>
                  <Text style={styles.serviceChipText}>{service}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Reviews</Text>

        {reviews.length ? (
          <View style={styles.reviewList}>
            {reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reviewer}>{review.reviewer_name}</Text>
                    <Text style={styles.reviewService}>{review.service_name || 'Completed service'}</Text>
                  </View>
                  <Text style={styles.stars}>
                    {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                  </Text>
                </View>
                {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
                <Text style={styles.reviewDate}>{new Date(review.created_at).toLocaleDateString()}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.noReviews}>
            <Text style={styles.emptyTitle}>No reviews yet</Text>
            <Text style={styles.emptyText}>Ratings appear after verified Gas Car's jobs are completed.</Text>
          </View>
        )}

        <View style={styles.safetyNote}>
          <Text style={styles.safetyTitle}>Gas Car's verified reviews</Text>
          <Text style={styles.safetyText}>
            A customer can review a provider only after that provider completed the service request in Gas Car's.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, paddingBottom: 60 },
  back: { alignSelf: 'flex-start', minHeight: 38, justifyContent: 'center', marginBottom: 8 },
  backText: { color: colors.coral, fontSize: 11, fontWeight: '950' },
  backButton: { minHeight: 42, borderRadius: 13, backgroundColor: colors.ink, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  backButtonText: { color: colors.lime, fontSize: 10, fontWeight: '950' },
  hero: { flexDirection: 'row', gap: 13, alignItems: 'center', borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 16 },
  logo: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.violetSoft, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 25 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  name: { color: colors.ink, fontSize: 22, lineHeight: 25, fontWeight: '950', letterSpacing: -0.6 },
  type: { color: colors.muted, fontSize: 9.5, marginTop: 5 },
  verified: { borderRadius: 999, backgroundColor: colors.limeSoft, paddingHorizontal: 7, paddingVertical: 4 },
  verifiedText: { color: colors.ink, fontSize: 6.8, fontWeight: '950', letterSpacing: 0.5 },
  ratingCard: { marginTop: 10, borderRadius: 20, backgroundColor: colors.ink, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  ratingMain: { flex: 1 },
  jobStat: { alignItems: 'flex-end', paddingLeft: 10 },
  jobStatValue: { color: colors.white, fontSize: 27, lineHeight: 31, fontWeight: '950' },
  jobStatLabel: { color: colors.lime, fontSize: 6.8, fontWeight: '950', letterSpacing: 0.7, marginTop: 2 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  modeBadge: { borderRadius: 999, backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: '#D8E9B7', paddingHorizontal: 10, paddingVertical: 7 },
  modeBadgeText: { color: colors.ink, fontSize: 8.5, fontWeight: '950' },
  ratingKicker: { color: colors.lime, fontSize: 8, fontWeight: '950', letterSpacing: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  ratingValue: { color: colors.white, fontSize: 35, lineHeight: 40, fontWeight: '950' },
  ratingStar: { color: '#F5B63D', fontSize: 25 },
  ratingCount: { color: '#B9BBB5', fontSize: 8.5, marginTop: 1 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '950', marginTop: 22, marginBottom: 10 },
  serviceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  serviceChip: { borderRadius: 999, backgroundColor: '#ECE9E0', paddingHorizontal: 10, paddingVertical: 7 },
  serviceChipText: { color: colors.ink, fontSize: 8.5, fontWeight: '900' },
  reviewList: { gap: 8 },
  reviewCard: { borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 13 },
  reviewTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reviewer: { color: colors.ink, fontSize: 11.5, fontWeight: '950' },
  reviewService: { color: colors.muted, fontSize: 8.5, marginTop: 3 },
  stars: { color: '#F5B63D', fontSize: 12, letterSpacing: 1 },
  comment: { color: colors.ink, fontSize: 10.5, lineHeight: 16, marginTop: 10 },
  reviewDate: { color: '#9B9E96', fontSize: 7.5, marginTop: 7 },
  noReviews: { borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 16 },
  emptyTitle: { color: colors.ink, fontSize: 12, fontWeight: '950' },
  emptyText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 4, textAlign: 'center' },
  safetyNote: { marginTop: 14, borderRadius: 17, backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: '#D8E9B7', padding: 13 },
  safetyTitle: { color: colors.ink, fontSize: 10.5, fontWeight: '950' },
  safetyText: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
});
