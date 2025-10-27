import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function RegisterGateScreen() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (scanMode && permission && !permission.granted && (permission as any).canAskAgain) requestPermission();
  }, [scanMode, permission]);

  const startSession = async (t: string) => {
    if (!t) {
      Alert.alert('Missing Token', 'Please enter or scan a registration token.');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('start_registration_session', { p_token: t });
      if (error) throw error;
      if (!data) throw new Error('No session returned');
      router.replace({ pathname: '/register', params: { sid: String(data) } } as any);
    } catch (e: any) {
      Alert.alert('Invalid Token', e?.message || 'Please ask admin for a valid token');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <TouchableOpacity onPress={() => router.replace('/login')} style={{ padding: 8, marginRight: 6 }} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color="#4e73df" />
        </TouchableOpacity>
        <Text style={styles.title}>Registration Gate</Text>
      </View>
      <Text style={styles.subtitle}>Enter the master key or scan a QR code from the Admin to open registration.</Text>

      {!scanMode ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Enter master key"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
          />
          <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} onPress={() => startSession(token)} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Please wait…' : 'Use Master Key'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.linkBtn]} onPress={() => setScanMode(true)}>
            <Text style={styles.linkText}>Or Scan QR Code</Text>
          </TouchableOpacity>
        </>
      ) : !permission || !permission.granted ? (
        <>
          <Text style={{ textAlign: 'center', color: '#6c757d', marginTop: 12 }}>Camera permission needed to scan</Text>
          <TouchableOpacity style={[styles.button, { marginTop: 12 }]} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.linkBtn]} onPress={() => setScanMode(false)}>
            <Text style={styles.linkText}>Use Master Key Instead</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.scannerBox}>
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(res) => {
              const t = (res as any).data as string;
              setScanMode(false);
              startSession(t);
            }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6c757d', textAlign: 'center', marginTop: 6, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 16, borderRadius: 8, fontSize: 16 },
  button: { backgroundColor: '#007AFF', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700' },
  linkBtn: { alignItems: 'center', marginTop: 10 },
  linkText: { color: '#4e73df', fontWeight: '600' },
  scannerBox: { height: 320, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', marginTop: 12 },
});
