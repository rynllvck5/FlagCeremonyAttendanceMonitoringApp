import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase, SUPABASE_URL, supabaseAdmin } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

export type RegisterWizardProps = { sid?: string };

export default function RegisterWizard({ sid }: RegisterWizardProps) {
  const hasSession = useMemo(() => typeof sid === 'string' && sid.length > 0, [sid]);
  const router = useRouter();
  const { signUp } = useAuth();

  type Step = 'form' | 'avatar' | 'qr' | 'fingerprint';
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [formValidated, setFormValidated] = useState(false);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [useDefaultPassword, setUseDefaultPassword] = useState(false);

  // Role selection and academic details
  type RoleChoice = 'student' | 'teacher' | '';
  const [roleChoice, setRoleChoice] = useState<RoleChoice>('');
  // Student fields
  const [program, setProgram] = useState('');
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');
  // Teacher fields
  const [position, setPosition] = useState('');
  const [college, setCollege] = useState('');

  // Options
  const [programs, setPrograms] = useState<Array<{ code: string; name: string; college_code: string }>>([]);
  const [years, setYears] = useState<Array<{ year_name: string }>>([]);
  const [sections, setSections] = useState<Array<{ section_name: string }>>([]);
  const [positions, setPositions] = useState<Array<{ name: string }>>([]);
  const [colleges, setColleges] = useState<Array<{ code: string; name: string }>>([]);

  // Pickers
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [showCollegeModal, setShowCollegeModal] = useState(false);

  // Created user context
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [createdFullName, setCreatedFullName] = useState('');

  // Avatar
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [hasUploadedAvatar, setHasUploadedAvatar] = useState(false);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);

  // QR
  const [generatedQR, setGeneratedQR] = useState<string | null>(null);
  const [generatingQR, setGeneratingQR] = useState(false);

  // Biometrics
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const QRCode = useMemo(() => {
    try { return require('react-native-qrcode-svg').default; } catch { return null; }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!createdUserId) return;
      try {
        const { data } = await supabase.from('user_profiles').select('biometric_enabled').eq('id', createdUserId).maybeSingle();
        if (active) setBiometricEnabled(!!data?.biometric_enabled);
      } catch { if (active) setBiometricEnabled(false); }
    })();
    return () => { active = false; };
  }, [createdUserId]);

  // Load static option lists
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [{ data: prog }, { data: pos }, { data: cols }] = await Promise.all([
          supabase.from('programs').select('code, name, college_code').order('name', { ascending: true }),
          supabase.from('teacher_positions').select('name').order('name', { ascending: true }),
          supabase.from('colleges').select('code, name').order('name', { ascending: true }),
        ]);
        if (mounted) {
          setPrograms(prog || []);
          setPositions(pos || []);
          setColleges(cols || []);
        }
      } catch {
        if (mounted) { setPrograms([]); setPositions([]); setColleges([]); }
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load dependent options when program/year change
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!program) { if (mounted) { setYears([]); setSections([]); } return; }
      try {
        const { data: yrs } = await supabase.from('program_years').select('year_name').eq('program_code', program).order('year_name', { ascending: true });
        if (mounted) setYears(yrs || []);
      } catch { if (mounted) setYears([]); }
    })();
    return () => { mounted = false; };
  }, [program]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!program || !year) { if (mounted) setSections([]); return; }
      try {
        const { data: secs } = await supabase.from('program_sections').select('section_name').eq('program_code', program).eq('year_name', year).order('section_name', { ascending: true });
        if (mounted) setSections(secs || []);
      } catch { if (mounted) setSections([]); }
    })();
    return () => { mounted = false; };
  }, [program, year]);

  const goPrev = () => setStep((s) => (s === 'fingerprint' ? 'qr' : s === 'qr' ? 'avatar' : 'form'));

  const handleNextFromForm = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Missing Fields', 'Please complete all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }

    // Require role and corresponding academic details
    if (!roleChoice) {
      Alert.alert('Select Role', 'Please choose Student or Teacher.');
      return;
    }
    if (roleChoice === 'student') {
      if (!program || !year || !section) {
        Alert.alert('Academic Details Required', 'Please select Program, Year, and Section.');
        return;
      }
    }
    if (roleChoice === 'teacher') {
      if (!position || !college) {
        Alert.alert('Academic Details Required', 'Please select Position and College.');
        return;
      }
    }

    setFormValidated(true);
    const full = `${firstName.trim()}${middleName.trim() ? ` ${middleName.trim()}` : ''}${lastName.trim() ? ` ${lastName.trim()}` : ''}`.trim();
    setCreatedFullName(full);
    setStep('avatar');
  };

  const handleUploadAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission required', 'Allow access to your photos.'); return; }
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1,1], quality: 0.6 });
      if ((pick as any).canceled || !(pick as any).assets?.length) return;
      setUploadingAvatar(true);
      const uri = (pick as any).assets[0].uri as string;
      setAvatarPreviewUri(uri);
      setHasUploadedAvatar(true);
    } catch (e: any) {
      console.error('[RegisterWizard] avatar pick error', e);
      Alert.alert('Failed', e?.message || 'Could not select a photo.');
    } finally { setUploadingAvatar(false); }
  };

  const handleGenerateQr = async () => {
    try {
      setGeneratingQR(true);
      const seed = (email || 'user').replace(/[^a-zA-Z0-9]/g, '');
      const newCode = `${seed}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      setGeneratedQR(newCode);
    } catch (e: any) {
      console.error('[RegisterWizard] qr error', e);
      Alert.alert('QR Failed', e?.message || 'Could not generate QR. You can skip this step.');
    } finally { setGeneratingQR(false); }
  };

  const handleRegisterFingerprint = async () => {
    try {
      setBusy(true);
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) { Alert.alert('Not Supported', 'Device does not support biometrics.'); return; }
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) { Alert.alert('No Biometrics', 'Please enroll a fingerprint/biometric in device settings.'); return; }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Register fingerprint', cancelLabel: 'Cancel' });
      if (!result.success) { Alert.alert('Failed', result.error || 'Authentication failed.'); return; }
      setBiometricEnabled(true);
      Alert.alert('Success', 'Fingerprint registered.');
    } catch (e: any) {
      console.error('[RegisterWizard] biometric error', e);
      Alert.alert('Error', e?.message || 'Failed to register biometrics.');
    } finally { setBusy(false); }
  };

  const normalizeEmailForSupabase = (raw: string) => {
    let e = (raw || '').trim();
    if (!e.includes('@')) e = `${e}@example.com`;
    const [local, domRaw] = e.split('@');
    let dom = (domRaw || 'example.com').trim();
    if (!dom.includes('.')) dom += '.com';
    return `${local}@${dom}`.toLowerCase();
  };

  const handleFinish = async () => {
    if (!biometricEnabled) { Alert.alert('Fingerprint Required', 'Please register your fingerprint before finishing.'); return; }
    if (!formValidated) { Alert.alert('Incomplete', 'Please complete your account information first.'); return; }

    setBusy(true);
    try {
      // Create the account now
      const rawEmail = email.trim();
      const normalizedEmail = normalizeEmailForSupabase(rawEmail);
      const pwd = password;
      const { data, error } = await signUp(normalizedEmail, pwd, {
        first_name: firstName.trim(),
        middle_name: middleName.trim(),
        last_name: lastName.trim(),
        provided_email: rawEmail,
      } as any);
      if (error) throw error as any;

      let uid = data?.user?.id || null;
      let accessToken: string | null = data?.session?.access_token || null;
      if (!uid || !accessToken) {
        const { data: u } = await supabase.auth.getUser();
        uid = uid || u?.user?.id || null;
        const { data: sess } = await supabase.auth.getSession();
        accessToken = accessToken || sess.session?.access_token || null;
      }

      if (hasSession) {
        try { await supabase.rpc('complete_registration_session', { p_session_id: sid as string }); } catch {}
      }

      // Force-confirm email to allow immediate login without email verification
      if (supabaseAdmin && uid) {
        try {
          await (supabaseAdmin as any).auth.admin.updateUserById(uid, { email_confirm: true });
        } catch (e) {
          console.warn('[RegisterWizard] admin email confirm failed', e);
        }
      }

      if (uid && accessToken) {
        // Upload avatar if chosen
        if (hasUploadedAvatar && avatarPreviewUri) {
          try {
            const fileName = avatarPreviewUri.split('/').pop() || `profile_${uid}.jpg`;
            const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
            const contentType = ext === 'png' ? 'image/png' : (ext === 'jpeg' || ext === 'jpg') ? 'image/jpeg' : `image/${ext}`;
            const storagePath = `${uid}/${fileName}`;
            const uploadUrl = `${SUPABASE_URL}/storage/v1/object/profile-pictures/${encodeURIComponent(storagePath)}`;
            await FileSystem.uploadAsync(uploadUrl, avatarPreviewUri, {
              httpMethod: 'PUT',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': contentType, 'x-upsert': 'true', 'cache-control': '3600' },
              uploadType: (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT,
            } as any);
            await supabase.from('user_profiles').update({ profile_picture: storagePath, updated_at: new Date().toISOString() }).eq('id', uid);
          } catch (e) { console.warn('[RegisterWizard] avatar post-signup failed', e); }
        }

        // Ensure QR is set if generated (or generate now)
        const qrCodeToUse = generatedQR || `${uid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        try { await supabase.from('user_profiles').update({ qr_code: qrCodeToUse, updated_at: new Date().toISOString() }).eq('id', uid); } catch {}

        // Mark biometrics enabled
        try { await supabase.from('user_profiles').update({ biometric_enabled: true, biometric_registered_at: new Date().toISOString() }).eq('id', uid); } catch {}

        // Apply chosen role and academic details
        const profileUpdates: any = { updated_at: new Date().toISOString() };
        if (roleChoice) profileUpdates.role = roleChoice;
        if (roleChoice === 'student') {
          profileUpdates.program = program;
          profileUpdates.year = year;
          profileUpdates.section = section;
        } else if (roleChoice === 'teacher') {
          profileUpdates.position = position;
          profileUpdates.college = college;
        }
        try { await supabase.from('user_profiles').update(profileUpdates).eq('id', uid); } catch (e) { console.warn('[RegisterWizard] profile role/academic update failed', e); }
      }

      Alert.alert('All Set', 'Your account has been created. You can now sign in.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    } catch (e: any) {
      console.error('[RegisterWizard] finish error', e);
      Alert.alert('Registration Failed', e?.message || 'Unable to create your account. Please review your details.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {step === 'form' ? (
          <View style={{ width: 60 }} />
        ) : (
          <TouchableOpacity onPress={goPrev} style={styles.backBtn}><Ionicons name="arrow-back" size={22} color="#4e73df" /><Text style={styles.backText}>Back</Text></TouchableOpacity>
        )}
        <Text style={styles.title}>Create Account</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {step === 'form' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Account Information</Text>
              <TextInput style={styles.input} placeholder="First Name (required)" placeholderTextColor="#adb5bd" value={firstName} onChangeText={setFirstName} />
              <TextInput style={styles.input} placeholder="Middle Name (optional)" placeholderTextColor="#adb5bd" value={middleName} onChangeText={setMiddleName} />
              <TextInput style={styles.input} placeholder="Last Name (required)" placeholderTextColor="#adb5bd" value={lastName} onChangeText={setLastName} />
              <TextInput style={styles.input} placeholder="Email (required)" placeholderTextColor="#adb5bd" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
              <TextInput style={styles.input} placeholder="Password (required)" placeholderTextColor="#adb5bd" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} editable={!useDefaultPassword} />
              <TextInput style={styles.input} placeholder="Confirm Password (required)" placeholderTextColor="#adb5bd" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} editable={!useDefaultPassword} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.smallBtn, showPassword && styles.smallBtnActive]} onPress={() => setShowPassword(v => !v)}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={16} color={showPassword ? '#fff' : '#4e73df'} />
                  <Text style={[styles.smallBtnText, showPassword && styles.smallBtnTextActive]}>{showPassword ? 'Hide Password' : 'Show Password'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallBtn, useDefaultPassword && styles.smallBtnActive]}
                  onPress={() => {
                    setUseDefaultPassword((prev) => {
                      const next = !prev;
                      if (next) {
                        const def = 'Password123!';
                        setPassword(def);
                        setConfirmPassword(def);
                      }
                      return next;
                    });
                  }}
                >
                  <Ionicons name="key" size={16} color={useDefaultPassword ? '#fff' : '#4e73df'} />
                  <Text style={[styles.smallBtnText, useDefaultPassword && styles.smallBtnTextActive]}>Use Default Password</Text>
                </TouchableOpacity>
              </View>

              {/* Role selection */}
              <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Account Type</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setRoleChoice('student')} style={[styles.rolePill, roleChoice === 'student' && styles.rolePillActive]}>
                  <Text style={[styles.rolePillText, roleChoice === 'student' && styles.rolePillTextActive]}>Student</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setRoleChoice('teacher')} style={[styles.rolePill, roleChoice === 'teacher' && styles.rolePillActive]}>
                  <Text style={[styles.rolePillText, roleChoice === 'teacher' && styles.rolePillTextActive]}>Teacher</Text>
                </TouchableOpacity>
              </View>

              {/* Academic details by role */}
              {roleChoice === 'student' && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.helpText}>Select Program, Year, and Section</Text>
                  <TouchableOpacity style={styles.input} onPress={() => setShowProgramModal(true)}>
                    <Text style={{ color: program ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{program || 'Select Program'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.input} onPress={() => program && setShowYearModal(true)} disabled={!program}>
                    <Text style={{ color: year ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{year || 'Select Year'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.input} onPress={() => program && year && setShowSectionModal(true)} disabled={!program || !year}>
                    <Text style={{ color: section ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{section || 'Select Section'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {roleChoice === 'teacher' && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.helpText}>Select Position and College</Text>
                  <TouchableOpacity style={styles.input} onPress={() => setShowPositionModal(true)}>
                    <Text style={{ color: position ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{position || 'Select Position'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.input} onPress={() => setShowCollegeModal(true)}>
                    <Text style={{ color: college ? '#2d3748' : '#adb5bd', textAlign: 'center' }}>{college || 'Select College'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {step === 'avatar' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Upload Profile Picture</Text>
              <Text style={{ color: '#6c757d', marginBottom: 12 }}>User: {createdFullName || '—'}</Text>
              <View style={styles.avatarPreview}>
                {avatarPreviewUri ? <Image source={{ uri: avatarPreviewUri }} style={styles.avatarImage} /> : (
                  <View style={styles.avatarPlaceholder}><Ionicons name="person" size={48} color="#868e96" /></View>
                )}
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleUploadAvatar} disabled={uploadingAvatar}>
                {uploadingAvatar ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Choose Photo and Upload</Text>}
              </TouchableOpacity>
            </View>
          )}

          {step === 'qr' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Generate QR Code</Text>
              <Text style={{ color: '#6c757d', marginBottom: 12 }}>User: {createdFullName || '—'}</Text>
              <View style={styles.qrContainer}>
                {generatedQR ? (
                  QRCode ? <QRCode value={generatedQR} size={180} /> : (
                    <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(generatedQR)}` }} style={{ width: 180, height: 180 }} />
                  )
                ) : (
                  <View style={styles.qrPlaceholder}><Ionicons name="qr-code-outline" size={64} color="#868e96" /></View>
                )}
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleGenerateQr} disabled={generatingQR}>
                {generatingQR ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{generatedQR ? 'Regenerate QR Code' : 'Generate QR Code'}</Text>}
              </TouchableOpacity>
            </View>
          )}

          {step === 'fingerprint' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Fingerprint Registration</Text>
              <Text style={{ color: '#6c757d', marginBottom: 12 }}>User: {createdFullName || '—'}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                <Text style={{ color: '#6c757d' }}>Current Status</Text>
                <Text style={{ color: biometricEnabled ? '#28a745' : '#6c757d', fontWeight: '700' }}>{biometricEnabled ? 'Registered' : 'Not Registered'}</Text>
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleRegisterFingerprint} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Register Fingerprint</Text>}
              </TouchableOpacity>
              <Text style={{ color: '#e03131', marginTop: 8 }}>This step is required. You cannot finish without registering the fingerprint.</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footerBar}>
          <View style={styles.footerRow}>
            <TouchableOpacity onPress={goPrev} disabled={step === 'form'} style={[styles.linkBtn, step === 'form' && { opacity: 0.4 }]}>
              <Ionicons name="chevron-back" size={16} color={step === 'form' ? '#adb5bd' : '#4e73df'} />
              <Text style={[styles.linkText, step === 'form' && { color: '#adb5bd' }]}>Back</Text>
            </TouchableOpacity>
            <View style={styles.dotsContainer}>
              {(['form','avatar','qr','fingerprint'] as const).map((s) => (
                <View key={s} style={[styles.dot, step === s && styles.dotActive]} />
              ))}
            </View>
            {step === 'form' && (
              formValidated ? (
                <TouchableOpacity onPress={() => setStep('avatar')} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Next</Text>
                  <Ionicons name="chevron-forward" size={16} color="#4e73df" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleNextFromForm} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Next</Text>
                  <Ionicons name="chevron-forward" size={16} color="#4e73df" />
                </TouchableOpacity>
              )
            )}
            {step === 'avatar' && (
              <TouchableOpacity onPress={() => setStep('qr')} style={styles.linkBtn}>
                <Text style={styles.linkText}>{hasUploadedAvatar ? 'Next' : 'Skip'}</Text>
                <Ionicons name="chevron-forward" size={16} color="#4e73df" />
              </TouchableOpacity>
            )}
            {step === 'qr' && (
              <TouchableOpacity onPress={() => setStep('fingerprint')} style={styles.linkBtn}>
                <Text style={styles.linkText}>Next</Text>
                <Ionicons name="chevron-forward" size={16} color="#4e73df" />
              </TouchableOpacity>
            )}
            {step === 'fingerprint' && (
              <TouchableOpacity onPress={handleFinish} style={[styles.linkBtn, !biometricEnabled && { opacity: 0.5 }]} disabled={!biometricEnabled}>
                <Text style={styles.linkText}>Finish</Text>
                <Ionicons name="checkmark" size={16} color={biometricEnabled ? '#4e73df' : '#adb5bd'} />
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

      <Modal visible={showPositionModal} animationType="slide" transparent onRequestClose={() => setShowPositionModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Position</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(positions || []).map(po => (
                <TouchableOpacity key={po.name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setPosition(po.name); setShowPositionModal(false); }}>
                  <Text style={{ color: '#2d3748', fontWeight: '600' }}>{po.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showCollegeModal} animationType="slide" transparent onRequestClose={() => setShowCollegeModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select College</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(colleges || []).map(c => (
                <TouchableOpacity key={c.code} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setCollege(c.code); setShowCollegeModal(false); }}>
                  <Text style={{ color: '#2d3748', fontWeight: '600' }}>{c.code} — {c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  header: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '700', color: '#2d3748' },
  backBtn: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  backText: { color: '#4e73df', fontWeight: '600', marginLeft: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#2d3748', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e9ecef', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#2d3748', marginBottom: 12, backgroundColor: '#fff' },
  helpText: { color: '#6c757d' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#4e73df', borderRadius: 8, backgroundColor: '#fff', alignSelf: 'flex-start' },
  smallBtnActive: { backgroundColor: '#4e73df', borderColor: '#4e73df' },
  smallBtnText: { color: '#4e73df', fontWeight: '600', fontSize: 12, marginLeft: 6 },
  smallBtnTextActive: { color: '#fff' },
  rolePill: { borderWidth: 1, borderColor: '#4e73df', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff' },
  rolePillActive: { backgroundColor: '#4e73df' },
  rolePillText: { color: '#4e73df', fontWeight: '600' },
  rolePillTextActive: { color: '#fff', fontWeight: '600' },
  primaryBtn: { backgroundColor: '#4e73df', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  footerBar: { borderTopWidth: 1, borderTopColor: '#e9ecef', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { color: '#4e73df', fontWeight: '600', marginRight: 4 },
  dotsContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#dee2e6' },
  dotActive: { backgroundColor: '#4e73df', width: 10, height: 10, borderRadius: 5 },
  avatarPreview: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatarImage: { width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: '#e9ecef' },
  avatarPlaceholder: { width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: '#e9ecef', backgroundColor: '#f1f3f5', alignItems: 'center', justifyContent: 'center' },
  qrContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  qrPlaceholder: { width: 180, height: 180, borderRadius: 12, borderWidth: 1, borderColor: '#e9ecef', backgroundColor: '#f1f3f5', alignItems: 'center', justifyContent: 'center' },
});
