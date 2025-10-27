import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../../lib/supabase';
import { useAuth } from '../../../../../hooks/useAuth';

export default function AdvisoryRosterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ program_code: string; year_name: string; section_name: string }>();
  const program_code = params.program_code as string;
  const year_name = params.year_name as string;
  const section_name = params.section_name as string;
  const { profile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null; biometric_enabled?: boolean }>>([]);
  const [todayMap, setTodayMap] = useState<Record<string, { has: boolean; verified: boolean; created_at?: string }>>({});
  const [statusMap, setStatusMap] = useState<Record<string, 'Present' | 'Waiting' | 'Absent' | 'Late'>>({});
  const [currentCaptainId, setCurrentCaptainId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Loading students for:', { program_code, year_name, section_name });
      
      // First, check if the class exists in program_sections
      const { data: classData, error: classError } = await supabase
        .from('program_sections')
        .select('program_code, year_name, section_name')
        .ilike('program_code', program_code)
        .ilike('year_name', year_name)
        .ilike('section_name', section_name)
        .maybeSingle();
      
      console.log('Class data:', classData, 'Error:', classError);
      
      if (!classData) {
        console.log('No matching class found in program_sections');
        setStudents([]);
        return;
      }

      // Now fetch students using the exact values from the database
      console.log('Fetching students with:', {
        program: classData.program_code,
        year: classData.year_name,
        section: classData.section_name
      });
      
      const { data: studs, error: studentsError } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email, program, year, section, biometric_enabled')
        .eq('role', 'student')
        .eq('program', classData.program_code.trim())
        .eq('year', classData.year_name.trim())
        .eq('section', classData.section_name.trim())
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });
      
      console.log('Fetched students:', studs, 'Error:', studentsError);
      
      if (studentsError) {
        console.error('Error fetching students:', studentsError);
      }
      
      // Also log the raw SQL query for debugging
      if (studs && studs.length === 0) {
        console.log('No students found. Checking database directly...');
        const { data: allStudents } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, email, program, year, section, role')
          .eq('role', 'student')
          .limit(5);
        console.log('Sample of all students in database:', allStudents);
      }
      
      setStudents((studs || []) as any);

      // Build per-student status for today
      const now = new Date();
      const start = new Date(now); start.setHours(0,0,0,0);
      const end = new Date(now); end.setHours(23,59,59,999);
      const ids = (studs || []).map(s => (s as any).id);

      // Fetch today's schedule
      let attendanceEndMinutes: number | null = null;
      let onTimeEndMinutes: number | null = null;
      try {
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayISO = `${yyyy}-${mm}-${dd}`;
        const { data: sched } = await supabase
          .from('attendance_schedules')
          .select('is_flag_day, attendance_end, on_time_end')
          .eq('date', todayISO)
          .maybeSingle();
        if (sched?.attendance_end && sched?.is_flag_day) {
          const [eh, em] = String(sched.attendance_end).split(':').map((x: string) => parseInt(x, 10));
          attendanceEndMinutes = (eh || 0) * 60 + (em || 0);
        }
        if (sched?.on_time_end && sched?.is_flag_day) {
          const [oh, om] = String(sched.on_time_end).split(':').map((x: string) => parseInt(x, 10));
          onTimeEndMinutes = (oh || 0) * 60 + (om || 0);
        }
      } catch {}

      // Determine targeted IDs for today (union of this section requirement and explicit required students)
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayISO = `${yyyy}-${mm}-${dd}`;
      const targeted = new Set<string>();
      try {
        const { data: reqSec } = await supabase
          .from('attendance_schedule_required_sections')
          .select('program_code, year_name, section_name')
          .eq('date', todayISO);
        const sectionRequired = (reqSec || []).some((r: any) => r.program_code === program_code && r.year_name === year_name && r.section_name === section_name);
        if (sectionRequired) ids.forEach(id => targeted.add(id));
        const { data: reqStud } = await supabase
          .from('attendance_schedule_required_students')
          .select('student_id')
          .eq('date', todayISO);
        const classSet = new Set(ids);
        (reqStud || []).forEach((r: any) => { if (classSet.has(r.student_id)) targeted.add(r.student_id); });
      } catch {}

      let recMap: Record<string, { has: boolean; verified: boolean; created_at?: string }> = {};
      const targetedIds = Array.from(targeted);
      if (targetedIds.length > 0) {
        const { data: recs } = await supabase
          .from('attendance_records')
          .select('user_id, verified, created_at')
          .in('user_id', targetedIds)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString());
        (recs || []).forEach((r: any) => { recMap[r.user_id] = { has: true, verified: !!r.verified, created_at: r.created_at }; });
      }
      setTodayMap(recMap);

      // Compute status: Present (verified before/on on_time_end), Late (verified after on_time_end), Waiting (no verified and before end), Absent (no verified and after end)
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const sMap: Record<string, 'Present' | 'Waiting' | 'Absent' | 'Late'> = {} as any;
      for (const id of targetedIds) {
        const rec = recMap[id];
        if (rec?.verified) {
          if (onTimeEndMinutes != null && rec.created_at) {
            const dt = new Date(rec.created_at);
            const mins = dt.getHours() * 60 + dt.getMinutes();
            sMap[id] = mins > onTimeEndMinutes ? 'Late' : 'Present';
          } else {
            sMap[id] = 'Present';
          }
        } else if (attendanceEndMinutes === null || nowMinutes <= attendanceEndMinutes) {
          sMap[id] = 'Waiting';
        } else {
          sMap[id] = 'Absent';
        }
      }
      setStatusMap(sMap);

      const { data: cap } = await supabase
        .from('class_captains')
        .select('captain_user_id')
        .eq('program_code', program_code)
        .eq('year_name', year_name)
        .eq('section_name', section_name)
        .maybeSingle();
      setCurrentCaptainId((cap as any)?.captain_user_id || null);
    } catch {
      setStudents([]); setTodayMap({}); setCurrentCaptainId(null);
    } finally {
      setLoading(false);
    }
  }, [program_code, year_name, section_name]);

  useEffect(() => { load(); }, [load]);

  const disableBiometrics = async (userId: string) => {
    try {
      Alert.alert('Disable Biometrics', 'Are you sure you want to disable biometrics for this student?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disable', style: 'destructive', onPress: async () => {
          await supabase
            .from('user_profiles')
            .update({ biometric_enabled: false, biometric_registered_at: null, biometric_device_id: null })
            .eq('id', userId);
          Alert.alert('Disabled', 'Biometric verification disabled.');
          setStudents(prev => prev.map(s => s.id === userId ? { ...s, biometric_enabled: false } : s));
        }},
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to disable biometrics');
    }
  };

  const setCaptain = async (userId: string) => {
    try {
      await supabase
        .from('class_captains')
        .upsert({
          program_code,
          year_name,
          section_name,
          captain_user_id: userId,
          assigned_by: profile?.id || null,
          assigned_at: new Date().toISOString(),
        });
      setCurrentCaptainId(userId);
      Alert.alert('Assigned', 'Class captain updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to assign captain');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#4e73df" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Advisory — {program_code} • {year_name} • Sec {section_name}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {loading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator color="#4e73df" />
          </View>
        ) : students.length === 0 ? (
          <Text style={{ color: '#6c757d' }}>No students in this section.</Text>
        ) : (
          students.map((s: { id: string; first_name: string | null; last_name: string | null; email: string | null; biometric_enabled?: boolean }) => (
            <View key={s.id} style={styles.row}>
              <View>
                <Text style={styles.name}>{`${s.first_name ?? ''}${s.last_name ? ` ${s.last_name}` : ''}`.trim()}</Text>
                <Text style={styles.meta}>{s.email}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 12 }}>
                {statusMap[s.id] === 'Present' && (
                  <Text style={{ color: '#28a745', fontWeight: '700' }}>Present</Text>
                )}
                {statusMap[s.id] === 'Late' && (
                  <Text style={{ color: '#fd7e14', fontWeight: '700' }}>Late</Text>
                )}
                {statusMap[s.id] === 'Waiting' && (
                  <Text style={{ color: '#f59f00', fontWeight: '700' }}>Waiting</Text>
                )}
                {statusMap[s.id] === 'Absent' && (
                  <Text style={{ color: '#e03131', fontWeight: '700' }}>Absent</Text>
                )}

                {/* Captain badge */}
                {currentCaptainId === s.id && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 6 }}>
                    <Ionicons name="ribbon" size={16} color="#f59f00" />
                    <Text style={{ color: '#f59f00', fontWeight: '700' }}>Captain</Text>
                  </View>
                )}

                {/* Teacher-only: set captain */}
                {profile?.role === 'teacher' && currentCaptainId !== s.id && (
                  <TouchableOpacity onPress={() => setCaptain(s.id)} style={styles.captainBtn}>
                    <Text style={styles.captainText}>Make Captain</Text>
                  </TouchableOpacity>
                )}

                {/* Captain authority: disable biometrics for classmates (cannot enable) */}
                {profile?.role === 'student' && currentCaptainId === profile?.id && s.id !== profile?.id && s.biometric_enabled !== false && (
                  <TouchableOpacity onPress={() => disableBiometrics(s.id)} style={styles.captainBtn}>
                    <Text style={styles.captainText}>Disable Biometrics</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  header: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, marginRight: 8 },
  backText: { color: '#4e73df', fontWeight: '600', marginLeft: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#2d3748' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' },
  name: { color: '#2d3748', fontWeight: '600' },
  meta: { color: '#6c757d', fontSize: 12 },
  captainBtn: { borderWidth: 1, borderColor: '#4e73df', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  captainText: { color: '#4e73df', fontWeight: '600' },
});
