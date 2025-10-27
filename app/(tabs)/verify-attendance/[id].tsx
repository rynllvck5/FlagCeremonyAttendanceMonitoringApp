import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';

export default function VerifyAttendanceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id as string;
  const { profile } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');

  type AttendanceRecord = {
    id: string;
    user_id: string;
    verified: boolean;
    created_at: string;
    verified_at: string | null;
    method: string;
    metadata: any | null;
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rec, setRec] = useState<AttendanceRecord | null>(null);
  const [remark, setRemark] = useState<'On Time' | 'Late' | '—'>('—');
  const [verifAddress, setVerifAddress] = useState<string | null>(null);

  const handleDatePress = useCallback((dateStr: string) => {
    router.push(`/(tabs)/schedule-view?anchor=${dateStr}`);
  }, [router]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, verified, created_at, verified_at, method, metadata')
        .eq('id', id)
        .single();
      if (error) throw error;
      const record = data as any as AttendanceRecord;
      setRec(record);

      // Compute remark from schedule for that date
      try {
        const created = new Date(record.created_at);
        const yyyy = created.getFullYear();
        const mm = String(created.getMonth() + 1).padStart(2, '0');
        const dd = String(created.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const { data: schedule } = await supabase
          .from('attendance_schedules')
          .select('is_flag_day, on_time_end, attendance_end')
          .eq('date', dateStr)
          .maybeSingle();
        const fallback = (record.metadata?.remark === 'late') ? 'Late' : 'On Time';
        if (!schedule || !schedule.is_flag_day || !schedule.on_time_end || !schedule.attendance_end) {
          setRemark(fallback);
        } else {
          const createdMin = created.getHours() * 60 + created.getMinutes();
          const parseTime = (t: string) => {
            const [h, m] = t.split(':').map((x: string) => parseInt(x, 10));
            return h * 60 + (m || 0);
          };
          const onTimeEndMin = parseTime(schedule.on_time_end);
          const attendanceEndMin = parseTime(schedule.attendance_end);
          if (createdMin <= onTimeEndMin) setRemark('On Time');
          else if (createdMin <= attendanceEndMin) setRemark('Late');
          else setRemark('Late');
        }
      } catch {
        setRemark((record.metadata?.remark === 'late') ? 'Late' : 'On Time');
      }
    } catch (e: any) {
      console.error('[VerifyAttendance] load error', e);
      Alert.alert('Error', e?.message || 'Unable to load attendance record.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Reverse geocode verification coordinates (if present) into a human-readable address
  useEffect(() => {
    (async () => {
      try {
        const coords = rec?.metadata?.verified_location;
        if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
          const results = await Location.reverseGeocodeAsync({ latitude: coords.latitude, longitude: coords.longitude });
          if (results && results.length > 0) {
            const r = results[0];
            const parts = [r.name, r.street, r.district, r.city || r.subregion, r.region, r.postalCode, r.country].filter(Boolean);
            setVerifAddress(parts.join(', '));
          } else {
            setVerifAddress(null);
          }
        } else {
          setVerifAddress(null);
        }
      } catch (e) {
        setVerifAddress(null);
      }
    })();
  }, [rec?.metadata?.verified_location?.latitude, rec?.metadata?.verified_location?.longitude]);

  const handleVerify = async () => {
    try {
      if (!profile) {
        Alert.alert('Not signed in', 'Please sign in again.');
        return;
      }
      if (!profile.biometric_enabled) {
        Alert.alert('Biometrics not enabled', 'Enable fingerprint in your profile first.');
        return;
      }

      setSaving(true);
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert('Not supported', 'Biometric authentication is not supported on this device.');
        return;
      }
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert('No biometrics', 'Please enroll a fingerprint/biometric in device settings first.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your attendance',
        cancelLabel: 'Cancel',
      });
      if (!result.success) {
        Alert.alert('Authentication failed', result.error || 'Could not authenticate.');
        return;
      }

      // Ask for location permission and capture current location
      let coords: { latitude: number; longitude: number; accuracy?: number } | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const acc = (typeof pos.coords.accuracy === 'number') ? pos.coords.accuracy : undefined;
          const obj: { latitude: number; longitude: number; accuracy?: number } = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
          if (acc !== undefined) obj.accuracy = acc;
          coords = obj;
        }
      } catch (e) {
        // Non-fatal: proceed without location
        console.warn('[VerifyAttendance] location capture failed', e);
      }

      const nowIso = new Date().toISOString();
      const updatedMetadata = { ...(rec?.metadata || {}), verified_location: coords ? { ...coords, timestamp: nowIso } : undefined };
      const { error } = await supabase
        .from('attendance_records')
        .update({ verified: true, verified_at: nowIso, metadata: updatedMetadata })
        .eq('id', id);
      if (error) throw error;

      setRec((prev) => prev ? { ...prev, verified: true, verified_at: nowIso, metadata: updatedMetadata } : prev);
      Alert.alert('Verified', 'Your attendance has been verified.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/attendance' as any) },
      ]);
    } catch (e: any) {
      console.error('[VerifyAttendance] verify error', e);
      Alert.alert('Error', e?.message || 'Failed to verify attendance.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#4e73df" />
      </SafeAreaView>
    );
  }

  if (!rec) {
    return (
      <SafeAreaView style={styles.center}>
        <Text>Record not found.</Text>
      </SafeAreaView>
    );
  }

  const isOwnRecord = profile?.id === rec.user_id;
  const alreadyVerified = rec.verified;

  const renderDetail = (label: string, value: string | null, last = false, isDate = false) => {
    const dateValue = value ? new Date(value) : null;
    const formattedDate = dateValue ? dateValue.toLocaleString() : '—';
    const dateStr = dateValue ? `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}-${String(dateValue.getDate()).padStart(2, '0')}` : '';
    
    return (
      <View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}>
        <Text style={styles.detailLabel}>{label}</Text>
        {isDate && value ? (
          <TouchableOpacity onPress={() => handleDatePress(dateStr)}>
            <Text style={[styles.detailValue, { color: '#4e73df', textDecorationLine: 'underline' }]}>{formattedDate}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.detailValue}>{value || '—'}</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Attendance Details</Text>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Status</Text><Text style={styles.detailValue}>{remark}</Text></View>
        {renderDetail('Date/Time', rec.created_at, false, true)}
        {renderDetail('Verified At', rec.verified_at, false, true)}
        {!!rec.metadata?.verified_location && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionHeading}>Verification Location</Text>
            <View style={styles.mapContainer}>
              {(() => {
                const lat = rec.metadata.verified_location.latitude;
                const lon = rec.metadata.verified_location.longitude;
                const delta = 0.005;
                const bbox = `${(lon - delta).toFixed(6)},${(lat - delta).toFixed(6)},${(lon + delta).toFixed(6)},${(lat + delta).toFixed(6)}`;
                const osmUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
                return (
                  <WebView source={{ uri: osmUrl }} style={styles.map} />
                );
              })()}
            </View>
            <Text style={[styles.detailValue, { marginTop: 8 }]}>
              {`Lat: ${rec.metadata.verified_location.latitude.toFixed(5)}, Lng: ${rec.metadata.verified_location.longitude.toFixed(5)}`}
            </Text>
          </View>
        )}
        {!isOwnRecord && (
          <Text style={styles.warning}>This record does not belong to your account.</Text>
        )}
        {alreadyVerified && (
          <Text style={styles.info}>This record is already verified.</Text>
        )}
        <TouchableOpacity
          style={[styles.primaryBtn, (!isOwnRecord || alreadyVerified || saving) && styles.disabledBtn]}
          disabled={!isOwnRecord || alreadyVerified || saving}
          onPress={handleVerify}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify with Fingerprint</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: 8, borderColor: '#e03131' }]}
            onPress={() => {
              Alert.alert(
                'Delete Attendance',
                'Are you sure you want to delete this attendance record?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        const { error } = await supabase.from('attendance_records').delete().eq('id', id);
                        if (error) throw error;
                        Alert.alert('Deleted', 'Attendance record has been deleted.', [
                          { text: 'OK', onPress: () => router.replace('/(tabs)/attendance' as any) },
                        ]);
                      } catch (e: any) {
                        console.error('[VerifyAttendance] delete error', e);
                        Alert.alert('Error', e?.message || 'Failed to delete attendance record.');
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Text style={[styles.secondaryBtnText, { color: '#e03131' }]}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc', padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#2d3748' },
  subtitle: { marginTop: 8, color: '#6c757d' },
  warning: { marginTop: 12, color: '#e03131' },
  info: { marginTop: 12, color: '#20c997' },
  primaryBtn: { marginTop: 16, backgroundColor: '#4e73df', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  disabledBtn: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { marginTop: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9ecef', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  secondaryBtnText: { color: '#4e73df', fontWeight: '700' },
  detailRow: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { color: '#6c757d' },
  detailValue: { color: '#2d3748', fontWeight: '600' },
  sectionHeading: { marginTop: 8, color: '#2d3748', fontWeight: '700' },
  mapContainer: { marginTop: 8, height: 180, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e9ecef' },
  map: { flex: 1 },
});
