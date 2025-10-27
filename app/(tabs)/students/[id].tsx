import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase, SUPABASE_URL } from '../../../lib/supabase';
import { supabaseAdmin } from '../../../lib/supabase';
import type { UserProfile } from '../../../types/user';
import { useAuth } from '../../../hooks/useAuth';

export default function StudentDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id as string;
  const { profile } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [generatingQR, setGeneratingQR] = useState(false);
  const QRCode = React.useMemo(() => {
    try { return require('react-native-qrcode-svg').default; } catch { return null; }
  }, []);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'student' | 'teacher' | 'admin' | 'superadmin'>('student');
  const [program, setProgram] = useState('');
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');
  const [programs, setPrograms] = useState<Array<{ code: string; name: string; college_code: string }>>([]);
  const [years, setYears] = useState<Array<{ year_name: string }>>([]);
  const [sections, setSections] = useState<Array<{ section_name: string }>>([]);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);

  const loadStudent = React.useCallback(async () => {
    if (!isAdmin || !id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, first_name, middle_name, last_name, email, role, profile_picture, qr_code, biometric_enabled, biometric_registered_at, program, year, section, created_at, updated_at')
        .eq('id', id)
        .single();
      if (error) throw error;
      setStudent(data as any);
      setError(null);
    } catch (e: any) {
      console.error('[StudentDetailsScreen] load error', e);
      setError(e?.message ?? 'Failed to load student');
    } finally {
      setLoading(false);
    }
  }, [id, isAdmin]);

  useFocusEffect(
    React.useCallback(() => {
      loadStudent();
    }, [loadStudent])
  );

  const handleDelete = () => {
    if (!student) return;
    const admin = supabaseAdmin;
    if (!admin) {
      Alert.alert('Configuration Error', 'Service role key is missing. Please set SUPABASE_SERVICE_ROLE_KEY or EXPO_PUBLIC_SUPABASE_SERVICE_KEY.');
      return;
    }
    Alert.alert(
      'Delete Student',
      'This will permanently remove the student, their profile, and related records. This action cannot be undone. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              // Delete auth user first. This cascades to public.user_profiles via ON DELETE CASCADE,
              // and then to dependent tables (e.g., scan_logs via ON DELETE CASCADE from migration 20250906).
              const { error: delErr } = await (admin as any).auth.admin.deleteUser(student.id);
              if (delErr) throw delErr;

              // Best-effort cleanup if profile still exists (older schema without cascade)
              try {
                await admin.from('user_profiles').delete().eq('id', student.id);
              } catch {}

              Alert.alert('Deleted', 'Student has been removed.');
              router.replace('/(tabs)/students');
            } catch (e: any) {
              console.error('[StudentDetailsScreen] delete error', e);
              Alert.alert('Error', e?.message || 'Failed to delete student.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  // Initialize form fields from loaded student
  useEffect(() => {
    if (student) {
      setFirstName(student.first_name ?? '');
      setMiddleName(student.middle_name ?? '');
      setLastName(student.last_name ?? '');
      setEmail(student.email);
      setRole(student.role as any);
      setProgram((student as any).program ?? '');
      setYear((student as any).year ?? '');
      setSection((student as any).section ?? '');
    }
  }, [student]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.from('programs').select('code, name, college_code').order('name');
        if (mounted) setPrograms(data || []);
      } catch {
        if (mounted) setPrograms([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!program) { if (mounted) { setYears([]); setSections([]); } return; }
      try {
        const { data } = await supabase.from('program_years').select('year_name').eq('program_code', program).order('year_name');
        if (mounted) setYears(data || []);
      } catch {
        if (mounted) setYears([]);
      }
    })();
    return () => { mounted = false; };
  }, [program]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!program || !year) { if (mounted) setSections([]); return; }
      try {
        const { data } = await supabase.from('program_sections').select('section_name').eq('program_code', program).eq('year_name', year).order('section_name');
        if (mounted) setSections(data || []);
      } catch {
        if (mounted) setSections([]);
      }
    })();
    return () => { mounted = false; };
  }, [program, year]);

  const handleUploadNewAvatar = async () => {
    if (!student) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'Permission to access media library is required!');
        return;
      }
      const pick = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (pick.canceled || !pick.assets?.length) return;
      setUploadingAvatar(true);
      const uri = pick.assets[0].uri;
      const fileName = uri.split('/').pop() || `profile_${student.id}.jpg`;
      const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
      const contentType = ext === 'png' ? 'image/png' : ext === 'jpeg' || ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const storagePath = `${student.id}/${fileName}`;

      // Use current session token to upload to Storage
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('No active session');

      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/profile-pictures/${encodeURIComponent(storagePath)}`;
      const result = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': contentType,
          'x-upsert': 'true',
          'cache-control': '3600',
        },
        // Bypass type differences across SDK versions
        uploadType: (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT,
      } as any);
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Upload failed: ${result.status} ${result.body}`);
      }

      // Update DB with avatar path
      if (supabaseAdmin) {
        const { error: updErr } = await supabaseAdmin
          .from('user_profiles')
          .update({ profile_picture: storagePath, updated_at: new Date().toISOString() })
          .eq('id', student.id);
        if (updErr) throw updErr;
      } else {
        const { error: updErr } = await supabase
          .from('user_profiles')
          .update({ profile_picture: storagePath, updated_at: new Date().toISOString() })
          .eq('id', student.id);
        if (updErr) throw updErr;
      }

      setStudent((prev) => (prev ? { ...prev, profile_picture: storagePath, updated_at: new Date().toISOString() } : prev));
      Alert.alert('Success', 'Profile picture updated.');
    } catch (err: any) {
      console.error('[StudentDetailsScreen] avatar upload error', err);
      Alert.alert('Error', err?.message || 'Failed to upload profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRegenerateQr = async () => {
    if (!student) return;
    try {
      setGeneratingQR(true);
      const newCode = `${student.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin
          .from('user_profiles')
          .update({ qr_code: newCode, updated_at: new Date().toISOString() })
          .eq('id', student.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_profiles')
          .update({ qr_code: newCode, updated_at: new Date().toISOString() })
          .eq('id', student.id);
        if (error) throw error;
      }
      setStudent((prev) => (prev ? { ...prev, qr_code: newCode, updated_at: new Date().toISOString() } : prev));
      Alert.alert('Success', 'QR Code regenerated.');
    } catch (e: any) {
      console.error('[StudentDetailsScreen] regenerate QR error', e);
      Alert.alert('Error', e?.message || 'Failed to generate QR Code.');
    } finally {
      setGeneratingQR(false);
    }
  };

  const handleSave = async () => {
    if (!student) return;
    try {
      setSaving(true);
      const updates: Partial<UserProfile> = {
        first_name: firstName.trim(),
        middle_name: middleName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        role: role,
        program: program.trim() || null as any,
        year: year.trim() || null as any,
        section: section.trim() || null as any,
        updated_at: new Date().toISOString(),
      } as any;

      // If we have admin client and email changed, update auth.users email as well
      if (supabaseAdmin && email.trim() !== student.email) {
        const { error: authErr } = await (supabaseAdmin as any).auth.admin.updateUserById(student.id, { email: email.trim() });
        if (authErr) throw authErr;
      }

      if (supabaseAdmin) {
        const { error: updErr } = await supabaseAdmin
          .from('user_profiles')
          .update(updates)
          .eq('id', student.id);
        if (updErr) throw updErr;
      } else {
        const { error: updErr } = await supabase
          .from('user_profiles')
          .update(updates)
          .eq('id', student.id);
        if (updErr) throw updErr;
      }

      setStudent((prev) => (prev ? { ...prev, ...updates } as any : prev));
      setEditing(false);
      Alert.alert('Saved', 'Student details updated.');
    } catch (e: any) {
      console.error('[StudentDetailsScreen] save error', e);
      Alert.alert('Error', e?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.noAccess}>You do not have permission to view this page.</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#4e73df" />
      </SafeAreaView>
    );
  }

  if (error || !student) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Student not found'}</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/students')} style={[styles.retryBtn, { marginTop: 12 }]}>
          <Text style={styles.retryText}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const fullName = `${student.first_name ?? ''}${student.middle_name ? ` ${student.middle_name}` : ''}${student.last_name ? ` ${student.last_name}` : ''}`.trim();
  const avatarUrl = student.profile_picture
    ? supabase.storage.from('profile-pictures').getPublicUrl(student.profile_picture).data.publicUrl
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/students')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#4e73df" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Student Details</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.hero}>
          <TouchableOpacity onPress={handleUploadNewAvatar} disabled={uploadingAvatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.heroAvatar} />
            ) : (
              <View style={[styles.heroAvatar, { backgroundColor: '#e9ecef' }]}> 
                <Ionicons name="person" size={40} color="#868e96" />
              </View>
            )}
          </TouchableOpacity>
          <View style={{ marginLeft: 16, flex: 1 }}>
            <Text style={styles.heroName} numberOfLines={1}>{fullName || 'Unnamed Student'}</Text>
            <Text style={styles.heroEmail} numberOfLines={1}>{student.email}</Text>
            <View style={[styles.rolePill, { backgroundColor: roleColor(student.role) }]}> 
              <Text style={styles.roleText}>{student.role}</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        {isAdmin && (
          <View style={{ marginTop: 12 }}>
            {editing ? (
              <View style={{ flexDirection: 'row', columnGap: 8, rowGap: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity style={styles.submitBtn} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Save</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.secondaryBtn]} onPress={() => setEditing(false)} disabled={saving}>
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dangerBtn} onPress={handleDelete} disabled={deleting}>
                  {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerText}>Delete</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', columnGap: 8, rowGap: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity style={styles.submitBtn} onPress={() => setEditing(true)}>
                  <Text style={styles.submitText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dangerBtn} onPress={handleDelete} disabled={deleting}>
                  {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerText}>Delete</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          {editing ? (
            <>
              <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First Name" placeholderTextColor="#adb5bd" />
              <TextInput style={styles.input} value={middleName} onChangeText={setMiddleName} placeholder="Middle Name" placeholderTextColor="#adb5bd" />
              <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last Name" placeholderTextColor="#adb5bd" />
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#adb5bd" autoCapitalize="none" keyboardType="email-address" />
              {role === 'student' && (
                <>
                  <TouchableOpacity style={styles.input} onPress={() => setShowProgramModal(true)}>
                    <Text style={{ color: program ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{program || 'Select Program'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.input} onPress={() => program && setShowYearModal(true)} disabled={!program}>
                    <Text style={{ color: year ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{year || 'Select Year'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.input} onPress={() => program && year && setShowSectionModal(true)} disabled={!program || !year}>
                    <Text style={{ color: section ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{section || 'Select Section'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <>
              <InfoRow label="First Name" value={student.first_name ?? ''} />
              <InfoRow label="Middle Name" value={student.middle_name ?? ''} />
              <InfoRow label="Last Name" value={student.last_name ?? ''} />
              <InfoRow label="Email" value={student.email} />
              <InfoRow label="Role" value={student.role} />
              {student.role === 'student' && (
                <>
                  <InfoRow label="Program" value={(student as any).program ?? ''} />
                  <InfoRow label="Year" value={(student as any).year ?? ''} />
                  <InfoRow label="Section" value={(student as any).section ?? ''} />
                </>
              )}
            </>
          )}
          <InfoRow label="Created" value={new Date(student.created_at).toLocaleString()} />
          <InfoRow label="Updated" value={new Date(student.updated_at).toLocaleString()} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More</Text>
          {/* QR Code Block */}
          {student.qr_code ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
              {QRCode ? (
                <QRCode value={student.qr_code} size={180} />
              ) : (
                <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(student.qr_code)}` }} style={{ width: 180, height: 180 }} />
              )}
              <Text style={[styles.muted, { marginTop: 8 }]} numberOfLines={1}>{student.qr_code}</Text>
              {editing && (
                <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 10 }]} onPress={handleRegenerateQr} disabled={generatingQR}>
                  {generatingQR ? <ActivityIndicator /> : <Text style={styles.secondaryBtnText}>Regenerate QR Code</Text>}
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
              <Text style={styles.muted}>QR Code: —</Text>
              {editing && (
                <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 10 }]} onPress={handleRegenerateQr} disabled={generatingQR}>
                  {generatingQR ? <ActivityIndicator /> : <Text style={styles.secondaryBtnText}>Generate QR Code</Text>}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Fingerprint / Biometrics Block */}
          <View style={{ marginTop: 12 }}>
            <Text style={styles.muted}>Biometrics: {student.biometric_enabled ? 'Registered' : 'Not Registered'}</Text>
            {!!student.biometric_registered_at && (
              <Text style={[styles.muted, { marginTop: 4 }]}>Registered At: {new Date(student.biometric_registered_at as any).toLocaleString()}</Text>
            )}
            {editing && (
              <TouchableOpacity
                style={[styles.secondaryBtn, { marginTop: 10 }]}
                onPress={() => router.push({ pathname: '/(tabs)/students/[id]/fingerprint', params: { id } } as any)}
              >
                <Text style={styles.secondaryBtnText}>Manage Fingerprint</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
      <Modal visible={showProgramModal} animationType="slide" transparent onRequestClose={() => setShowProgramModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Program</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(programs || []).map(p => (
                <TouchableOpacity key={p.code} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setProgram(p.code); setYear(''); setSection(''); setShowProgramModal(false); }}>
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
                <TouchableOpacity key={y.year_name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setYear(y.year_name); setSection(''); setShowYearModal(false); }}>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}

function roleColor(role?: string) {
  switch (role) {
    case 'superadmin':
      return '#6f42c1';
    case 'admin':
      return '#e83e8c';
    case 'teacher':
      return '#20c997';
    case 'student':
      return '#17a2b8';
    default:
      return '#6c757d';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  header: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, marginRight: 8 },
  backText: { color: '#4e73df', fontWeight: '600', marginLeft: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#2d3748' },

  hero: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  heroAvatar: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
  heroName: { fontSize: 18, fontWeight: '700', color: '#2d3748' },
  heroEmail: { fontSize: 13, color: '#6c757d', marginTop: 4 },
  rolePill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 8 },
  roleText: { color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },

  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#2d3748', marginBottom: 12 },
  muted: { color: '#6c757d', fontSize: 13 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  infoLabel: { color: '#6c757d' },
  infoValue: { color: '#212529', fontWeight: '500', maxWidth: '60%' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccess: { color: '#6c757d' },
  errorText: { color: '#e03131' },
  retryBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f1f3f5', borderRadius: 8 },
  retryText: { color: '#343a40', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2d3748',
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  submitBtn: { backgroundColor: '#4e73df', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9ecef', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  secondaryBtnText: { color: '#4e73df', fontWeight: '700' },
  dangerBtn: { backgroundColor: '#e03131', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  dangerText: { color: '#fff', fontWeight: '700' },
});
