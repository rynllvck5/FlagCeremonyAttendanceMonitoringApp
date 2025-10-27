import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Switch, TouchableOpacity, Alert, TextInput, ScrollView, RefreshControl } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

interface SettingItemProps {
  title: string;
  description: string;
  type: 'switch' | 'button' | 'text';
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
  buttonText?: string;
  buttonType?: 'default' | 'danger';
}

const SettingItem = ({
  title,
  description,
  type,
  value,
  onValueChange,
  onPress,
  buttonText,
  buttonType = 'default',
}: SettingItemProps) => (
  <View style={styles.settingItem}>
    <View style={styles.settingInfo}>
      <Text style={styles.settingTitle}>{title}</Text>
      <Text style={styles.settingDescription}>{description}</Text>
    </View>
    
    {type === 'switch' && onValueChange !== undefined && (
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#767577', true: '#81b0ff' }}
        thumbColor={value ? '#007AFF' : '#f4f3f4'}
      />
    )}
    
    {type === 'button' && onPress && (
      <TouchableOpacity 
        style={[
          styles.button, 
          buttonType === 'danger' ? styles.dangerButton : {}
        ]} 
        onPress={onPress}
      >
        <Text style={[
          styles.buttonText,
          buttonType === 'danger' ? styles.dangerButtonText : {}
        ]}>
          {buttonText}
        </Text>
      </TouchableOpacity>
    )}
  </View>
);

export default function SettingsScreen() {
  const { profile, signOut, refreshProfile } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isAdmin = ['admin','superadmin'].includes(profile?.role || '');

  // Registration token generation (admin)
  const [regBusy, setRegBusy] = useState(false);
  const [regTTL, setRegTTL] = useState('10'); // minutes
  const [regToken, setRegToken] = useState<string | null>(null);
  const [regExpiresAtMs, setRegExpiresAtMs] = useState<number | null>(null);
  const [regExpiresDisplay, setRegExpiresDisplay] = useState<string | null>(null);
  const [regCountdown, setRegCountdown] = useState<string>('');

  // Drive countdown and auto-clear on expiry
  useEffect(() => {
    let t: any;
    const fmt = (n: number) => (n < 10 ? `0${n}` : String(n));
    const update = async () => {
      if (regExpiresAtMs == null) return;
      const delta = Math.max(0, Math.floor((regExpiresAtMs - Date.now()) / 1000));
      const mm = Math.floor(delta / 60);
      const ss = delta % 60;
      setRegCountdown(`${fmt(mm)}:${fmt(ss)}`);
      if (delta <= 0 && regToken) {
        // Try to delete expired token (best effort)
        try {
          await supabase.from('registration_tokens')
            .delete()
            .eq('token', regToken)
            .lte('expires_at', new Date().toISOString());
        } catch {}
        setRegToken(null);
        setRegExpiresAtMs(null);
        setRegExpiresDisplay(null);
        setRegCountdown('');
        clearInterval(t);
      }
    };
    if (regExpiresAtMs != null) {
      update();
      t = setInterval(update, 1000);
    }
    return () => t && clearInterval(t);
  }, [regExpiresAtMs, regToken]);

  const generateRegistrationToken = async () => {
    try {
      setRegBusy(true);
      const ttl = parseInt(regTTL, 10) || 10;
      const { data, error } = await supabase.rpc('generate_registration_token', { p_ttl_minutes: ttl });
      if (error) throw error;
      const token = (data as any)?.token as string | undefined;
      const expiresAt = (data as any)?.expires_at as string | undefined;
      if (!token || !expiresAt) throw new Error('Server did not return token');
      setRegToken(token);
      const ms = new Date(expiresAt).getTime();
      setRegExpiresAtMs(isFinite(ms) ? ms : null);
      setRegExpiresDisplay(new Date(expiresAt).toLocaleString());
      Alert.alert('Master Key Created', 'Share the QR or token with the student to open registration.');
    } catch (e: any) {
      console.error('[Settings] generateRegistrationToken', e);
      Alert.alert('Error', e?.message || 'Failed to create registration token');
    } finally {
      setRegBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill out both password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters.');
      return;
    }

    try {
      setChangingPw(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setShowChangePw(false);
      await refreshProfile();
      Alert.alert('Success', 'Password changed successfully.');
    } catch (e: any) {
      console.error('[Settings] changePassword error:', e);
      Alert.alert('Error', e?.message || 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              // First delete the user profile
              const { error: profileError } = await supabase
                .from('user_profiles')
                .delete()
                .eq('id', profile?.id);

              if (profileError) throw profileError;

              // Then delete the auth user
              const { error: authError } = await supabase.auth.admin.deleteUser(
                profile?.id || ''
              );

              if (authError) throw authError;

              // Sign out the user
              await signOut();
            } catch (error) {
              console.error('Error deleting account:', error);
              Alert.alert('Error', 'Failed to delete account');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleExportData = async () => {
    Alert.alert('Coming Soon!', 'Data export feature is coming soon!');
  };

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshProfile();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.section}>
        <SettingItem
          title="Push Notifications"
          description="Receive push notifications for important updates"
          type="switch"
          value={notificationsEnabled}
          onValueChange={(val) => {
            if (val) {
              Alert.alert('Coming Soon!', 'Push notifications feature is coming soon!');
            }
            setNotificationsEnabled(val);
          }}
        />
        <SettingItem
          title="Dark Mode"
          description="Enable dark theme"
          type="switch"
          value={darkMode}
          onValueChange={(val) => {
            if (val) {
              Alert.alert('Coming Soon!', 'Dark mode feature is coming soon!');
            }
            setDarkMode(val);
          }}
        />
      </View>

      {isAdmin && (
        <>
          <Text style={styles.sectionTitle}>Registration (Admin)</Text>
          <View style={styles.section}>
            <View style={{ padding: 16 }}>
              <Text style={styles.formLabel}>Duration (minutes)</Text>
              <TextInput style={styles.input} value={regTTL} onChangeText={setRegTTL} keyboardType="numeric" />
              <TouchableOpacity 
                style={[styles.inlineBtn, { backgroundColor: '#4e73df', marginTop: 12 }]} 
                onPress={generateRegistrationToken} 
                disabled={regBusy}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{regBusy ? 'Creating…' : 'Generate Master Key'}</Text>
              </TouchableOpacity>

              {regToken && (
                <View style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={{ color: '#6c757d', marginBottom: 8 }}>Share this QR or token with the student</Text>
                  {(() => {
                    try {
                      const QRCode = require('react-native-qrcode-svg').default;
                      return <QRCode value={regToken} size={220} />;
                    } catch {
                      return <Text selectable>{regToken}</Text>;
                    }
                  })()}
                  <Text style={{ color: '#6c757d', marginTop: 8 }}>Token: <Text selectable style={{ fontWeight: '700', color: '#212529' }}>{regToken}</Text></Text>
                  <Text style={{ color: '#6c757d', marginTop: 4 }}>Expires at: {regExpiresDisplay ?? '—'}</Text>
                  {regCountdown ? (
                    <Text style={{ color: '#e03131', marginTop: 4 }}>Time left: {regCountdown}</Text>
                  ) : null}
                </View>
              )}
            </View>
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.section}>
        {!showChangePw ? (
          <SettingItem
            title="Change Password"
            description="Update your account password"
            type="button"
            buttonText="Change"
            onPress={() => setShowChangePw(true)}
          />
        ) : (
          <View style={{ padding: 16 }}>
            <Text style={styles.formLabel}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
              secureTextEntry
            />
            <Text style={[styles.formLabel, { marginTop: 12 }]}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              secureTextEntry
            />
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <TouchableOpacity 
                style={[styles.inlineBtn, { backgroundColor: '#e9ecef' }]}
                onPress={() => { setShowChangePw(false); setNewPassword(''); setConfirmPassword(''); }}
                disabled={changingPw}
              >
                <Text style={{ color: '#212529', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.inlineBtn, { backgroundColor: '#007AFF', marginLeft: 8 }]}
                onPress={handleChangePassword}
                disabled={changingPw}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{changingPw ? 'Changing...' : 'Change Password'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <SettingItem
          title="Export My Data"
          description="Download a copy of your data"
          type="button"
          buttonText="Export"
          onPress={handleExportData}
        />
      </View>

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.section}>
        <SettingItem
          title="Version"
          description="1.0.0"
          type="text"
        />
        <SettingItem
          title="Terms of Service"
          description=""
          type="button"
          buttonText="View"
          onPress={() => Alert.alert('Coming Soon!', 'Terms of Service will be available soon!')}
        />
        <SettingItem
          title="Privacy Policy"
          description=""
          type="button"
          buttonText="View"
          onPress={() => Alert.alert('Coming Soon!', 'Privacy Policy will be available soon!')}
        />
      </View>

      <View style={styles.section}>
        <SettingItem
          title="Sign Out"
          description="Sign out of your account"
          type="button"
          buttonText="Sign Out"
          onPress={handleSignOut}
          buttonType="danger"
        />
        {profile?.role === 'superadmin' && (
          <SettingItem
            title="Delete Account"
            description="Permanently delete your account and all data"
            type="button"
            buttonText="Delete"
            onPress={handleDeleteAccount}
            buttonType="danger"
          />
        )}
      </View>

      <Text style={styles.footer}>
        © {new Date().getFullYear()} Attendance Monitoring App
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6c757d',
    marginBottom: 8,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: '#6c757d',
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  buttonText: {
    color: '#007AFF',
    fontWeight: '500',
  },
  dangerButton: {
    borderColor: '#dc3545',
  },
  dangerButtonText: {
    color: '#dc3545',
  },
  footer: {
    textAlign: 'center',
    color: '#6c757d',
    marginTop: 8,
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 13,
    color: '#6c757d',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  inlineBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
});
