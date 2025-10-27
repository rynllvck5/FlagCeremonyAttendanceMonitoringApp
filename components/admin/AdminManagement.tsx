import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, supabaseAdmin } from '../../lib/supabase';

type Admin = {
  id: string;
  email: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  college: string | null;
  created_at: string;
};

type College = { code: string; name: string };

export default function AdminManagement() {
  const [loading, setLoading] = useState(false);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null);
  const [showCollegeModal, setShowCollegeModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [college, setCollege] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [useDefaultPassword, setUseDefaultPassword] = useState(true);
  const DEFAULT_PASSWORD = 'Password123!';

  useEffect(() => {
    loadAdmins();
    loadColleges();
  }, []);

  const loadAdmins = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, middle_name, last_name, college, created_at')
        .eq('role', 'admin')
        .order('email');
      if (error) throw error;
      setAdmins((data || []) as Admin[]);
    } catch (e: any) {
      console.error('[AdminManagement] load error', e);
      Alert.alert('Error', e?.message || 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  };

  const loadColleges = async () => {
    try {
      const { data, error } = await supabase.from('colleges').select('code, name').order('name');
      if (error) throw error;
      setColleges((data || []) as College[]);
    } catch (e: any) {
      console.error('[AdminManagement] load colleges error', e);
    }
  };

  const openAddAdmin = () => {
    setFirstName('');
    setMiddleName('');
    setLastName('');
    setEmail('');
    setPassword(DEFAULT_PASSWORD);
    setCollege('');
    setShowPassword(false);
    setUseDefaultPassword(true);
    setEditMode(false);
    setSelectedAdmin(null);
    setShowAdminModal(true);
  };

  const openEditAdmin = (admin: Admin) => {
    setFirstName(admin.first_name || '');
    setMiddleName(admin.middle_name || '');
    setLastName(admin.last_name || '');
    setEmail(admin.email);
    setPassword('');
    setCollege(admin.college || '');
    setShowPassword(false);
    setUseDefaultPassword(false);
    setEditMode(true);
    setSelectedAdmin(admin);
    setShowAdminModal(true);
  };

  const saveAdmin = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      Alert.alert('Error', 'First name, last name, and email are required');
      return;
    }
    const finalPassword = useDefaultPassword ? DEFAULT_PASSWORD : password.trim();
    if (!editMode && !finalPassword) {
      Alert.alert('Error', 'Password is required for new admin');
      return;
    }
    try {
      if (editMode && selectedAdmin) {
        // Update existing admin
        const { error } = await supabase
          .from('user_profiles')
          .update({
            first_name: firstName.trim(),
            middle_name: middleName.trim() || null,
            last_name: lastName.trim(),
            college: college || null,
          })
          .eq('id', selectedAdmin.id);
        if (error) throw error;
        
        // Update password if provided
        if (password.trim()) {
          if (!supabaseAdmin) {
            throw new Error('Admin operations require server key.');
          }
          const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(selectedAdmin.id, {
            password: password.trim(),
          });
          if (pwError) throw pwError;
        }
        
        Alert.alert('Updated', 'Admin updated successfully');
      } else {
        // Create new admin using admin API
        if (!supabaseAdmin) {
          throw new Error('Admin operations require server key.');
        }
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: email.trim(),
          password: finalPassword,
          email_confirm: true,
          user_metadata: {
            first_name: firstName.trim(),
            middle_name: middleName.trim() || null,
            last_name: lastName.trim(),
          },
        });
        if (authError) throw authError;
        
        if (authData.user) {
          // Set role to admin and assign college
          const { error: profileError } = await supabase
            .from('user_profiles')
            .update({ role: 'admin', college: college || null })
            .eq('id', authData.user.id);
          if (profileError) throw profileError;
        }
        
        Alert.alert('Created', `Admin created! ${useDefaultPassword ? `Default password: ${DEFAULT_PASSWORD}` : ''}`);
      }
      setShowAdminModal(false);
      loadAdmins();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save admin');
    }
  };

  const deleteAdmin = (admin: Admin) => {
    Alert.alert('Delete Admin', `Remove ${admin.email}? This action cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (!supabaseAdmin) {
              Alert.alert('Error', 'Admin operations require server key.');
              return;
            }
            const { error } = await supabaseAdmin.auth.admin.deleteUser(admin.id);
            if (error) throw error;
            Alert.alert('Deleted', 'Admin removed');
            loadAdmins();
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to delete admin');
          }
        },
      },
    ]);
  };

  const openAssignCollege = (admin: Admin) => {
    setSelectedAdmin(admin);
    setCollege(admin.college || '');
    setShowCollegeModal(true);
  };

  const assignCollege = async () => {
    if (!selectedAdmin) return;
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ college: college || null })
        .eq('id', selectedAdmin.id);
      if (error) throw error;
      Alert.alert('Success', 'College assignment updated');
      setShowCollegeModal(false);
      loadAdmins();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to assign college');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin Accounts</Text>
        <TouchableOpacity onPress={openAddAdmin} style={styles.addBtn}>
          <Ionicons name="add-circle" size={22} color="#4e73df" />
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color="#4e73df" style={{ marginVertical: 20 }} />
      ) : admins.length === 0 ? (
        <Text style={styles.emptyText}>No admin accounts found</Text>
      ) : (
        admins.map((a) => (
          <View key={a.id} style={styles.adminCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.adminName}>
                {a.first_name || a.last_name ? `${a.first_name || ''} ${a.middle_name ? a.middle_name + ' ' : ''}${a.last_name || ''}`.trim() : 'Unnamed Admin'}
              </Text>
              <Text style={styles.adminEmail}>{a.email}</Text>
              <Text style={styles.adminCollege}>
                {a.college ? `College: ${a.college}` : 'No college assigned'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => openEditAdmin(a)} style={styles.iconBtn}>
                <Ionicons name="create-outline" size={20} color="#4e73df" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openAssignCollege(a)} style={styles.assignBtn}>
                <Text style={styles.assignBtnText}>Assign</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteAdmin(a)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={20} color="#e03131" />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Admin Create/Edit Modal */}
      <Modal visible={showAdminModal} animationType="slide" transparent onRequestClose={() => setShowAdminModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editMode ? 'Edit Admin' : 'Create Admin'}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First Name *"
                placeholderTextColor="#adb5bd"
              />
              <TextInput
                style={styles.input}
                value={middleName}
                onChangeText={setMiddleName}
                placeholder="Middle Name (optional)"
                placeholderTextColor="#adb5bd"
              />
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last Name *"
                placeholderTextColor="#adb5bd"
              />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Email *"
                placeholderTextColor="#adb5bd"
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!editMode}
              />
              {!editMode && (
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => {
                    const next = !useDefaultPassword;
                    setUseDefaultPassword(next);
                    if (next) setPassword(DEFAULT_PASSWORD); else setPassword('');
                  }}
                >
                  <Ionicons
                    name={useDefaultPassword ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={useDefaultPassword ? '#4e73df' : '#adb5bd'}
                  />
                  <Text style={styles.checkboxText}>Use default password ({DEFAULT_PASSWORD})</Text>
                </TouchableOpacity>
              )}
              {(
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={[styles.input, { paddingRight: 45, opacity: !editMode && useDefaultPassword ? 0.75 : 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={editMode ? 'New Password (leave blank to keep)' : 'Password *'}
                    placeholderTextColor="#adb5bd"
                    secureTextEntry={editMode ? !showPassword : (useDefaultPassword ? false : !showPassword)}
                    editable={editMode ? true : !useDefaultPassword}
                  />
                  <TouchableOpacity
                    style={{ position: 'absolute', right: 12, top: 12 }}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#6c757d" />
                  </TouchableOpacity>
                </View>
              )}
              <Text style={styles.label}>College</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {colleges.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.collegePill, college === c.code && styles.collegePillSelected]}
                    onPress={() => setCollege(c.code)}
                  >
                    <Text style={[styles.collegePillText, college === c.code && styles.collegePillTextSelected]}>
                      {c.code}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.collegePill, !college && styles.collegePillSelected]}
                  onPress={() => setCollege('')}
                >
                  <Text style={[styles.collegePillText, !college && styles.collegePillTextSelected]}>None</Text>
                </TouchableOpacity>
              </ScrollView>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.saveBtn} onPress={saveAdmin}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdminModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* College Assignment Modal */}
      <Modal visible={showCollegeModal} animationType="slide" transparent onRequestClose={() => setShowCollegeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assign College</Text>
            <Text style={styles.modalSubtitle}>
              {selectedAdmin ? `${selectedAdmin.first_name || ''} ${selectedAdmin.last_name || ''}`.trim() : ''}
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {colleges.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={styles.optionBtn}
                  onPress={() => setCollege(c.code)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                    <Text style={styles.optionText}>{c.code} — {c.name}</Text>
                    {college === c.code && <Ionicons name="checkmark-circle" size={20} color="#28a745" />}
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.optionBtn, { backgroundColor: '#fff3cd' }]}
                onPress={() => setCollege('')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                  <Text style={[styles.optionText, { color: '#856404' }]}>Unassign College</Text>
                  {!college && <Ionicons name="checkmark-circle" size={20} color="#856404" />}
                </View>
              </TouchableOpacity>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.saveBtn} onPress={assignCollege}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCollegeModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
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
  adminCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#e9ecef' },
  adminName: { fontSize: 15, fontWeight: '700', color: '#2d3748' },
  adminEmail: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  adminCollege: { fontSize: 12, color: '#495057', marginTop: 4, fontWeight: '600' },
  iconBtn: { padding: 6 },
  assignBtn: { backgroundColor: '#4e73df', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  assignBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  emptyText: { color: '#6c757d', fontSize: 14, fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '85%', backgroundColor: '#fff', borderRadius: 12, padding: 16, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#2d3748', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#6c757d', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e9ecef', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#2d3748', marginBottom: 10, backgroundColor: '#fff' },
  label: { color: '#6c757d', marginBottom: 6, fontWeight: '600', fontSize: 14 },
  collegePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e9ecef', marginRight: 8 },
  collegePillSelected: { backgroundColor: '#4e73df' },
  collegePillText: { color: '#495057', fontWeight: '600', fontSize: 13 },
  collegePillTextSelected: { color: '#fff' },
  optionBtn: { paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#f8f9fa', borderRadius: 8, marginBottom: 8 },
  optionText: { color: '#2d3748', fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: '#4e73df', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  cancelBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9ecef', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: '#4e73df', fontWeight: '700' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  checkboxText: { marginLeft: 8, color: '#2d3748', fontSize: 14 },
});
