import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

const fmtDate = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function useMonthMatrix(anchor: Date) {
  return useMemo(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const firstWeekday = firstOfMonth.getDay();
    const daysInMonth = lastOfMonth.getDate();

    const cells: Array<Date | null> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: Array<Array<Date | null>> = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [anchor]);
}

export default function ScheduleViewScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ anchor?: string }>();
  const initialAnchor = useMemo(() => {
    const a = typeof params.anchor === 'string' ? params.anchor : undefined;
    if (!a) return null;
    const parts = a.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m - 1, d);
    }
    return null;
  }, [params]);
  const [monthAnchor, setMonthAnchor] = useState(() => { const d = initialAnchor ? new Date(initialAnchor) : new Date(); d.setDate(1); return d; });
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialAnchor) {
      return fmtDate(initialAnchor);
    }
    return fmtDate(new Date());
  });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [flaggedDates, setFlaggedDates] = useState<Set<string>>(new Set());
  const [attendStatusByDate, setAttendStatusByDate] = useState<Record<string, { attended: boolean; verified: boolean }>>({});
  const [details, setDetails] = useState<{ is_flag_day: boolean; attendance_start: string | null; on_time_end: string | null; attendance_end: string | null; venue?: string | null; description?: string | null } | null>(null);
  const [myAttendance, setMyAttendance] = useState<{ id: string; created_at: string; verified: boolean; verified_at: string | null } | null>(null);

  const monthWeeks = useMonthMatrix(monthAnchor);
  const monthLabel = useMemo(() => monthAnchor.toLocaleDateString(undefined, { year: 'numeric', month: 'long' }), [monthAnchor]);
  const todayStr = useMemo(() => fmtDate(new Date()), []);

  const loadMonthData = useCallback(async () => {
    try {
      const start = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
      const end = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
      const startStr = fmtDate(start);
      const endStr = fmtDate(end);
      const { data, error } = await supabase
        .from('attendance_schedules')
        .select('date, is_flag_day')
        .gte('date', startStr)
        .lte('date', endStr);
      if (error) throw error;
      const flagged = (data || []).filter((row: any) => !!row.is_flag_day).map((row: any) => row.date as string);
      console.log('[ScheduleView] Flagged dates:', flagged);
      const reqSet = new Set<string>();
      if (flagged.length > 0) {
        if (profile?.role === 'student') {
          const { id: uid } = (profile as any) || {};
          if (!uid) {
            console.warn('[ScheduleView] No student ID, not highlighting any dates');
          } else {
            // Simple: just check if this student's ID is in the required_students table
            const { data: reqStud, error: studError } = await supabase
              .from('attendance_schedule_required_students')
              .select('date')
              .eq('student_id', uid)
              .in('date', flagged);
            
            if (studError) {
              console.error('[ScheduleView] Error fetching required students:', studError);
            }
            
            console.log('[ScheduleView] Required dates for student:', {
              studentId: uid,
              requiredDates: reqStud || []
            });
            
            // Add dates where this student is required
            (reqStud || []).forEach((r: any) => reqSet.add(r.date as string));
          }
        } else if (profile?.role === 'teacher') {
          const { id: uid } = (profile as any) || {};
          const { data: reqTeach } = await supabase
            .from('attendance_schedule_required_teachers')
            .select('date')
            .eq('teacher_id', uid)
            .in('date', flagged);
          (reqTeach || []).forEach((r: any) => reqSet.add(r.date as string));
        } else {
          // Other roles: show all flagged
          flagged.forEach(d => reqSet.add(d));
        }
      }
      console.log('[ScheduleView] Setting flagged dates:', Array.from(reqSet));
      setFlaggedDates(reqSet);

      // Also load my attendance within the month to color cells by status
      if (profile?.id) {
        const startISO = new Date(start); startISO.setHours(0,0,0,0);
        const endISO = new Date(end); endISO.setHours(23,59,59,999);
        const { data: recs, error: rErr } = await supabase
          .from('attendance_records')
          .select('created_at, verified')
          .eq('user_id', profile.id)
          .gte('created_at', startISO.toISOString())
          .lte('created_at', endISO.toISOString());
        if (rErr) throw rErr;
        const map: Record<string, { attended: boolean; verified: boolean }> = {};
        (recs || []).forEach((r: any) => {
          const d = new Date(r.created_at);
          const ds = fmtDate(d);
          if (!map[ds]) map[ds] = { attended: true, verified: !!r.verified };
          else map[ds].verified = map[ds].verified || !!r.verified;
        });
        setAttendStatusByDate(map);
      } else {
        setAttendStatusByDate({});
      }
    } catch (e) {
      console.warn('[ScheduleView] month load failed', e);
      setFlaggedDates(new Set());
      setAttendStatusByDate({});
    }
  }, [monthAnchor, profile?.id, profile?.role]);

  // Load data when component mounts
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadMonthData();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMonthData]);

  // Also reload data when screen comes into focus
  // This ensures students see updated required attendees status immediately
  useFocusEffect(
    useCallback(() => {
      loadMonthData();
    }, [loadMonthData])
  );

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadMonthData();
      // Reload details for selected date
      const { data, error } = await supabase
        .from('attendance_schedules')
        .select('is_flag_day, attendance_start, on_time_end, attendance_end, venue, description')
        .eq('date', selectedDate)
        .maybeSingle();
      if (!error) setDetails(data as any);
      // Reload attendance for selected date
      if (profile?.id) {
        const start = new Date(selectedDate + 'T00:00:00');
        const end = new Date(selectedDate + 'T23:59:59.999');
        const { data: recData } = await supabase
          .from('attendance_records')
          .select('id, created_at, verified, verified_at')
          .eq('user_id', profile.id)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: false })
          .limit(1);
        const rec = (recData && recData.length > 0) ? recData[0] as any : null;
        setMyAttendance(rec ? { id: rec.id, created_at: rec.created_at, verified: !!rec.verified, verified_at: rec.verified_at } : null);
      }
    } catch (e) {
      console.error('[ScheduleView] refresh failed', e);
    } finally {
      setRefreshing(false);
    }
  }, [loadMonthData, selectedDate, profile?.id]);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('attendance_schedules')
          .select('is_flag_day, attendance_start, on_time_end, attendance_end, venue, description')
          .eq('date', selectedDate)
          .maybeSingle();
        if (error) throw error;
        setDetails(data as any);
      } catch (e) {
        setDetails(null);
      }
    })();
  }, [selectedDate]);

  // Load current user's attendance for the selected date (student/teacher views)
  useEffect(() => {
    (async () => {
      try {
        if (!profile?.id) { setMyAttendance(null); return; }
        const start = new Date(selectedDate + 'T00:00:00');
        const end = new Date(selectedDate + 'T23:59:59.999');
        const { data, error } = await supabase
          .from('attendance_records')
          .select('id, created_at, verified, verified_at')
          .eq('user_id', profile.id)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) throw error;
        const rec = (data && data.length > 0) ? data[0] as any : null;
        setMyAttendance(rec ? { id: rec.id, created_at: rec.created_at, verified: !!rec.verified, verified_at: rec.verified_at } : null);
      } catch (e) {
        setMyAttendance(null);
      }
    })();
  }, [selectedDate, profile?.id]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#4e73df']}
            tintColor="#4e73df"
          />
        }
      >
        <Text style={styles.title}>Attendance Schedule</Text>
        <Text style={styles.subtitle}>These dates are configured by admins. Tap a highlighted date to view details.</Text>

        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={() => setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
              <Ionicons name="chevron-back" size={20} color="#2d3748" />
            </TouchableOpacity>
            <Text style={styles.calendarTitle}>{monthLabel}</Text>
            <TouchableOpacity onPress={() => setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
              <Ionicons name="chevron-forward" size={20} color="#2d3748" />
            </TouchableOpacity>
          </View>
          <View style={styles.calendarWeekHeader}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <Text key={d} style={styles.calendarWeekDay}>{d}</Text>
            ))}
          </View>
          {monthWeeks.map((week, wi) => (
            <View key={wi} style={styles.calendarWeekRow}>
              {week.map((day, di) => {
                if (!day) return <View key={di} style={[styles.calendarCell, { backgroundColor: 'transparent' }]} />;
                const dStr = fmtDate(day);
                const active = dStr === selectedDate;
                const isFlagged = flaggedDates.has(dStr);
                const isToday = dStr === todayStr;
                const isPast = new Date(dStr) < new Date(todayStr);
                // Determine color: red (missed), green (attended), yellow (upcoming)
                let flaggedStyle = undefined as any;
                if (isFlagged) {
                  if (new Date(dStr) > new Date(todayStr)) {
                    flaggedStyle = styles.calendarCellUpcoming; // yellow
                  } else {
                    const st = attendStatusByDate[dStr];
                    if (st && st.verified) {
                      flaggedStyle = styles.calendarCellAttended; // green (verified)
                    } else {
                      flaggedStyle = styles.calendarCellMissed; // red (absent or unverified)
                    }
                  }
                }
                const cellStyles = [
                  styles.calendarCell,
                  flaggedStyle,
                  isToday && styles.calendarCellToday,
                  active && styles.calendarCellActive,
                ];
                const textStyles = [
                  styles.calendarCellText,
                  (active || isFlagged) && styles.calendarCellTextActive,
                ];
                return (
                  <TouchableOpacity key={di} style={cellStyles} onPress={() => setSelectedDate(dStr)}>
                    <Text style={textStyles}>{day.getDate()}</Text>
                    {(isFlagged && attendStatusByDate[dStr]?.attended && !attendStatusByDate[dStr]?.verified && (new Date(dStr) <= new Date(todayStr))) && (
                      <View style={styles.cellBadge}><Ionicons name="information-circle" size={12} color="#f59f00" /></View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Selected Date</Text>
          <Text style={styles.selectedDate}>{selectedDate}</Text>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 12 }} />
          ) : details && details.is_flag_day ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.detail}><Text style={styles.detailLabel}>Attendance Start:</Text> {details.attendance_start || '—'}</Text>
              <Text style={styles.detail}><Text style={styles.detailLabel}>On Time Until:</Text> {details.on_time_end || '—'}</Text>
              <Text style={styles.detail}><Text style={styles.detailLabel}>Attendance End:</Text> {details.attendance_end || '—'}</Text>
              <Text style={styles.detail}><Text style={styles.detailLabel}>Venue:</Text> {details.venue || '—'}</Text>
              {!!details.description && (
                <Text style={styles.detail}><Text style={styles.detailLabel}>Description:</Text> {details.description}</Text>
              )}
            </View>
          ) : (
            <Text style={{ color: '#6c757d', marginTop: 12 }}>No event configured for this date.</Text>
          )}
        </View>

        {/* User's attendance summary for the selected date (if signed in) */}
        {profile?.id && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Your Attendance</Text>
            {!myAttendance ? (
              <Text style={{ color: '#6c757d', marginTop: 6 }}>No attendance record for this date.</Text>
            ) : (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.detail}><Text style={styles.detailLabel}>Scanned At:</Text> {new Date(myAttendance.created_at).toLocaleString()}</Text>
                <Text style={styles.detail}><Text style={styles.detailLabel}>Verification:</Text> {myAttendance.verified ? `Verified at ${new Date(myAttendance.verified_at as any).toLocaleString()}` : 'Pending'}</Text>
                <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/verify-attendance/[id]', params: { id: myAttendance.id } } as any)} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                  <Text style={{ color: '#4e73df', fontWeight: '700' }}>View Details</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  title: { fontSize: 20, fontWeight: '700', color: '#2d3748' },
  subtitle: { marginTop: 6, color: '#6c757d' },
  calendarCard: { marginTop: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calendarTitle: { fontSize: 16, fontWeight: '700', color: '#2d3748' },
  calendarWeekHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  calendarWeekDay: { width: `${100/7}%`, textAlign: 'center', color: '#6c757d', fontWeight: '600' },
  calendarWeekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  calendarCell: { width: `${100/7}%`, aspectRatio: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f3f5' },
  calendarCellFlagged: { backgroundColor: '#d3f9d8' },
  calendarCellFlaggedPast: { backgroundColor: '#ffe3e3' },
  calendarCellFlaggedUpcoming: { backgroundColor: '#d3f9d8' },
  // New color states for attended/missed/upcoming
  calendarCellAttended: { backgroundColor: '#d3f9d8' },
  calendarCellMissed: { backgroundColor: '#ffe3e3' },
  calendarCellUpcoming: { backgroundColor: '#fff3bf' },
  calendarCellToday: { borderWidth: 2, borderColor: '#4e73df' },
  calendarCellActive: { backgroundColor: '#4e73df' },
  calendarCellText: { color: '#2d3748', fontWeight: '700' },
  calendarCellTextActive: { color: '#fff', fontWeight: '700' },
  card: { marginTop: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2d3748', marginTop: 8 },
  selectedDate: { marginTop: 4, color: '#495057', fontWeight: '600' },
  detail: { color: '#2d3748', marginTop: 6 },
  detailLabel: { color: '#6c757d', fontWeight: '600' },
  cellBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: 'transparent' },
});
