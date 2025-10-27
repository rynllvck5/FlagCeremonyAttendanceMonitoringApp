import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, Button, TouchableOpacity, ScrollView, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

export default function AdminScanner() {
  const router = useRouter();
  type ScanLog = { code: string; user?: { id: string; name?: string; email?: string; role?: string }; timestamp: string };
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [duplicateUserName, setDuplicateUserName] = useState<string | null>(null);

  useEffect(() => {
    // Try to fetch recent logs (if scan_logs table exists and policies allow)
    (async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('scan_logs')
          .select('code, scanned_at, scanned_user (id, first_name, last_name, email, role)')
          .order('scanned_at', { ascending: false })
          .limit(20);
        if (fetchErr) throw fetchErr;
        if (data) {
          const mapped: ScanLog[] = data.map((row: any) => ({
            code: row.code,
            user: row.scanned_user
              ? {
                  id: row.scanned_user.id,
                  name: `${row.scanned_user.first_name ?? ''} ${row.scanned_user.last_name ?? ''}`.trim(),
                  email: row.scanned_user.email,
                  role: row.scanned_user.role,
                }
              : undefined,
            timestamp: row.scanned_at,
          }));
          setLogs(mapped);
        }
      } catch (e) {
        // Silently ignore if table does not exist / no permission
      }
    })();
  }, []);

  useEffect(() => {
    // Auto-request camera permission when screen mounts (if we can ask)
    if (permission && !permission.granted && (permission as any).canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  useFocusEffect(
    useCallback(() => {
      // Reset state whenever the screen comes into focus
      setScanned(false);
      setError(null);
      return () => {};
    }, [])
  );

  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    setScanned(true);
    const scannedAt = new Date().toISOString();
    try {
      // Lookup user by QR code
      const { data: found, error: queryErr } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email, role, biometric_enabled')
        .eq('qr_code', data)
        .maybeSingle();

      if (queryErr) throw queryErr;

      // If valid user found, detect duplicate scan within the same day
      if (found?.id) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const { data: existingToday, error: dupErr } = await supabase
          .from('attendance_records')
          .select('id, created_at')
          .eq('user_id', found.id)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .limit(1);
        if (dupErr) throw dupErr;
        if ((existingToday?.length ?? 0) > 0) {
          // show modal error and do not insert another attendance record
          setDuplicateUserName(`${found.first_name ?? ''} ${found.last_name ?? ''}`.trim() || found.email || 'This user');
          setDuplicateModalVisible(true);
          setError(null);
          return;
        }
      }

      // Try to persist to scan_logs
      try {
        const { data: me } = await supabase.auth.getUser();
        const scanned_by = me?.user?.id ?? null;
        await supabase.from('scan_logs').insert({
          code: data,
          scanned_by,
          scanned_user: found?.id ?? null,
          scanned_at: scannedAt,
        });
      } catch {}

      // Insert attendance record for valid scans (admins only via RLS)
      try {
        const { data: me2 } = await supabase.auth.getUser();
        const created_by = me2?.user?.id ?? null;
        if (found?.id) {
          // Optionally compute a provisional remark from today's schedule
          let remark: 'on_time' | 'late' = 'on_time';
          try {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const todayStr = `${yyyy}-${mm}-${dd}`;
            const { data: schedule } = await supabase
              .from('attendance_schedules')
              .select('date, is_flag_day, on_time_end, attendance_end')
              .eq('date', todayStr)
              .maybeSingle();
            if (schedule?.is_flag_day && schedule.on_time_end && schedule.attendance_end) {
              const now = new Date();
              const nowMinutes = now.getHours() * 60 + now.getMinutes();
              const parseTime = (t: string) => {
                const [h, m] = t.split(':').map((x: string) => parseInt(x, 10));
                return h * 60 + (m || 0);
              };
              const onTimeEndMin = parseTime(schedule.on_time_end);
              const attendanceEndMin = parseTime(schedule.attendance_end);
              if (nowMinutes <= onTimeEndMin) remark = 'on_time';
              else if (nowMinutes <= attendanceEndMin) remark = 'late';
            }
          } catch {}

          const shouldVerify = !found.biometric_enabled; // auto-verify if biometrics disabled
          await supabase.from('attendance_records').insert({
            user_id: found.id,
            created_by,
            method: 'qr',
            verified: shouldVerify,
            verified_at: shouldVerify ? scannedAt : null,
            verified_by: shouldVerify ? created_by : null,
            metadata: { code: data, source: 'scanner', remark },
          });
        }
      } catch {}

      setLogs((prev: ScanLog[]) => [
        {
          code: data,
          user: found
            ? {
                id: found.id,
                name: `${found.first_name ?? ''} ${found.last_name ?? ''}`.trim(),
                email: found.email,
                role: found.role,
              }
            : undefined,
          timestamp: scannedAt,
        },
        ...prev,
      ]);
      // Do not set error for not-found; UI will show 'Invalid QR Code' in logs
      setError(null);
    } catch (e: any) {
      console.error('[Scanner] Query error:', e);
      setError(e?.message || 'Failed to look up QR code. Check RLS policies for admin/superadmin.');
      setLogs((prev: ScanLog[]) => [
        { code: data, timestamp: scannedAt },
        ...prev,
      ]);
    }
  };

  if (!permission) {
    return (
      <View style={styles.centered}> 
        <Text>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={{ marginBottom: 12 }}>We need camera access to scan QR codes.</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Duplicate modal */}
      <Modal
        transparent
        visible={duplicateModalVisible}
        animationType="fade"
        onRequestClose={() => setDuplicateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="close-circle" size={42} color="#e03131" style={{ marginBottom: 8 }} />
            <Text style={styles.modalTitle}>Duplicate Scan</Text>
            <Text style={styles.modalMessage}>
              You have already taken attendance. Please open your account and verify your attendance using your fingerprint.
            </Text>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => { setDuplicateModalVisible(false); setScanned(false); }}
            >
              <Text style={styles.modalBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={styles.scannerBox}>
        <CameraView
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={
            scanned
              ? undefined
              : (result) =>
                  handleBarCodeScanned({
                    data: (result as any).data,
                    type: String((result as any).type),
                  })
          }
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <Text style={styles.scanText}>Scan your QR Code</Text>
      {scanned && (
        <View style={styles.scanActions}>
          <Button title="Scan Again" onPress={() => { setScanned(false); setError(null); }} />
        </View>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
      <View style={styles.logsContainer}>
        {logs.length === 0 ? (
          <Text style={styles.logEmpty}>No scans yet.</Text>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            {logs.map((l: ScanLog, idx: number) => (
              <View key={idx} style={styles.logItem}>
                <TouchableOpacity
                  onPress={() => {
                    if (l.user?.id) {
                      router.push({ pathname: '/(tabs)/students/[id]', params: { id: l.user.id } });
                    } else {
                      Alert.alert('Invalid QR Code', 'This is not a valid QR Code');
                    }
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="information-circle-outline" size={18} color="#6c757d" style={{ marginRight: 6 }} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logText}>
                    {l.user
                      ? `${l.user.name || 'Unknown'} • ${l.user.role}`
                      : 'Invalid QR Code'}
                  </Text>
                  <Text style={styles.logSub}>{new Date(l.timestamp).toLocaleString()} • {l.code}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  scannerBox: {
    height: 320,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  scanText: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 16,
    color: '#343a40',
  },
  scanActions: {
    marginTop: 12,
    alignItems: 'center',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  logsContainer: {
    marginTop: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#2d3748', marginBottom: 6, textAlign: 'center' },
  modalMessage: { color: '#6c757d', textAlign: 'center', marginBottom: 12 },
  modalBtn: { backgroundColor: '#e03131', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  modalBtnText: { color: '#fff', fontWeight: '700' },
  logEmpty: {
    color: '#6c757d',
    textAlign: 'center',
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  logText: {
    color: '#212529',
  },
  logSub: {
    color: '#6c757d',
    fontSize: 12,
  },
});
