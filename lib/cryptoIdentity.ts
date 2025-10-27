import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import * as ed from '@noble/ed25519';
import { utf8ToBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { supabase } from './supabase';

const PRIVKEY_ITEM = 'amx_ed25519_privkey_v1';
const PUBKEY_ITEM = 'amx_ed25519_pubkey_v1';

export type CryptoIdentity = {
  publicKey: string; // hex
  deviceId: string;
  createdAt: string;
};

export async function ensureCryptoIdentity(): Promise<CryptoIdentity> {
  // Try to get existing keys
  let pubHex = await SecureStore.getItemAsync(PUBKEY_ITEM);
  let privHex = await SecureStore.getItemAsync(PRIVKEY_ITEM, { requireAuthentication: false });

  if (!pubHex || !privHex) {
    // Generate new keypair
    const privBytes = await ed.utils.randomPrivateKey();
    const pubBytes = await ed.getPublicKeyAsync(privBytes);
    const privHexNew = bytesToHex(privBytes);
    const pubHexNew = bytesToHex(pubBytes);

    await SecureStore.setItemAsync(PRIVKEY_ITEM, privHexNew, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      requireAuthentication: true, // Gate private key behind biometrics / device unlock
    });
    await SecureStore.setItemAsync(PUBKEY_ITEM, pubHexNew, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      requireAuthentication: false,
    });
    privHex = privHexNew;
    pubHex = pubHexNew;
  }

  const deviceId = await getDeviceIdAsync();
  const createdAt = new Date().toISOString();
  return { publicKey: pubHex!, deviceId, createdAt };
}

export async function registerPublicKeyWithServer(): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };
  const { publicKey, deviceId } = await ensureCryptoIdentity();
  const { error } = await supabase
    .from('user_profiles')
    .update({ public_key: publicKey, device_id: deviceId, crypto_identity_created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function biometricSignCanonical(token: string, lat: number, lng: number, timestampIso: string): Promise<string> {
  // Prompt for biometric before retrieving private key
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) throw new Error('Biometric hardware not available');
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) throw new Error('No biometrics enrolled on device');
  const auth = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to sign attendance' });
  if (!auth.success) throw new Error(auth.error || 'Authentication failed');

  const privHex = await SecureStore.getItemAsync(PRIVKEY_ITEM, { requireAuthentication: true });
  if (!privHex) throw new Error('Missing private key');

  const message = canonicalMessage(token, lat, lng, timestampIso);
  const msgBytes = utf8ToBytes(message);
  const privBytes = hexToBytes(privHex);
  const sigBytes = await ed.signAsync(msgBytes, privBytes);
  const signature = bytesToHex(sigBytes);
  return signature;
}

export function canonicalMessage(token: string, lat: number, lng: number, timestampIso: string): string {
  const latStr = lat.toFixed(6);
  const lngStr = lng.toFixed(6);
  return `v1|${token}|${timestampIso}|${latStr}|${lngStr}`;
}

async function getDeviceIdAsync(): Promise<string> {
  try {
    if (Platform.OS === 'android') {
      const id = await (Application as any).getAndroidId?.();
      return id || (Application as any).androidId || 'android-unknown';
    }
    if (Platform.OS === 'ios') {
      const id = await Application.getIosIdForVendorAsync();
      return id || 'ios-unknown';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
