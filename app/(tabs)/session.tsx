import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

export default function SessionScreen() {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');
  return isAdmin ? <AdminScanner /> : <MyQR />;
}

// Admin/Superadmin: Scanner with logs
const AdminScanner = () => {
  type ScanLog = { code: string; user?: { id: string; name?: string; email?: string; role?: string }; timestamp: string };
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [duplicateUserName, setDuplicateUserName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('scan_logs')
          .select('code, scanned_at, scanned_user (id, first_name, last_name, email, role)')
          .order('scanned_at', { ascending: false })
          .limit(20);
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
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (permission && !permission.granted && (permission as any).canAskAgain) requestPermission();
  }, [permission]);

  useFocusEffect(
    useCallback(() => {
      setScanned(false);
      setError(null);
      return () => {};
    }, [])
  );

  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    setScanned(true);
    const scannedAt = new Date().toISOString();
    try {
      const { data: found } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email, role')
        .eq('qr_code', data)
        .maybeSingle();

      if (found?.id) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const { data: existingToday } = await supabase
          .from('attendance_records')
          .select('id, created_at')
          .eq('user_id', found.id)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .limit(1);
        if ((existingToday?.length ?? 0) > 0) {
          setDuplicateUserName(`${found.first_name ?? ''} ${found.last_name ?? ''}`.trim() || found.email || 'This user');
          setDuplicateModalVisible(true);
          setError(null);
          return;
        }
      }

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

      try {
        const { data: me2 } = await supabase.auth.getUser();
        const created_by = me2?.user?.id ?? null;
        if (found?.id) {
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

          await supabase.from('attendance_records').insert({
            user_id: found.id,
            created_by,
            method: 'qr',
            verified: false,
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
      setError(null);
    } catch (e: any) {
      console.error('[Session.Scanner] error:', e);
      setError(e?.message || 'Failed to look up QR code.');
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
      <Modal transparent visible={duplicateModalVisible} animationType="fade" onRequestClose={() => setDuplicateModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="close-circle" size={42} color="#e03131" style={{ marginBottom: 8 }} />
            <Text style={styles.modalTitle}>Duplicate Scan</Text>
            <Text style={styles.modalMessage}>{duplicateUserName || 'This user'} has already taken attendance today.</Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => { setDuplicateModalVisible(false); setScanned(false); }}>
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
      <Text style={styles.scanText}>Scan a user's QR Code</Text>
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
                <Ionicons name="information-circle-outline" size={18} color="#6c757d" style={{ marginRight: 6 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.logText}>
                    {l.user ? `${l.user.name || 'Unknown'} • ${l.user.role}` : 'Invalid QR Code'}
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
};

// Student/Teacher: My QR generate/regenerate
const MyQR = () => {
  const { profile } = useAuth();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setQrCode(profile?.qr_code ?? null);
  }, [profile?.qr_code]);

  const generateQr = async () => {
    if (!profile) return;
    try {
      setGenerating(true);
      const newCode = `${profile.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const { error } = await supabase
        .from('user_profiles')
        .update({ qr_code: newCode, updated_at: new Date().toISOString() })
        .eq('id', profile.id);
      if (error) throw error;
      setQrCode(newCode);
      Alert.alert('Success', 'QR Code has been generated.');
    } catch (e: any) {
      console.error('[Session.MyQR] Generate error:', e);
      Alert.alert('Error', e?.message || 'Failed to generate QR Code. Ensure qr_code column exists.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My QR Code</Text>
      <View style={styles.sessionCard}>
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
          {qrCode ? (
            (() => {
              try {
                const QRCode = require('react-native-qrcode-svg').default;
                return <QRCode value={qrCode} size={220} />;
              } catch {
                return <Text selectable style={{ color: '#6c757d' }}>{qrCode}</Text>;
              }
            })()
          ) : (
            <View style={{ width: 220, height: 220, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa' }}>
              <Text style={{ color: '#6c757d' }}>No QR Code yet</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={[styles.btn, { marginTop: 8 }]}
          onPress={async () => {
            if (qrCode) {
              const confirmed = await new Promise<boolean>((resolve) => {
                Alert.alert(
                  'Regenerate QR?',
                  'This will invalidate your previous QR code.',
                  [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Regenerate', style: 'destructive', onPress: () => resolve(true) },
                  ]
                );
              });
              if (!confirmed) return;
            }
            generateQr();
          }}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>{qrCode ? 'Regenerate QR Code' : 'Generate QR Code'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: '#2d3748' },
  subtitle: { color: '#6c757d', marginTop: 4 },
  btn: { marginTop: 8, backgroundColor: '#4e73df', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  errorText: { color: '#ff3b30', fontSize: 14, textAlign: 'center', marginTop: 8 },
  scannerBox: { height: 320, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  scanText: { textAlign: 'center', marginTop: 12, fontSize: 16, color: '#343a40' },
  scanActions: { marginTop: 12, alignItems: 'center' },
  logsContainer: { marginTop: 16, backgroundColor: '#f8f9fa', borderRadius: 12, padding: 12 },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '85%', backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#2d3748', marginBottom: 6, textAlign: 'center' },
  modalMessage: { color: '#6c757d', textAlign: 'center', marginBottom: 12 },
  modalBtn: { backgroundColor: '#e03131', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  modalBtnText: { color: '#fff', fontWeight: '700' },
  logEmpty: { color: '#6c757d', textAlign: 'center' },
  logItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  logText: { color: '#212529' },
  logSub: { color: '#6c757d', fontSize: 12 },
  sessionCard: { backgroundColor: '#f8f9fa', borderRadius: 12, padding: 12, marginTop: 16 },
});
