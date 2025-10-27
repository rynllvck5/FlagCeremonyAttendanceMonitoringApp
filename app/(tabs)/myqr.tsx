import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import QRCode from 'react-native-qrcode-svg';

export default function MyQRScreen() {
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
      // Create a unique code per user each time
      const newCode = `${profile.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const { error } = await supabase
        .from('user_profiles')
        .update({ qr_code: newCode, updated_at: new Date().toISOString() })
        .eq('id', profile.id);

      if (error) throw error;
      setQrCode(newCode);
      Alert.alert('Success', 'QR Code has been generated.');
    } catch (e: any) {
      console.error('[MyQR] Generate error:', e);
      Alert.alert('Error', e?.message || 'Failed to generate QR Code. Ensure qr_code column exists.');
    } finally {
      setGenerating(false);
    }
  };

  if (!profile) {
    return (
      <View style={styles.container}> 
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>My QR Code</Text>

      <View style={styles.qrContainer}>
        {qrCode ? (
          <QRCode value={qrCode} size={220} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>No QR Code yet</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.button}
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
          <Text style={styles.buttonText}>{qrCode ? 'Regenerate QR Code' : 'Generate QR Code'}</Text>
        )}
      </TouchableOpacity>

      {qrCode && (
        <Text style={styles.codeText}>{qrCode}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8f9fa',
    minHeight: '100%'
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  qrContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 16,
  },
  placeholder: {
    width: 220,
    height: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  placeholderText: {
    color: '#6c757d',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  codeText: {
    marginTop: 12,
    color: '#6c757d',
    fontSize: 12,
  },
});
