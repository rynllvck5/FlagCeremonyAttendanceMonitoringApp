import React, { useCallback, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator, ScrollView, Image, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { supabaseAdmin } from '../../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase, SUPABASE_URL } from '../../../lib/supabase';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import { useFocusEffect } from '@react-navigation/native';

export default function NewStudentScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [useDefaultPwd, setUseDefaultPwd] = useState(false);
  const [program, setProgram] = useState('');
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');

  // Options and modals for dynamic selects
  const [programs, setPrograms] = useState<Array<{ code: string; name: string; college_code: string }>>([]);
  const [years, setYears] = useState<Array<{ year_name: string }>>([]);
  const [sections, setSections] = useState<Array<{ section_name: string }>>([]);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  // Load options
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.from('programs').select('code, name, college_code').order('name');
        if (mounted) setPrograms(data || []);
      } catch { if (mounted) setPrograms([]); }
    })();
    return () => { mounted = false; };
  }, []);
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!program) { if (mounted) { setYears([]); setSections([]); } return; }
      try {
        const { data } = await supabase.from('program_years').select('year_name').eq('program_code', program).order('year_name');
        if (mounted) setYears(data || []);
      } catch { if (mounted) setYears([]); }
    })();
    return () => { mounted = false; };
  }, [program]);
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!program || !year) { if (mounted) setSections([]); return; }
      try {
        const { data } = await supabase.from('program_sections').select('section_name').eq('program_code', program).eq('year_name', year).order('section_name');
        if (mounted) setSections(data || []);
      } catch { if (mounted) setSections([]); }
    })();
    return () => { mounted = false; };
  }, [program, year]);

  // Post-creation wizard
  const [step, setStep] = useState<'form' | 'avatar' | 'qr' | 'fingerprint'>('form');
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [createdFullName, setCreatedFullName] = useState<string>('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [generatedQR, setGeneratedQR] = useState<string | null>(null);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [hasUploadedAvatar, setHasUploadedAvatar] = useState(false);
  const [savedFirstName, setSavedFirstName] = useState('');
  const [savedMiddleName, setSavedMiddleName] = useState('');
  const [savedLastName, setSavedLastName] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [disableOverride, setDisableOverride] = useState(false);

  const QRCode = React.useMemo(() => {
    try {
      return require('react-native-qrcode-svg').default;
    } catch {
      return null;
    }
  }, []);

  const goPrev = () => {
    setStep((s) => (s === 'fingerprint' ? 'qr' : s === 'qr' ? 'avatar' : s === 'avatar' ? 'form' : 'form'));
  };

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

  const handleRegisterFingerprint = async () => {
    if (!createdUserId) { Alert.alert('Not Ready', 'Create the student first.'); return; }
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) { Alert.alert('Not Supported', 'This device does not support biometric authentication.'); return; }
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) { Alert.alert('No Biometrics Enrolled', 'Please enroll a fingerprint/biometric in device settings first.'); return; }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Authenticate to register biometrics', cancelLabel: 'Cancel' });
      if (!result.success) { Alert.alert('Authentication Failed', (result as any).error || 'Could not authenticate.'); return; }
      const deviceId = await getDeviceIdAsync();
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('user_profiles')
        .update({ biometric_enabled: true, biometric_registered_at: nowIso, biometric_device_id: deviceId })
        .eq('id', createdUserId);
      if (error) throw error;
      setBiometricEnabled(true);
      setDisableOverride(false);
      Alert.alert('Success', 'Biometric verification enabled for this user.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to register biometrics.');
    }
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!createdUserId) return;
        try {
          const { data } = await supabase
            .from('user_profiles')
            .select('biometric_enabled')
            .eq('id', createdUserId)
            .maybeSingle();
          if (active) setBiometricEnabled(!!data?.biometric_enabled);
        } catch {
          if (active) setBiometricEnabled(false);
        }
      })();
      return () => { active = false; };
    }, [createdUserId])
  );

  const onSubmit = async () => {
    if (!isAdmin) return;
    if (!supabaseAdmin) {
      Alert.alert('Configuration Error', 'Service role key is missing. Please set SUPABASE_SERVICE_ROLE_KEY or EXPO_PUBLIC_SUPABASE_SERVICE_KEY.');
      return;
    }
    const missingBase = !firstName.trim() || !middleName.trim() || !lastName.trim() || !email.trim();

    // If a user was already created, treat this as an update to details instead of creating a new user
    if (createdUserId) {
      if (missingBase) {
        Alert.alert('Missing Fields', 'Please fill in first name, middle name, last name, and email.');
        return;
      }
      try {
        setLoading(true);
        // Update auth email if changed
        const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(createdUserId);
        const currentEmail = existingUser?.user?.email;
        if (currentEmail && email.trim() !== currentEmail) {
          const { error: updAuthErr } = await (supabaseAdmin as any).auth.admin.updateUserById(createdUserId, { email: email.trim() });
          if (updAuthErr) throw updAuthErr;
        }

        // Update profile details (force role 'student')
        const selProg = programs.find(p => p.code === program);
        const { error: upErr } = await supabaseAdmin.from('user_profiles').upsert({
          id: createdUserId,
          first_name: firstName.trim(),
          middle_name: middleName.trim(),
          last_name: lastName.trim(),
          role: 'student',
          email: email.trim(),
          program: program.trim() || null,
          year: year.trim() || null,
          section: section.trim() || null,
          college: selProg?.college_code || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (upErr) throw upErr;

        const full = `${firstName.trim()} ${middleName.trim()} ${lastName.trim()}`.trim();
        setCreatedFullName(full);
        setSavedFirstName(firstName.trim());
        setSavedMiddleName(middleName.trim());
        setSavedLastName(lastName.trim());
        setSavedEmail(email.trim());
        // proceed to next step
        setStep('avatar');
      } catch (e: any) {
        console.error('[NewStudent] update details error', e);
        Alert.alert('Error', e?.message ?? 'Failed to update student details');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (missingBase || !password) {
      Alert.alert('Missing Fields', 'Please fill in first name, middle name, last name, email, and password.');
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName.trim(),
          middle_name: middleName.trim(),
          last_name: lastName.trim(),
          role: 'student',
        },
      });
      if (error) throw error;
      const userId = data.user?.id;
      if (!userId) throw new Error('User creation failed.');

      // Upsert profile details (role 'student', names)
      const selProg = programs.find(p => p.code === program);
      const { error: upErr } = await supabaseAdmin.from('user_profiles').upsert({
        id: userId,
        first_name: firstName.trim(),
        middle_name: middleName.trim(),
        last_name: lastName.trim(),
        role: 'student',
        email: email.trim(),
        program: program.trim() || null,
        year: year.trim() || null,
        section: section.trim() || null,
        college: selProg?.college_code || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (upErr) throw upErr;

      // Prepare wizard state
      const full = `${firstName.trim()} ${middleName.trim()} ${lastName.trim()}`.trim();
      setCreatedUserId(userId);
      setCreatedFullName(full);
      setSavedFirstName(firstName.trim());
      setSavedMiddleName(middleName.trim());
      setSavedLastName(lastName.trim());
      setSavedEmail(email.trim());
      setPassword('');
      setUseDefaultPwd(false);
      setShowPassword(false);
      // proceed to next step
      setStep('avatar');
    } catch (e: any) {
      console.error('[NewStudent] create error', e);
      Alert.alert('Error', e?.message ?? 'Failed to create student');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadAvatar = async () => {
    if (!createdUserId) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'Permission to access media library is required!');
        return;
      }
      const pick = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (pick.canceled || !pick.assets?.length) return;
      setUploadingAvatar(true);
      const uri = pick.assets[0].uri;
      setAvatarPreviewUri(uri);
      const fileName = uri.split('/').pop() || `profile_${createdUserId}.jpg`;
      const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
      const contentType = ext === 'png' ? 'image/png' : ext === 'jpeg' || ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const storagePath = `${createdUserId}/${fileName}`;

      // Use current session token to upload to Storage
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('No active session');

      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/profile-pictures/${encodeURIComponent(storagePath)}`;
      const result = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': contentType,
          'x-upsert': 'true',
          'cache-control': '3600',
        },
        // Bypass type differences across SDK versions
        uploadType: (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT,
      } as any);
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Upload failed: ${result.status} ${result.body}`);
      }

      // Update DB with avatar path
      if (supabaseAdmin) {
        const { error: updErr } = await supabaseAdmin
          .from('user_profiles')
          .update({ profile_picture: storagePath, updated_at: new Date().toISOString() })
          .eq('id', createdUserId);
        if (updErr) throw updErr;
      } else {
        await supabase
          .from('user_profiles')
          .update({ profile_picture: storagePath, updated_at: new Date().toISOString() })
          .eq('id', createdUserId);
      }
      setHasUploadedAvatar(true);
    } catch (err: any) {
      console.error('[NewStudent] avatar upload error', err);
      Alert.alert('Error', err?.message || 'Failed to upload profile picture. You can skip this step.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleGenerateQr = async () => {
    if (!createdUserId) return;
    try {
      setGeneratingQR(true);
      const newCode = `${createdUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin
          .from('user_profiles')
          .update({ qr_code: newCode, updated_at: new Date().toISOString() })
          .eq('id', createdUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_profiles')
          .update({ qr_code: newCode, updated_at: new Date().toISOString() })
          .eq('id', createdUserId);
        if (error) throw error;
      }
      setGeneratedQR(newCode);
    } catch (e: any) {
      console.error('[NewStudent] generate QR error', e);
      Alert.alert('Error', e?.message || 'Failed to generate QR Code. You can skip this step.');
    } finally {
      setGeneratingQR(false);
    }
  };

  const isCreateMode = !createdUserId;
  const isBaseValid = firstName.trim().length > 0 && middleName.trim().length > 0 && lastName.trim().length > 0 && email.trim().length > 0;
  const isChanged = createdUserId ? (
    firstName.trim() !== savedFirstName ||
    middleName.trim() !== savedMiddleName ||
    lastName.trim() !== savedLastName ||
    email.trim() !== savedEmail
  ) : false;
  const canSave = isCreateMode ? (isBaseValid && password.length > 0) : (isBaseValid && isChanged);
  const canNextFromForm = true;

  const resetAll = () => {
    setFirstName('');
    setMiddleName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setUseDefaultPwd(false);
    setStep('form');
    setCreatedUserId(null);
    setCreatedFullName('');
    setUploadingAvatar(false);
    setGeneratedQR(null);
    setGeneratingQR(false);
    setAvatarPreviewUri(null);
    setHasUploadedAvatar(false);
    setSavedFirstName('');
    setSavedMiddleName('');
    setSavedLastName('');
    setSavedEmail('');
    setProgram(''); setYear(''); setSection('');
    setDisableOverride(false);
  };

  const handleFinish = () => {
    if (!createdUserId) {
      Alert.alert('Incomplete', 'Please create the student first.');
      return;
    }
    if (!(biometricEnabled || disableOverride)) {
      Alert.alert('Fingerprint Step', 'Please register fingerprint or disable biometrics to finish.');
      return;
    }
    Alert.alert('Success', 'Student setup finished.', [
      {
        text: 'OK',
        onPress: () => {
          resetAll();
          router.replace('/(tabs)/students');
        },
      },
    ]);
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.noAccess}>You do not have permission to view this page.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {step === 'form' ? (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#4e73df" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
        <Text style={styles.title}>New Student</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {step === 'form' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Account Information</Text>
              <TextInput
                style={styles.input}
                placeholder="First Name (required)"
                placeholderTextColor="#adb5bd"
                value={firstName}
                onChangeText={setFirstName}
              />
              <TextInput
                style={styles.input}
                placeholder="Middle Name (required)"
                placeholderTextColor="#adb5bd"
                value={middleName}
                onChangeText={setMiddleName}
              />
              <TextInput
                style={styles.input}
                placeholder="Last Name (required)"
                placeholderTextColor="#adb5bd"
                value={lastName}
                onChangeText={setLastName}
              />
              <TextInput
                style={styles.input}
                placeholder="Email (required)"
                placeholderTextColor="#adb5bd"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Academic Details</Text>
              <TouchableOpacity style={styles.input} onPress={() => setShowProgramModal(true)}>
                <Text style={{ color: program ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{program || 'Select Program'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.input} onPress={() => program && setShowYearModal(true)} disabled={!program}>
                <Text style={{ color: year ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{year || 'Select Year'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.input} onPress={() => program && year && setShowSectionModal(true)} disabled={!program || !year}>
                <Text style={{ color: section ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{section || 'Select Section'}</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Password (required)"
                placeholderTextColor="#adb5bd"
                secureTextEntry={!showPassword}
                editable={isCreateMode && !useDefaultPwd}
                value={password}
                onChangeText={setPassword}
              />
              {isCreateMode && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <TouchableOpacity
                    style={[styles.smallBtn, showPassword && styles.smallBtnActive]}
                    onPress={() => setShowPassword(v => !v)}
                  >
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={16} color={showPassword ? '#fff' : '#4e73df'} />
                    <Text style={[styles.smallBtnText, showPassword && styles.smallBtnTextActive]}>
                      {showPassword ? 'Hide Password' : 'Show Password'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, useDefaultPwd && styles.smallBtnActive]}
                    onPress={() => {
                      const next = !useDefaultPwd;
                      setUseDefaultPwd(next);
                      setPassword(next ? 'Password123!' : '');
                    }}
                  >
                    <Ionicons name="key" size={16} color={useDefaultPwd ? '#fff' : '#4e73df'} />
                    <Text style={[styles.smallBtnText, useDefaultPwd && styles.smallBtnTextActive]}>Use Default Password</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Removed inline Create Student button; use footer Next */}
            </View>
          )}

          {step === 'avatar' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Upload Profile Picture</Text>
              <Text style={{ color: '#6c757d', marginBottom: 12 }}>Student: {createdFullName}</Text>

              <View style={styles.avatarPreview}>
                {avatarPreviewUri ? (
                  <Image source={{ uri: avatarPreviewUri }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={48} color="#868e96" />
                  </View>
                )}
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleUploadAvatar} disabled={uploadingAvatar}>
                {uploadingAvatar ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Choose Photo and Upload</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 'qr' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Generate QR Code</Text>
              <Text style={{ color: '#6c757d', marginBottom: 12 }}>Student: {createdFullName}</Text>
              <View style={styles.qrContainer}>
                {generatedQR ? (
                  QRCode ? (
                    <QRCode value={generatedQR} size={180} />
                  ) : (
                    <Image
                      source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(generatedQR)}` }}
                      style={{ width: 180, height: 180 }}
                    />
                  )
                ) : (
                  <View style={styles.qrPlaceholder}>
                    <Ionicons name="qr-code-outline" size={64} color="#868e96" />
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.submitBtn} onPress={handleGenerateQr} disabled={generatingQR}>
                {generatingQR ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>{generatedQR ? 'Regenerate QR Code' : 'Generate QR Code'}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 'fingerprint' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Fingerprint Registration</Text>
              <Text style={{ color: '#6c757d', marginBottom: 12 }}>Student: {createdFullName}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                <Text style={{ color: '#6c757d' }}>Current Status</Text>
                <Text style={{ color: biometricEnabled ? '#28a745' : (disableOverride ? '#e03131' : '#6c757d'), fontWeight: '700' }}>
                  {biometricEnabled ? 'Enabled' : (disableOverride ? 'Disabled' : 'Not Registered')}
                </Text>
              </View>
              <TouchableOpacity style={styles.submitBtn} onPress={handleRegisterFingerprint} disabled={!createdUserId}>
                <Text style={styles.submitText}>Register Fingerprint</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, { marginTop: 10 }]}
                onPress={async () => {
                  if (!createdUserId) return;
                  try {
                    await supabase
                      .from('user_profiles')
                      .update({ biometric_enabled: false, biometric_registered_at: null, biometric_device_id: null })
                      .eq('id', createdUserId);
                    setBiometricEnabled(false);
                    setDisableOverride(true);
                    Alert.alert('Disabled', 'Biometric verification disabled for this user.');
                  } catch (e: any) {
                    Alert.alert('Error', e?.message || 'Failed to disable biometrics');
                  }
                }}
                disabled={!createdUserId}
              >
                <Text style={styles.secondaryBtnText}>Disable Biometrics</Text>
              </TouchableOpacity>
              <Text style={{ color: '#6c757d', marginTop: 8 }}>
                You may disable biometrics to allow finishing without fingerprint. If disabled, QR scans will be auto-verified.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom progress/footer */}
        <View style={styles.footer}>
          <View style={styles.progressBar}>
            <TouchableOpacity onPress={goPrev} disabled={step === 'form'} style={[styles.progressBackBtn, step === 'form' && { opacity: 0.4 }]}> 
              <Ionicons name="chevron-back" size={16} color={step === 'form' ? '#adb5bd' : '#4e73df'} />
              <Text style={[styles.progressBackText, step === 'form' && { color: '#adb5bd' }]}>Back</Text>
            </TouchableOpacity>
            <View style={styles.dotsContainer}>
              {(['form','avatar','qr','fingerprint'] as const).map((s) => (
                <View key={s} style={[styles.dot, step === s && styles.dotActive]} />
              ))}
            </View>
            {step === 'form' && (
              <TouchableOpacity onPress={onSubmit} disabled={loading} style={[styles.progressSkipBtn, loading && { opacity: 0.4 }]}> 
                <Text style={styles.progressSkipText}>Next</Text>
                <Ionicons name="chevron-forward" size={16} color={loading ? '#adb5bd' : '#4e73df'} />
              </TouchableOpacity>
            )}
            {step === 'avatar' && (
              <TouchableOpacity onPress={() => setStep('qr')} style={styles.progressSkipBtn}>
                <Text style={styles.progressSkipText}>{hasUploadedAvatar ? 'Next' : 'Skip'}</Text>
                <Ionicons name="chevron-forward" size={16} color="#4e73df" />
              </TouchableOpacity>
            )}
            {step === 'qr' && (
              <TouchableOpacity onPress={() => setStep('fingerprint')} style={styles.progressSkipBtn}>
                <Text style={styles.progressSkipText}>Next</Text>
                <Ionicons name="chevron-forward" size={16} color="#4e73df" />
              </TouchableOpacity>
            )}
            {step === 'fingerprint' && (
              <TouchableOpacity onPress={handleFinish} style={[styles.progressSkipBtn, !(biometricEnabled || disableOverride) && { opacity: 0.5 }]} disabled={!(biometricEnabled || disableOverride)}>
                <Text style={styles.progressSkipText}>Finish</Text>
                <Ionicons name="checkmark" size={16} color={(biometricEnabled || disableOverride) ? '#4e73df' : '#adb5bd'} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      {/* Selection Modals */}
      <Modal visible={showProgramModal} animationType="slide" transparent onRequestClose={() => setShowProgramModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Program</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(programs || []).map(p => (
                <TouchableOpacity key={p.code} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setProgram(p.code); setYear(''); setSection(''); setShowProgramModal(false); }}>
                  <Text style={{ color: '#2d3748', fontWeight: '600' }}>{p.code} — {p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showYearModal} animationType="slide" transparent onRequestClose={() => setShowYearModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Year</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(years || []).map(y => (
                <TouchableOpacity key={y.year_name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setYear(y.year_name); setSection(''); setShowYearModal(false); }}>
                  <Text style={{ color: '#2d3748', fontWeight: '600' }}>{y.year_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showSectionModal} animationType="slide" transparent onRequestClose={() => setShowSectionModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Section</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(sections || []).map(s => (
                <TouchableOpacity key={s.section_name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setSection(s.section_name); setShowSectionModal(false); }}>
                  <Text style={{ color: '#2d3748', fontWeight: '600' }}>{s.section_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccess: { color: '#6c757d' },
  header: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  backText: { color: '#4e73df', fontWeight: '600', marginLeft: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#2d3748' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#2d3748', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2d3748',
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  submitBtn: { backgroundColor: '#4e73df', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#fff', fontWeight: '700' },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#4e73df',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  smallBtnActive: {
    backgroundColor: '#4e73df',
    borderColor: '#4e73df',
  },
  smallBtnText: {
    color: '#4e73df',
    fontWeight: '600',
    fontSize: 12,
    marginLeft: 6,
  },
  smallBtnTextActive: {
    color: '#fff',
  },
  secondaryBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e9ecef',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#4e73df',
    fontWeight: '700',
  },
  progressBar: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dotsContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#dee2e6' },
  dotActive: { backgroundColor: '#4e73df', width: 10, height: 10, borderRadius: 5 },
  progressBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 64 },
  progressBackText: { color: '#4e73df', fontWeight: '600' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  progressSkipBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', width: 64 },
  progressSkipText: { color: '#4e73df', fontWeight: '600', marginRight: 4 },
  avatarPreview: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatarImage: { width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: '#e9ecef' },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: '#e9ecef',
    backgroundColor: '#f1f3f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  qrPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    backgroundColor: '#f1f3f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Option loaders for dynamic selects
function useProgramOptions() {
  const [progs, setProgs] = React.useState<Array<{ code: string; name: string; college_code: string }>>([]);
  React.useEffect(() => { (async () => { try { const { data } = await supabase.from('programs').select('code, name, college_code'); setProgs(data || []); } catch { setProgs([]); } })(); }, []);
  return progs;
}

