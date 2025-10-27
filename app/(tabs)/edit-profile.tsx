import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, RefreshControl, Modal } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';

export default function EditProfileScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const [form, setForm] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
  });
  const [saving, setSaving] = useState(false);

  // Role-based fields
  const [program, setProgram] = useState('');
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');
  const [position, setPosition] = useState('');
  const [college, setCollege] = useState('');

  // Options from DB
  const [programs, setPrograms] = useState<Array<{ code: string; name: string; college_code: string }>>([]);
  const [years, setYears] = useState<Array<{ year_name: string }>>([]);
  const [sections, setSections] = useState<Array<{ section_name: string }>>([]);
  const [positions, setPositions] = useState<Array<{ name: string }>>([]);
  const [colleges, setColleges] = useState<Array<{ code: string; name: string }>>([]);

  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [showCollegeModal, setShowCollegeModal] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name || '',
        middle_name: (profile as any).middle_name || '',
        last_name: profile.last_name || '',
      });
      setProgram(((profile as any).program || '') as string);
      setYear(((profile as any).year || '') as string);
      setSection(((profile as any).section || '') as string);
      setPosition(((profile as any).position || '') as string);
      setCollege(((profile as any).college || '') as string);
    }
  }, [profile]);

  // Load base option lists
  useEffect(() => {
    (async () => {
      try {
        const { data: progs } = await supabase.from('programs').select('code, name, college_code');
        setPrograms(progs || []);
      } catch {}
      try {
        const { data: pos } = await supabase.from('teacher_positions').select('name');
        setPositions(pos || []);
      } catch {}
      try {
        const { data: cols } = await supabase.from('colleges').select('code, name');
        setColleges(cols || []);
      } catch {}
    })();
  }, []);

  // Load dependent lists
  useEffect(() => {
    (async () => {
      if (!program) { setYears([]); setSections([]); return; }
      try {
        const { data: yrs } = await supabase.from('program_years').select('year_name').eq('program_code', program);
        setYears(yrs || []);
      } catch { setYears([]); }
    })();
  }, [program]);

  useEffect(() => {
    (async () => {
      if (!program || !year) { setSections([]); return; }
      try {
        const { data: secs } = await supabase.from('program_sections').select('section_name').eq('program_code', program).eq('year_name', year);
        setSections(secs || []);
      } catch { setSections([]); }
    })();
  }, [program, year]);

  const saveProfile = async () => {
    if (!profile) return;
    try {
      setSaving(true);
      const updates: any = {
        first_name: form.first_name.trim() || null,
        middle_name: form.middle_name.trim() || null,
        last_name: form.last_name.trim() || null,
        updated_at: new Date().toISOString(),
      };
      // Role-based updates
      if (profile.role === 'student') {
        updates.program = program || null;
        updates.year = year || null;
        updates.section = section || null;
      } else if (profile.role === 'teacher') {
        updates.position = position || null;
        updates.college = college || null;
      } else if (profile.role === 'admin') {
        updates.college = college || null;
      }
      const { error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', profile.id);
      if (error) throw error;

      // Keep auth user metadata in sync (best effort)
      await supabase.auth.updateUser({
        data: {
          first_name: updates.first_name || undefined,
          middle_name: updates.middle_name || undefined,
          last_name: updates.last_name || undefined,
        },
      });

      await refreshProfile();
      Alert.alert('Success', 'Profile updated successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      console.error('[EditProfile] saveProfile error:', e);
      Alert.alert('Error', e?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill out both password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters.');
      return;
    }

    try {
      setChangingPw(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await refreshProfile();
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Success', 'Password changed successfully.');
    } catch (e: any) {
      console.error('[EditProfile] changePassword error:', e);
      Alert.alert('Error', e?.message || 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  if (!profile) {
    return (
      <View style={styles.center}> 
        <Text>Loading...</Text>
      </View>
    );
  }

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshProfile();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> }>
      <Text style={styles.title}>Edit Profile</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Personal Information</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>First Name</Text>
          <TextInput
            style={styles.input}
            value={form.first_name}
            onChangeText={(t) => setForm({ ...form, first_name: t })}
            placeholder="First Name"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Middle Name</Text>
          <TextInput
            style={styles.input}
            value={form.middle_name}
            onChangeText={(t) => setForm({ ...form, middle_name: t })}
            placeholder="Middle Name"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={form.last_name}
            onChangeText={(t) => setForm({ ...form, last_name: t })}
            placeholder="Last Name"
          />
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={saveProfile} disabled={saving}>
          <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { marginTop: 16 }]}> 
        <Text style={styles.sectionTitle}>Change Password</Text>
        <View style={styles.formGroup}>
          <Text style={styles.label}>New Password</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Enter new password"
            secureTextEntry
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            secureTextEntry
          />
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={changePassword} disabled={changingPw}>
          <Text style={styles.secondaryButtonText}>{changingPw ? 'Changing...' : 'Change Password'}</Text>
        </TouchableOpacity>
      </View>

      {/* Role-based fields */}
      {profile.role === 'student' && (
        <View style={[styles.card, { marginTop: 16 }]}> 
          <Text style={styles.sectionTitle}>Academic Details</Text>
          <View style={styles.fieldReadOnly}>
            <Text style={styles.label}>Program</Text>
            <Text style={styles.readOnlyValue}>{program || 'Not assigned'}</Text>
          </View>
          <View style={styles.fieldReadOnly}>
            <Text style={styles.label}>Year</Text>
            <Text style={styles.readOnlyValue}>{year || 'Not assigned'}</Text>
          </View>
          <View style={styles.fieldReadOnly}>
            <Text style={styles.label}>Section</Text>
            <Text style={styles.readOnlyValue}>{section || 'Not assigned'}</Text>
          </View>
          <Text style={styles.fieldHint}>Academic details are managed by administrators and cannot be changed here.</Text>
        </View>
      )}

      {profile.role === 'teacher' && (
        <View style={[styles.card, { marginTop: 16 }]}> 
          <Text style={styles.sectionTitle}>Teacher Details</Text>
          <TouchableOpacity style={styles.selectInput} onPress={() => setShowPositionModal(true)}>
            <Text style={styles.selectInputText}>{position || 'Select Position'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectInput} onPress={() => setShowCollegeModal(true)}>
            <Text style={styles.selectInputText}>{college || 'Select College'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={saveProfile} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save Teacher Details'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {profile.role === 'admin' && (
        <View style={[styles.card, { marginTop: 16 }]}> 
          <Text style={styles.sectionTitle}>Admin Details</Text>
          <View style={styles.fieldReadOnly}>
            <Text style={styles.label}>College</Text>
            <Text style={styles.readOnlyValue}>{college || 'Not assigned'}</Text>
            <Text style={styles.fieldHint}>Only superadmin can change your college assignment</Text>
          </View>
        </View>
      )}

      <TouchableOpacity style={[styles.button, { backgroundColor: '#f1f3f5', marginTop: 16 }]} onPress={() => router.back()}>
        <Text style={[styles.buttonText, { color: '#343a40' }]}>Back</Text>
      </TouchableOpacity>
    
      {/* Modals */}
      <Modal visible={showProgramModal} animationType="slide" transparent onRequestClose={() => setShowProgramModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Program</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(programs || []).map(p => (
                <TouchableOpacity key={p.code} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setProgram(p.code); setShowProgramModal(false); setYear(''); setSection(''); }}>
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
                <TouchableOpacity key={y.year_name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setYear(y.year_name); setShowYearModal(false); setSection(''); }}>
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

      <Modal visible={showPositionModal} animationType="slide" transparent onRequestClose={() => setShowPositionModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Position</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(positions || []).map(p => (
                <TouchableOpacity key={p.name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setPosition(p.name); setShowPositionModal(false); }}>
                  <Text style={{ color: '#2d3748', fontWeight: '600' }}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showCollegeModal} animationType="slide" transparent onRequestClose={() => setShowCollegeModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select College</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(colleges || []).map(c => (
                <TouchableOpacity key={c.code} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setCollege(c.code); setShowCollegeModal(false); }}>
                  <Text style={{ color: '#2d3748', fontWeight: '600' }}>{c.code} — {c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  formGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#e9ecef',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryButtonText: {
    color: '#212529',
    fontWeight: '700',
  },
  selectInput: {
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f8f9fa',
    marginBottom: 12,
  },
  selectInputText: {
    color: '#212529',
    fontSize: 16,
  },
  button: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  fieldReadOnly: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  readOnlyValue: {
    fontSize: 16,
    color: '#495057',
    fontWeight: '600',
    marginTop: 4,
  },
  fieldHint: {
    fontSize: 12,
    color: '#6c757d',
    fontStyle: 'italic',
    marginTop: 6,
  },
});
