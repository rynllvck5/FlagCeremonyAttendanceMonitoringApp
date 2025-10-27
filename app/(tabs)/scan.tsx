import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { biometricSignCanonical, ensureCryptoIdentity, registerPublicKeyWithServer } from '../../lib/cryptoIdentity';

export default function ScanSessionScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && (permission as any).canAskAgain) requestPermission();
  }, [permission]);

  useFocusEffect(useCallback(() => {
    setScanned(false);
    setResultMsg(null);
    return () => {};
  }, []));

  const onScanned = async (token: string) => {
    if (busy) return;
    setBusy(true);
    try {
      setResultMsg(null);
      // 1) Ensure we have a crypto identity locally and register the public key with server
      const id = await ensureCryptoIdentity();
      const reg = await registerPublicKeyWithServer();
      if (!reg.ok) throw new Error(reg.error || 'Failed to register public key');

      // 2) Get location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Location permission denied');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const ts = new Date().toISOString();

      // 3) Biometric challenge + sign
      const signature = await biometricSignCanonical(token, lat, lng, ts);

      // 4) Send to verifier (Edge Function)
      const { data, error } = await supabase.functions.invoke('verify-proof', {
        body: { token, lat, lng, timestamp: ts, signature },
      });
      if (error) throw new Error(error.message || 'Verification failed');
      setResultMsg('Attendance recorded successfully.');
    } catch (e: any) {
      console.error('[Scan] error', e);
      setResultMsg(e?.message || 'Failed to record attendance');
    } finally {
      setBusy(false);
      setScanned(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}> 
        <Text>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}> 
        <Text style={{ marginBottom: 8 }}>We need camera access to scan the session QR.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.scannerBox}>
        <CameraView
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : (res) => {
            setScanned(true);
            const token = (res as any).data as string;
            onScanned(token);
          }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <Text style={styles.caption}>Scan the session QR to mark your attendance</Text>
      {busy && <ActivityIndicator style={{ marginTop: 10 }} />}
      {resultMsg && <Text style={[styles.caption, { color: resultMsg.includes('success') ? '#28a745' : '#e03131' }]}>{resultMsg}</Text>}
      {scanned && !busy && (
        <TouchableOpacity style={[styles.btn, { marginTop: 12 }]} onPress={() => { setScanned(false); setResultMsg(null); }}>
          <Text style={styles.btnText}>Scan Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  scannerBox: { height: 320, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  caption: { textAlign: 'center', marginTop: 10, color: '#6c757d' },
  btn: { backgroundColor: '#4e73df', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
});
