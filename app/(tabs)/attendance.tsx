import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';

export default function AttendanceScreen() {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');
  const router = useRouter();

  const handleCalendarPress = useCallback(() => {
    router.push('/(tabs)/schedule-view');
  }, [router]);

  type AttendanceRecord = {
    id: string;
    created_at: string;
    verified: boolean;
    method: string;
    user_id: string;
    verified_at: string | null;
    verified_by: string | null;
    user?: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  };

  const [filter, setFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState<string>(''); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>('');     // YYYY-MM-DD
  const [showDateModal, setShowDateModal] = useState(false);
  const [datePickTarget, setDatePickTarget] = useState<'from' | 'to'>('from');
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => { const d = new Date(); d.setDate(1); return d; });

  const PAGE_SIZE = 25;

  const fetchPage = useCallback(async (pageIndex: number, reset: boolean = false) => {
    try {
      if (reset) setLoading(true);
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let select = 'id, created_at, verified, method, user_id, verified_at, verified_by';
      if (isAdmin) {
        select += ', user:user_profiles!attendance_records_user_id_fkey(id, first_name, last_name, email)';
      }
      let query = supabase
        .from('attendance_records')
        .select(select)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (!isAdmin && profile?.id) {
        query = query.eq('user_id', profile.id);
      }
      if (filter === 'verified') query = query.eq('verified', true);
      if (filter === 'unverified') query = query.eq('verified', false);

      // Date range filter
      if (dateFrom) {
        query = query.gte('created_at', new Date(`${dateFrom}T00:00:00`).toISOString());
      }
      if (dateTo) {
        query = query.lte('created_at', new Date(`${dateTo}T23:59:59.999`).toISOString());
      }

      // Search filter (admin only): filter by user name or email by resolving user IDs
      if (isAdmin && searchTerm.trim()) {
        const term = searchTerm.trim();
        try {
          const { data: users, error: uerr } = await supabase
            .from('user_profiles')
            .select('id')
            .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
          if (uerr) throw uerr;
          const ids = (users || []).map((u: any) => u.id);
          if (ids.length > 0) {
            query = query.in('user_id', ids);
          } else {
            // No matches; short-circuit result
            setHasMore(false);
            if (reset) setRecords([]);
            return;
          }
        } catch (e) {
          console.warn('[Attendance] user filter failed', e);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as AttendanceRecord[];
      setHasMore(rows.length === PAGE_SIZE);
      if (reset) setRecords(rows);
      else setRecords(prev => [...prev, ...rows]);
    } catch (e) {
      console.error('Failed to fetch attendance list', e);
    } finally {
      if (reset) setLoading(false);
    }
  }, [filter, isAdmin, profile?.id, searchTerm, dateFrom, dateTo]);

  useEffect(() => {
    setRecords([]);
    setPage(0);
    setHasMore(true);
    fetchPage(0, true);
  }, [fetchPage]);

  // helpers for date picker
  const fmtDate = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const monthMatrix = (anchor: Date) => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const firstWeekday = firstOfMonth.getDay();
    const daysInMonth = lastOfMonth.getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: Array<Array<Date | null>> = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  };
  const applyPickedDate = (ds: string) => {
    if (datePickTarget === 'from') {
      let newFrom = ds;
      let newTo = dateTo;
      if (newTo && newFrom > newTo) newTo = newFrom;
      setDateFrom(newFrom);
      setDateTo(newTo);
    } else {
      let newFrom = dateFrom;
      let newTo = ds;
      if (newFrom && newFrom > newTo) newFrom = newTo;
      setDateFrom(newFrom);
      setDateTo(newTo);
    }
    setShowDateModal(false);
    // refresh
    setPage(0); setHasMore(true); fetchPage(0, true);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(0);
    setHasMore(true);
    await fetchPage(0, true);
    setRefreshing(false);
  }, [fetchPage]);

  const loadMore = () => {
    if (loading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    fetchPage(next, false);
  };

  const handleVerify = async (rec: AttendanceRecord) => {
    if (!isAdmin || rec.verified || verifyingId) return;
    setVerifyingId(rec.id);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('attendance_records')
        .update({ verified: true, verified_at: nowIso, verified_by: profile?.id ?? null })
        .eq('id', rec.id);
      if (error) throw error;
      setRecords(prev => prev.map(r => r.id === rec.id ? { ...r, verified: true, verified_at: nowIso, verified_by: profile?.id ?? null } : r));
    } catch (e) {
      console.error('Failed to verify attendance', e);
    } finally {
      setVerifyingId(null);
    }
  };

  const renderItem = ({ item }: { item: AttendanceRecord }) => {
    const isUnverified = !item.verified;
    const bg = isUnverified ? '#fff3cd' : '#e3f2fd';
    const icon = isUnverified ? 'alert-circle' : 'checkmark-circle';
    const color = isUnverified ? '#f59f00' : '#1976d2';
    const name = isAdmin
      ? `${item.user?.first_name ?? ''} ${item.user?.last_name ?? ''}`.trim()
      : `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim();
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push({ pathname: '/(tabs)/verify-attendance/[id]', params: { id: item.id } })}
        activeOpacity={0.7}
      >
        <View style={[styles.rowIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>
            {item.verified ? 'Attendance verified' : 'Attendance unverified'}{isAdmin ? (name ? ` — ${name}` : '') : ''}
          </Text>
          <Text style={styles.rowSubtitle}>{new Date(item.created_at).toLocaleString()} • {item.method.toUpperCase()}</Text>
        </View>
        {isAdmin && isUnverified ? (
          <TouchableOpacity
            style={styles.verifyBtn}
            onPress={() => handleVerify(item)}
            disabled={verifyingId === item.id}
          >
            {verifyingId === item.id ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.verifyBtnText}>Verify</Text>
            )}
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={20} color="#9e9e9e" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }} />
        <Text style={styles.title}>Attendance Records</Text>
        <TouchableOpacity onPress={handleCalendarPress} style={styles.calendarButton}>
          <Ionicons name="calendar" size={24} color="#4e73df" />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>{isAdmin ? 'All attendance records' : 'Your attendance records'}</Text>

      {isAdmin && (
        <View style={styles.filtersBox}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color="#6c757d" style={{ marginRight: 6 }} />
            <Text style={{ color: '#6c757d', marginRight: 6 }}>Search:</Text>
            <View style={{ flex: 1 }}>
              <TextInput
                placeholder="Name or email"
                placeholderTextColor="#adb5bd"
                value={searchTerm}
                onChangeText={(t) => setSearchTerm(t)}
                style={styles.searchInput}
              />
            </View>
          </View>
          <View style={[styles.searchRow, { marginTop: 8, alignItems: 'center' }]}> 
            <Text style={{ color: '#6c757d', marginRight: 6 }}>From:</Text>
            <TouchableOpacity style={[styles.datePill]} onPress={() => { setDatePickTarget('from'); setShowDateModal(true); }}>
              <Text style={{ color: dateFrom ? '#2d3748' : '#adb5bd', fontWeight: '600' }}>{dateFrom || 'Pick date'}</Text>
            </TouchableOpacity>
            <Text style={{ color: '#6c757d', marginHorizontal: 6 }}>To:</Text>
            <TouchableOpacity style={[styles.datePill]} onPress={() => { setDatePickTarget('to'); setShowDateModal(true); }}>
              <Text style={{ color: dateTo ? '#2d3748' : '#adb5bd', fontWeight: '600' }}>{dateTo || 'Pick date'}</Text>
            </TouchableOpacity>
            {(dateFrom || dateTo) && (
              <TouchableOpacity style={[styles.applyBtn, { marginLeft: 8, backgroundColor: '#e9ecef' }]} onPress={() => { setDateFrom(''); setDateTo(''); setPage(0); setHasMore(true); fetchPage(0, true); }}>
                <Text style={[styles.applyBtnText, { color: '#2d3748' }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={styles.filters}>
        {(['all', 'verified', 'unverified'] as const).map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity key={f} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {f === 'all' ? 'All' : f === 'verified' ? 'Verified' : 'Unverified'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && records.length === 0 ? (
        <View style={{ paddingVertical: 24 }}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<Text style={styles.emptyText}>No attendance records.</Text>}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}
      <Modal visible={showDateModal} animationType="slide" transparent onRequestClose={() => setShowDateModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
                <Ionicons name="chevron-back" size={20} color="#2d3748" />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>{monthAnchor.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</Text>
              <TouchableOpacity onPress={() => setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
                <Ionicons name="chevron-forward" size={20} color="#2d3748" />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
                  <Text key={d} style={{ width: `${100/7}%`, textAlign: 'center', color: '#6c757d', fontWeight: '600' }}>{d}</Text>
                ))}
              </View>
              {monthMatrix(monthAnchor).map((week, wi) => (
                <View key={wi} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  {week.map((day, di) => (
                    day ? (
                      <TouchableOpacity key={di} style={{ width: `${100/7}%`, aspectRatio: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f3f5' }} onPress={() => applyPickedDate(fmtDate(day))}>
                        <Text style={{ color: '#2d3748', fontWeight: '700' }}>{day.getDate()}</Text>
                      </TouchableOpacity>
                    ) : (
                      <View key={di} style={{ width: `${100/7}%`, aspectRatio: 1 }} />
                    )
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  calendarButton: {
    padding: 8,
    marginLeft: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    marginBottom: 12,
  },
  emptyText: {
    color: '#6c757d',
    textAlign: 'center',
    paddingVertical: 20,
  },
  filters: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#fff',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#4e73df',
    borderColor: '#4e73df',
  },
  filterChipText: {
    color: '#495057',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 14,
    color: '#2d3748',
    marginBottom: 2,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#6c757d',
  },
  filtersBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#2d3748',
    backgroundColor: '#fff',
  },
  applyBtn: { marginLeft: 8, backgroundColor: '#4e73df', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  applyBtnText: { color: '#fff', fontWeight: '700' },
  datePill: { flex: 0.5, borderWidth: 1, borderColor: '#e9ecef', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', alignItems: 'center' },
  verifyBtn: {
    backgroundColor: '#28a745',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  verifyBtnText: { color: '#fff', fontWeight: '600' },
});
