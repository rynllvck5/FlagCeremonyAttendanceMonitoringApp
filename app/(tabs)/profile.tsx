import { useState, useEffect, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';
import { Alert, StyleSheet, Text, TouchableOpacity, View, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
import { supabase, SUPABASE_URL } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, signOut, refreshProfile } = useAuth();
  const { unreadCount, refetch: refetchUnreadCount } = useUnreadNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const [profilePicUploading, setProfilePicUploading] = useState(false);
  const [profilePicturePath, setProfilePicturePath] = useState<string | null>(null);

  useEffect(() => {
    setProfilePicturePath(profile?.profile_picture ?? null);
  }, [profile?.profile_picture]);

  useFocusEffect(
    useCallback(() => {
      refetchUnreadCount();
    }, [refetchUnreadCount])
  );


  // No inline personal info editing on this screen

  const handlePickProfilePicture = async () => {
    if (!profile) return;
    try {
      console.log('[Profile] Avatar pressed');
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('[Profile] Media library permission:', permissionResult);
      if (!permissionResult.granted) {
        Alert.alert('Permission required', 'Permission to access media library is required!');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });
      console.log('[Profile] Picker result:', pickerResult);

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        setProfilePicUploading(true);
        try {
          const uri = pickerResult.assets[0].uri;
          const fileName = uri.split('/').pop() || `profile_${profile.id}.jpg`;
          const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
          const contentType = ext === 'png' ? 'image/png' : ext === 'jpeg' || ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

          // Perform REST upload via Expo FileSystem for reliability in React Native
          const storagePath = `${profile.id}/${fileName}`;
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) {
            throw new Error('No active session');
          }

          const uploadUrl = `${SUPABASE_URL}/storage/v1/object/profile-pictures/${encodeURIComponent(storagePath)}`;
          const uploadOptions: any = {
            httpMethod: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': contentType,
              'x-upsert': 'true',
              'cache-control': '3600',
            },
            // Bypass type differences across SDK versions
            uploadType: (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT,
          };
          const result = await FileSystem.uploadAsync(uploadUrl, uri, uploadOptions);

          if (result.status < 200 || result.status >= 300) {
            throw new Error(`Upload failed: ${result.status} ${result.body}`);
          }

          // Update user_profiles with filename
          const { error: updateErr } = await supabase
            .from('user_profiles')
            .update({ profile_picture: storagePath })
            .eq('id', profile.id);
          if (updateErr) throw updateErr;

          // Update local UI immediately
          setProfilePicturePath(storagePath);
          await refreshProfile();
          Alert.alert('Success', 'Profile picture updated!');
        } catch (err) {
          console.error('[Profile] Upload error:', err);
          Alert.alert('Error', 'Failed to upload profile picture.');
        } finally {
          setProfilePicUploading(false);
        }
      }
    } catch (e) {
      console.error('[Profile] Error handling image pick:', e);
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

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={{ color: '#212529' }}>Loading...</Text>
      </View>
    );
  }

  // Build display name: Firstname M. Lastname (middle initial if available)
  const middleInitial = profile.middle_name
    ? `${profile.middle_name.charAt(0)}.`
    : '';
  const displayName = `${profile.first_name ?? ''} ${middleInitial ? middleInitial + ' ' : ''}${profile.last_name ?? ''}`.trim();

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshProfile();
      await refetchUnreadCount();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> }>
      {/* Header Card */}
      <View style={[styles.headerCard, { backgroundColor: '#fff', borderColor: '#e9ecef' }]}> 
        <View style={{ alignItems: 'center' }}>
          <TouchableOpacity 
            onPress={handlePickProfilePicture} 
            disabled={profilePicUploading}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            {profilePicturePath ? (
              <Image
                source={{ uri: `${supabase.storage.from('profile-pictures').getPublicUrl(profilePicturePath).data.publicUrl}?t=${Date.now()}` }}
                style={styles.avatarImg}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: '#007AFF' }] }>
                <Text style={styles.avatarText}>
                  {profile.first_name?.charAt(0)}{profile.last_name?.charAt(0)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={[styles.name, { color: '#212529' }]}>{displayName}</Text>
          <Text style={[styles.emailValue, { color: '#6c757d' }]}>{profile.email}</Text>
          <View style={[styles.rolePill, { backgroundColor: '#e9ecef' }]}> 
            <Text style={{ color: '#6c757d', textTransform: 'capitalize', fontWeight: '700' }}>{profile.role}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
          <TouchableOpacity 
            style={[styles.primaryBtn, { backgroundColor: '#007AFF' }]}
            onPress={() => router.push('/(tabs)/edit-profile')}
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.secondaryBtn, { borderColor: '#e9ecef' }]}
            onPress={() => router.push('/(tabs)/settings')}
          >
            <Ionicons name="settings-outline" size={18} color={'#212529'} />
            <Text style={[styles.secondaryBtnText, { color: '#212529' }]}>Settings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Links */}
      <View style={[styles.listCard, { backgroundColor: '#fff', borderColor: '#e9ecef' }]}> 
        <TouchableOpacity 
          style={styles.listItem}
          onPress={() => router.push('/(tabs)/notifications')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="notifications-outline" size={20} color={'#212529'} style={{ marginRight: 10 }} />
            <Text style={[styles.listItemText, { color: '#212529' }]}>Notifications</Text>
          </View>
          {unreadCount > 0 ? (
            <View style={[styles.unreadBadge, { backgroundColor: '#e03131' }]}>
              <Text style={[styles.unreadBadgeText, { color: '#fff' }]}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={'#6c757d'} />
          )}
        </TouchableOpacity>
      </View>

      {/* Account */}
      <View style={[styles.listCard, { backgroundColor: '#fff', borderColor: '#e9ecef' }]}> 
        <TouchableOpacity 
          style={[styles.signOutBtn, { backgroundColor: '#ef3b3b20', borderColor: '#ef3b3b40' }]} 
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={18} color="#e03131" />
          <Text style={[styles.signOutText]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const getRoleColor = (role: string) => {
  switch (role) {
    case 'superadmin':
      return '#6f42c1';
    case 'admin':
      return '#e83e8c';
    case 'teacher':
      return '#20c997';
    case 'student':
      return '#17a2b8';
    default:
      return '#6c757d';
  }
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
  },
  headerCard: {
    margin: 16,
    marginTop: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    resizeMode: 'cover',
    backgroundColor: '#eee',
  },
  avatarText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  role: {
    fontSize: 16,
    color: '#6c757d',
    textTransform: 'capitalize',
  },
  listCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginHorizontal: 20,
    marginBottom: 6,
  },
  editButton: {
    color: '#007AFF',
    fontWeight: '600',
  },
  editActions: {
    flexDirection: 'row',
  },
  cancelButton: {
    marginRight: 12,
    padding: 8,
  },
  cancelButtonText: {
    color: '#6c757d',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  emailValue: {
    fontSize: 14,
    paddingTop: 4,
  },
  rolePill: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'center',
  },
  email: {
    color: '#6c757d',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  roleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontWeight: '700',
  },
  listItem: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listItemText: {
    fontSize: 16,
    fontWeight: '600',
  },
  unreadBadge: {
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  signOutBtn: {
    margin: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  signOutText: {
    color: '#e03131',
    fontWeight: '800',
  },
});
