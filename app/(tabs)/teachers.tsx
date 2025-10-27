import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View, Alert, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

const PAGE_SIZE = 20;

type Teacher = {
  id: string;
  first_name: string | null;
  middle_name?: string | null;
  last_name: string | null;
  email: string | null;
  role: string;
  position?: string | null;
  college?: string | null;
};

type Advisory = { program_code: string; year_name: string; section_name: string };

export default function TeachersScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  // advisory modal state
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [assignModal, setAssignModal] = useState(false);
  const [assignProgram, setAssignProgram] = useState('');
  const [assignYear, setAssignYear] = useState('');
  const [assignSection, setAssignSection] = useState('');
  const [programs, setPrograms] = useState<Array<{ code: string; name: string }>>([]);
  const [years, setYears] = useState<Array<{ year_name: string }>>([]);
  const [sections, setSections] = useState<Array<{ section_name: string }>>([]);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [teacherAdvisories, setTeacherAdvisories] = useState<Advisory[]>([]);
  const [savingAssign, setSavingAssign] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  const fetchPage = useCallback(async (pageIndex: number, replace = false) => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      let req = supabase
        .from('user_profiles')
        .select('id, first_name, middle_name, last_name, email, role, position, college', { count: 'exact' })
        .eq('role', 'teacher');

      // Filter by college for college admins (not superadmins)
      if (profile?.role === 'admin' && profile?.college) {
        req = req.eq('college', profile.college);
      }

      if (debouncedQuery.trim()) {
        const term = debouncedQuery.trim();
        req = req.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
      }

      req = req.order('last_name', { ascending: true }).order('first_name', { ascending: true });
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await req.range(from, to);
      if (error) throw error;

      setHasMore(((count ?? 0) - (to + 1)) > 0);
      setTeachers(prev => (replace ? (data as any) : [...prev, ...(data as any)]));
    } catch (e) {
      console.error('[Teachers] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, isAdmin, profile]);

  useEffect(() => {
    setPage(0);
    setHasMore(true);
    setTeachers([]);
    fetchPage(0, true);
  }, [debouncedQuery, fetchPage]);

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

  // Load base program options
  useEffect(() => { (async () => {
    try {
      const { data } = await supabase.from('programs').select('code, name').order('name');
      setPrograms(data || []);
    } catch { setPrograms([]); }
  })() }, []);

  useEffect(() => { (async () => {
    if (!assignProgram) { setYears([]); setSections([]); return; }
    try {
      const { data } = await supabase.from('program_years').select('year_name').eq('program_code', assignProgram);
      setYears(data || []);
    } catch { setYears([]); }
  })() }, [assignProgram]);

  useEffect(() => { (async () => {
    if (!assignProgram || !assignYear) { setSections([]); return; }
    try {
      const { data } = await supabase.from('program_sections').select('section_name').eq('program_code', assignProgram).eq('year_name', assignYear);
      setSections(data || []);
    } catch { setSections([]); }
  })() }, [assignProgram, assignYear]);

  const openAssignForTeacher = async (t: Teacher) => {
    setSelectedTeacher(t);
    setAssignProgram(''); setAssignYear(''); setAssignSection('');
    setAssignModal(true);
    try {
      const { data } = await supabase
        .from('advisory_assignments')
        .select('program_code, year_name, section_name')
        .eq('teacher_id', t.id);
      setTeacherAdvisories((data || []) as any);
    } catch { setTeacherAdvisories([]); }
  };

  const addAssignment = async () => {
    if (!selectedTeacher || !assignProgram || !assignYear || !assignSection) return;
    setSavingAssign(true);
    try {
      const { error } = await supabase.from('advisory_assignments').insert({
        teacher_id: selectedTeacher.id,
        program_code: assignProgram,
        year_name: assignYear,
        section_name: assignSection,
      });
      if (error) {
        // Postgres unique_violation is 23505. We also try to check constraint naming if provided.
        const msg = (error as any)?.message || '';
        const code = (error as any)?.code || '';
        if (code === '23505' || /duplicate key/i.test(msg)) {
          Alert.alert('Duplicate Advisory', 'This class already has an advisory assigned to a teacher. Remove the existing assignment first.');
          return;
        }
        throw error;
      }
      // refresh list
      const { data } = await supabase
        .from('advisory_assignments')
        .select('program_code, year_name, section_name')
        .eq('teacher_id', selectedTeacher.id);
      setTeacherAdvisories((data || []) as any);
      setAssignSection('');
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Could not add advisory assignment');
    } finally { setSavingAssign(false); }
  };

  const removeAssignment = async (a: Advisory) => {
    if (!selectedTeacher) return;
    try {
      await supabase
        .from('advisory_assignments')
        .delete()
        .eq('teacher_id', selectedTeacher.id)
        .eq('program_code', a.program_code)
        .eq('year_name', a.year_name)
        .eq('section_name', a.section_name);
      setTeacherAdvisories(prev => prev.filter(x => !(x.program_code === a.program_code && x.year_name === a.year_name && x.section_name === a.section_name)));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to remove advisory');
    }
  };

  const renderItem = ({ item }: { item: Teacher }) => (
    <TouchableOpacity style={styles.item} onPress={() => router.push({ pathname: '/(tabs)/teachers/[id]', params: { id: item.id } } as any)} activeOpacity={0.8}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{`${item.first_name ?? ''}${item.last_name ? ` ${item.last_name}` : ''}`.trim()}</Text>
        <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
        <Text style={styles.meta} numberOfLines={1}>{`${item.position || ''}${item.college ? ` • ${item.college}` : ''}`}</Text>
      </View>
      <TouchableOpacity onPress={() => openAssignForTeacher(item)} style={styles.assignBtn}>
        <Ionicons name="create" size={18} color="#4e73df" />
        <Text style={styles.assignText}>Assign Advisory</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

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
        <Text style={styles.title}>Teachers</Text>
        <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/teachers/new' } as any)} style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
          <Ionicons name="add-circle" size={22} color="#4e73df" />
          <Text style={{ color: '#4e73df', fontWeight: '600', marginLeft: 4 }}>New</Text>
        </TouchableOpacity>
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

      {loading && teachers.length === 0 ? (
        <View style={styles.center}> 
          <ActivityIndicator size="large" color="#4e73df" />
        </View>
      ) : (
        <FlatList
          data={teachers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={() => (
            <View style={styles.center}> 
              <Text style={styles.emptyText}>No teachers found</Text>
            </View>
          )}
          ListFooterComponent={() => (
            <View style={{ paddingVertical: 16 }}>
              {loading && teachers.length > 0 && <ActivityIndicator color="#4e73df" />}
            </View>
          )}
        />
      )}

      {/* Assignment Modal */}
      <Modal visible={assignModal} animationType="slide" transparent onRequestClose={() => setAssignModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Assign Advisory — {selectedTeacher ? `${selectedTeacher.first_name ?? ''} ${selectedTeacher.last_name ?? ''}` : ''}</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={{ color: '#6c757d', marginBottom: 8 }}>Select Program, Year, Section</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.input} onPress={() => setShowProgramModal(true)}>
                  <Text style={{ color: assignProgram ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{assignProgram || 'Program'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.input} onPress={() => assignProgram && setShowYearModal(true)} disabled={!assignProgram}>
                  <Text style={{ color: assignYear ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{assignYear || 'Year'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.input} onPress={() => assignProgram && assignYear && setShowSectionModal(true)} disabled={!assignProgram || !assignYear}>
                  <Text style={{ color: assignSection ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{assignSection || 'Section'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={addAssignment} style={[styles.assignActionBtn, (!assignProgram || !assignYear || !assignSection || savingAssign) && { opacity: 0.6 }]} disabled={!assignProgram || !assignYear || !assignSection || savingAssign}>
                {savingAssign ? <ActivityIndicator color="#fff" /> : <Text style={styles.assignActionText}>Add Advisory</Text>}
              </TouchableOpacity>

              <Text style={{ color: '#6c757d', marginTop: 12, marginBottom: 4 }}>Current Advisories</Text>
              {(teacherAdvisories || []).length === 0 ? (
                <Text style={{ color: '#adb5bd' }}>None</Text>
              ) : (
                teacherAdvisories.map((a, idx) => (
                  <View key={`${a.program_code}-${a.year_name}-${a.section_name}-${idx}`} style={styles.advisoryRow}>
                    <Text style={{ color: '#2d3748', fontWeight: '600' }}>{a.program_code} • {a.year_name} • Sec {a.section_name}</Text>
                    <TouchableOpacity onPress={() => removeAssignment(a)}>
                      <Ionicons name="trash" size={18} color="#e03131" />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <View style={{ height: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Selectors */}
      <Modal visible={showProgramModal} animationType="slide" transparent onRequestClose={() => setShowProgramModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Program</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(programs || []).map(p => (
                <TouchableOpacity key={p.code} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setAssignProgram(p.code); setAssignYear(''); setAssignSection(''); setShowProgramModal(false); }}>
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
                <TouchableOpacity key={y.year_name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setAssignYear(y.year_name); setAssignSection(''); setShowYearModal(false); }}>
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
                <TouchableOpacity key={s.section_name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setAssignSection(s.section_name); setShowSectionModal(false); }}>
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
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccess: { color: '#6c757d' },
  header: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '700', color: '#2d3748' },
  searchBar: { margin: 16, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e9ecef' },
  searchInput: { marginLeft: 8, flex: 1, color: '#2d3748' },
  item: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  name: { fontSize: 16, fontWeight: '600', color: '#2d3748' },
  email: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  meta: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  emptyText: { color: '#6c757d' },
  assignBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#4e73df', backgroundColor: '#fff' },
  assignText: { color: '#4e73df', fontWeight: '600', marginLeft: 6 },
  input: { borderWidth: 1, borderColor: '#e9ecef', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minWidth: 90, textAlign: 'center', color: '#2d3748' },
  assignActionBtn: { backgroundColor: '#4e73df', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  assignActionText: { color: '#fff', fontWeight: '700' },
  advisoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' },
});
