import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import type { UserProfile } from '../../../types/user';
import { useAuth } from '../../../hooks/useAuth';

export default function StudentDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id as string;
  const { profile } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!isAdmin || !id) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, first_name, middle_name, last_name, email, role, profile_picture, created_at, updated_at')
          .eq('id', id)
          .single();
        if (error) throw error;
        if (mounted) setStudent(data as any);
      } catch (e: any) {
        console.error('[StudentDetailsScreen] load error', e);
        setError(e?.message ?? 'Failed to load student');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [id, isAdmin]);

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.noAccess}>You do not have permission to view this page.</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#4e73df" />
      </SafeAreaView>
    );
  }

  if (error || !student) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Student not found'}</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.retryBtn, { marginTop: 12 }]}>
          <Text style={styles.retryText}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const fullName = `${student.first_name ?? ''}${student.middle_name ? ` ${student.middle_name}` : ''}${student.last_name ? ` ${student.last_name}` : ''}`.trim();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#4e73df" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Student Details</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.hero}>
          {student.profile_picture ? (
            <Image source={{ uri: student.profile_picture }} style={styles.heroAvatar} />
          ) : (
            <View style={[styles.heroAvatar, { backgroundColor: '#e9ecef' }]}>
              <Ionicons name="person" size={40} color="#868e96" />
            </View>
          )}
          <View style={{ marginLeft: 16, flex: 1 }}>
            <Text style={styles.heroName} numberOfLines={1}>{fullName || 'Unnamed Student'}</Text>
            <Text style={styles.heroEmail} numberOfLines={1}>{student.email}</Text>
            <View style={[styles.rolePill, { backgroundColor: roleColor(student.role) }]}>
              <Text style={styles.roleText}>{student.role}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          <InfoRow label="First Name" value={student.first_name ?? ''} />
          <InfoRow label="Middle Name" value={student.middle_name ?? ''} />
          <InfoRow label="Last Name" value={student.last_name ?? ''} />
          <InfoRow label="Email" value={student.email} />
          <InfoRow label="Created" value={new Date(student.created_at).toLocaleString()} />
          <InfoRow label="Updated" value={new Date(student.updated_at).toLocaleString()} />
        </View>

        {/* Placeholder for future sections (attendance, classes, etc.) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More</Text>
          <Text style={styles.muted}>Additional details will appear here soon.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}

function roleColor(role?: string) {
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
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  header: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, marginRight: 8 },
  backText: { color: '#4e73df', fontWeight: '600', marginLeft: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#2d3748' },

  hero: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  heroAvatar: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
  heroName: { fontSize: 18, fontWeight: '700', color: '#2d3748' },
  heroEmail: { fontSize: 13, color: '#6c757d', marginTop: 4 },
  rolePill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 8 },
  roleText: { color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },

  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#2d3748', marginBottom: 12 },
  muted: { color: '#6c757d', fontSize: 13 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  infoLabel: { color: '#6c757d' },
  infoValue: { color: '#212529', fontWeight: '500', maxWidth: '60%' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccess: { color: '#6c757d' },
  errorText: { color: '#e03131' },
  retryBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f1f3f5', borderRadius: 8 },
  retryText: { color: '#343a40', fontWeight: '600' },
});
