import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Switch, Modal, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

// Helper to format date to YYYY-MM-DD
const fmtDate = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function useMonthMatrix(anchor: Date) {
  return useMemo(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth(); // 0-based
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const firstWeekday = firstOfMonth.getDay(); // 0=Sun
    const daysInMonth = lastOfMonth.getDate();

    const cells: Array<Date | null> = [];
    // pad before first day
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    // days of month
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    // pad after to complete weeks
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: Array<Array<Date | null>> = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }, [anchor]);
}

// Helper to send notifications for attendance schedule changes
async function sendAttendanceNotifications(params: {
  date: string;
  addedTeachers: string[];
  removedTeachers: string[];
  addedStudents: string[];
  removedStudents: string[];
  metadata: {
    venue?: string;
    attendance_start?: string;
    on_time_end?: string;
    attendance_end?: string;
    description?: string;
  };
}) {
  try {
    const { date, addedTeachers, removedTeachers, addedStudents, removedStudents, metadata } = params;
    
    const formatDate = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    };

    const notifications: Array<{
      user_id: string;
      title: string;
      message: string;
      type: 'attendance_required' | 'attendance_not_required';
      schedule_date: string;
      metadata: any;
    }> = [];

    // Notify added teachers
    addedTeachers.forEach(teacherId => {
      notifications.push({
        user_id: teacherId,
        title: 'Attendance Required',
        message: `You are required to take attendance on ${formatDate(date)}!`,
        type: 'attendance_required',
        schedule_date: date,
        metadata
      });
    });

    // Notify removed teachers
    removedTeachers.forEach(teacherId => {
      notifications.push({
        user_id: teacherId,
        title: 'Attendance Not Required',
        message: `You are not required to take attendance on ${formatDate(date)}.`,
        type: 'attendance_not_required',
        schedule_date: date,
        metadata
      });
    });

    // Notify added students
    addedStudents.forEach(studentId => {
      notifications.push({
        user_id: studentId,
        title: 'Attendance Required',
        message: `You are required to take attendance on ${formatDate(date)}!`,
        type: 'attendance_required',
        schedule_date: date,
        metadata
      });
    });

    // Notify removed students
    removedStudents.forEach(studentId => {
      notifications.push({
        user_id: studentId,
        title: 'Attendance Not Required',
        message: `You are not required to take attendance on ${formatDate(date)}.`,
        type: 'attendance_not_required',
        schedule_date: date,
        metadata
      });
    });

    // Insert all notifications
    if (notifications.length > 0) {
      const { error } = await supabase.from('notifications').insert(notifications);
      if (error) {
        console.error('[Schedule] Failed to send notifications:', error);
      } else {
        console.log('[Schedule] Sent', notifications.length, 'in-app notifications');
      }
    }
  } catch (e) {
    console.error('[Schedule] Error sending notifications:', e);
  }
}

export default function ScheduleScreen() {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role || '');

  const [monthAnchor, setMonthAnchor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState<string>(() => fmtDate(new Date()));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // schedule fields
  const [isFlagDay, setIsFlagDay] = useState(false);
  const [attendanceStart, setAttendanceStart] = useState('07:00');
  const [onTimeEnd, setOnTimeEnd] = useState('07:30');
  const [attendanceEnd, setAttendanceEnd] = useState('09:00');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [collegeCode, setCollegeCode] = useState<string>('');
  const [requireTeachers, setRequireTeachers] = useState<boolean>(false);

  // Requirement selections
  type Req = { program_code: string; year_name: string; section_name: string };
  const [selectedReqs, setSelectedReqs] = useState<Req[]>([]);

  // Option lists
  const [colleges, setColleges] = useState<Array<{ code: string; name: string }>>([]);
  const [programs, setPrograms] = useState<Array<{ code: string; name: string; college_code: string }>>([]);
  const [years, setYears] = useState<Array<{ year_name: string }>>([]);
  const [sections, setSections] = useState<Array<{ section_name: string }>>([]);

  // Current picker state
  const [pickProgram, setPickProgram] = useState('');
  const [pickYear, setPickYear] = useState('');
  const [pickSection, setPickSection] = useState('');

  const [showCollegeModal, setShowCollegeModal] = useState(false);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showReqModal, setShowReqModal] = useState(false);
  const [showTeacherPosModal, setShowTeacherPosModal] = useState(false);

  const [teacherPositions, setTeacherPositions] = useState<Array<{ name: string }>>([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherPosFilter, setTeacherPosFilter] = useState<string>('');
  const [teachers, setTeachers] = useState<Array<{ id: string; first_name: string | null; last_name: string | null; position: string | null; college: string | null }>>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [allProgramYears, setAllProgramYears] = useState<Array<{ program_code: string; year_name: string }>>([]);
  const [allProgramSections, setAllProgramSections] = useState<Array<{ program_code: string; year_name: string; section_name: string }>>([]);
  const [students, setStudents] = useState<Array<{ id: string; first_name: string | null; last_name: string | null; program: string | null; year: string | null; section: string | null }>>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const [openTeachers, setOpenTeachers] = useState(true);
  const [openStudents, setOpenStudents] = useState(true);
  const [openPrograms, setOpenPrograms] = useState<Record<string, boolean>>({});
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const [flaggedDates, setFlaggedDates] = useState<Set<string>>(new Set());
  const [showFlagWarningModal, setShowFlagWarningModal] = useState(false);
  const [pendingFlagToggle, setPendingFlagToggle] = useState(false);
  const [hasAttendanceRecords, setHasAttendanceRecords] = useState(false);

  const monthWeeks = useMonthMatrix(monthAnchor);
  const monthLabel = useMemo(() => monthAnchor.toLocaleDateString(undefined, { year: 'numeric', month: 'long' }), [monthAnchor]);

  const loadSchedule = useCallback(async (dateStr: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('attendance_schedules')
        .select('date, is_flag_day, attendance_start, on_time_end, attendance_end, venue, description, college_code, require_teachers')
        .eq('date', dateStr)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setIsFlagDay(!!data.is_flag_day);
        // Format times to HH:MM (remove seconds if present)
        const formatTime = (t: string | null) => {
          if (!t) return '07:00';
          const parts = t.split(':');
          return `${parts[0] || '07'}:${parts[1] || '00'}`;
        };
        setAttendanceStart(formatTime(data.attendance_start));
        setOnTimeEnd(formatTime(data.on_time_end));
        setAttendanceEnd(formatTime(data.attendance_end));
        setVenue(data.venue || '');
        setDescription(data.description || '');
        setCollegeCode(data.college_code || (profile?.role === 'admin' ? ((profile as any).college || '') : ((profile as any).college || '')) || '');
        setRequireTeachers(!!data.require_teachers);

        // Load required teachers for this date
        try {
          const { data: rteach } = await supabase
            .from('attendance_schedule_required_teachers')
            .select('teacher_id')
            .eq('date', dateStr);
          setSelectedTeacherIds(((rteach || []) as any).map((r: any) => r.teacher_id));
        } catch { setSelectedTeacherIds([]); }
        // Load required students for this date (ignore if table not present)
        try {
          const { data: rstud } = await supabase
            .from('attendance_schedule_required_students')
            .select('student_id')
            .eq('date', dateStr);
          setSelectedStudentIds(((rstud || []) as any).map((r: any) => r.student_id));
        } catch { setSelectedStudentIds([]); }
      } else {
        setIsFlagDay(false);
        setAttendanceStart('07:00');
        setOnTimeEnd('07:30');
        setAttendanceEnd('09:00');
        setVenue('');
        setDescription('');
        const defaultCollege = (profile as any)?.college || '';
        setCollegeCode(defaultCollege);
        setRequireTeachers(false);
        setSelectedReqs([]);
        setSelectedTeacherIds([]);
        setSelectedStudentIds([]);

        // Prefill from template for this admin's college
        if (defaultCollege) {
          try {
            const { data: tmpl } = await supabase.from('flag_templates').select('require_teachers').eq('college_code', defaultCollege).maybeSingle();
            setRequireTeachers(!!tmpl?.require_teachers);
            // Load template teachers/students if available
            try {
              const { data: tteach } = await supabase.from('flag_template_teachers').select('teacher_id').eq('college_code', defaultCollege);
              setSelectedTeacherIds(((tteach || []) as any).map((r: any) => r.teacher_id));
            } catch { setSelectedTeacherIds([]); }
            try {
              const { data: tstud } = await supabase.from('flag_template_students').select('student_id').eq('college_code', defaultCollege);
              setSelectedStudentIds(((tstud || []) as any).map((r: any) => r.student_id));
            } catch { setSelectedStudentIds([]); }
          } catch {}
        }
      }
    } catch (e: any) {
      console.error('[Schedule] load error', e);
      Alert.alert('Error', e?.message || 'Failed to load schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFlaggedDates = useCallback(async () => {
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
      const set = new Set<string>();
      (data || []).forEach((row: any) => { if (row.is_flag_day) set.add(row.date); });
      setFlaggedDates(set);
    } catch (e) {
      console.warn('[Schedule] month highlight load failed', e);
      setFlaggedDates(new Set());
    }
  }, [monthAnchor]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      // Reload current date schedule
      await loadSchedule(selectedDate);
      // Reload flagged dates for calendar highlighting
      await loadFlaggedDates();
    } catch (e) {
      console.error('[Schedule] refresh failed', e);
    } finally {
      setRefreshing(false);
    }
  }, [selectedDate, loadSchedule, loadFlaggedDates]);

  useEffect(() => {
    loadSchedule(selectedDate);
  }, [selectedDate, loadSchedule]);

  // Load all schedule days for the current month to highlight
  useEffect(() => {
    loadFlaggedDates();
  }, [loadFlaggedDates]);

  // Load option lists
  useEffect(() => {
    (async () => {
      try {
        const { data: cols } = await supabase.from('colleges').select('code, name');
        setColleges(cols || []);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!showReqModal) return;
      try {
        const { data: pos } = await supabase.from('teacher_positions').select('name');
        setTeacherPositions(pos || []);
      } catch {}
      try {
        let tq: any = supabase
          .from('user_profiles')
          .select('id, first_name, last_name, position, college, role')
          .eq('role', 'teacher');
        if ((profile as any)?.role !== 'superadmin' && collegeCode) {
          tq = tq.eq('college', collegeCode);
        }
        const { data: tchs } = await tq;
        setTeachers((tchs || []) as any);
      } catch { setTeachers([]); }
      try {
        const pCodes = (programs || []).map(p => p.code);
        if (pCodes.length > 0) {
          const { data: yrs } = await supabase.from('program_years').select('program_code, year_name').in('program_code', pCodes);
          setAllProgramYears(yrs || []);
          const { data: secs } = await supabase.from('program_sections').select('program_code, year_name, section_name').in('program_code', pCodes);
          setAllProgramSections(secs || []);
          let sq: any = supabase
            .from('user_profiles')
            .select('id, first_name, last_name, program, year, section, role')
            .eq('role', 'student')
            .in('program', pCodes);
          const { data: studs } = await sq;
          setStudents((studs || []) as any);
        } else {
          setAllProgramYears([]); setAllProgramSections([]); setStudents([]);
        }
      } catch { setAllProgramYears([]); setAllProgramSections([]); setStudents([]); }
    })();
  }, [showReqModal, collegeCode, programs]);

  const filteredTeachers = useMemo(() => {
    const term = teacherSearch.trim().toLowerCase();
    return (teachers || []).filter(t => {
      const name = `${t.first_name || ''} ${t.last_name || ''}`.toLowerCase();
      const okSearch = term ? name.includes(term) : true;
      const okPos = teacherPosFilter ? (t.position || '') === teacherPosFilter : true;
      return okSearch && okPos;
    });
  }, [teachers, teacherSearch, teacherPosFilter]);

  

  const studentsAllOn = useMemo(() => (students || []).length > 0 && (students || []).every(st => selectedStudentIds.includes(st.id)), [students, selectedStudentIds]);

  const setAllStudentsToggle = (on: boolean) => {
    const ids = (students || []).map(s => s.id);
    setSelectedStudentIds(prev => {
      const set = new Set(prev);
      ids.forEach(id => { if (on) set.add(id); else set.delete(id); });
      return Array.from(set);
    });
    setSelectedReqs(prev => {
      if (on) {
        const existing = new Set(prev.map(x => `${x.program_code}|${x.year_name}|${x.section_name}`));
        const adds = (allProgramSections || []).map(s => ({ program_code: s.program_code, year_name: s.year_name, section_name: s.section_name }));
        const newOnes = adds.filter(t => !existing.has(`${t.program_code}|${t.year_name}|${t.section_name}`));
        return [...prev, ...(newOnes as any)];
      }
      return [];
    });
  };

  const toggleTeacher = (id: string) => {
    setSelectedTeacherIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleStudent = (id: string) => {
    setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const sectionKey = (p: string, y: string, s: string) => `${p}__${y}__${s}`;
  const yearKey = (p: string, y: string) => `${p}__${y}`;

  const setSectionToggle = (p: string, y: string, s: string, on: boolean) => {
    console.log('[Schedule] setSectionToggle:', { program: p, year: y, section: s, on });
    const ids = (students || []).filter(st => st.program === p && st.year === y && st.section === s).map(st => st.id);
    setSelectedStudentIds(prev => {
      const set = new Set(prev);
      ids.forEach(id => { if (on) set.add(id); else set.delete(id); });
      return Array.from(set);
    });
    setSelectedReqs(prev => {
      const exists = prev.some(r => r.program_code === p && r.year_name === y && r.section_name === s);
      console.log('[Schedule] Section exists in selectedReqs:', exists, 'Adding:', on);
      if (on && !exists) {
        const newReqs = [...prev, { program_code: p, year_name: y, section_name: s } as any];
        console.log('[Schedule] Adding section, new count:', newReqs.length);
        return newReqs;
      }
      if (!on && exists) {
        const newReqs = prev.filter(r => !(r.program_code === p && r.year_name === y && r.section_name === s));
        console.log('[Schedule] Removing section, new count:', newReqs.length);
        return newReqs;
      }
      console.log('[Schedule] No change to sections');
      return prev;
    });
  };
  const setYearToggle = (p: string, y: string, on: boolean) => {
    const secs = (allProgramSections || []).filter(ps => ps.program_code === p && ps.year_name === y).map(ps => ps.section_name);
    secs.forEach(sec => setSectionToggle(p, y, sec, on));
  };
  const setProgramToggle = (p: string, on: boolean) => {
    const yrs = (allProgramYears || []).filter(py => py.program_code === p).map(py => py.year_name);
    yrs.forEach(yr => setYearToggle(p, yr, on));
  };

  useEffect(() => {
    (async () => {
      if (!collegeCode) { setPrograms([]); return; }
      try {
        const { data: progs } = await supabase.from('programs').select('code, name, college_code').eq('college_code', collegeCode);
        setPrograms(progs || []);
      } catch { setPrograms([]); }
    })();
  }, [collegeCode]);

  useEffect(() => {
    (async () => {
      if (!pickProgram) { setYears([]); setSections([]); return; }
      try {
        const { data: yrs } = await supabase.from('program_years').select('year_name').eq('program_code', pickProgram);
        setYears(yrs || []);
      } catch { setYears([]); }
    })();
  }, [pickProgram]);

  useEffect(() => {
    (async () => {
      if (!pickProgram || !pickYear) { setSections([]); return; }
      try {
        const { data: secs } = await supabase.from('program_sections').select('section_name').eq('program_code', pickProgram).eq('year_name', pickYear);
        setSections(secs || []);
      } catch { setSections([]); }
    })();
  }, [pickProgram, pickYear]);

  const validateTime = (t: string) => /^\d{2}:\d{2}$/.test(t);

  const handleFlagDayToggle = async (newValue: boolean) => {
    // If turning OFF flag day and there's already a saved schedule, show warning
    if (!newValue && isFlagDay) {
      try {
        // Check if there are any attendance records for this date
        const { count } = await supabase
          .from('attendance_records')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', `${selectedDate}T00:00:00`)
          .lte('created_at', `${selectedDate}T23:59:59`);
        
        setHasAttendanceRecords((count && count > 0) || false);
        // Always show warning when turning off an existing flag day
        setPendingFlagToggle(true);
        setShowFlagWarningModal(true);
        return;
      } catch (e) {
        console.warn('[Schedule] Failed to check attendance records', e);
        setHasAttendanceRecords(false);
        // Still show warning even if check fails
        setPendingFlagToggle(true);
        setShowFlagWarningModal(true);
        return;
      }
    }
    // Safe to toggle ON
    setIsFlagDay(newValue);
  };

  const confirmFlagDayToggleOff = async () => {
    try {
      console.log('[Schedule] Deleting schedule for date:', selectedDate);
      
      // Delete all attendance records for this date if any exist
      if (hasAttendanceRecords) {
        console.log('[Schedule] Deleting attendance records...');
        const { error: recError } = await supabase
          .from('attendance_records')
          .delete()
          .gte('created_at', `${selectedDate}T00:00:00`)
          .lte('created_at', `${selectedDate}T23:59:59`);
        
        if (recError) {
          console.error('[Schedule] Error deleting records:', recError);
          throw recError;
        }
        console.log('[Schedule] Attendance records deleted');
      }
      
      // Manually delete required attendees first (in case cascade isn't set up)
      console.log('[Schedule] Deleting required teachers...');
      const { error: teachError } = await supabase
        .from('attendance_schedule_required_teachers')
        .delete()
        .eq('date', selectedDate);
      if (teachError) console.warn('[Schedule] Error deleting teachers:', teachError);
      
      console.log('[Schedule] Deleting required students...');
      const { error: studError } = await supabase
        .from('attendance_schedule_required_students')
        .delete()
        .eq('date', selectedDate);
      if (studError) console.warn('[Schedule] Error deleting students:', studError);
      
      console.log('[Schedule] Deleting notifications...');
      const { error: notifError } = await supabase
        .from('notifications')
        .delete()
        .eq('schedule_date', selectedDate);
      if (notifError) console.warn('[Schedule] Error deleting notifications:', notifError);
      
      // Delete the entire attendance_schedules record for this date
      console.log('[Schedule] Updating attendance schedule to NOT a flag day...');
      const { error: deleteError } = await supabase
        .from('attendance_schedules')
        .update({
          is_flag_day: false,
          attendance_start: null,
          on_time_end: null,
          attendance_end: null,
          venue: null,
          description: null,
          college_code: null,
          require_teachers: false,
        })
        .eq('date', selectedDate);
      
      if (deleteError) {
        console.error('[Schedule] Error deleting schedule:', deleteError);
        throw deleteError;
      }
      
      console.log('[Schedule] All deletions successful');
      
      // Close the modal first
      setShowFlagWarningModal(false);
      setPendingFlagToggle(false);
      
      // Clear all state immediately
      setIsFlagDay(false);
      setHasAttendanceRecords(false);
      setSelectedReqs([]);
      setSelectedTeacherIds([]);
      setSelectedStudentIds([]);
      setVenue('');
      setDescription('');
      setAttendanceStart('07:00');
      setOnTimeEnd('07:30');
      setAttendanceEnd('09:00');
      setRequireTeachers(false);
      
      // Reload calendar highlights and schedule data to reflect the change
      await loadFlaggedDates();
      await loadSchedule(selectedDate);
      
      // Show success message after a brief delay to allow UI to update
      const message = hasAttendanceRecords 
        ? 'Flag ceremony day removed and all attendance records deleted.'
        : 'Flag ceremony day removed for this date.';
      
      setTimeout(() => {
        Alert.alert('Success', message);
      }, 100);
    } catch (e: any) {
      console.error('[Schedule] Failed to toggle off flag day', e);
      Alert.alert('Error', e?.message || 'Failed to remove flag ceremony day.');
    }
  };

  const onSave = async () => {
    try {
      if (!isAdmin) return;
      
      console.log('[Schedule] onSave called with state:', {
        selectedDate,
        isFlagDay,
        selectedReqs: selectedReqs.length,
        selectedReqsData: selectedReqs,
        selectedTeacherIds: selectedTeacherIds.length,
        selectedStudentIds: selectedStudentIds.length
      });
      
      if (!validateTime(attendanceStart) || !validateTime(onTimeEnd) || !validateTime(attendanceEnd)) {
        Alert.alert('Invalid time', 'Please enter time in HH:MM (24-hour) format.');
        return;
      }
      if (isFlagDay && !venue.trim()) {
        Alert.alert('Missing venue', 'Please enter the place/venue for the flag ceremony.');
        return;
      }
      if (isFlagDay && !collegeCode) {
        Alert.alert('Missing college', 'Please select the college for this flag ceremony.');
        return;
      }
      setSaving(true);
      const { error } = await supabase
        .from('attendance_schedules')
        .upsert({
          date: selectedDate,
          is_flag_day: isFlagDay,
          attendance_start: attendanceStart,
          on_time_end: onTimeEnd,
          attendance_end: attendanceEnd,
          venue: isFlagDay ? venue.trim() : venue.trim() || null,
          description: description.trim() || null,
          college_code: isFlagDay ? collegeCode : null,
          require_teachers: isFlagDay ? (selectedTeacherIds.length > 0) : false,
        });
      if (error) throw error;

      // Update required attendees for this date
      // We only use student IDs and teacher IDs (no more sections table)
      // When sections are toggled in UI, setSectionToggle already adds/removes student IDs
      if (isFlagDay) {
        console.log('[Schedule] Saving required attendees:', {
          date: selectedDate,
          teachers: selectedTeacherIds.length,
          students: selectedStudentIds.length
        });
        
        // Fetch previous required attendees for notification comparison
        const { data: prevTeachers } = await supabase
          .from('attendance_schedule_required_teachers')
          .select('teacher_id')
          .eq('date', selectedDate);
        const { data: prevStudents } = await supabase
          .from('attendance_schedule_required_students')
          .select('student_id')
          .eq('date', selectedDate);
        
        const prevTeacherIds = new Set((prevTeachers || []).map((t: any) => t.teacher_id));
        const prevStudentIds = new Set((prevStudents || []).map((s: any) => s.student_id));
        const newTeacherIds = new Set(selectedTeacherIds);
        const newStudentIds = new Set(selectedStudentIds);
        
        // Calculate added and removed
        const addedTeachers = selectedTeacherIds.filter(id => !prevTeacherIds.has(id));
        const removedTeachers = Array.from(prevTeacherIds).filter(id => !newTeacherIds.has(id));
        const addedStudents = selectedStudentIds.filter(id => !prevStudentIds.has(id));
        const removedStudents = Array.from(prevStudentIds).filter(id => !newStudentIds.has(id));
        
        // Clear and update required teachers
        await supabase.from('attendance_schedule_required_teachers').delete().eq('date', selectedDate);
        if (selectedTeacherIds.length > 0) {
          const trows = selectedTeacherIds.map(id => ({ date: selectedDate, teacher_id: id }));
          await supabase.from('attendance_schedule_required_teachers').insert(trows);
          console.log('[Schedule] Saved', selectedTeacherIds.length, 'required teachers');
        } else {
          console.log('[Schedule] No teachers required');
        }
        
        // Clear and update required students
        await supabase.from('attendance_schedule_required_students').delete().eq('date', selectedDate);
        if (selectedStudentIds.length > 0) {
          const srows = selectedStudentIds.map(id => ({ date: selectedDate, student_id: id }));
          await supabase.from('attendance_schedule_required_students').insert(srows);
          console.log('[Schedule] Saved', selectedStudentIds.length, 'required students');
        } else {
          console.log('[Schedule] No students required');
        }
        
        // Send notifications for changes
        await sendAttendanceNotifications({
          date: selectedDate,
          addedTeachers,
          removedTeachers,
          addedStudents,
          removedStudents,
          metadata: {
            venue: venue.trim(),
            attendance_start: attendanceStart,
            on_time_end: onTimeEnd,
            attendance_end: attendanceEnd,
            description: description.trim() || undefined
          }
        });
        
        // Save template for this college (for next time)
        // Templates also use IDs only, no sections table
        await supabase.from('flag_templates').upsert({ college_code: collegeCode, require_teachers: selectedTeacherIds.length > 0, updated_at: new Date().toISOString() });
        try {
          await supabase.from('flag_template_teachers').delete().eq('college_code', collegeCode);
          if (selectedTeacherIds.length > 0) {
            const ft = selectedTeacherIds.map(id => ({ college_code: collegeCode, teacher_id: id }));
            await supabase.from('flag_template_teachers').insert(ft);
          }
        } catch {}
        try {
          await supabase.from('flag_template_students').delete().eq('college_code', collegeCode);
          if (selectedStudentIds.length > 0) {
            const fs = selectedStudentIds.map(id => ({ college_code: collegeCode, student_id: id }));
            await supabase.from('flag_template_students').insert(fs);
          }
        } catch {}
      }
      Alert.alert('Saved', 'Schedule has been saved.');
    } catch (e: any) {
      console.error('[Schedule] save error', e);
      Alert.alert('Error', e?.message || 'Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.center}> 
        <Text style={{ color: '#6c757d' }}>You do not have permission to view this page.</Text>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.subtitle}>Choose a date and set attendance windows. Students will be marked On Time or Late based on these settings. Absent applies when no attendance is taken for the day.</Text>

        {/* Calendar */}
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

        {/* Modals */}
        <Modal visible={showCollegeModal} animationType="slide" transparent onRequestClose={() => setShowCollegeModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select College</Text>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                {(colleges || []).map(c => (
                  <TouchableOpacity key={c.code} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setCollegeCode(c.code); setShowCollegeModal(false); setPickProgram(''); setPickYear(''); setPickSection(''); setSelectedReqs([]); }}>
                    <Text style={{ color: '#2d3748', fontWeight: '600' }}>{c.code} — {c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Teacher Position Dropdown */}
        <Modal visible={showTeacherPosModal} animationType="slide" transparent onRequestClose={() => setShowTeacherPosModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Filter Position</Text>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                <TouchableOpacity style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setTeacherPosFilter(''); setShowTeacherPosModal(false); }}>
                  <Text style={{ color: '#2d3748', fontWeight: '600' }}>All Positions</Text>
                </TouchableOpacity>
                {(teacherPositions || []).map(p => (
                  <TouchableOpacity key={p.name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setTeacherPosFilter(p.name); setShowTeacherPosModal(false); }}>
                    <Text style={{ color: '#2d3748' }}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>


        <Modal visible={showReqModal} animationType="slide" transparent onRequestClose={() => setShowReqModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85%' }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Require Attendees</Text>
                <TouchableOpacity onPress={() => setShowReqModal(false)}>
                  <Text style={{ color: '#4e73df', fontWeight: '700' }}>Close</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 16 }}>
                {/* Teachers */}
                <TouchableOpacity onPress={() => setOpenTeachers(prev => !prev)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#2d3748' }}>Teachers ({selectedTeacherIds.length})</Text>
                  <Ionicons name={openTeachers ? 'chevron-up' : 'chevron-down'} size={16} color="#2d3748" />
                </TouchableOpacity>
                {openTeachers && (
                  <View style={{ paddingLeft: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <TextInput
                        value={teacherSearch}
                        onChangeText={setTeacherSearch}
                        placeholder="Search teacher by name"
                        style={[styles.input, { flex: 1, textAlign: 'left' }]}
                      />
                      <TouchableOpacity onPress={() => setShowTeacherPosModal(true)} style={[styles.input, { minWidth: 140 }]}> 
                        <Text style={{ color: '#2d3748', textAlign: 'center' }}>{teacherPosFilter ? `Position: ${teacherPosFilter}` : 'Position: All'}</Text>
                      </TouchableOpacity>
                    </View>
                    {(filteredTeachers || []).map(t => {
                      const name = `${t.first_name || ''} ${t.last_name || ''}`.trim() || '(No name)';
                      const on = selectedTeacherIds.includes(t.id);
                      return (
                        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
                          <View>
                            <Text style={{ color: '#2d3748', fontWeight: '600' }}>{name}</Text>
                            {!!t.position && <Text style={{ color: '#6c757d', fontSize: 12 }}>{t.position}</Text>}
                          </View>
                          <Switch value={on} onValueChange={() => toggleTeacher(t.id)} />
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Students */}
                <TouchableOpacity onPress={() => setOpenStudents(prev => !prev)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#2d3748' }}>Students ({selectedStudentIds.length})</Text>
                  <Ionicons name={openStudents ? 'chevron-up' : 'chevron-down'} size={16} color="#2d3748" />
                </TouchableOpacity>
                {openStudents && (
                  <View style={{ paddingLeft: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={styles.label}>Require Students</Text>
                      <Switch value={studentsAllOn} onValueChange={setAllStudentsToggle} />
                    </View>
                    

                    {/* Program > Year > Section tree */}
                    {(programs || []).map(p => {
                      const pcode = p.code;
                      const pIds = (students || []).filter(s => s.program === pcode).map(s => s.id);
                      const pOn = pIds.length > 0 && pIds.every(id => selectedStudentIds.includes(id));
                      return (
                        <View key={pcode} style={{ marginTop: 10 }}>
                          <TouchableOpacity onPress={() => setOpenPrograms(prev => ({ ...prev, [pcode]: !prev[pcode] }))} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#2d3748', fontWeight: '700' }}>{pcode} — {p.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <Switch value={pOn} onValueChange={(on) => setProgramToggle(pcode, on)} />
                              <Ionicons name={openPrograms[pcode] ? 'chevron-up' : 'chevron-down'} size={16} color="#2d3748" />
                            </View>
                          </TouchableOpacity>
                          {openPrograms[pcode] && (
                            <View style={{ marginLeft: 12, marginTop: 6 }}>
                              {allProgramYears.filter(y => y.program_code === pcode).map(y => {
                                const yname = y.year_name;
                                const yIds = (students || []).filter(s => s.program === pcode && s.year === yname).map(s => s.id);
                                const yOn = yIds.length > 0 && yIds.every(id => selectedStudentIds.includes(id));
                                const yKey = yearKey(pcode, yname);
                                return (
                                  <View key={yKey} style={{ marginTop: 6 }}>
                                    <TouchableOpacity onPress={() => setOpenYears(prev => ({ ...prev, [yKey]: !prev[yKey] }))} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <Text style={{ color: '#2d3748', fontWeight: '600' }}>{yname}</Text>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <Switch value={yOn} onValueChange={(on) => setYearToggle(pcode, yname, on)} />
                                        <Ionicons name={openYears[yKey] ? 'chevron-up' : 'chevron-down'} size={16} color="#2d3748" />
                                      </View>
                                    </TouchableOpacity>
                                    {openYears[yKey] && (
                                      <View style={{ marginLeft: 12, marginTop: 6 }}>
                                        {allProgramSections.filter(s => s.program_code === pcode && s.year_name === yname).map(s => {
                                          const sname = s.section_name;
                                          const sIds = (students || []).filter(st => st.program === pcode && st.year === yname && st.section === sname).map(st => st.id);
                                          const sOn = sIds.length > 0 && sIds.every(id => selectedStudentIds.includes(id));
                                          const sKey = sectionKey(pcode, yname, sname);
                                          return (
                                            <View key={sKey} style={{ marginTop: 6 }}>
                                              <TouchableOpacity onPress={() => setOpenSections(prev => ({ ...prev, [sKey]: !prev[sKey] }))} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#2d3748' }}>Section {sname}</Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                  <Switch value={sOn} onValueChange={(on) => setSectionToggle(pcode, yname, sname, on)} />
                                                  <Ionicons name={openSections[sKey] ? 'chevron-up' : 'chevron-down'} size={16} color="#2d3748" />
                                                </View>
                                              </TouchableOpacity>
                                              {openSections[sKey] && (
                                                <View style={{ marginLeft: 12, marginTop: 6 }}>
                                                  {(students || []).filter(st => st.program === pcode && st.year === yname && st.section === sname).map(st => {
                                                    const on = selectedStudentIds.includes(st.id);
                                                    const nm = `${st.first_name || ''} ${st.last_name || ''}`.trim() || '(No name)';
                                                    return (
                                                      <View key={st.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
                                                        <Text style={{ color: '#2d3748' }}>{nm}</Text>
                                                        <Switch value={on} onValueChange={() => toggleStudent(st.id)} />
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
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={showProgramModal} animationType="slide" transparent onRequestClose={() => setShowProgramModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#2d3748' }}>Select Program</Text>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                {(programs || []).map(p => (
                  <TouchableOpacity key={p.code} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setPickProgram(p.code); setShowProgramModal(false); setPickYear(''); setPickSection(''); }}>
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
                  <TouchableOpacity key={y.year_name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setPickYear(y.year_name); setShowYearModal(false); setPickSection(''); }}>
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
                  <TouchableOpacity key={s.section_name} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' }} onPress={() => { setPickSection(s.section_name); setShowSectionModal(false); }}>
                    <Text style={{ color: '#2d3748', fontWeight: '600' }}>{s.section_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
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
                const cellStyles = [
                  styles.calendarCell,
                  isFlagged && styles.calendarCellFlagged,
                  active && styles.calendarCellActive,
                ];
                const textStyles = [
                  styles.calendarCellText,
                  (active || isFlagged) && styles.calendarCellTextActive,
                ];
                return (
                  <TouchableOpacity key={di} style={cellStyles} onPress={() => setSelectedDate(dStr)}>
                    <Text style={textStyles}>{day.getDate()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Selected date and fields */}
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Selected Date</Text>
          <Text style={styles.selectedDate}>{selectedDate}</Text>

          <View style={styles.rowBetween}>
            <Text style={styles.label}>Flag Ceremony Day</Text>
            <Switch value={isFlagDay} onValueChange={handleFlagDayToggle} />
          </View>

          <Text style={styles.sectionTitle}>Attendance Windows</Text>
          <Text style={styles.helpText}>Enter times in 24-hour format HH:MM.</Text>
          <View style={styles.inputRow}>
            <Text style={styles.label}>Start</Text>
            <TextInput value={attendanceStart} onChangeText={setAttendanceStart} placeholder="07:00" style={styles.input} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.label}>On Time Until</Text>
            <TextInput value={onTimeEnd} onChangeText={setOnTimeEnd} placeholder="07:30" style={styles.input} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.label}>End</Text>
            <TextInput value={attendanceEnd} onChangeText={setAttendanceEnd} placeholder="09:00" style={styles.input} keyboardType="numbers-and-punctuation" />
          </View>

          <Text style={styles.sectionTitle}>Flag Ceremony Details</Text>
          <Text style={styles.helpText}>Venue is required when marking a flag ceremony day. Description is optional.</Text>
          {isFlagDay && (
            <>
              {/* College - only show for superadmin, auto-use admin's college otherwise */}
              {profile?.role === 'superadmin' ? (
                <View style={styles.inputRow}>
                  <Text style={styles.label}>College</Text>
                  <TouchableOpacity style={[styles.input, { minWidth: 160 }]} onPress={() => setShowCollegeModal(true)}>
                    <Text style={{ color: '#2d3748', textAlign: 'center' }}>{collegeCode || 'Select College'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.inputRow}>
                  <Text style={styles.label}>College</Text>
                  <View style={[styles.input, { minWidth: 160, backgroundColor: '#f8f9fa' }]}>
                    <Text style={{ color: '#6c757d', textAlign: 'center' }}>{collegeCode || 'Not assigned'}</Text>
                  </View>
                </View>
              )}
              {/* Require Attendees */}
              <View style={[styles.rowBetween, { marginTop: 8 }]}>
                <Text style={styles.label}>Require Attendees</Text>
                <TouchableOpacity style={[styles.saveBtn, { paddingVertical: 8 }]} onPress={() => setShowReqModal(true)}>
                  <Text style={styles.saveBtnText}>Open</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helpText}>{selectedTeacherIds.length} teachers, {selectedStudentIds.length} students selected</Text>
            </>
          )}
          <View style={styles.inputRow}>
            <Text style={styles.label}>Venue</Text>
            <TextInput value={venue} onChangeText={setVenue} placeholder="e.g., Main Quadrangle" style={[styles.input, { flex: 1 }]} />
          </View>
          <View style={{ marginTop: 8 }}>
            <Text style={styles.label}>Description</Text>
            <TextInput value={description} onChangeText={setDescription} placeholder="Optional event details" style={[styles.input, { textAlign: 'left' }]} multiline />
          </View>

          <TouchableOpacity style={[styles.saveBtn, (saving || loading) && { opacity: 0.7 }]} onPress={onSave} disabled={saving || loading}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Schedule</Text>}
          </TouchableOpacity>
        </View>

        {/* Warning Modal for Flag Day Toggle Off */}
        <Modal visible={showFlagWarningModal} animationType="fade" transparent onRequestClose={() => { setShowFlagWarningModal(false); setPendingFlagToggle(false); setHasAttendanceRecords(false); }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 }}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <Ionicons name="warning" size={48} color={hasAttendanceRecords ? "#dc3545" : "#f59f00"} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#2d3748', textAlign: 'center', marginBottom: 8 }}>Warning</Text>
              <Text style={{ fontSize: 14, color: '#6c757d', textAlign: 'center', marginBottom: 20 }}>
                {hasAttendanceRecords 
                  ? `There are attendance records for this date. Turning off Flag Ceremony Day will delete all attendance records for ${selectedDate}. This action cannot be undone.`
                  : `You are about to declare ${selectedDate} as NOT a flag ceremony day. This will remove the schedule for this date. Are you sure you want to continue?`
                }
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity 
                  style={{ flex: 1, backgroundColor: '#e9ecef', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }} 
                  onPress={() => { setShowFlagWarningModal(false); setPendingFlagToggle(false); setHasAttendanceRecords(false); }}
                >
                  <Text style={{ color: '#495057', fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, backgroundColor: hasAttendanceRecords ? '#dc3545' : '#f59f00', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }} 
                  onPress={confirmFlagDayToggleOff}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{hasAttendanceRecords ? 'Delete Records' : 'Confirm'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fc' },
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
  calendarCellActive: { backgroundColor: '#4e73df' },
  calendarCellText: { color: '#2d3748', fontWeight: '700' },
  calendarCellTextActive: { color: '#fff', fontWeight: '700' },
  formCard: { marginTop: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2d3748', marginTop: 8 },
  selectedDate: { marginTop: 4, color: '#495057', fontWeight: '600' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  label: { color: '#495057', fontWeight: '600' },
  helpText: { color: '#adb5bd', marginTop: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#e9ecef', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minWidth: 120, textAlign: 'center', color: '#2d3748' },
  saveBtn: { marginTop: 16, backgroundColor: '#4e73df', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f1f3f5',
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    gap: 6,
  },
  chipText: { color: '#495057', fontWeight: '600', fontSize: 12 },
});
