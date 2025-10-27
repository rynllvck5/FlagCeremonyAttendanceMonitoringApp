import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import type { UserProfile } from '../../../../types/user';

export default function FingerprintManagementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id as string;
  const { profile } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [student, setStudent] = useState<UserProfile | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, first_name, middle_name, last_name, email, role, biometric_enabled, biometric_registered_at, biometric_device_id')
        .eq('id', id)
        .single();
      if (error) throw error;
      setStudent(data as any);
    } catch (e: any) {
      console.error('[FingerprintManagement] load error', e);
      Alert.alert('Error', e?.message || 'Failed to load student');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const getDeviceIdAsync = async (): Promise<string> => {
    try {
      if (Platform.OS === 'android') {
        if (typeof (Application as any).getAndroidId === 'function') {
          const id = await (Application as any).getAndroidId();
          return id || 'android-unknown';
        }
        return ((Application as any).androidId as string | undefined) ?? 'android-unknown';
      }
      if (Platform.OS === 'ios') {
        const iosId = await Application.getIosIdForVendorAsync();
        return iosId || 'ios-unknown';
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const handleRegister = async () => {
    if (!student) return;
    try {
      setSaving(true);
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert('Not Supported', 'This device does not support biometric authentication.');
        return;
      }
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert('No Biometrics Enrolled', 'Please enroll a fingerprint/biometric in device settings first.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to register biometrics',
        cancelLabel: 'Cancel',
      });
      if (!result.success) {
        Alert.alert('Authentication Failed', result.error || 'Could not authenticate.');
        return;
      }
      const deviceId = await getDeviceIdAsync();
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('user_profiles')
        .update({ biometric_enabled: true, biometric_registered_at: nowIso, biometric_device_id: deviceId })
        .eq('id', student.id);
      if (error) throw error;
      setStudent((prev) => (prev ? { ...prev, biometric_enabled: true, biometric_registered_at: nowIso, biometric_device_id: deviceId } as any : prev));
      Alert.alert('Success', 'Biometric verification enabled for this user.');
    } catch (e: any) {
      console.error('[FingerprintManagement] register error', e);
      Alert.alert('Error', e?.message || 'Failed to register biometrics.');
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!student) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('user_profiles')
        .update({ biometric_enabled: false, biometric_registered_at: null, biometric_device_id: null })
        .eq('id', student.id);
      if (error) throw error;
      setStudent((prev) => (prev ? { ...prev, biometric_enabled: false, biometric_registered_at: null, biometric_device_id: null } as any : prev));
      Alert.alert('Disabled', 'Biometric verification disabled for this user.');
    } catch (e: any) {
      console.error('[FingerprintManagement] disable error', e);
      Alert.alert('Error', e?.message || 'Failed to disable biometrics.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.center}> 
        <Text>You do not have permission to view this page.</Text>
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

  if (!student) {
    return (
      <SafeAreaView style={styles.center}> 
        <Text>Student not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const fullName = `${student.first_name ?? ''}${student.middle_name ? ` ${student.middle_name}` : ''}${student.last_name ? ` ${student.last_name}` : ''}`.trim() || 'Unnamed Student';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#4e73df" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Fingerprint</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{fullName}</Text>
        <Text style={styles.cardSub}>{student.email}</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={[styles.statusValue, { color: student.biometric_enabled ? '#28a745' : '#6c757d' }]}>
            {student.biometric_enabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Device ID:</Text>
          <Text style={styles.statusValue}>{student.biometric_device_id || '—'}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Registered:</Text>
          <Text style={styles.statusValue}>{student.biometric_registered_at ? new Date(student.biometric_registered_at).toLocaleString() : '—'}</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleRegister} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Register Fingerprint</Text>}
        </TouchableOpacity>
        {student.biometric_enabled && (
          <TouchableOpacity style={styles.dangerBtn} onPress={handleDisable} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerText}>Disable Biometrics</Text>}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  card: { backgroundColor: '#fff', margin: 16, borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#2d3748' },
  cardSub: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  statusLabel: { color: '#6c757d' },
  statusValue: { color: '#2d3748', fontWeight: '600' },
  primaryBtn: { backgroundColor: '#4e73df', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9ecef', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  secondaryBtnText: { color: '#4e73df', fontWeight: '700' },
  dangerBtn: { backgroundColor: '#e03131', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  dangerText: { color: '#fff', fontWeight: '700' },
});
