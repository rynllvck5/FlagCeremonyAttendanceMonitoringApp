import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
import AcademicStructuresManager from '../../components/admin/AcademicStructuresManager';
import AdminManagement from '../../components/admin/AdminManagement';
import AttendanceReport from '../../components/admin/AttendanceReport';

type Advisory = { program_code: string; year_name: string; section_name: string };

export default function HomeScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const { unreadCount, refetch: refetchUnreadCount } = useUnreadNotifications();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');
  const isTeacher = (profile?.role === 'teacher');
  
  const scrollViewRef = useRef<ScrollView>(null);
  const manageAdminsRef = useRef<View>(null);
  const reportRef = useRef<View>(null);
  const academicStructureRef = useRef<View>(null);

  const [studentsCount, setStudentsCount] = useState<number | null>(null);
  type AttendanceRecord = {
    id: string;
    created_at: string;
    verified: boolean;
    method: string;
    user_id: string;
    user?: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  };
  const [attendance, setAttendance] = useState<AttendanceRecord[] | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [waitingToday, setWaitingToday] = useState<boolean>(false);
  const [presentCount, setPresentCount] = useState<number>(0);
  const [absentCount, setAbsentCount] = useState<number>(0);
  const [presentDays, setPresentDays] = useState<Array<{ date: string; id?: string; verified: boolean; created_at?: string; status: 'Verified' | 'Pending' | 'Unverified' }>>([]);
  const [absentDays, setAbsentDays] = useState<string[]>([]);
  const [presentModal, setPresentModal] = useState(false);
  const [absentModal, setAbsentModal] = useState(false);
  const [studentAttendanceModal, setStudentAttendanceModal] = useState(false);
  const [adminTodayCounts, setAdminTodayCounts] = useState<{ verified: number; total: number } | null>(null);
  const [adminNoScheduleToday, setAdminNoScheduleToday] = useState<boolean>(false);
  // Teacher advisory state
  const [myAdvisories, setMyAdvisories] = useState<Advisory[]>([]);
  const [selectedAdv, setSelectedAdv] = useState<Advisory | null>(null);
  const [advStudents, setAdvStudents] = useState<Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>>([]);
  const [advLoading, setAdvLoading] = useState(false);
  const [currentCaptainId, setCurrentCaptainId] = useState<string | null>(null);
  const [advSummaries, setAdvSummaries] = useState<Record<string, { verified: number; total: number }>>({});
  const [advTodayMap, setAdvTodayMap] = useState<Record<string, { has: boolean; verified: boolean }>>({});
  const [myCaptainClass, setMyCaptainClass] = useState<Advisory | null>(null);
  const [captainClassStudents, setCaptainClassStudents] = useState<Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>>([]);
  const [captainStudentStatus, setCaptainStudentStatus] = useState<Record<string, 'Present' | 'Waiting' | 'Absent' | 'Late'>>({});

  // Admin: Required attendees modal state
  const [adminReqVisible, setAdminReqVisible] = useState(false);
  const [adminReqLoading, setAdminReqLoading] = useState(false);
  const [adminReqData, setAdminReqData] = useState<{
    schedule?: { on_time_end: string | null; attendance_end: string | null; is_flag_day?: boolean } | null;
    teachers: Array<{ id: string; name: string; email: string | null; status: 'Waiting'|'Present'|'Late'|'Absent' }>;
    students: Record<string, Record<string, Record<string, Array<{ id: string; name: string; email: string | null; status: 'Waiting'|'Present'|'Late'|'Absent' }>>>>;
  }>({ schedule: null, teachers: [], students: {} });
  const [adminFilterRole, setAdminFilterRole] = useState<'all'|'students'|'teachers'>('all');
  const [adminFilterProgram, setAdminFilterProgram] = useState<string | null>(null);
  const [adminFilterYear, setAdminFilterYear] = useState<string | null>(null);
  const [adminFilterSection, setAdminFilterSection] = useState<string | null>(null);
  const [collapseKeys, setCollapseKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAdmin) return;
    let isMounted = true;
    const fetchCount = async () => {
      try {
        const { count, error } = await supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'student');
        if (error) throw error;
        if (isMounted) setStudentsCount(count ?? 0);
      } catch (e) {
        console.error('Failed to fetch students count', e);
      }
    };
    fetchCount();
    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  const loadAttendance = useCallback(async () => {
    try {
      setAttLoading(true);
      if (isAdmin) {
        const { data, error } = await supabase
          .from('attendance_records')
          .select('id, created_at, verified, method, user_id, user:user_profiles!attendance_records_user_id_fkey(id, first_name, last_name, email)')
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) throw error;
        setAttendance((data ?? []) as unknown as AttendanceRecord[]);

        // Compute admin/superadmin percent for today's date card
        try {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const dd = String(now.getDate()).padStart(2, '0');
          const todayISODate = `${yyyy}-${mm}-${dd}`;

          // Check if today is scheduled flag day
          const { data: sched } = await supabase
            .from('attendance_schedules')
            .select('is_flag_day')
            .eq('date', todayISODate)
            .maybeSingle();
          const flagToday = !!sched?.is_flag_day;
          setAdminNoScheduleToday(!flagToday);
          if (!flagToday) {
            setAdminTodayCounts(null);
            return;
          }

          // Today's requirements - simple: just get IDs
          const { data: reqStud } = await supabase
            .from('attendance_schedule_required_students')
            .select('student_id')
            .eq('date', todayISODate);
          const { data: reqTeach } = await supabase
            .from('attendance_schedule_required_teachers')
            .select('teacher_id')
            .eq('date', todayISODate);

          // Build student and teacher ID lists
          const targetStudentIds = Array.from(new Set((reqStud || []).map(r => (r as any).student_id)));
          const teacherIds = Array.from(new Set((reqTeach || []).map((t: any) => String(t.teacher_id))));

          const total = targetStudentIds.length + teacherIds.length;
          if (total === 0) { setAdminTodayCounts({ verified: 0, total: 0 }); }
          else {
            const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
            const endOfDay = new Date(now); endOfDay.setHours(23,59,59,999);
            const { data: recs } = await supabase
              .from('attendance_records')
              .select('user_id, verified')
              .in('user_id', [...targetStudentIds, ...teacherIds])
              .gte('created_at', startOfDay.toISOString())
              .lte('created_at', endOfDay.toISOString())
              .eq('verified', true);
            const verifiedUserSet = new Set<string>((recs || []).map(r => (r as any).user_id));
            setAdminTodayCounts({ verified: verifiedUserSet.size, total });
          }
        } catch (e) {
          console.warn('[Home] admin percent compute failed', e);
          setAdminTodayCounts(null);
          setAdminNoScheduleToday(false);
        }
      } else if (profile?.id) {
        const { data, error } = await supabase
          .from('attendance_records')
          .select('id, created_at, verified, method, user_id')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) throw error;
        setAttendance((data ?? []) as unknown as AttendanceRecord[]);

        // Determine if we should show 'Waiting' for today (only if student is required today)
        try {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const dd = String(now.getDate()).padStart(2, '0');
          const todayISODate = `${yyyy}-${mm}-${dd}`;

          // Fetch today's schedule
          const { data: schedule } = await supabase
            .from('attendance_schedules')
            .select('is_flag_day, attendance_end')
            .eq('date', todayISODate)
            .maybeSingle();

          // Check if this student is targeted today - simple ID check
          let isTargeted = false;
          if (schedule?.is_flag_day) {
            const { data: reqStud } = await supabase
              .from('attendance_schedule_required_students')
              .select('student_id')
              .eq('date', todayISODate)
              .eq('student_id', profile.id)
              .limit(1);
            isTargeted = (reqStud || []).length > 0;
          }

          if (schedule?.is_flag_day && schedule.attendance_end && isTargeted) {
            const startOfDay = new Date(now);
            startOfDay.setHours(0,0,0,0);
            const endOfDay = new Date(now);
            endOfDay.setHours(23,59,59,999);
            const { data: todays, error: todayErr } = await supabase
              .from('attendance_records')
              .select('id')
              .eq('user_id', profile.id)
              .gte('created_at', startOfDay.toISOString())
              .lte('created_at', endOfDay.toISOString())
              .limit(1);
            if (todayErr) throw todayErr;

            // Parse attendance_end into minutes and compare current time
            const [eh, em] = String(schedule.attendance_end).split(':').map((x: string) => parseInt(x, 10));
            const endMinutes = (eh || 0) * 60 + (em || 0);
            const nowMinutes = now.getHours() * 60 + now.getMinutes();

            const noAttendanceYet = (todays?.length ?? 0) === 0;
            setWaitingToday(noAttendanceYet && nowMinutes <= endMinutes);
          } else {
            setWaitingToday(false);
          }
        } catch (e) {
          setWaitingToday(false);
        }

        // Compute dynamic present/absent over the last 60 days
        console.log('[Home] Computing student stats for:', { id: profile.id });
        
        if (!profile.id) {
          console.warn('[Home] No student ID, cannot compute attendance stats');
          setPresentDays([]); setAbsentDays([]); setPresentCount(0); setAbsentCount(0);
        } else {
          try {
            const rangeDays = 60;
            const now = new Date();
            const start = new Date(now);
            start.setDate(start.getDate() - rangeDays);
            const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const startStr = toStr(start);
            const endStr = toStr(now);

            // Fetch schedules in range
            const { data: scheds, error: sErr } = await supabase
              .from('attendance_schedules')
              .select('date, is_flag_day, attendance_end')
              .gte('date', startStr)
              .lte('date', endStr);
            if (sErr) throw sErr;
            const flagged = (scheds || []).filter((s: any) => !!s.is_flag_day).map((s: any) => s.date as string);
            console.log('[Home] Flagged dates in range:', flagged);
            const flagSet = new Set<string>();
            const schedMap = new Map<string, { attendance_end: string | null; is_flag_day: boolean }>();
            (scheds || []).forEach((s: any) => { schedMap.set(s.date, { attendance_end: s.attendance_end ?? null, is_flag_day: !!s.is_flag_day }); });

            // Limit flagged dates to those where this student is required - simple ID check
            if (flagged.length > 0) {
              const { data: reqStud, error: studError } = await supabase
                .from('attendance_schedule_required_students')
                .select('date')
                .eq('student_id', profile.id)
                .in('date', flagged);
              
              if (studError) {
                console.error('[Home] Error fetching required students:', studError);
              }
              
              console.log('[Home] Required dates for student:', {
                studentId: profile.id,
                requiredDates: reqStud || []
              });
              
              // Add dates where this student is required
              (reqStud || []).forEach((r: any) => flagSet.add(r.date as string));
            }

          // Fetch all attendance records in range for this user
          const startISO = new Date(start); startISO.setHours(0,0,0,0);
          const endISO = new Date(now); endISO.setHours(23,59,59,999);
          const { data: recs, error: rErr } = await supabase
            .from('attendance_records')
            .select('id, created_at, verified')
            .eq('user_id', profile.id)
            .gte('created_at', startISO.toISOString())
            .lte('created_at', endISO.toISOString())
            .order('created_at', { ascending: false });
          if (rErr) throw rErr;

          const latestByDate = new Map<string, { id: string; created_at: string; verified: boolean }>();
          (recs || []).forEach((r: any) => {
            const d = new Date(r.created_at);
            const ds = toStr(d);
            if (!latestByDate.has(ds)) latestByDate.set(ds, { id: r.id, created_at: r.created_at, verified: !!r.verified });
          });

          const pDays: Array<{ date: string; id?: string; verified: boolean; created_at?: string; status: 'Verified' | 'Pending' | 'Unverified' }> = [];
          const aDays: string[] = [];
          const todayStrISO = toStr(now);

          for (const ds of Array.from(flagSet).sort()) {
            const ref = latestByDate.get(ds);
            const sched = schedMap.get(ds);
            if (ref) {
              // Determine status
              let status: 'Verified' | 'Pending' | 'Unverified' = 'Verified';
              if (!ref.verified) {
                if (ds === todayStrISO && sched?.attendance_end) {
                  const [eh, em] = String(sched.attendance_end).split(':').map((x: string) => parseInt(x, 10));
                  const endMinutes = (eh || 0) * 60 + (em || 0);
                  const nowMin = now.getHours()*60 + now.getMinutes();
                  status = nowMin <= endMinutes ? 'Pending' : 'Unverified';
                } else {
                  // Past date
                  status = 'Unverified';
                }
              }
              pDays.push({ date: ds, id: ref.id, verified: !!ref.verified, created_at: ref.created_at, status });
            } else {
              // No attendance record for this required date
              if (ds < todayStrISO) {
                // Past date - mark as absent
                aDays.push(ds);
              } else if (ds === todayStrISO) {
                // Today - check if waiting or absent
                if (sched?.attendance_end) {
                  const [eh, em] = String(sched.attendance_end).split(':').map((x: string) => parseInt(x, 10));
                  const endMinutes = (eh || 0) * 60 + (em || 0);
                  const nowMin = now.getHours()*60 + now.getMinutes();
                  if (nowMin <= endMinutes) {
                    // Still within attendance window - show as "Pending" (Waiting)
                    pDays.push({ date: ds, verified: false, status: 'Pending' });
                  } else {
                    // Window closed - mark as absent
                    aDays.push(ds);
                  }
                } else {
                  // No schedule details, mark as absent
                  aDays.push(ds);
                }
              }
              // Future dates (ds > todayStrISO) - don't include yet
            }
          }

          const verifiedCount = pDays.filter(d => d.verified).length;
          console.log('[Home] Final counts:', { presentDays: pDays.length, absentDays: aDays.length, verifiedCount });
          setPresentDays(pDays.sort((a,b) => a.date < b.date ? 1 : -1));
          setAbsentDays(aDays.sort((a,b) => a < b ? 1 : -1));
          setPresentCount(verifiedCount);
          setAbsentCount(aDays.length);
          } catch (e) {
            console.warn('[Home] failed to compute present/absent stats', e);
            setPresentDays([]); setAbsentDays([]); setPresentCount(0); setAbsentCount(0);
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch attendance', e);
    } finally {
      setAttLoading(false);
    }
  }, [isAdmin, profile?.id, profile?.program, profile?.year, profile?.section, profile?.role]);

  useEffect(() => {
    let active = true;
    (async () => {
      await loadAttendance();
    })();
    return () => { active = false; };
  }, [loadAttendance]);

  // Reload attendance when screen comes into focus
  // This ensures data is fresh when navigating back from other screens
  useFocusEffect(
    useCallback(() => {
      loadAttendance();
      refetchUnreadCount();
    }, [loadAttendance, refetchUnreadCount])
  );

  // Load teacher advisories and students
  useEffect(() => {
    (async () => {
      try {
        if (!isTeacher || !profile?.id) { setMyAdvisories([]); setSelectedAdv(null); setAdvStudents([]); setCurrentCaptainId(null); return; }
        const { data: adv } = await supabase
          .from('advisory_assignments')
          .select('program_code, year_name, section_name')
          .eq('teacher_id', profile.id)
          .order('program_code');
        const list = (adv || []) as Advisory[];
        setMyAdvisories(list);
        const first = list[0] || null;
        setSelectedAdv(prev => prev || first);
      } catch {
        setMyAdvisories([]); setSelectedAdv(null);
      }
    })();
  }, [isTeacher, profile?.id]);

  useEffect(() => {
    (async () => {
      try {
        if (profile?.role !== 'student' || !profile?.id) { setMyCaptainClass(null); return; }
        const { data: cap } = await supabase
          .from('class_captains')
          .select('program_code, year_name, section_name, captain_user_id')
          .eq('captain_user_id', profile.id)
          .maybeSingle();
        setMyCaptainClass(cap ? { program_code: (cap as any).program_code, year_name: (cap as any).year_name, section_name: (cap as any).section_name } : null);
      } catch { setMyCaptainClass(null); }
    })();
  }, [profile?.role, profile?.id]);

  // Load captain's classmates and their status
  useEffect(() => {
    (async () => {
      try {
        if (!myCaptainClass) { setCaptainClassStudents([]); setCaptainStudentStatus({}); return; }
        const { data: studs } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, email')
          .eq('role', 'student')
          .eq('program', myCaptainClass.program_code)
          .eq('year', myCaptainClass.year_name)
          .eq('section', myCaptainClass.section_name)
          .order('last_name', { ascending: true })
          .order('first_name', { ascending: true });
        setCaptainClassStudents((studs || []) as any);

        // Compute status for today (only for required attendees)
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

        // Determine targeted IDs: union of section requirement and explicit required students for today
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayISO = `${yyyy}-${mm}-${dd}`;
        let targetedIdsSet = new Set<string>();
        try {
          const { data: reqSec } = await supabase
            .from('attendance_schedule_required_sections')
            .select('program_code, year_name, section_name')
            .eq('date', todayISO);
          const sectionRequired = (reqSec || []).some((r: any) => r.program_code === myCaptainClass.program_code && r.year_name === myCaptainClass.year_name && r.section_name === myCaptainClass.section_name);
          if (sectionRequired) ids.forEach(id => targetedIdsSet.add(id));
          const { data: reqStud } = await supabase
            .from('attendance_schedule_required_students')
            .select('student_id')
            .eq('date', todayISO);
          const classIdSet = new Set(ids);
          (reqStud || []).forEach((r: any) => { if (classIdSet.has(r.student_id)) targetedIdsSet.add(r.student_id); });
        } catch {}

        // Fetch records only for targeted IDs
        let recMap: Record<string, { has: boolean; verified: boolean; created_at?: string }> = {};
        const targetedIds = Array.from(targetedIdsSet);
        if (targetedIds.length > 0) {
          const { data: recs } = await supabase
            .from('attendance_records')
            .select('user_id, verified, created_at')
            .in('user_id', targetedIds)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString());
          (recs || []).forEach((r: any) => { recMap[r.user_id] = { has: true, verified: !!r.verified, created_at: r.created_at }; });
        }

        // Compute status
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const sMap: Record<string, 'Present' | 'Waiting' | 'Absent' | 'Late'> = {};
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
        setCaptainStudentStatus(sMap);
      } catch { setCaptainClassStudents([]); setCaptainStudentStatus({}); }
    })();
  }, [myCaptainClass?.program_code, myCaptainClass?.year_name, myCaptainClass?.section_name]);

  // Advisory summaries: verified today per class
  useEffect(() => {
    (async () => {
      try {
        if (!isTeacher || myAdvisories.length === 0) { setAdvSummaries({}); return; }
        const now = new Date();
        const start = new Date(now); start.setHours(0,0,0,0);
        const end = new Date(now); end.setHours(23,59,59,999);
        const summaries: Record<string, { verified: number; total: number }> = {};
        for (const a of myAdvisories) {
          const key = `${a.program_code}|${a.year_name}|${a.section_name}`;
          const { data: studs } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('role', 'student')
            .eq('program', a.program_code)
            .eq('year', a.year_name)
            .eq('section', a.section_name);
          const ids = (studs || []).map(s => (s as any).id);
          if (ids.length === 0) { summaries[key] = { verified: 0, total: 0 }; continue; }
          // Determine targeted set for today in this class - simple: check which students are required
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const dd = String(now.getDate()).padStart(2, '0');
          const todayISO = `${yyyy}-${mm}-${dd}`;
          const { data: reqStud } = await supabase
            .from('attendance_schedule_required_students')
            .select('student_id')
            .eq('date', todayISO);
          const classIdSet = new Set(ids);
          const targeted = new Set<string>();
          (reqStud || []).forEach((r: any) => { if (classIdSet.has(r.student_id)) targeted.add(r.student_id); });
          const targetedIds = Array.from(targeted);
          if (targetedIds.length === 0) { summaries[key] = { verified: 0, total: 0 }; continue; }
          const { data: recs } = await supabase
            .from('attendance_records')
            .select('user_id')
            .in('user_id', targetedIds)
            .eq('verified', true)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString());
          const vset = new Set((recs || []).map(r => (r as any).user_id));
          summaries[key] = { verified: vset.size, total: targetedIds.length };
        }
        setAdvSummaries(summaries);
      } catch {
        setAdvSummaries({});
      }
    })();
  }, [isTeacher, myAdvisories]);

  useEffect(() => {
    (async () => {
      try {
        if (!selectedAdv) { setAdvStudents([]); setCurrentCaptainId(null); return; }
        setAdvLoading(true);
        const { data: studs } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, email')
          .eq('role', 'student')
          .eq('program', selectedAdv.program_code)
          .eq('year', selectedAdv.year_name)
          .eq('section', selectedAdv.section_name)
          .order('last_name', { ascending: true })
          .order('first_name', { ascending: true });
        setAdvStudents((studs || []) as any);
        // Today's attendance per student in class
        const now = new Date();
        const start = new Date(now); start.setHours(0,0,0,0);
        const end = new Date(now); end.setHours(23,59,59,999);
        const ids = (studs || []).map(s => (s as any).id);
        if (ids.length > 0) {
          const { data: recs } = await supabase
            .from('attendance_records')
            .select('user_id, verified')
            .in('user_id', ids)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString());
          const map: Record<string, { has: boolean; verified: boolean }> = {};
          (recs || []).forEach((r: any) => { map[r.user_id] = { has: true, verified: !!r.verified }; });
          setAdvTodayMap(map);
        } else {
          setAdvTodayMap({});
        }
        const { data: cap } = await supabase
          .from('class_captains')
          .select('captain_user_id')
          .eq('program_code', selectedAdv.program_code)
          .eq('year_name', selectedAdv.year_name)
          .eq('section_name', selectedAdv.section_name)
          .maybeSingle();
        setCurrentCaptainId((cap as any)?.captain_user_id || null);
      } catch {
        setAdvStudents([]); setCurrentCaptainId(null);
      } finally { setAdvLoading(false); }
    })();
  }, [selectedAdv?.program_code, selectedAdv?.year_name, selectedAdv?.section_name]);

  const setCaptain = async (userId: string) => {
    if (!selectedAdv) return;
    try {
      await supabase
        .from('class_captains')
        .upsert({
          program_code: selectedAdv.program_code,
          year_name: selectedAdv.year_name,
          section_name: selectedAdv.section_name,
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

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      if (isAdmin) {
        // refresh students count
        try {
          const { count, error } = await supabase
            .from('user_profiles')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'student');
          if (error) throw error;
          setStudentsCount(count ?? 0);
        } catch (e) {
          console.error('Failed to refresh students count', e);
        }
      }
      await loadAttendance();
      await refetchUnreadCount();
    } finally {
      setRefreshing(false);
    }
  }, [isAdmin, loadAttendance]);

  const getWelcomeMessage = () => {
    switch (profile?.role) {
      case 'student':
        return 'Welcome, Student!';
      case 'teacher':
        return 'Welcome, Professor!';
      case 'admin':
        return 'Welcome, Administrator!';
      case 'superadmin':
        return 'Welcome, Super Admin!';
      default:
        return 'Please sign in to access your account.';
    }
  };

  const getRoleDescription = () => {
    switch (profile?.role) {
      case 'student':
        return 'You can view your attendance records.';
      case 'teacher':
        return 'You can manage your classes and take attendance.';
      case 'admin':
        return 'You can manage users and system settings.';
      case 'superadmin':
        return 'You have full system access and administrative privileges.';
      default:
        return 'Please sign in to access your account.';
    }
  };

  const getQuickActions = () => {
    const actions = [] as Array<{ title: string; icon: string; onPress: () => void; color: string }>;
    if (profile?.role === 'student' && myCaptainClass) {
      actions.push({
        title: 'My Class',
        icon: 'people',
        onPress: () => router.push({ pathname: '/(tabs)/advisory/[program_code]/[year_name]/[section_name]', params: myCaptainClass } as any),
        color: '#4e73df',
      });
    }
    if (profile?.role === 'superadmin') {
      actions.push({
        title: 'Manage Admins',
        icon: 'shield-checkmark',
        onPress: () => {
          manageAdminsRef.current?.measureLayout(
            scrollViewRef.current as any,
            (x, y) => {
              scrollViewRef.current?.scrollTo({ y: y - 20, animated: true });
            },
            () => {}
          );
        },
        color: '#6f42c1',
      });
    }
    if (isAdmin) {
      actions.push({
        title: 'Academic Structure',
        icon: 'school',
        onPress: () => {
          academicStructureRef.current?.measureLayout(
            scrollViewRef.current as any,
            (x, y) => {
              scrollViewRef.current?.scrollTo({ y: y - 20, animated: true });
            },
            () => {}
          );
        },
        color: '#fd7e14',
      });
      actions.push({
        title: 'Generate Report',
        icon: 'document-text',
        onPress: () => {
          reportRef.current?.measureLayout(
            scrollViewRef.current as any,
            (x, y) => {
              scrollViewRef.current?.scrollTo({ y: y - 20, animated: true });
            },
            () => {
              Alert.alert('Reports', 'Report section not available.');
            }
          );
        },
        color: '#28a745',
      });
    }
    // Remove View Profile and Reports for now; keep Settings only
    actions.push({
      title: 'Settings',
      icon: 'settings',
      onPress: () => router.push('/(tabs)/settings'),
      color: '#6c757d',
    });
    return actions;
  };

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const quickActions = getQuickActions();
  const todayStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const verifiedPresentCount = presentDays.filter(d => d.verified).length;
  const totalSchedDays = presentDays.length + absentDays.length;
  const attendancePercent = totalSchedDays > 0 ? Math.round((verifiedPresentCount / totalSchedDays) * 100) : 0;

  return (
    <>
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.welcomeText}>Hello,</Text>
            <Text style={styles.userName}>
              {profile.first_name} {profile.last_name}
            </Text>
            <View style={[styles.roleBadge, { backgroundColor: getRoleColor(profile.role) }]}>
              <Text style={styles.roleText}>{profile.role}</Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile.first_name?.charAt(0)}{profile.last_name?.charAt(0)}
              </Text>
            </View>
            {/* Notification Badge */}
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>{getRoleDescription()}</Text>
      </View>

      {/* Stats Cards */}
      {isAdmin ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
          {/* Row 1: Date & Attendance */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: '#4e73df', width: '48%' }]}
              onPress={() => router.push({ pathname: isAdmin ? '/(tabs)/schedule' : '/(tabs)/schedule-view' } as any)}
              activeOpacity={0.8}
            > 
              <Ionicons name="calendar" size={24} color="#fff" />
              <Text style={styles.statNumber}>{todayStr}</Text>
              <Text style={styles.statLabel}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: '#1cc88a', width: '48%' }]}
              onPress={async () => {
                // Open Required Attendees modal
                try {
                  setAdminReqLoading(true);
                  const now = new Date();
                  const yyyy = now.getFullYear();
                  const mm = String(now.getMonth() + 1).padStart(2, '0');
                  const dd = String(now.getDate()).padStart(2, '0');
                  const todayISO = `${yyyy}-${mm}-${dd}`;

                  // Schedule
                  const { data: sched } = await supabase
                    .from('attendance_schedules')
                    .select('is_flag_day, on_time_end, attendance_end')
                    .eq('date', todayISO)
                    .maybeSingle();

                  // Required students - simple: just get IDs from the table
                  const { data: reqStud } = await supabase
                    .from('attendance_schedule_required_students')
                    .select('student_id')
                    .eq('date', todayISO);
                  const targetStudentIds = Array.from(new Set((reqStud || []).map((r: any) => r.student_id)));
                  
                  // Fetch student profiles for these IDs
                  const studentMap: Record<string, any> = {};
                  if (targetStudentIds.length > 0) {
                    const { data: studentProfiles } = await supabase
                      .from('user_profiles')
                      .select('id, first_name, last_name, email, program, year, section')
                      .in('id', targetStudentIds);
                    (studentProfiles || []).forEach((s: any) => { studentMap[s.id] = s; });
                  }

                  // Required teachers
                  const { data: reqTeach } = await supabase
                    .from('attendance_schedule_required_teachers')
                    .select('teacher_id')
                    .eq('date', todayISO);
                  const teacherIds = Array.from(new Set((reqTeach || []).map((t: any) => t.teacher_id)));
                  let teachers: any[] = [];
                  if (teacherIds.length > 0) {
                    const { data: tProfiles } = await supabase
                      .from('user_profiles')
                      .select('id, first_name, last_name, email')
                      .in('id', teacherIds);
                    teachers = tProfiles || [];
                  }

                  // Attendance records today for all required
                  const allIds = [...targetStudentIds, ...teacherIds];
                  const start = new Date(now); start.setHours(0,0,0,0);
                  const end = new Date(now); end.setHours(23,59,59,999);
                  const { data: dayRecs } = allIds.length > 0 ? await supabase
                    .from('attendance_records')
                    .select('user_id, verified, created_at')
                    .in('user_id', allIds)
                    .gte('created_at', start.toISOString())
                    .lte('created_at', end.toISOString()) : { data: [] } as any;
                  const latest: Record<string, { verified: boolean; created_at: string }> = {};
                  (dayRecs || []).forEach((r: any) => { if (!latest[r.user_id]) latest[r.user_id] = { verified: !!r.verified, created_at: r.created_at }; });
                  const parseMin = (t?: string | null) => {
                    if (!t) return null; const [h, m] = String(t).split(':').map((x: string) => parseInt(x, 10)); return (h||0)*60 + (m||0);
                  };
                  const onTimeEndMin = parseMin((sched as any)?.on_time_end || null);
                  const attendanceEndMin = parseMin((sched as any)?.attendance_end || null);
                  const nowMin = now.getHours()*60 + now.getMinutes();
                  const statusOf = (uId: string): 'Waiting'|'Present'|'Late'|'Absent' => {
                    const rec = latest[uId];
                    if (rec?.verified) {
                      if (onTimeEndMin != null) {
                        const dt = new Date(rec.created_at); const mins = dt.getHours()*60 + dt.getMinutes();
                        return mins > onTimeEndMin ? 'Late' : 'Present';
                      }
                      return 'Present';
                    }
                    if (attendanceEndMin == null || nowMin <= attendanceEndMin) return 'Waiting';
                    return 'Absent';
                  };

                  // Build teachers list
                  const teachersOut = teachers.map((t: any) => ({
                    id: t.id,
                    name: `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || '(No name)',
                    email: t.email || null,
                    status: statusOf(t.id),
                  }));

                  // Build nested students
                  const nested: Record<string, Record<string, Record<string, Array<{ id: string; name: string; email: string | null; status: 'Waiting'|'Present'|'Late'|'Absent' }>>>> = {};
                  targetStudentIds.forEach((id: string) => {
                    const s = studentMap[id];
                    const prog = String(s.program || 'Unknown');
                    const yr = String(s.year || '');
                    const sec = String(s.section || '');
                    nested[prog] = nested[prog] || {};
                    nested[prog][yr] = nested[prog][yr] || {};
                    nested[prog][yr][sec] = nested[prog][yr][sec] || [];
                    nested[prog][yr][sec].push({ id, name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || '(No name)', email: s.email || null, status: statusOf(id) });
                  });

                  setAdminReqData({ schedule: (sched as any) || null, teachers: teachersOut, students: nested });
                  setAdminReqVisible(true);
                } catch {
                  // ignore
                } finally {
                  setAdminReqLoading(false);
                }
              }}
              activeOpacity={0.8}
            > 
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              {adminNoScheduleToday ? (
                <Text style={[styles.statNumber, { fontSize: 14, lineHeight: 18 }]}>No scheduled attendance today!</Text>
              ) : (
                <Text style={styles.statNumber}>
                  {adminTodayCounts && adminTodayCounts.total > 0
                    ? `${adminTodayCounts.verified}/${adminTodayCounts.total} • ${Math.round((adminTodayCounts.verified / adminTodayCounts.total) * 100)}%`
                    : '—'}
                </Text>
              )}
              <Text style={styles.statLabel}>Attendance</Text>
            </TouchableOpacity>
          </View>

          {/* Row 2: Students & Teachers */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: '#f6c23e', width: '48%' }]}
              onPress={() => router.push({ pathname: '/(tabs)/students' })}
            > 
              <Ionicons name="people" size={24} color="#fff" />
              <Text style={styles.statNumber}>{studentsCount ?? '—'}</Text>
              <Text style={styles.statLabel}>Students</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: '#9c27b0', width: '48%' }]}
              onPress={() => router.push({ pathname: '/(tabs)/teachers' })}
            >
              <Ionicons name="school" size={24} color="#fff" />
              <Text style={styles.statNumber}>View</Text>
              <Text style={styles.statLabel}>Teachers</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsContainer}
        >
          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#4e73df' }]}
            onPress={() => {
              const d = new Date();
              const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
              router.push({ pathname: '/(tabs)/schedule-view', params: { anchor: ds } } as any);
            }}
            activeOpacity={0.85}
          > 
            <Ionicons name="calendar" size={24} color="#fff" />
            <Text style={styles.statNumber}>{todayStr}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.statCard, { backgroundColor: '#1cc88a' }]}
            onPress={() => setStudentAttendanceModal(true)}
            activeOpacity={0.85}
          > 
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <Text style={styles.statNumber}>{totalSchedDays > 0 ? `${verifiedPresentCount}/${totalSchedDays} • ${attendancePercent}%` : '—'}</Text>
            <Text style={styles.statLabel}>Attendance</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {(!isAdmin && profile.role === 'student') && (
        <View style={styles.miniStatsRow}>
          <TouchableOpacity style={styles.miniStatBox} onPress={() => setPresentModal(true)}>
            <Text style={styles.miniStatNumber}>{presentCount}</Text>
            <Text style={styles.miniStatLabel}>Present Days</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.miniStatBox} onPress={() => setAbsentModal(true)}>
            <Text style={styles.miniStatNumber}>{absentCount}</Text>
            <Text style={styles.miniStatLabel}>Absent Days</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((action, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.actionButton, { backgroundColor: action.color + '15' }]}
              onPress={action.onPress}
            >
              <View style={[styles.actionIcon, { backgroundColor: action.color + '33' }]}>
                <Ionicons name={action.icon as any} size={24} color={action.color} />
              </View>
              <Text style={[styles.actionText, { color: action.color }]}>{action.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Recent Activity */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/attendance')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.activityList}>
          {attLoading && (
            <View style={{ paddingVertical: 8 }}>
              <ActivityIndicator />
            </View>
          )}
          {!attLoading && (attendance?.length ?? 0) === 0 && (
            <Text style={{ color: '#6c757d' }}>No recent attendance yet.</Text>
          )}
          {!attLoading && waitingToday && !isAdmin && (
            <View style={styles.activityItem}>
              <View style={[styles.activityIcon, { backgroundColor: '#fff3cd' }]}> 
                <Ionicons name={'time'} size={20} color={'#f59f00'} />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>Waiting</Text>
                <Text style={styles.activityTime}>Attendance window still open</Text>
              </View>
            </View>
          )}
          {!attLoading && attendance?.map((rec) => {
            const isUnverified = !rec.verified;
            const name = isAdmin ? `${rec.user?.first_name ?? ''} ${rec.user?.last_name ?? ''}`.trim() : `${profile.first_name} ${profile.last_name}`.trim();
            return (
              <TouchableOpacity
                key={rec.id}
                style={styles.activityItem}
                onPress={() => router.push({ pathname: '/(tabs)/verify-attendance/[id]', params: { id: rec.id } })}
                activeOpacity={0.7}
              >
                <View style={[styles.activityIcon, { backgroundColor: isUnverified ? '#fff3cd' : '#e3f2fd' }]}> 
                  <Ionicons name={isUnverified ? 'alert-circle' : 'checkmark-circle'} size={20} color={isUnverified ? '#f59f00' : '#1976d2'} />
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activityTitle}>
                    {isUnverified ? 'Attendance unverified' : 'Attendance verified'}{isAdmin ? ` — ${name}` : ''}
                  </Text>
                  <Text style={styles.activityTime}>{new Date(rec.created_at).toLocaleString()}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9e9e9e" />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Student Captain Class Section */}
      {profile?.role === 'student' && myCaptainClass && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Class</Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/advisory/[program_code]/[year_name]/[section_name]', params: myCaptainClass } as any)}>
              <Text style={styles.seeAllText}>View All</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: '#6c757d', marginBottom: 12 }}>
            {myCaptainClass.program_code} • {myCaptainClass.year_name} • Sec {myCaptainClass.section_name}
          </Text>
          {captainClassStudents.length === 0 ? (
            <Text style={{ color: '#6c757d' }}>No classmates found.</Text>
          ) : (
            <View>
              {captainClassStudents.slice(0, 5).map((s: { id: string; first_name: string | null; last_name: string | null; email: string | null }) => (
                <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
                  <View>
                    <Text style={{ color: '#2d3748', fontWeight: '600' }}>{`${s.first_name ?? ''}${s.last_name ? ` ${s.last_name}` : ''}`.trim()}</Text>
                    <Text style={{ color: '#6c757d', fontSize: 12 }}>{s.email}</Text>
                  </View>
                  {captainStudentStatus[s.id] === 'Present' && (
                    <Text style={{ color: '#28a745', fontWeight: '700' }}>Present</Text>
                  )}
                  {captainStudentStatus[s.id] === 'Late' && (
                    <Text style={{ color: '#fd7e14', fontWeight: '700' }}>Late</Text>
                  )}
                  {captainStudentStatus[s.id] === 'Waiting' && (
                    <Text style={{ color: '#f59f00', fontWeight: '700' }}>Waiting</Text>
                  )}
                  {captainStudentStatus[s.id] === 'Absent' && (
                    <Text style={{ color: '#e03131', fontWeight: '700' }}>Absent</Text>
                  )}
                </View>
              ))}
              {captainClassStudents.length > 5 && (
                <Text style={{ marginTop: 8, color: '#6c757d', fontSize: 12 }}>
                  And {captainClassStudents.length - 5} more...
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Teacher Advisory Class Section */}
      {isTeacher && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Advisory Class</Text>
          </View>
          {myAdvisories.length === 0 ? (
            <Text style={{ color: '#6c757d' }}>No advisory class assigned.</Text>
          ) : (
            <>
              {/* Summary list */}
              <View style={{ marginBottom: 8 }}>
                {myAdvisories.map((a) => {
                  const key = `${a.program_code}|${a.year_name}|${a.section_name}`;
                  const sum = advSummaries[key] || { verified: 0, total: 0 };
                  return (
                    <TouchableOpacity key={key} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} onPress={() => router.push({ pathname: '/(tabs)/advisory/[program_code]/[year_name]/[section_name]', params: { program_code: a.program_code, year_name: a.year_name, section_name: a.section_name } } as any)}>
                      <Text style={{ color: '#2d3748', fontWeight: '700' }}>{a.program_code} • {a.year_name} • Sec {a.section_name}</Text>
                      <Text style={{ color: '#4e73df', fontWeight: '700' }}>{sum.total > 0 ? `${sum.verified}/${sum.total} verified` : '—'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={{ marginTop: 8, color: '#6c757d' }}>Tap a class to view and manage students</Text>
            </>
          )}
        </View>
      )}

      {/* Admin/Superadmin Academic Structures Management */}
      {isAdmin && (
        <View ref={academicStructureRef} collapsable={false} style={styles.section}>
          <Text style={styles.sectionTitle}>Academic Structures</Text>
          <AcademicStructuresManager 
            adminCollege={(profile as any)?.college || null} 
            isSuperadmin={profile?.role === 'superadmin'} 
          />
        </View>
      )}

      {/* Admin/Superadmin Attendance Reports */}
      {isAdmin && (profile as any)?.college && (
        <View ref={reportRef} collapsable={false} style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly Attendance Reports</Text>
          <AttendanceReport adminCollege={(profile as any)?.college} />
        </View>
      )}

      {/* Superadmin Admin Management */}
      {profile?.role === 'superadmin' && (
        <View ref={manageAdminsRef} style={styles.section} collapsable={false}>
          <Text style={styles.sectionTitle}>Manage Admins</Text>
          <AdminManagement />
        </View>
      )}
    </ScrollView>

    {!isAdmin && (
      <>
        <Modal visible={presentModal} animationType="slide" transparent onRequestClose={() => setPresentModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Present Days (last 60)</Text>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                {presentDays.length === 0 ? (
                  <Text style={{ color: '#6c757d' }}>No present days found.</Text>
                ) : (
                  presentDays.map((d) => (
                    <TouchableOpacity key={d.date} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => {
                      if (d.id) router.push({ pathname: '/(tabs)/verify-attendance/[id]', params: { id: d.id } } as any);
                    }}>
                      <Text style={{ color: '#2d3748', fontWeight: '600' }}>{new Date(d.date).toLocaleDateString()}</Text>
                      <Text style={{ marginTop: 2, color: d.status === 'Verified' ? '#28a745' : d.status === 'Pending' ? '#f59f00' : '#e03131', fontWeight: '600' }}>{d.status}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              <View style={{ padding: 12 }}>
                <TouchableOpacity style={{ backgroundColor: '#4e73df', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={() => setPresentModal(false)}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={absentModal} animationType="slide" transparent onRequestClose={() => setAbsentModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Absent Days (last 60)</Text>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                {absentDays.length === 0 ? (
                  <Text style={{ color: '#6c757d' }}>No absent days found.</Text>
                ) : (
                  absentDays.map((ds) => (
                    <TouchableOpacity key={ds} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => {
                      router.push({ pathname: '/(tabs)/schedule-view', params: { anchor: ds } } as any);
                    }}>
                      <Text style={{ color: '#2d3748', fontWeight: '600' }}>{new Date(ds).toLocaleDateString()}</Text>
                      <Text style={{ marginTop: 2, color: '#e03131', fontWeight: '600' }}>Absent</Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              <View style={{ padding: 12 }}>
                <TouchableOpacity style={{ backgroundColor: '#4e73df', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={() => setAbsentModal(false)}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Student Attendance Details Modal */}
        <Modal visible={studentAttendanceModal} animationType="slide" transparent onRequestClose={() => setStudentAttendanceModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%' }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>My Attendance Details</Text>
                <TouchableOpacity onPress={() => setStudentAttendanceModal(false)}>
                  <Ionicons name="close" size={24} color="#2d3748" />
                </TouchableOpacity>
              </View>
              
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', backgroundColor: '#f8f9fa' }}>
                <Text style={{ fontSize: 14, color: '#6c757d', marginBottom: 8 }}>Last 60 Days Summary</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: '700', color: '#28a745' }}>{verifiedPresentCount}</Text>
                    <Text style={{ fontSize: 12, color: '#6c757d' }}>Verified Present</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: '700', color: '#e03131' }}>{absentCount}</Text>
                    <Text style={{ fontSize: 12, color: '#6c757d' }}>Absent</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: '700', color: '#4e73df' }}>{attendancePercent}%</Text>
                    <Text style={{ fontSize: 12, color: '#6c757d' }}>Attendance Rate</Text>
                  </View>
                </View>
              </View>

              <ScrollView contentContainerStyle={{ padding: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#2d3748', marginBottom: 8 }}>All Required Dates</Text>
                <Text style={{ fontSize: 12, color: '#6c757d', marginBottom: 12 }}>Only dates where you are required to attend are shown below.</Text>
                
                {/* Combine present and absent days and sort by date */}
                {(() => {
                  const allDates = [
                    ...presentDays.map(d => ({ ...d, type: 'present' as const })),
                    ...absentDays.map(d => ({ date: d, type: 'absent' as const }))
                  ].sort((a, b) => b.date.localeCompare(a.date));
                  
                  if (allDates.length === 0) {
                    return <Text style={{ color: '#6c757d', textAlign: 'center', marginTop: 20 }}>No required attendance dates in the last 60 days.</Text>;
                  }
                  
                  return allDates.map((item) => (
                    <TouchableOpacity 
                      key={item.date} 
                      style={{ 
                        paddingVertical: 12, 
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: '#f8f9fa',
                        marginBottom: 8,
                        borderLeftWidth: 4,
                        borderLeftColor: 
                          item.type === 'present' && (item as any).status === 'Verified' ? '#28a745' :
                          item.type === 'present' && (item as any).status === 'Pending' ? '#f59f00' :
                          item.type === 'present' && (item as any).status === 'Unverified' ? '#e03131' :
                          '#e03131'
                      }} 
                      onPress={() => {
                        setStudentAttendanceModal(false);
                        if (item.type === 'present' && (item as any).id) {
                          router.push({ pathname: '/(tabs)/verify-attendance/[id]', params: { id: (item as any).id } } as any);
                        } else {
                          router.push({ pathname: '/(tabs)/schedule-view', params: { anchor: item.date } } as any);
                        }
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#2d3748', fontWeight: '600', fontSize: 14 }}>
                            {new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                          </Text>
                          {item.type === 'present' && (item as any).created_at && (
                            <Text style={{ color: '#6c757d', fontSize: 12, marginTop: 2 }}>
                              Scanned at {new Date((item as any).created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ 
                            fontWeight: '700', 
                            fontSize: 14,
                            color: 
                              item.type === 'present' && (item as any).status === 'Verified' ? '#28a745' :
                              item.type === 'present' && (item as any).status === 'Pending' ? '#f59f00' :
                              item.type === 'present' && (item as any).status === 'Unverified' ? '#e03131' :
                              '#e03131'
                          }}>
                            {item.type === 'present' ? (item as any).status : 'Absent'}
                          </Text>
                          <Ionicons 
                            name={
                              item.type === 'present' && (item as any).status === 'Verified' ? 'checkmark-circle' :
                              item.type === 'present' && (item as any).status === 'Pending' ? 'time' :
                              'close-circle'
                            }
                            size={20}
                            color={
                              item.type === 'present' && (item as any).status === 'Verified' ? '#28a745' :
                              item.type === 'present' && (item as any).status === 'Pending' ? '#f59f00' :
                              '#e03131'
                            }
                            style={{ marginTop: 4 }}
                          />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ));
                })()}
              </ScrollView>

              <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#f1f3f5' }}>
                <TouchableOpacity 
                  style={{ backgroundColor: '#4e73df', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} 
                  onPress={() => setStudentAttendanceModal(false)}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    )}

    {isAdmin && (
      <Modal visible={adminReqVisible} animationType="slide" transparent onRequestClose={() => setAdminReqVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Required Attendees — Today</Text>
              <TouchableOpacity onPress={() => setAdminReqVisible(false)}>
                <Ionicons name="close" size={20} color="#2d3748" />
              </TouchableOpacity>
            </View>
            {adminReqLoading ? (
              <View style={{ padding: 16 }}><ActivityIndicator /></View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                {/* Filters */}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <TouchableOpacity onPress={() => setAdminFilterRole('all')} style={[styles.optionBtn, adminFilterRole === 'all' && styles.optionBtnSelected]}>
                    <Text style={[styles.optionText, adminFilterRole === 'all' && styles.optionTextSelected]}>All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setAdminFilterRole('students')} style={[styles.optionBtn, adminFilterRole === 'students' && styles.optionBtnSelected]}>
                    <Text style={[styles.optionText, adminFilterRole === 'students' && styles.optionTextSelected]}>Students</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setAdminFilterRole('teachers')} style={[styles.optionBtn, adminFilterRole === 'teachers' && styles.optionBtnSelected]}>
                    <Text style={[styles.optionText, adminFilterRole === 'teachers' && styles.optionTextSelected]}>Teachers</Text>
                  </TouchableOpacity>
                  <View style={{ height: 8, width: '100%' }} />
                  {/* Program filter options */}
                  {Object.keys(adminReqData.students || {}).length > 0 && (
                    <>
                      <Text style={styles.label}>Program</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <TouchableOpacity onPress={() => { setAdminFilterProgram(null); setAdminFilterYear(null); setAdminFilterSection(null); }} style={[styles.optionBtn, !adminFilterProgram && styles.optionBtnSelected]}>
                          <Text style={[styles.optionText, !adminFilterProgram && styles.optionTextSelected]}>Any</Text>
                        </TouchableOpacity>
                        {Object.keys(adminReqData.students).map(p => (
                          <TouchableOpacity key={p} onPress={() => { setAdminFilterProgram(p); setAdminFilterYear(null); setAdminFilterSection(null); }} style={[styles.optionBtn, adminFilterProgram === p && styles.optionBtnSelected]}>
                            <Text style={[styles.optionText, adminFilterProgram === p && styles.optionTextSelected]}>{p}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      {!!adminFilterProgram && (
                        <>
                          <Text style={[styles.label, { marginTop: 8 }]}>Year</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <TouchableOpacity onPress={() => { setAdminFilterYear(null); setAdminFilterSection(null); }} style={[styles.optionBtn, !adminFilterYear && styles.optionBtnSelected]}>
                              <Text style={[styles.optionText, !adminFilterYear && styles.optionTextSelected]}>Any</Text>
                            </TouchableOpacity>
                            {Object.keys(adminReqData.students[adminFilterProgram] || {}).map(y => (
                              <TouchableOpacity key={y} onPress={() => { setAdminFilterYear(y); setAdminFilterSection(null); }} style={[styles.optionBtn, adminFilterYear === y && styles.optionBtnSelected]}>
                                <Text style={[styles.optionText, adminFilterYear === y && styles.optionTextSelected]}>{y}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </>
                      )}
                      {!!adminFilterYear && (
                        <>
                          <Text style={[styles.label, { marginTop: 8 }]}>Section</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <TouchableOpacity onPress={() => setAdminFilterSection(null)} style={[styles.optionBtn, !adminFilterSection && styles.optionBtnSelected]}>
                              <Text style={[styles.optionText, !adminFilterSection && styles.optionTextSelected]}>Any</Text>
                            </TouchableOpacity>
                            {Object.keys(adminReqData.students[adminFilterProgram!][adminFilterYear!] || {}).map(s => (
                              <TouchableOpacity key={s} onPress={() => setAdminFilterSection(s)} style={[styles.optionBtn, adminFilterSection === s && styles.optionBtnSelected]}>
                                <Text style={[styles.optionText, adminFilterSection === s && styles.optionTextSelected]}>{s}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </>
                      )}
                    </>
                  )}
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity onPress={() => { setAdminFilterRole('all'); setAdminFilterProgram(null); setAdminFilterYear(null); setAdminFilterSection(null); }}>
                    <Ionicons name="close-circle" size={20} color="#4e73df" />
                  </TouchableOpacity>
                </View>

                {/* Teachers category */}
                {(adminFilterRole === 'all' || adminFilterRole === 'teachers') && (adminReqData.teachers || []).length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <TouchableOpacity onPress={() => setCollapseKeys(prev => ({ ...prev, teachers: !prev.teachers }))} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: '700', color: '#2d3748' }}>Teachers</Text>
                      <Ionicons name={(collapseKeys as any).teachers ? 'chevron-up' : 'chevron-down'} size={16} color="#2d3748" />
                    </TouchableOpacity>
                    {(collapseKeys as any).teachers !== true && (
                      <View style={{ marginTop: 6 }}>
                        {adminReqData.teachers.map(t => (
                          <View key={t.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', flexDirection: 'row', justifyContent: 'space-between' }}>
                            <View>
                              <Text style={{ color: '#2d3748', fontWeight: '600' }}>{t.name}</Text>
                              {!!t.email && <Text style={{ color: '#6c757d', fontSize: 12 }}>{t.email}</Text>}
                            </View>
                            <Text style={{ fontWeight: '700', color: t.status === 'Present' ? '#28a745' : t.status === 'Late' ? '#fd7e14' : t.status === 'Waiting' ? '#f59f00' : '#e03131' }}>{t.status}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Students by Program > Year > Section */}
                {(adminFilterRole === 'all' || adminFilterRole === 'students') && Object.keys(adminReqData.students || {}).length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    {Object.keys(adminReqData.students).filter(p => !adminFilterProgram || adminFilterProgram === p).map(p => (
                      <View key={p} style={{ marginBottom: 8 }}>
                        <TouchableOpacity onPress={() => setCollapseKeys(prev => ({ ...prev, [p]: !prev[p] }))} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontWeight: '700', color: '#2d3748' }}>{p}</Text>
                          <Ionicons name={collapseKeys[p] ? 'chevron-up' : 'chevron-down'} size={16} color="#2d3748" />
                        </TouchableOpacity>
                        {!collapseKeys[p] && (
                          <View style={{ marginLeft: 10, marginTop: 6 }}>
                            {Object.keys(adminReqData.students[p] || {}).filter(y => !adminFilterYear || adminFilterYear === y).map(y => {
                              const keyY = `${p}|${y}`;
                              return (
                                <View key={keyY} style={{ marginBottom: 6 }}>
                                  <TouchableOpacity onPress={() => setCollapseKeys(prev => ({ ...prev, [keyY]: !prev[keyY] }))} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ color: '#2d3748', fontWeight: '600' }}>{y}</Text>
                                    <Ionicons name={collapseKeys[keyY] ? 'chevron-up' : 'chevron-down'} size={16} color="#2d3748" />
                                  </TouchableOpacity>
                                  {!collapseKeys[keyY] && (
                                    <View style={{ marginLeft: 10, marginTop: 6 }}>
                                      {Object.keys(adminReqData.students[p][y] || {}).filter(s => !adminFilterSection || adminFilterSection === s).map(s => {
                                        const keyS = `${p}|${y}|${s}`;
                                        const list = adminReqData.students[p][y][s] || [];
                                        if (list.length === 0) return null;
                                        return (
                                          <View key={keyS} style={{ marginBottom: 6 }}>
                                            <TouchableOpacity onPress={() => setCollapseKeys(prev => ({ ...prev, [keyS]: !prev[keyS] }))} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <Text style={{ color: '#2d3748' }}>Sec {s}</Text>
                                              <Ionicons name={collapseKeys[keyS] ? 'chevron-up' : 'chevron-down'} size={16} color="#2d3748" />
                                            </TouchableOpacity>
                                            {!collapseKeys[keyS] && (
                                              <View style={{ marginLeft: 10, marginTop: 6 }}>
                                                {list.map(st => (
                                                  <View key={st.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <View>
                                                      <Text style={{ color: '#2d3748', fontWeight: '600' }}>{st.name}</Text>
                                                      {!!st.email && <Text style={{ color: '#6c757d', fontSize: 12 }}>{st.email}</Text>}
                                                    </View>
                                                    <Text style={{ fontWeight: '700', color: st.status === 'Present' ? '#28a745' : st.status === 'Late' ? '#fd7e14' : st.status === 'Waiting' ? '#f59f00' : '#e03131' }}>{st.status}</Text>
                                                  </View>
                                                ))}
                                              </View>
                                            )}
                                          </View>
                                        );
                                      })}
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}
            <View style={{ padding: 12 }}>
              <TouchableOpacity style={{ backgroundColor: '#4e73df', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={() => setAdminReqVisible(false)}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    )}
    </>
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
    flex: 1,
    backgroundColor: '#f8f9fc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#4e73df',
    padding: 20,
    paddingTop: 50,
    paddingBottom: 30,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  welcomeText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 4,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
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
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#4e73df',
    fontSize: 20,
    fontWeight: 'bold',
  },
  notificationBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#e03131',
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#4e73df',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  statCard: {
    width: 150,
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginVertical: 8,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  miniStatsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  miniStatBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  miniStatNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2d3748',
  },
  miniStatLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 2,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    margin: 16,
    marginBottom: 0,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
  },
  seeAllText: {
    color: '#4e73df',
    fontSize: 14,
    fontWeight: '500',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  actionButton: {
    width: '48%',
    margin: '1%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  activityList: {
    marginTop: 8,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    color: '#2d3748',
    marginBottom: 2,
  },
  activityTime: {
    fontSize: 12,
    color: '#a0aec0',
  },
  optionBtn: { 
    padding: 10, 
    backgroundColor: '#f8f9fa', 
    borderRadius: 8, 
    marginRight: 8, 
    marginBottom: 8 
  },
  optionBtnSelected: { 
    backgroundColor: '#4e73df' 
  },
  optionText: { 
    color: '#2d3748', 
    fontWeight: '600' 
  },
  optionTextSelected: { 
    color: '#fff' 
  },
  label: { 
    color: '#6c757d', 
    fontWeight: '600', 
    fontSize: 14, 
    marginBottom: 8, 
    marginRight: 8 
  },
});
