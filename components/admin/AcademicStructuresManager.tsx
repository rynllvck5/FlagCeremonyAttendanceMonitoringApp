import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

type College = { code: string; name: string };
type Program = { code: string; name: string; college_code: string };
type ProgramYear = { program_code: string; year_name: string };
type ProgramSection = { program_code: string; year_name: string; section_name: string };

export default function AcademicStructuresManager({ adminCollege, isSuperadmin }: { adminCollege: string | null; isSuperadmin: boolean }) {
  const [colleges, setColleges] = useState<College[]>([]);
  const [expandedCollege, setExpandedCollege] = useState<string | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);
  const [years, setYears] = useState<ProgramYear[]>([]);
  const [expandedYear, setExpandedYear] = useState<string | null>(null);
  const [sections, setSections] = useState<ProgramSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCollegeModal, setShowCollegeModal] = useState(false);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [collegeCode, setCollegeCode] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [programCode, setProgramCode] = useState('');
  const [programName, setProgramName] = useState('');
  const [yearName, setYearName] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [originalCode, setOriginalCode] = useState('');

  useEffect(() => {
    if (isSuperadmin) loadColleges();
    else loadPrograms();
  }, [isSuperadmin, adminCollege]);

  useEffect(() => {
    if (expandedCollege && isSuperadmin) loadProgramsByCollege(expandedCollege);
  }, [expandedCollege]);

  useEffect(() => {
    if (expandedProgram) {
      loadYearsAndSections(expandedProgram);
    } else {
      setYears([]);
      setSections([]);
    }
  }, [expandedProgram]);

  const loadColleges = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('colleges').select('code, name').order('name');
      if (error) throw error;
      setColleges(data || []);
    } catch (e: any) {
      console.error('Load colleges error', e);
    } finally {
      setLoading(false);
    }
  };

  const loadPrograms = async () => {
    try {
      setLoading(true);
      let query = supabase.from('programs').select('code, name, college_code').order('name');
      if (!isSuperadmin && adminCollege) query = query.eq('college_code', adminCollege);
      const { data, error } = await query;
      if (error) throw error;
      setPrograms(data || []);
    } catch (e: any) {
      console.error('Load programs error', e);
    } finally {
      setLoading(false);
    }
  };

  const loadProgramsByCollege = async (code: string) => {
    try {
      const { data, error } = await supabase.from('programs').select('code, name, college_code').eq('college_code', code).order('name');
      if (error) throw error;
      setPrograms(data || []);
    } catch (e: any) {
      console.error('Load programs by college error', e);
      setPrograms([]);
    }
  };

  const loadYearsAndSections = async (programCode: string) => {
    try {
      const { data: yrs } = await supabase.from('program_years').select('program_code, year_name').eq('program_code', programCode).order('year_name');
      setYears(yrs || []);
      const { data: secs } = await supabase.from('program_sections').select('program_code, year_name, section_name').eq('program_code', programCode).order('year_name').order('section_name');
      setSections(secs || []);
    } catch (e: any) {
      console.error('Load years/sections error', e);
    }
  };

  const saveCollege = async () => {
    if (!collegeCode.trim() || !collegeName.trim()) return Alert.alert('Error', 'Code and name required');
    try {
      if (editMode) {
        await supabase.from('colleges').update({ name: collegeName.trim() }).eq('code', originalCode);
        Alert.alert('Updated', 'College updated');
      } else {
        await supabase.from('colleges').insert({ code: collegeCode.trim(), name: collegeName.trim() });
        Alert.alert('Created', 'College created');
      }
      setShowCollegeModal(false);
      loadColleges();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed');
    }
  };

  const deleteCollege = (code: string) => {
    Alert.alert('Delete College', 'Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await supabase.from('colleges').delete().eq('code', code);
            Alert.alert('Deleted', 'College deleted');
            if (expandedCollege === code) setExpandedCollege(null);
            loadColleges();
          } catch (e: any) {
            Alert.alert('Error', e?.message);
          }
        }
      }
    ]);
  };

  const saveProgram = async () => {
    if (!programCode.trim() || !programName.trim() || !collegeCode) return Alert.alert('Error', 'All fields required');
    try {
      if (editMode) {
        await supabase.from('programs').update({ code: programCode.trim(), name: programName.trim() }).eq('code', originalCode);
        Alert.alert('Updated', 'Program updated');
      } else {
        await supabase.from('programs').insert({ code: programCode.trim(), name: programName.trim(), college_code: collegeCode });
        Alert.alert('Created', 'Program created');
      }
      setShowProgramModal(false);
      isSuperadmin && expandedCollege ? loadProgramsByCollege(expandedCollege) : loadPrograms();
    } catch (e: any) {
      Alert.alert('Error', e?.message);
    }
  };

  const deleteProgram = (code: string) => {
    Alert.alert('Delete Program', 'Also deletes years/sections. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await supabase.from('programs').delete().eq('code', code);
            Alert.alert('Deleted', 'Program deleted');
            if (expandedProgram === code) setExpandedProgram(null);
            isSuperadmin && expandedCollege ? loadProgramsByCollege(expandedCollege) : loadPrograms();
          } catch (e: any) {
            Alert.alert('Error', e?.message);
          }
        }
      }
    ]);
  };

  const saveYear = async () => {
    if (!yearName.trim() || !expandedProgram) return Alert.alert('Error', 'Year name required');
    try {
      await supabase.from('program_years').insert({ program_code: expandedProgram, year_name: yearName.trim() });
      Alert.alert('Created', 'Year created');
      setShowYearModal(false);
      loadYearsAndSections(expandedProgram);
    } catch (e: any) {
      Alert.alert('Error', e?.message);
    }
  };

  const deleteYear = (programCode: string, yearName: string) => {
    Alert.alert('Delete Year', 'Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await supabase.from('program_years').delete().eq('program_code', programCode).eq('year_name', yearName);
            Alert.alert('Deleted', 'Year deleted');
            loadYearsAndSections(programCode);
          } catch (e: any) {
            Alert.alert('Error', e?.message);
          }
        }
      }
    ]);
  };

  const saveSection = async () => {
    if (!sectionName.trim() || !yearName.trim() || !expandedProgram) return Alert.alert('Error', 'All fields required');
    try {
      await supabase.from('program_sections').insert({ program_code: expandedProgram, year_name: yearName.trim(), section_name: sectionName.trim() });
      Alert.alert('Created', 'Section created');
      setShowSectionModal(false);
      loadYearsAndSections(expandedProgram);
    } catch (e: any) {
      Alert.alert('Error', e?.message);
    }
  };

  const deleteSection = (programCode: string, yearName: string, sectionName: string) => {
    Alert.alert('Delete Section', 'Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await supabase.from('program_sections').delete().eq('program_code', programCode).eq('year_name', yearName).eq('section_name', sectionName);
            Alert.alert('Deleted', 'Section deleted');
            loadYearsAndSections(programCode);
          } catch (e: any) {
            Alert.alert('Error', e?.message);
          }
        }
      }
    ]);
  };

  const renderProgram = (p: Program) => (
    <View key={p.code} style={[styles.card, { marginBottom: 8 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => setExpandedProgram(expandedProgram === p.code ? null : p.code)}>
          <Ionicons name={expandedProgram === p.code ? 'chevron-down' : 'chevron-forward'} size={16} color="#6c757d" style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{p.code} — {p.name}</Text>
            {!isSuperadmin && <Text style={styles.cardSub}>{p.college_code}</Text>}
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => { setProgramCode(p.code); setProgramName(p.name); setCollegeCode(p.college_code); setOriginalCode(p.code); setEditMode(true); setShowProgramModal(true); }} style={styles.iconBtn}>
            <Ionicons name="create-outline" size={18} color="#4e73df" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => deleteProgram(p.code)} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={18} color="#e03131" />
          </TouchableOpacity>
        </View>
      </View>

      {expandedProgram === p.code && (
        <View style={{ marginTop: 12, paddingLeft: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.subTitle}>Years</Text>
            <TouchableOpacity onPress={() => { setYearName(''); setShowYearModal(true); }} style={styles.miniAddBtn}>
              <Ionicons name="add" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          {years.length === 0 ? <Text style={styles.emptyText}>No years</Text> : years.map((y) => (
            <View key={y.year_name}>
              <View style={styles.itemRow}>
                <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => setExpandedYear(expandedYear === y.year_name ? null : y.year_name)}>
                  <Ionicons name={expandedYear === y.year_name ? 'chevron-down' : 'chevron-forward'} size={16} color="#6c757d" style={{ marginRight: 8 }} />
                  <Text style={styles.itemText}>{y.year_name}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteYear(y.program_code, y.year_name)}>
                  <Ionicons name="close-circle" size={18} color="#e03131" />
                </TouchableOpacity>
              </View>
              {expandedYear === y.year_name && (
                <View style={{ paddingLeft: 24, marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={styles.subTitle}>Sections</Text>
                    <TouchableOpacity onPress={() => { setYearName(y.year_name); setSectionName(''); setShowSectionModal(true); }} style={styles.miniAddBtn}>
                      <Ionicons name="add" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  {sections.filter(s => s.year_name === y.year_name).length === 0 ? <Text style={styles.emptyText}>No sections</Text> : sections.filter(s => s.year_name === y.year_name).map((s) => (
                    <View key={`${s.year_name}-${s.section_name}`} style={[styles.itemRow, { marginBottom: 6 }]}>
                      <Text style={styles.itemText}>Sec {s.section_name}</Text>
                      <TouchableOpacity onPress={() => deleteSection(s.program_code, s.year_name, s.section_name)}>
                        <Ionicons name="close-circle" size={18} color="#e03131" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {isSuperadmin ? (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>Colleges</Text>
            <TouchableOpacity onPress={() => { setCollegeCode(''); setCollegeName(''); setOriginalCode(''); setEditMode(false); setShowCollegeModal(true); }} style={styles.addBtn}>
              <Ionicons name="add-circle" size={22} color="#4e73df" />
            </TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color="#4e73df" style={{ marginVertical: 12 }} /> : colleges.length === 0 ? <Text style={styles.emptyText}>No colleges</Text> : colleges.map((college) => (
            <View key={college.code} style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => setExpandedCollege(expandedCollege === college.code ? null : college.code)}>
                  <Ionicons name={expandedCollege === college.code ? 'chevron-down' : 'chevron-forward'} size={18} color="#6c757d" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{college.code}</Text>
                    <Text style={styles.cardSub}>{college.name}</Text>
                  </View>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => { setCollegeCode(college.code); setCollegeName(college.name); setOriginalCode(college.code); setEditMode(true); setShowCollegeModal(true); }} style={styles.iconBtn}>
                    <Ionicons name="create-outline" size={20} color="#4e73df" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteCollege(college.code)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={20} color="#e03131" />
                  </TouchableOpacity>
                </View>
              </View>
              {expandedCollege === college.code && (
                <View style={{ marginTop: 12, paddingLeft: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={styles.subTitle}>Programs</Text>
                    <TouchableOpacity onPress={() => { setProgramCode(''); setProgramName(''); setCollegeCode(college.code); setOriginalCode(''); setEditMode(false); setShowProgramModal(true); }} style={styles.miniAddBtn}>
                      <Ionicons name="add" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  {programs.length === 0 ? <Text style={styles.emptyText}>No programs</Text> : programs.map(renderProgram)}
                </View>
              )}
            </View>
          ))}
        </>
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>Programs</Text>
            <TouchableOpacity onPress={() => { setProgramCode(''); setProgramName(''); setCollegeCode(adminCollege || ''); setOriginalCode(''); setEditMode(false); setShowProgramModal(true); }} style={styles.addBtn}>
              <Ionicons name="add-circle" size={22} color="#4e73df" />
            </TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color="#4e73df" style={{ marginVertical: 12 }} /> : programs.length === 0 ? <Text style={styles.emptyText}>No programs</Text> : programs.map(renderProgram)}
        </>
      )}

      <Modal visible={showCollegeModal} animationType="slide" transparent onRequestClose={() => setShowCollegeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editMode ? 'Edit College' : 'Add College'}</Text>
            <TextInput style={styles.input} value={collegeCode} onChangeText={setCollegeCode} placeholder="Code (e.g., CCS)" placeholderTextColor="#adb5bd" editable={!editMode} />
            <TextInput style={styles.input} value={collegeName} onChangeText={setCollegeName} placeholder="Name" placeholderTextColor="#adb5bd" />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.saveBtn} onPress={saveCollege}><Text style={styles.saveBtnText}>Save</Text></TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCollegeModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showProgramModal} animationType="slide" transparent onRequestClose={() => setShowProgramModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editMode ? 'Edit Program' : 'Add Program'}</Text>
            <TextInput style={styles.input} value={programCode} onChangeText={setProgramCode} placeholder="Code (e.g., BSCS)" placeholderTextColor="#adb5bd" editable={!editMode} />
            <TextInput style={styles.input} value={programName} onChangeText={setProgramName} placeholder="Name" placeholderTextColor="#adb5bd" />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.saveBtn} onPress={saveProgram}><Text style={styles.saveBtnText}>Save</Text></TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowProgramModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showYearModal} animationType="slide" transparent onRequestClose={() => setShowYearModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Year</Text>
            <TextInput style={styles.input} value={yearName} onChangeText={setYearName} placeholder="Year (e.g., First)" placeholderTextColor="#adb5bd" />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.saveBtn} onPress={saveYear}><Text style={styles.saveBtnText}>Save</Text></TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowYearModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSectionModal} animationType="slide" transparent onRequestClose={() => setShowSectionModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Section</Text>
            <Text style={styles.label}>Year: {yearName}</Text>
            <TextInput style={styles.input} value={sectionName} onChangeText={setSectionName} placeholder="Section (e.g., A)" placeholderTextColor="#adb5bd" />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.saveBtn} onPress={saveSection}><Text style={styles.saveBtnText}>Save</Text></TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowSectionModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#2d3748' },
  addBtn: { padding: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#2d3748' },
  cardSub: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  iconBtn: { padding: 6 },
  subTitle: { fontSize: 14, fontWeight: '600', color: '#495057' },
  miniAddBtn: { backgroundColor: '#4e73df', borderRadius: 16, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, backgroundColor: '#f8f9fa', borderRadius: 8, marginBottom: 6 },
  itemText: { color: '#2d3748', fontSize: 13, fontWeight: '600' },
  emptyText: { color: '#6c757d', fontSize: 13, fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '85%', backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#2d3748', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e9ecef', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#2d3748', marginBottom: 10, backgroundColor: '#fff' },
  label: { color: '#6c757d', marginBottom: 6, fontWeight: '600', fontSize: 14 },
  saveBtn: { flex: 1, backgroundColor: '#4e73df', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  cancelBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9ecef', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: '#4e73df', fontWeight: '700' },
});