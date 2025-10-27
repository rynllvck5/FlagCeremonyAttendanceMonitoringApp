import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase, SUPABASE_URL } from '../../../lib/supabase';
import { supabaseAdmin } from '../../../lib/supabase';
import type { UserProfile } from '../../../types/user';
import { useAuth } from '../../../hooks/useAuth';

export default function TeacherDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id as string;
  const { profile } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');

  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState<UserProfile | null>(null);
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
  // Role is fixed to 'teacher' for teacher accounts; adviser-ness is implied by having advisory assignments
  const [position, setPosition] = useState('');
  const [college, setCollege] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!isAdmin || !id) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, first_name, middle_name, last_name, email, role, profile_picture, qr_code, biometric_enabled, biometric_registered_at, position, college, created_at, updated_at')
          .eq('id', id)
          .single();
        if (error) throw error;
        if (mounted) setTeacher(data as any);
      } catch (e: any) {
        console.error('[TeacherDetailsScreen] load error', e);
        setError(e?.message ?? 'Failed to load teacher');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [id, isAdmin]);


  const handleDelete = () => {
    if (!teacher) return;
    const admin = supabaseAdmin;
    if (!admin) {
      Alert.alert('Configuration Error', 'Service role key is missing. Please set SUPABASE_SERVICE_ROLE_KEY or EXPO_PUBLIC_SUPABASE_SERVICE_KEY.');
      return;
    }
    Alert.alert(
      'Delete Teacher',
      'This will permanently remove the teacher, their profile, and related records. This action cannot be undone. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              const { error: delErr } = await (admin as any).auth.admin.deleteUser(teacher.id);
              if (delErr) throw delErr;
              try { await admin.from('user_profiles').delete().eq('id', teacher.id); } catch {}
              Alert.alert('Deleted', 'Teacher has been removed.');
              router.replace('/(tabs)/teachers');
            } catch (e: any) {
              console.error('[TeacherDetailsScreen] delete error', e);
              Alert.alert('Error', e?.message || 'Failed to delete teacher.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  // Initialize form
  useEffect(() => {
    if (teacher) {
      setFirstName(teacher.first_name ?? '');
      setMiddleName(teacher.middle_name ?? '');
      setLastName(teacher.last_name ?? '');
      setEmail(teacher.email);
      // keep role as-is, but we do not edit it here
      setPosition((teacher as any).position ?? '');
      setCollege((teacher as any).college ?? '');
    }
  }, [teacher]);

  const handleUploadNewAvatar = async () => {
    if (!teacher) return;
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
      const fileName = uri.split('/').pop() || `profile_${teacher.id}.jpg`;
      const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
      const contentType = ext === 'png' ? 'image/png' : ext === 'jpeg' || ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const storagePath = `${teacher.id}/${fileName}`;

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
        uploadType: (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT,
      } as any);
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Upload failed: ${result.status} ${result.body}`);
      }

      if (supabaseAdmin) {
        const { error: updErr } = await supabaseAdmin
          .from('user_profiles')
          .update({ profile_picture: storagePath, updated_at: new Date().toISOString() })
          .eq('id', teacher.id);
        if (updErr) throw updErr;
      } else {
        const { error: updErr } = await supabase
          .from('user_profiles')
          .update({ profile_picture: storagePath, updated_at: new Date().toISOString() })
          .eq('id', teacher.id);
        if (updErr) throw updErr;
      }

      setTeacher((prev) => (prev ? { ...prev, profile_picture: storagePath, updated_at: new Date().toISOString() } : prev));
      Alert.alert('Success', 'Profile picture updated.');
    } catch (err: any) {
      console.error('[TeacherDetailsScreen] avatar upload error', err);
      Alert.alert('Error', err?.message || 'Failed to upload profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRegenerateQr = async () => {
    if (!teacher) return;
    try {
      setGeneratingQR(true);
      const newCode = `${teacher.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin
          .from('user_profiles')
          .update({ qr_code: newCode, updated_at: new Date().toISOString() })
          .eq('id', teacher.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_profiles')
          .update({ qr_code: newCode, updated_at: new Date().toISOString() })
          .eq('id', teacher.id);
        if (error) throw error;
      }
      setTeacher((prev) => (prev ? { ...prev, qr_code: newCode, updated_at: new Date().toISOString() } : prev));
      Alert.alert('Success', 'QR Code regenerated.');
    } catch (e: any) {
      console.error('[TeacherDetailsScreen] regenerate QR error', e);
      Alert.alert('Error', e?.message || 'Failed to generate QR Code.');
    } finally {
      setGeneratingQR(false);
    }
  };

  const handleSave = async () => {
    if (!teacher) return;
    try {
      setSaving(true);
      const updates: Partial<UserProfile> = {
        first_name: firstName.trim(),
        middle_name: middleName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        // Position and college are not editable for teachers
        updated_at: new Date().toISOString(),
      } as any;

      // Update auth email if changed
      if (supabaseAdmin && email.trim() !== teacher.email) {
        const { error: authErr } = await (supabaseAdmin as any).auth.admin.updateUserById(teacher.id, { email: email.trim() });
        if (authErr) throw authErr;
      }

      if (supabaseAdmin) {
        const { error: updErr } = await supabaseAdmin
          .from('user_profiles')
          .update(updates)
          .eq('id', teacher.id);
        if (updErr) throw updErr;
      } else {
        const { error: updErr } = await supabase
          .from('user_profiles')
          .update(updates)
          .eq('id', teacher.id);
        if (updErr) throw updErr;
      }

      setTeacher((prev) => (prev ? { ...prev, ...updates } as any : prev));
      setEditing(false);
      Alert.alert('Saved', 'Teacher details updated.');
    } catch (e: any) {
      console.error('[TeacherDetailsScreen] save error', e);
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

  if (error || !teacher) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Teacher not found'}</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/teachers')} style={[styles.retryBtn, { marginTop: 12 }]}>
          <Text style={styles.retryText}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const fullName = `${teacher.first_name ?? ''}${teacher.middle_name ? ` ${teacher.middle_name}` : ''}${teacher.last_name ? ` ${teacher.last_name}` : ''}`.trim();
  const avatarUrl = teacher.profile_picture
    ? supabase.storage.from('profile-pictures').getPublicUrl(teacher.profile_picture).data.publicUrl
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/teachers')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#4e73df" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Teacher Details</Text>
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
            <Text style={styles.heroName} numberOfLines={1}>{fullName || 'Unnamed Teacher'}</Text>
            <Text style={styles.heroEmail} numberOfLines={1}>{teacher.email}</Text>
            <View style={[styles.rolePill, { backgroundColor: roleColor(teacher.role) }]}> 
              <Text style={styles.roleText}>{teacher.role}</Text>
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
              {/* Role is not editable here; remains 'teacher'. Adviser capability comes from advisory assignments. */}
              <InfoRow label="Position" value={(teacher as any).position ?? ''} />
              {/* College field is not shown in edit mode */}
            </>
          ) : (
            <>
              <InfoRow label="First Name" value={teacher.first_name ?? ''} />
              <InfoRow label="Middle Name" value={teacher.middle_name ?? ''} />
              <InfoRow label="Last Name" value={teacher.last_name ?? ''} />
              <InfoRow label="Email" value={teacher.email} />
              <InfoRow label="Role" value={teacher.role} />
              <InfoRow label="Position" value={(teacher as any).position ?? ''} />
              <InfoRow label="College" value={(teacher as any).college ?? ''} />
            </>
          )}
          <InfoRow label="Created" value={new Date(teacher.created_at).toLocaleString()} />
          <InfoRow label="Updated" value={new Date(teacher.updated_at).toLocaleString()} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More</Text>
          {/* QR Code Block */}
          {teacher.qr_code ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
              {QRCode ? (
                <QRCode value={teacher.qr_code} size={180} />
              ) : (
                <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(teacher.qr_code)}` }} style={{ width: 180, height: 180 }} />
              )}
              <Text style={[styles.muted, { marginTop: 8 }]} numberOfLines={1}>{teacher.qr_code}</Text>
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
            <Text style={styles.muted}>Biometrics: {teacher.biometric_enabled ? 'Registered' : 'Not Registered'}</Text>
            {!!teacher.biometric_registered_at && (
              <Text style={[styles.muted, { marginTop: 4 }]}>Registered At: {new Date(teacher.biometric_registered_at as any).toLocaleString()}</Text>
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
    case 'adviser':
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
