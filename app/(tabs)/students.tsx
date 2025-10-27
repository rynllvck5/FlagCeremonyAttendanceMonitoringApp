import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { UserProfile } from '../../types/user';

const PAGE_SIZE = 20;

export default function StudentsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [students, setStudents] = useState<UserProfile[]>([]);
  // Filters and options
  const [program, setProgram] = useState('');
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');
  const [programs, setPrograms] = useState<Array<{ code: string; name: string }>>([]);
  const [years, setYears] = useState<Array<{ year_name: string }>>([]);
  const [sections, setSections] = useState<Array<{ section_name: string }>>([]);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [currentCaptainId, setCurrentCaptainId] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  const fetchPage = useCallback(async (pageIndex: number, replace = false) => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      let req = supabase
        .from('user_profiles')
        .select('id, first_name, middle_name, last_name, email, profile_picture, role, program, year, section, created_at', { count: 'exact' })
        .eq('role', 'student');

      if (debouncedQuery.trim()) {
        const term = debouncedQuery.trim();
        req = req.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
      }

      if (program) req = req.eq('program', program);
      if (year) req = req.eq('year', year);
      if (section) req = req.eq('section', section);

      req = req.order('last_name', { ascending: true }).order('first_name', { ascending: true });
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await req.range(from, to);
      if (error) throw error;

      setHasMore(((count ?? 0) - (to + 1)) > 0);
      setStudents(prev => (replace ? (data as any) : [...prev, ...(data as any)]));
    } catch (e) {
      console.error('[StudentsScreen] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, program, year, section, isAdmin]);

  // initial and search refresh
  useEffect(() => {
    setPage(0);
    setHasMore(true);
    setStudents([]);
    fetchPage(0, true);
  }, [debouncedQuery, fetchPage]);

  // Refresh when screen gains focus (e.g., after creating a new student)
  useFocusEffect(
    React.useCallback(() => {
      fetchPage(0, true);
    }, [fetchPage])
  );

  const onEndReached = () => {
    if (loading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    fetchPage(next);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setPage(0);
      setHasMore(true);
      await fetchPage(0, true);
    } finally {
      setRefreshing(false);
    }
  };

  // Options loaders
  useEffect(() => { (async () => {
    try { const { data } = await supabase.from('programs').select('code, name').order('name'); setPrograms(data || []); } catch { setPrograms([]); }
  })() }, []);
  // Load all possible Years across programs
  useEffect(() => { (async () => {
    try {
      const { data } = await supabase.from('program_years').select('year_name').order('year_name');
      const uniq = Array.from(new Set((data || []).map((y: any) => y.year_name))).map((yn) => ({ year_name: yn }));
      setYears(uniq);
    } catch { setYears([]); }
  })() }, []);
  // Load all possible Sections across programs/years
  useEffect(() => { (async () => {
    try {
      const { data } = await supabase.from('program_sections').select('section_name').order('section_name');
      const uniq = Array.from(new Set((data || []).map((s: any) => s.section_name))).map((sn) => ({ section_name: sn }));
      setSections(uniq);
    } catch { setSections([]); }
  })() }, []);

  // Update captain for the selected class
  useEffect(() => {
    (async () => {
      if (program && year && section) {
        try {
          const { data } = await supabase
            .from('class_captains')
            .select('captain_user_id')
            .eq('program_code', program)
            .eq('year_name', year)
            .eq('section_name', section)
            .maybeSingle();
          setCurrentCaptainId((data as any)?.captain_user_id || null);
        } catch { setCurrentCaptainId(null); }
      } else {
        setCurrentCaptainId(null);
      }
    })();
  }, [program, year, section]);

  const setCaptain = async (userId: string) => {
    if (!program || !year || !section) return;
    try {
      await supabase.from('class_captains').upsert({
        program_code: program,
        year_name: year,
        section_name: section,
        captain_user_id: userId,
        assigned_by: profile?.id || null,
        assigned_at: new Date().toISOString(),
      });
      setCurrentCaptainId(userId);
    } catch (e) { /* noop */ }
  };

  const renderItem = ({ item }: { item: UserProfile }) => {
    const avatarUrl = item.profile_picture
      ? supabase.storage.from('profile-pictures').getPublicUrl(item.profile_picture).data.publicUrl
      : null;
    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => router.push({ pathname: '/(tabs)/students/[id]', params: { id: item.id } })}
      >
        <View style={styles.avatarContainer}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: '#e9ecef' }]}>
              <Ionicons name="person" size={22} color="#868e96" />
            </View>
          )}
        </View>
        <View style={styles.itemInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {`${item.first_name ?? ''}${item.middle_name ? ` ${item.middle_name}` : ''}${item.last_name ? ` ${item.last_name}` : ''}`.trim()}
          </Text>
          <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
          {(item as any).program && (
            <Text style={styles.meta} numberOfLines={1}>{`${(item as any).program || ''}${(item as any).year ? ` • ${(item as any).year}` : ''}${(item as any).section ? ` • Sec ${(item as any).section}` : ''}`}</Text>
          )}
        </View>
        {program && year && section ? (
          currentCaptainId === item.id ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="ribbon" size={16} color="#f59f00" />
              <Text style={{ color: '#f59f00', fontWeight: '700' }}>Captain</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setCaptain(item.id)} style={{ borderWidth: 1, borderColor: '#4e73df', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }}>
              <Text style={{ color: '#4e73df', fontWeight: '600' }}>Make Captain</Text>
            </TouchableOpacity>
          )
        ) : (
          <Ionicons name="chevron-forward" size={20} color="#adb5bd" />
        )}
      </TouchableOpacity>
    );
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.noAccess}>You do not have permission to view this page.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Students</Text>
        {isAdmin && (
          <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/students/new' as any })} style={styles.addBtn}>
            <Ionicons name="add-circle" size={22} color="#4e73df" />
            <Text style={styles.addText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10 }}>
        <View style={styles.filterPillRow}>
          <TouchableOpacity style={styles.filterPillPress} onPress={() => setShowProgramModal(true)}>
            <Text style={styles.filterText}>{program || 'Program'}</Text>
          </TouchableOpacity>
          {program ? (
            <TouchableOpacity onPress={() => { setProgram(''); setYear(''); setSection(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="#6c757d" />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.filterPillRow}>
          <TouchableOpacity style={styles.filterPillPress} onPress={() => setShowYearModal(true)}>
            <Text style={styles.filterText}>{year || 'Year'}</Text>
          </TouchableOpacity>
          {year ? (
            <TouchableOpacity onPress={() => { setYear(''); setSection(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="#6c757d" />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.filterPillRow}>
          <TouchableOpacity style={styles.filterPillPress} onPress={() => setShowSectionModal(true)}>
            <Text style={styles.filterText}>{section || 'Section'}</Text>
          </TouchableOpacity>
          {section ? (
            <TouchableOpacity onPress={() => setSection('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="#6c757d" />
            </TouchableOpacity>
          ) : null}
        </View>
        {(program || year || section) ? (
          <TouchableOpacity onPress={() => { setProgram(''); setYear(''); setSection(''); }} style={styles.clearPill}>
            <Ionicons name="close" size={14} color="#4e73df" />
            <Text style={{ color: '#4e73df', fontWeight: '700', marginLeft: 4 }}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#6c757d" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or email"
          placeholderTextColor="#adb5bd"
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      {loading && students.length === 0 ? (
        <View style={styles.center}> 
          <ActivityIndicator size="large" color="#4e73df" />
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={() => (
            <View style={styles.center}> 
              <Text style={styles.emptyText}>No students found</Text>
            </View>
          )}
          ListFooterComponent={() => (
            <View style={{ paddingVertical: 16 }}>
              {loading && students.length > 0 && <ActivityIndicator color="#4e73df" />}
            </View>
          )}
        />
      )}
      {/* Selection Modals */}
      <Modal visible={showProgramModal} animationType="slide" transparent onRequestClose={() => setShowProgramModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Program</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(programs || []).map(p => (
                <TouchableOpacity key={p.code} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setProgram(p.code); setShowProgramModal(false); }}>
                  <Text style={{ color: '#2d3748', fontWeight: '600' }}>{p.code} — {p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showYearModal} animationType="slide" transparent onRequestClose={() => setShowYearModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Year</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(years || []).map(y => (
                <TouchableOpacity key={y.year_name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setYear(y.year_name); setShowYearModal(false); }}>
                  <Text style={{ color: '#2d3748', fontWeight: '600' }}>{y.year_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showSectionModal} animationType="slide" transparent onRequestClose={() => setShowSectionModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Section</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(sections || []).map(s => (
                <TouchableOpacity key={s.section_name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setSection(s.section_name); setShowSectionModal(false); }}>
                  <Text style={{ color: '#2d3748', fontWeight: '600' }}>{s.section_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fc',
  },
  header: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginRight: 8,
  },
  backText: { color: '#4e73df', fontWeight: '600', marginLeft: 4 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2d3748',
  },
  addBtn: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  addText: { color: '#4e73df', fontWeight: '600', marginLeft: 4 },
  searchBar: {
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  searchInput: {
    marginLeft: 8,
    flex: 1,
    color: '#2d3748',
  },
  item: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarContainer: { marginRight: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#495057', fontWeight: '700' },
  itemInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#2d3748' },
  email: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  meta: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccess: { color: '#6c757d' },
  emptyText: { color: '#6c757d' },
  filterPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#e9ecef', backgroundColor: '#fff' },
  filterText: { color: '#2d3748', fontWeight: '600' },
  filterPillRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#e9ecef', backgroundColor: '#fff' },
  filterPillPress: { alignItems: 'center', justifyContent: 'center', paddingRight: 6 },
  clearPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#cfe2ff', backgroundColor: '#edf2ff' },
});
