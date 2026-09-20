import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

type Section = 'overview' | 'businesses' | 'services' | 'users' | 'leads' | 'support' | 'finance' | 'audit';

type SystemHealth = {
  ok: boolean;
  negative_wallets: number;
  missing_wallets: number;
  active_unverified: number;
  open_accepted: number;
  accepted_without_business: number;
  expired_open: number;
  leads_without_service: number;
  ledger_mismatch: number;
};

type Dashboard = {
  users: number;
  businesses: number;
  pending_businesses: number;
  active_businesses: number;
  open_leads: number;
  completed_leads: number;
  services: number;
  open_support_tickets: number;
  unlocks: number;
  credits_outstanding: number;
};

type Business = {
  id: string;
  name: string;
  business_type: string;
  status: 'pending' | 'active' | 'suspended';
  is_verified: boolean;
  city: string | null;
  state: string | null;
  zip: string | null;
  created_at: string;
};

type Service = {
  id: string;
  name: string;
  category: 'repair' | 'towing';
  group_name: string | null;
  active: boolean;
  sort_order: number;
};

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: 'driver' | 'business' | 'admin';
  created_at: string | null;
  last_sign_in_at: string | null;
};

type Lead = {
  id: string;
  service: string | null;
  service_location: 'shop' | 'mobile' | 'either';
  status: string;
  zip: string | null;
  issue_description: string;
  created_at: string;
  credit_cost: number;
};

type Ticket = {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'resolved';
  created_at: string;
};

type Wallet = {
  business_id: string;
  balance: number;
  updated_at: string;
};

type CreditPurchase = {
  id: string;
  business_id: string;
  provider: string;
  amount_cents: number;
  credits: number;
  status: string;
  created_at: string;
};

type AuditEntry = {
  id: string;
  actor_id: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
};

const nav: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'businesses', label: 'Businesses', icon: '▦' },
  { id: 'services', label: 'Services', icon: '⚙' },
  { id: 'users', label: 'Users', icon: '●' },
  { id: 'leads', label: 'Leads', icon: '↗' },
  { id: 'support', label: 'Support', icon: '?' },
  { id: 'finance', label: 'Finance', icon: '$' },
  { id: 'audit', label: 'Audit', icon: '≡' },
];

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function Status({ value }: { value: string }) {
  const positive = ['active', 'completed', 'resolved', 'admin'].includes(value);
  const warning = ['pending', 'open', 'in_progress'].includes(value);
  return (
    <View style={[styles.status, positive && styles.statusPositive, warning && styles.statusWarning]}>
      <Text style={styles.statusText}>{value.replaceAll('_', ' ').toUpperCase()}</Text>
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  active,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        active && styles.smallButtonActive,
        danger && styles.smallButtonDanger,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 },
      ]}
    >
      <Text style={[styles.smallButtonText, active && styles.smallButtonTextActive, danger && styles.smallButtonTextDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AdminScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const { user, loading: authLoading, signOut } = useAuth();

  const [section, setSection] = useState<Section>('overview');
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [devAutoConfirm, setDevAutoConfirm] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!user || !isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    setLoading(true);

    try {
      const { data: profile, error: profileError } = await supabase
        .from('gascars_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      if (profile.role !== 'admin') {
        setAuthorized(false);
        return;
      }
      setAuthorized(true);

      const [
        dashboardResult,
        businessesResult,
        servicesResult,
        usersResult,
        leadsResult,
        ticketsResult,
        devStatusResult,
        healthResult,
        walletsResult,
        purchasesResult,
        auditResult,
      ] = await Promise.all([
        supabase.rpc('gascars_admin_dashboard'),
        supabase
          .from('gascars_businesses')
          .select('id,name,business_type,status,is_verified,city,state,zip,created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('gascars_services')
          .select('id,name,category,group_name,active,sort_order')
          .order('sort_order', { ascending: true }),
        supabase.rpc('gascars_admin_list_users'),
        supabase
          .from('gascars_leads')
          .select('id,service,service_location,status,zip,issue_description,created_at,credit_cost')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('gascars_support_tickets')
          .select('id,user_id,subject,status,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.rpc('gascars_admin_dev_status'),
        supabase.rpc('gascars_admin_system_health'),
        supabase
          .from('gascars_wallets')
          .select('business_id,balance,updated_at')
          .order('balance', { ascending: false }),
        supabase
          .from('gascars_credit_purchases')
          .select('id,business_id,provider,amount_cents,credits,status,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('gascars_audit')
          .select('id,actor_id,action,detail,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      const firstError =
        dashboardResult.error ||
        businessesResult.error ||
        servicesResult.error ||
        usersResult.error ||
        leadsResult.error ||
        ticketsResult.error ||
        devStatusResult.error ||
        healthResult.error ||
        walletsResult.error ||
        purchasesResult.error ||
        auditResult.error;

      if (firstError) throw firstError;

      setDashboard((dashboardResult.data ?? null) as Dashboard | null);
      setBusinesses((businessesResult.data ?? []) as Business[]);
      setServices((servicesResult.data ?? []) as Service[]);
      setUsers((usersResult.data ?? []) as AdminUser[]);
      setLeads((leadsResult.data ?? []) as Lead[]);
      setTickets((ticketsResult.data ?? []) as Ticket[]);
      setDevAutoConfirm(Boolean((devStatusResult.data as { auto_confirm_new_users?: boolean } | null)?.auto_confirm_new_users));
      setSystemHealth((healthResult.data ?? null) as SystemHealth | null);
      setWallets((walletsResult.data ?? []) as Wallet[]);
      setPurchases((purchasesResult.data ?? []) as CreditPurchase[]);
      setAuditEntries((auditResult.data ?? []) as AuditEntry[]);
    } catch (error) {
      Alert.alert('Admin portal error', error instanceof Error ? error.message : 'Could not load admin data.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAuthorized(false);
      setLoading(false);
      return;
    }
    void loadAll();
  }, [authLoading, user, loadAll]);

  const healthIssues = useMemo(() => {
    if (!systemHealth) return [] as Array<{ label: string; count: number }>;

    return [
      { label: 'Negative wallets', count: systemHealth.negative_wallets },
      { label: 'Businesses without wallet', count: systemHealth.missing_wallets },
      { label: 'Active but unverified businesses', count: systemHealth.active_unverified },
      { label: 'Open leads already assigned', count: systemHealth.open_accepted },
      { label: 'Accepted jobs without provider', count: systemHealth.accepted_without_business },
      { label: 'Expired leads still open', count: systemHealth.expired_open },
      { label: 'Leads without service ID', count: systemHealth.leads_without_service },
      { label: 'Wallet / ledger mismatches', count: systemHealth.ledger_mismatch },
    ].filter((item) => item.count > 0);
  }, [systemHealth]);

  const filteredBusinesses = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return businesses;
    return businesses.filter((item) =>
      [item.name, item.business_type, item.status, item.city, item.state, item.zip]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [businesses, search]);

  const filteredServices = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return services;
    return services.filter((item) =>
      [item.name, item.category, item.group_name].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [services, search]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter((item) =>
      [item.email, item.display_name, item.role].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [users, search]);

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return leads;
    return leads.filter((item) =>
      [item.service, item.status, item.zip, item.issue_description, item.service_location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [leads, search]);

  async function runAction(
    id: string,
    action: () => Promise<{ error: any }>,
    successMessage?: string,
  ) {
    setWorkingId(id);
    try {
      const { error } = await action();
      if (error) throw error;
      await loadAll();
      if (successMessage) Alert.alert('Updated', successMessage);
    } catch (error) {
      Alert.alert('Action failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorkingId(null);
    }
  }

  async function grantTestCredits(businessId: string) {
    await runAction(
      'credit-' + businessId,
      () => getSupabaseClient().rpc('gascars_admin_grant_credits', {
        p_business_id: businessId,
        p_credits: 10,
        p_reason: 'Admin QA grant',
      }),
      '10 test credits were added.',
    );
  }

  async function toggleDevAutoConfirm() {
    setWorkingId('dev-auto-confirm');
    try {
      const { error } = await getSupabaseClient().rpc('gascars_admin_set_dev_auto_confirm', {
        p_enabled: !devAutoConfirm,
      });
      if (error) throw error;
      await loadAll();
    } catch (error) {
      Alert.alert('Could not change test mode', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorkingId(null);
    }
  }

  async function logout() {
    await signOut();
    router.replace('/auth');
  }

  if (authLoading || (loading && authorized === null)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={colors.coral} /></View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerCard}>
          <Text style={styles.kicker}>ADMIN</Text>
          <Text style={styles.deniedTitle}>Sign in required</Text>
          <Text style={styles.deniedText}>Use an authorized Gas Car’s administrator account.</Text>
          <SmallButton label="Sign in" active onPress={() => router.replace('/auth')} />
        </View>
      </SafeAreaView>
    );
  }

  if (authorized === false) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerCard}>
          <Text style={styles.kicker}>ADMIN</Text>
          <Text style={styles.deniedTitle}>Access denied</Text>
          <Text style={styles.deniedText}>This account does not have administrator privileges.</Text>
          <SmallButton label="Back to app" active onPress={() => router.replace('/(tabs)/profile')} />
        </View>
      </SafeAreaView>
    );
  }

  const sidebar = (
    <View style={[styles.sidebar, desktop ? styles.sidebarDesktop : styles.mobileNav]}>
      {desktop ? (
        <>
          <View style={styles.adminBrand}>
            <View style={styles.adminLogo}><Text style={styles.adminLogoText}>GC</Text></View>
            <View>
              <Text style={styles.adminBrandName}>Gas Car's</Text>
              <Text style={styles.adminBrandSub}>Admin Console</Text>
            </View>
          </View>
          <View style={styles.navStack}>
            {nav.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  setSection(item.id);
                  setSearch('');
                }}
                style={[styles.navItem, section === item.id && styles.navItemActive]}
              >
                <Text style={[styles.navIcon, section === item.id && styles.navTextActive]}>{item.icon}</Text>
                <Text style={[styles.navText, section === item.id && styles.navTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.sidebarBottom}>
            <Text style={styles.adminEmail} numberOfLines={1}>{user.email}</Text>
            <Pressable onPress={() => router.replace('/(tabs)/profile')}><Text style={styles.sidebarLink}>Open app</Text></Pressable>
            <Pressable onPress={() => void logout()}><Text style={[styles.sidebarLink, { color: '#FF9B86' }]}>Sign out</Text></Pressable>
          </View>
        </>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileNavContent}>
          {nav.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                setSection(item.id);
                setSearch('');
              }}
              style={[styles.mobileChip, section === item.id && styles.mobileChipActive]}
            >
              <Text style={[styles.mobileChipText, section === item.id && styles.mobileChipTextActive]}>{item.icon} {item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const overview = (
    <View>
      <View style={styles.metricGrid}>
        {[
          ['Users', dashboard?.users ?? 0, 'Registered accounts'],
          ['Businesses', dashboard?.businesses ?? 0, (dashboard?.pending_businesses ?? 0) + ' pending review'],
          ['Open leads', dashboard?.open_leads ?? 0, (dashboard?.completed_leads ?? 0) + ' completed'],
          ['Active services', dashboard?.services ?? 0, 'Marketplace catalog'],
          ['Lead unlocks', dashboard?.unlocks ?? 0, 'Paid/unlocked leads'],
          ['Support', dashboard?.open_support_tickets ?? 0, 'Open tickets'],
        ].map(([label, value, detail]) => (
          <View key={String(label)} style={[styles.metricCard, desktop && styles.metricCardDesktop]}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={styles.metricValue}>{value}</Text>
            <Text style={styles.metricDetail}>{detail}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Operations</Text>
      <View style={styles.opsGrid}>
        <Pressable onPress={() => setSection('businesses')} style={styles.opsCard}>
          <Text style={styles.opsIcon}>▦</Text>
          <Text style={styles.opsTitle}>Business approvals</Text>
          <Text style={styles.opsText}>Review pending providers, approve legitimate businesses, or suspend access.</Text>
        </Pressable>
        <Pressable onPress={() => setSection('services')} style={styles.opsCard}>
          <Text style={styles.opsIcon}>⚙</Text>
          <Text style={styles.opsTitle}>Service catalog</Text>
          <Text style={styles.opsText}>Control which services can be selected and matched to providers.</Text>
        </Pressable>
        <Pressable onPress={() => setSection('leads')} style={styles.opsCard}>
          <Text style={styles.opsIcon}>↗</Text>
          <Text style={styles.opsTitle}>Lead operations</Text>
          <Text style={styles.opsText}>Inspect requests and correct statuses when support or disputes require it.</Text>
        </Pressable>
        <Pressable onPress={() => setSection('support')} style={styles.opsCard}>
          <Text style={styles.opsIcon}>?</Text>
          <Text style={styles.opsTitle}>Customer support</Text>
          <Text style={styles.opsText}>Track open issues and resolve support tickets.</Text>
        </Pressable>
      </View>

      <View style={styles.testLabCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.testLabKicker}>DEVELOPMENT TEST LAB</Text>
          <Text style={styles.testLabTitle}>Email auto-confirm is {devAutoConfirm ? 'ON' : 'OFF'}</Text>
          <Text style={styles.testLabText}>
            {devAutoConfirm
              ? 'New test accounts can sign in immediately without opening verification emails. Keep this enabled only in the temporary development backend.'
              : 'New accounts must complete normal email verification.'}
          </Text>
        </View>
        <SmallButton
          label={devAutoConfirm ? 'Disable' : 'Enable'}
          active={!devAutoConfirm}
          danger={devAutoConfirm}
          disabled={workingId === 'dev-auto-confirm'}
          onPress={() => void toggleDevAutoConfirm()}
        />
      </View>

      <View style={[styles.healthCard, systemHealth?.ok ? styles.healthGood : styles.healthBad]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.healthKicker}>AUTOMATED SYSTEM CHECKS</Text>
          <Text style={styles.healthTitle}>{systemHealth?.ok ? 'All critical checks passed' : 'Issues need attention'}</Text>
          <Text style={styles.healthText}>
            {systemHealth?.ok
              ? 'Wallets, lead ownership, provider verification and ledger balances are internally consistent.'
              : healthIssues.map((item) => item.label + ': ' + item.count).join(' · ') || 'Run Refresh to check the current backend state.'}
          </Text>
        </View>
        <View style={[styles.healthBadge, systemHealth?.ok ? styles.healthBadgeGood : styles.healthBadgeBad]}>
          <Text style={styles.healthBadgeText}>{systemHealth?.ok ? 'PASS' : String(healthIssues.length)}</Text>
        </View>
      </View>

      <View style={styles.securityCard}>
        <Text style={styles.securityTitle}>Admin actions are server-protected</Text>
        <Text style={styles.securityText}>
          Approval, role, service and lead-status changes go through admin-only Supabase functions and are written to the audit log.
        </Text>
      </View>
    </View>
  );

  const businessesView = (
    <View style={styles.listGap}>
      {filteredBusinesses.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyTitle}>No businesses yet</Text><Text style={styles.emptyText}>New provider applications will appear here.</Text></View>
      ) : filteredBusinesses.map((business) => (
        <View key={business.id} style={styles.rowCard}>
          <View style={styles.rowMain}>
            <View style={{ flex: 1 }}>
              <View style={styles.rowTitleLine}>
                <Text style={styles.rowTitle}>{business.name}</Text>
                <Status value={business.status} />
              </View>
              <Text style={styles.rowMeta}>
                {business.business_type} · {[business.city, business.state, business.zip].filter(Boolean).join(' ') || 'Location not set'} · {formatDate(business.created_at)}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <SmallButton
              label="Approve"
              active={business.status === 'active'}
              disabled={workingId === business.id || business.status === 'active'}
              onPress={() => void runAction(
                business.id,
                () => getSupabaseClient().rpc('gascars_admin_set_business_status', { p_business_id: business.id, p_status: 'active' }),
                business.name + ' is now approved and can receive matched leads.',
              )}
            />
            <SmallButton
              label="Pending"
              active={business.status === 'pending'}
              disabled={workingId === business.id || business.status === 'pending'}
              onPress={() => void runAction(
                business.id,
                () => getSupabaseClient().rpc('gascars_admin_set_business_status', { p_business_id: business.id, p_status: 'pending' }),
                business.name + ' is pending review.',
              )}
            />
            <SmallButton
              label="Suspend"
              danger
              disabled={workingId === business.id || business.status === 'suspended'}
              onPress={() => void runAction(
                business.id,
                () => getSupabaseClient().rpc('gascars_admin_set_business_status', { p_business_id: business.id, p_status: 'suspended' }),
                business.name + ' has been suspended.',
              )}
            />
          </View>
        </View>
      ))}
    </View>
  );

  const servicesView = (
    <View style={styles.listGap}>
      {filteredServices.map((service) => (
        <View key={service.id} style={styles.rowCard}>
          <View style={styles.rowTitleLine}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{service.name}</Text>
              <Text style={styles.rowMeta}>{service.group_name || 'Service'} · {service.category}</Text>
            </View>
            <Status value={service.active ? 'active' : 'disabled'} />
          </View>
          <View style={styles.actions}>
            <SmallButton
              label={service.active ? 'Disable' : 'Enable'}
              active={!service.active}
              danger={service.active}
              disabled={workingId === service.id}
              onPress={() => void runAction(service.id, () => getSupabaseClient().rpc('gascars_admin_set_service_active', { p_service_id: service.id, p_active: !service.active }))}
            />
          </View>
        </View>
      ))}
    </View>
  );

  const usersView = (
    <View style={styles.listGap}>
      {filteredUsers.map((item) => (
        <View key={item.id} style={styles.rowCard}>
          <View style={styles.rowTitleLine}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.display_name || item.email}</Text>
              <Text style={styles.rowMeta}>{item.email} · Joined {formatDate(item.created_at)} · Last sign-in {formatDate(item.last_sign_in_at)}</Text>
            </View>
            <Status value={item.role} />
          </View>
          <View style={styles.actions}>
            {(['driver','business','admin'] as const).map((role) => (
              <SmallButton
                key={role}
                label={role}
                active={item.role === role}
                disabled={workingId === item.id || (item.id === user.id && role !== 'admin')}
                onPress={() => void runAction(item.id, () => getSupabaseClient().rpc('gascars_admin_set_user_role', { p_user_id: item.id, p_role: role }))}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );

  const leadsView = (
    <View style={styles.listGap}>
      {filteredLeads.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyTitle}>No leads yet</Text><Text style={styles.emptyText}>Customer service requests will appear here.</Text></View>
      ) : filteredLeads.map((lead) => (
        <View key={lead.id} style={styles.rowCard}>
          <View style={styles.rowTitleLine}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{lead.service || 'Unspecified service'}</Text>
              <Text style={styles.rowMeta}>ZIP {lead.zip || '—'} · {lead.service_location} · {lead.credit_cost} credits · {formatDate(lead.created_at)}</Text>
            </View>
            <Status value={lead.status} />
          </View>
          <Text style={styles.bodyText}>{lead.issue_description}</Text>
          <View style={styles.actions}>
            {['open','in_progress','completed','closed','cancelled'].map((status) => (
              <SmallButton
                key={status}
                label={status.replaceAll('_',' ')}
                active={lead.status === status}
                disabled={workingId === lead.id}
                onPress={() => void runAction(lead.id, () => getSupabaseClient().rpc('gascars_admin_set_lead_status', { p_lead_id: lead.id, p_status: status }))}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );

  const supportView = (
    <View style={styles.listGap}>
      {tickets.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyTitle}>No support tickets</Text><Text style={styles.emptyText}>Open customer and provider issues will appear here.</Text></View>
      ) : tickets.map((ticket) => (
        <View key={ticket.id} style={styles.rowCard}>
          <View style={styles.rowTitleLine}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{ticket.subject}</Text>
              <Text style={styles.rowMeta}>Opened {formatDate(ticket.created_at)} · User {ticket.user_id.slice(0,8)}</Text>
            </View>
            <Status value={ticket.status} />
          </View>
          <View style={styles.actions}>
            <SmallButton
              label="Open"
              active={ticket.status === 'open'}
              disabled={workingId === ticket.id}
              onPress={() => void runAction(ticket.id, () => getSupabaseClient().rpc('gascars_admin_set_ticket_status', { p_ticket_id: ticket.id, p_status: 'open' }))}
            />
            <SmallButton
              label="Resolve"
              active={ticket.status === 'resolved'}
              disabled={workingId === ticket.id}
              onPress={() => void runAction(ticket.id, () => getSupabaseClient().rpc('gascars_admin_set_ticket_status', { p_ticket_id: ticket.id, p_status: 'resolved' }))}
            />
          </View>
        </View>
      ))}
    </View>
  );


  const financeView = (
    <View style={styles.listGap}>
      <View style={styles.rowCard}>
        <Text style={styles.rowTitle}>Credit system</Text>
        <Text style={styles.rowMeta}>
          Outstanding credits: {dashboard?.credits_outstanding ?? 0} · Purchases recorded: {purchases.length}
        </Text>
        <Text style={styles.bodyText}>
          Development grants and test purchases use the same wallet ledger that production Stripe purchases will use.
        </Text>
      </View>

      {businesses.map((business) => {
        const wallet = wallets.find((item) => item.business_id === business.id);
        return (
          <View key={business.id} style={styles.rowCard}>
            <View style={styles.rowTitleLine}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{business.name}</Text>
                <Text style={styles.rowMeta}>{business.business_type} · {business.status}</Text>
              </View>
              <View style={styles.financeBalance}>
                <Text style={styles.financeBalanceValue}>{wallet?.balance ?? 0}</Text>
                <Text style={styles.financeBalanceLabel}>credits</Text>
              </View>
            </View>
            <View style={styles.actions}>
              <SmallButton
                label="+10 test credits"
                active
                disabled={workingId === 'credit-' + business.id}
                onPress={() => void grantTestCredits(business.id)}
              />
            </View>
          </View>
        );
      })}

      {purchases.slice(0, 20).map((purchase) => {
        const business = businesses.find((item) => item.id === purchase.business_id);
        return (
          <View key={purchase.id} style={styles.rowCard}>
            <View style={styles.rowTitleLine}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{business?.name || 'Provider purchase'}</Text>
                <Text style={styles.rowMeta}>
                  {purchase.provider} · {'$' + (purchase.amount_cents / 100).toFixed(2)} · {formatDate(purchase.created_at)}
                </Text>
              </View>
              <Status value={purchase.status} />
            </View>
            <Text style={styles.bodyText}>+{purchase.credits} credits</Text>
          </View>
        );
      })}
    </View>
  );

  const auditView = (
    <View style={styles.listGap}>
      {auditEntries.length ? auditEntries.map((entry) => (
        <View key={entry.id} style={styles.rowCard}>
          <Text style={styles.rowTitle}>{entry.action}</Text>
          <Text style={styles.rowMeta}>
            {formatDate(entry.created_at)} · Actor {entry.actor_id?.slice(0, 8) || 'system'}
          </Text>
          <Text style={styles.auditDetail}>{JSON.stringify(entry.detail)}</Text>
        </View>
      )) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No audit activity</Text>
          <Text style={styles.emptyText}>Administrative and privileged provider actions will appear here.</Text>
        </View>
      )}
    </View>
  );

  const body =
    section === 'overview' ? overview :
    section === 'businesses' ? businessesView :
    section === 'services' ? servicesView :
    section === 'users' ? usersView :
    section === 'leads' ? leadsView :
    section === 'support' ? supportView :
    section === 'finance' ? financeView :
    auditView;

  const searchable = !['overview', 'support', 'finance', 'audit'].includes(section);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={[styles.shell, desktop && styles.shellDesktop]}>
        {sidebar}
        <View style={styles.main}>
          <ScrollView
            contentContainerStyle={[styles.mainContent, desktop && styles.mainContentDesktop]}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} />}
            showsVerticalScrollIndicator={false}
          >
            {!desktop ? (
              <View style={styles.mobileTop}>
                <View>
                  <Text style={styles.kicker}>GAS CAR'S ADMIN</Text>
                  <Text style={styles.mobileTitle}>{nav.find((item) => item.id === section)?.label}</Text>
                </View>
                <Pressable onPress={() => router.replace('/(tabs)/profile')} style={styles.appButton}>
                  <Text style={styles.appButtonText}>App</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.pageHeader}>
                <View>
                  <Text style={styles.kicker}>ADMIN CONTROL CENTER</Text>
                  <Text style={styles.pageTitle}>{nav.find((item) => item.id === section)?.label}</Text>
                </View>
                <Pressable onPress={() => void loadAll()} style={styles.refreshButton}>
                  <Text style={styles.refreshText}>Refresh</Text>
                </Pressable>
              </View>
            )}

            {searchable ? (
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={'Search ' + section + '...'}
                  placeholderTextColor="#999B94"
                  style={styles.searchInput}
                />
                {search ? <Pressable onPress={() => setSearch('')}><Text style={styles.clear}>×</Text></Pressable> : null}
              </View>
            ) : null}

            {loading && authorized ? (
              <View style={styles.inlineLoading}><ActivityIndicator color={colors.coral} /></View>
            ) : body}

            {!desktop ? (
              <View style={styles.mobileFooter}>
                <Text style={styles.adminEmail}>{user.email}</Text>
                <Pressable onPress={() => void logout()}><Text style={styles.mobileLogout}>Sign out</Text></Pressable>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F3EB' },
  shell: { flex: 1 },
  shellDesktop: { flexDirection: 'row' },
  sidebar: { backgroundColor: '#20231E' },
  sidebarDesktop: { width: 230, minWidth: 230 },
  mobileNav: { minHeight: 56 },
  mobileNavContent: { paddingHorizontal: 12, paddingVertical: 9, gap: 7 },
  mobileChip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 13, backgroundColor: '#30342D', justifyContent: 'center' },
  mobileChipActive: { backgroundColor: colors.lime },
  mobileChipText: { color: '#C8CAC3', fontSize: 10.5, fontWeight: '900' },
  mobileChipTextActive: { color: colors.ink },
  adminBrand: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 20, paddingTop: 24 },
  adminLogo: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' },
  adminLogoText: { color: colors.white, fontSize: 12, fontWeight: '950' },
  adminBrandName: { color: colors.white, fontSize: 14, fontWeight: '950' },
  adminBrandSub: { color: '#9EA198', fontSize: 9, marginTop: 2 },
  navStack: { paddingHorizontal: 12, gap: 5 },
  navItem: { minHeight: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13 },
  navItemActive: { backgroundColor: '#34382F' },
  navIcon: { width: 20, color: '#A8AAA3', fontSize: 15, fontWeight: '900' },
  navText: { color: '#BFC1BA', fontSize: 11.5, fontWeight: '800' },
  navTextActive: { color: colors.lime },
  sidebarBottom: { marginTop: 'auto', padding: 20, gap: 10 },
  adminEmail: { color: '#9EA198', fontSize: 9.5 },
  sidebarLink: { color: colors.white, fontSize: 11, fontWeight: '800' },
  main: { flex: 1 },
  mainContent: { padding: 16, paddingBottom: 50 },
  mainContentDesktop: { width: '100%', maxWidth: 1220, alignSelf: 'center', padding: 30 },
  mobileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  mobileTitle: { color: colors.ink, fontSize: 27, fontWeight: '950', marginTop: 3, letterSpacing: -1 },
  appButton: { minWidth: 54, height: 38, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  appButtonText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  pageTitle: { color: colors.ink, fontSize: 34, fontWeight: '950', letterSpacing: -1.4, marginTop: 4 },
  kicker: { color: colors.coral, fontSize: 9.5, fontWeight: '950', letterSpacing: 1.4 },
  refreshButton: { height: 42, paddingHorizontal: 15, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  searchBox: { minHeight: 50, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 16 },
  searchIcon: { color: colors.muted, fontSize: 21, marginRight: 8 },
  searchInput: { flex: 1, minHeight: 48, color: colors.ink, fontSize: 12.5, fontWeight: '700' },
  clear: { color: colors.muted, fontSize: 24 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flexGrow: 1, minWidth: 145, flexBasis: '45%', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 19, padding: 15 },
  metricCardDesktop: { flexBasis: '30%' },
  metricLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  metricValue: { color: colors.ink, fontSize: 28, fontWeight: '950', marginTop: 8 },
  metricDetail: { color: colors.muted, fontSize: 9.5, marginTop: 3 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '950', marginTop: 25, marginBottom: 11 },
  opsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  opsCard: { flexGrow: 1, flexBasis: '45%', minWidth: 220, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 19, padding: 16 },
  opsIcon: { color: colors.coral, fontSize: 22, fontWeight: '900' },
  opsTitle: { color: colors.ink, fontSize: 13, fontWeight: '950', marginTop: 10 },
  opsText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  testLabCard: { backgroundColor: colors.violetSoft, borderRadius: 18, padding: 15, marginTop: 16, borderWidth: 1, borderColor: '#D8CFF7', flexDirection: 'row', alignItems: 'center', gap: 12 },
  testLabKicker: { color: colors.violet, fontSize: 8.5, fontWeight: '950', letterSpacing: 1 },
  testLabTitle: { color: colors.ink, fontSize: 12.5, fontWeight: '950', marginTop: 4 },
  testLabText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  healthCard: { borderRadius: 18, padding: 15, marginTop: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  healthGood: { backgroundColor: colors.limeSoft, borderColor: '#D9EAB8' },
  healthBad: { backgroundColor: '#FFF0EC', borderColor: '#F0B6A8' },
  healthKicker: { color: colors.muted, fontSize: 8.5, fontWeight: '950', letterSpacing: 0.9 },
  healthTitle: { color: colors.ink, fontSize: 12.5, fontWeight: '950', marginTop: 4 },
  healthText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  healthBadge: { minWidth: 48, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  healthBadgeGood: { backgroundColor: colors.ink },
  healthBadgeBad: { backgroundColor: colors.coral },
  healthBadgeText: { color: colors.white, fontSize: 9, fontWeight: '950' },
  securityCard: { backgroundColor: colors.limeSoft, borderRadius: 18, padding: 15, marginTop: 16, borderWidth: 1, borderColor: '#D9EAB8' },
  securityTitle: { color: colors.ink, fontSize: 12, fontWeight: '950' },
  securityText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  listGap: { gap: 10 },
  rowCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 14 },
  rowMain: { flexDirection: 'row' },
  rowTitleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowTitle: { color: colors.ink, fontSize: 13.5, fontWeight: '950' },
  rowMeta: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  financeBalance: { minWidth: 70, borderRadius: 14, backgroundColor: colors.limeSoft, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' },
  financeBalanceValue: { color: colors.ink, fontSize: 15, fontWeight: '950' },
  financeBalanceLabel: { color: colors.muted, fontSize: 7.5, marginTop: 1 },
  auditDetail: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 8 },
  bodyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 10 },
  status: { alignSelf: 'flex-start', backgroundColor: '#EEECE5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusPositive: { backgroundColor: colors.limeSoft },
  statusWarning: { backgroundColor: colors.sunSoft },
  statusText: { color: colors.ink, fontSize: 7.5, fontWeight: '950', letterSpacing: 0.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  smallButton: { minHeight: 34, borderRadius: 11, backgroundColor: '#EEECE5', paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  smallButtonActive: { backgroundColor: colors.ink },
  smallButtonDanger: { backgroundColor: '#FFF0EC' },
  smallButtonText: { color: colors.ink, fontSize: 9.5, fontWeight: '900', textTransform: 'capitalize' },
  smallButtonTextActive: { color: colors.white },
  smallButtonTextDanger: { color: '#C14D37' },
  empty: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 20 },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: '950' },
  emptyText: { color: colors.muted, fontSize: 10, marginTop: 4 },
  inlineLoading: { paddingVertical: 40, alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerCard: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', padding: 30, maxWidth: 480 },
  deniedTitle: { color: colors.ink, fontSize: 30, fontWeight: '950', marginTop: 6 },
  deniedText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginVertical: 16 },
  mobileFooter: { marginTop: 28, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mobileLogout: { color: colors.coral, fontSize: 10.5, fontWeight: '900' },
});
