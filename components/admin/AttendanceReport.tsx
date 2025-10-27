import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

type AttendanceReportProps = {
  adminCollege: string | null;
};

export default function AttendanceReport({ adminCollege }: AttendanceReportProps) {
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showPreview, setShowPreview] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [filterProgram, setFilterProgram] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [filterSection, setFilterSection] = useState<string | null>(null);
  const [openDateYearDD, setOpenDateYearDD] = useState(false);
  const [openDateMonthDD, setOpenDateMonthDD] = useState(false);
  

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  const programOptions = useMemo(() => {
    if (!reportData?.students) return [] as string[];
    const set = new Set<string>();
    (reportData.students || []).forEach((s: any) => { if (s.program) set.add(String(s.program)); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reportData?.students]);

  const yearOptions = useMemo(() => {
    if (!reportData?.students) return [] as string[];
    let list = (reportData.students as any[]);
    if (filterProgram) list = list.filter(s => s.program === filterProgram);
    const set = new Set<string>();
    list.forEach((s: any) => { if (s.year != null) set.add(String(s.year)); });
    const arr = Array.from(set);
    const toNum = (y: string) => { const n = parseInt(String(y).replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY; };
    return arr.sort((a, b) => {
      const na = toNum(a), nb = toNum(b);
      if (na !== nb) return na - nb;
      return String(a).localeCompare(String(b));
    });
  }, [reportData?.students, filterProgram]);

  const sectionOptions = useMemo(() => {
    if (!reportData?.students) return [] as string[];
    let list = (reportData.students as any[]);
    if (filterProgram) list = list.filter(s => s.program === filterProgram);
    if (filterYear) list = list.filter(s => String(s.year) === String(filterYear));
    const set = new Set<string>();
    list.forEach((s: any) => { if (s.section != null) set.add(String(s.section)); });
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));
  }, [reportData?.students, filterProgram, filterYear]);

  const generateReport = async () => {
    if (!adminCollege) {
      Alert.alert('Error', 'No college assigned');
      return;
    }

    try {
      setLoading(true);
      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get all students in admin's college
      const { data: students, error: studentsError } = await supabase
        .from('user_profiles')
        .select('id, first_name, middle_name, last_name, email, program, year, section')
        .eq('role', 'student')
        .in('program', 
          await supabase
            .from('programs')
            .select('code')
            .eq('college_code', adminCollege)
            .then(res => res.data?.map(p => p.code) || [])
        );

      if (studentsError) throw studentsError;

      // Get attendance records for the month
      const { data: records, error: recordsError } = await supabase
        .from('attendance_records')
        .select('*')
        .gte('created_at', startDateStr)
        .lte('created_at', endDateStr + 'T23:59:59')
        .in('user_id', students?.map(s => s.id) || []);

      if (recordsError) throw recordsError;

      // Get schedules for the month (scoped to admin's college)
      const { data: schedules, error: schedulesError } = await supabase
        .from('attendance_schedules')
        .select('date, on_time_end, attendance_end, college_code')
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .eq('college_code', adminCollege);

      if (schedulesError) throw schedulesError;

      const scheduleDates = (schedules || []).map((s: any) => s.date);

      // Get required sections for the month for those schedules
      const { data: reqs, error: reqErr } = await supabase
        .from('attendance_schedule_required_sections')
        .select('date, program_code, year_name, section_name')
        .in('date', scheduleDates);
      if (reqErr) throw reqErr;

      // Get required students for the month for those schedules
      const { data: reqStud, error: reqStudErr } = await supabase
        .from('attendance_schedule_required_students')
        .select('date, student_id')
        .in('date', scheduleDates);
      if (reqStudErr) throw reqStudErr;

      // Process data
      const studentMap = new Map();
      students?.forEach(student => {
        studentMap.set(student.id, {
          ...student,
          presentCount: 0,
          absentCount: 0,
          lateCount: 0,
          totalScheduled: 0,
          records: []
        });
      });

      // Build a map for quick schedule lookup by date
      const scheduleByDate = new Map<string, any>();
      (schedules || []).forEach((s: any) => scheduleByDate.set(s.date, s));

      // Build targeted sets by date (union of required sections and required students)
      const reqsByDate = new Map<string, any[]>();
      (reqs || []).forEach((r: any) => {
        const list = reqsByDate.get(r.date) || [];
        list.push(r);
        reqsByDate.set(r.date, list);
      });
      const reqStudByDate = new Map<string, Set<string>>();
      (reqStud || []).forEach((r: any) => {
        const set = reqStudByDate.get(r.date) || new Set<string>();
        set.add(r.student_id);
        reqStudByDate.set(r.date, set);
      });

      // Count attendance only for targeted students per date
      records?.forEach(record => {
        const student = studentMap.get(record.user_id);
        if (!student) return;
        student.records.push(record);
        const recordTime = new Date(record.created_at);
        const recordDateStr = recordTime.toISOString().split('T')[0];
        const dateReqs = reqsByDate.get(recordDateStr) || [];
        const explicit = reqStudByDate.get(recordDateStr) || new Set<string>();
        // Determine if this student is targeted on this date
        let targeted = explicit.has(record.user_id);
        if (!targeted && dateReqs.length > 0) {
          const s = student; // has program/year/section on studentMap entry
          targeted = dateReqs.some((rq: any) => String(s.program) === String(rq.program_code) && String(s.year) === String(rq.year_name) && String(s.section) === String(rq.section_name));
        }
        if (!targeted) return;
        if (!record.verified) return;
        const schedule = scheduleByDate.get(recordDateStr);
        if (schedule && schedule.on_time_end) {
          const onTimeEnd = new Date(`${schedule.date}T${schedule.on_time_end}`);
          if (recordTime <= onTimeEnd) student.presentCount++;
          else student.lateCount++;
        } else {
          student.presentCount++;
        }
      });

      // Count total scheduled days per student based on required sections or explicit required students only
      const reqsMap = new Map<string, any[]>();
      (reqs || []).forEach((r: any) => {
        const arr = reqsMap.get(r.date) || [];
        arr.push(r);
        reqsMap.set(r.date, arr);
      });
      const reqStudMap = new Map<string, Set<string>>();
      (reqStud || []).forEach((r: any) => {
        const set = reqStudMap.get(r.date) || new Set<string>();
        set.add(r.student_id);
        reqStudMap.set(r.date, set);
      });
      (schedules || []).forEach((s: any) => {
        const dateReqs = reqsMap.get(s.date) || [];
        const explicitSet = reqStudMap.get(s.date) || new Set<string>();
        // Build targeted set = union(section-based students, explicit students)
        const targetedIds = new Set<string>();
        if (dateReqs.length > 0) {
          (students || []).forEach((student: any) => {
            if (dateReqs.some((r: any) => String(student.program) === String(r.program_code) && String(student.year) === String(r.year_name) && String(student.section) === String(r.section_name))) {
              targetedIds.add(student.id);
            }
          });
        }
        explicitSet.forEach(id => targetedIds.add(id));
        // Only count targeted
        targetedIds.forEach(id => {
          const studentData = studentMap.get(id);
          if (studentData) studentData.totalScheduled++;
        });
      });

      // Calculate absences
      studentMap.forEach((student, id) => {
        student.absentCount = student.totalScheduled - student.presentCount - student.lateCount;
        if (student.absentCount < 0) student.absentCount = 0;
      });

      const studentsArray = Array.from(studentMap.values());

      // Calculate summary statistics
      const totalStudents = studentsArray.length;
      const totalPresent = studentsArray.reduce((sum, s) => sum + s.presentCount, 0);
      const totalAbsent = studentsArray.reduce((sum, s) => sum + s.absentCount, 0);
      const totalLate = studentsArray.reduce((sum, s) => sum + s.lateCount, 0);
      const totalScheduled = studentsArray.reduce((sum, s) => sum + s.totalScheduled, 0);
      const averageAttendance = totalScheduled > 0 ? ((totalPresent + totalLate) / totalScheduled * 100).toFixed(2) : '0';

      // Build quick index for student details
      const studentIndex: Record<string, { fullName: string; email: string | null; program: string | null; year: string | null; section: string | null }>= {};
      (students || []).forEach((s: any) => {
        const fullName = `${s.first_name || ''} ${s.middle_name || ''} ${s.last_name || ''}`.trim();
        studentIndex[s.id] = { fullName, email: s.email || null, program: s.program || null, year: s.year || null, section: s.section || null };
      });

      // Per-program analytics
      const programStatsMap = new Map<string, { present: number; late: number; absent: number; scheduled: number }>();
      studentsArray.forEach((s: any) => {
        const key = s.program || 'Unknown';
        const prev = programStatsMap.get(key) || { present: 0, late: 0, absent: 0, scheduled: 0 };
        prev.present += s.presentCount;
        prev.late += s.lateCount;
        prev.absent += s.absentCount;
        prev.scheduled += s.totalScheduled;
        programStatsMap.set(key, prev);
      });
      const programStats = Array.from(programStatsMap.entries()).map(([program, stats]) => ({ program, ...stats }));

      // Per-date analytics with attendee lists
      const recordsByDate = new Map<string, any[]>();
      (records || []).forEach((r: any) => {
        const ds = new Date(r.created_at).toISOString().split('T')[0];
        const arr = recordsByDate.get(ds) || [];
        arr.push(r);
        recordsByDate.set(ds, arr);
      });
      
      const byDate = (schedules || []).map((s: any) => {
        const ds = s.date as string;
        const dateReqs = reqsByDate.get(ds) || [];
        const targetedIds = new Set<string>();
        if (dateReqs.length > 0) {
          (students || []).forEach((st: any) => {
            if (dateReqs.some((rq: any) => st.program === rq.program_code && st.year === rq.year_name && st.section === rq.section_name)) targetedIds.add(st.id);
          });
        }
        const explicitReq = reqStudByDate.get(ds) || new Set<string>();
        explicitReq.forEach(id => targetedIds.add(id));
        const dayRecords = (recordsByDate.get(ds) || []).filter((r: any) => targetedIds.has(r.user_id));
        const presentIds = new Set<string>();
        const lateIds = new Set<string>();
        dayRecords.forEach((r: any) => {
          if (!r.verified) return;
          const rt = new Date(r.created_at);
          if (s.on_time_end) {
            const onTimeEnd = new Date(`${s.date}T${s.on_time_end}`);
            if (rt <= onTimeEnd) presentIds.add(r.user_id);
            else lateIds.add(r.user_id);
          } else {
            presentIds.add(r.user_id);
          }
        });
        const totalTargeted = targetedIds.size;
        const present = presentIds.size;
        const late = lateIds.size;
        const absent = Math.max(totalTargeted - present - late, 0);
        const presentList = Array.from(presentIds).map(id => studentIndex[id]?.fullName || id);
        const lateList = Array.from(lateIds).map(id => studentIndex[id]?.fullName || id);
        const absentList = Array.from(targetedIds).filter(id => !presentIds.has(id) && !lateIds.has(id)).map(id => studentIndex[id]?.fullName || id);
        return { date: ds, on_time_end: s.on_time_end, attendance_end: s.attendance_end, totalTargeted, present, late, absent, presentList, lateList, absentList };
      }).sort((a: any, b: any) => (a.date < b.date ? -1 : 1));

      const report = {
        month: months[selectedMonth],
        year: selectedYear,
        college: adminCollege,
        summary: {
          totalStudents,
          totalPresent,
          totalAbsent,
          totalLate,
          totalScheduled,
          averageAttendance
        },
        programStats,
        byDate,
        students: studentsArray.sort((a, b) => a.last_name.localeCompare(b.last_name))
      };

      setReportData(report);
      setShowPreview(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };
  const downloadReport = async () => {
    if (!reportData) return;
    try {
      const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c] || c);

      // Apply filters
      let filtered: any[] = (reportData.students || []);
      if (filterProgram) filtered = filtered.filter((s: any) => s.program === filterProgram);
      if (filterYear) filtered = filtered.filter((s: any) => String(s.year) === String(filterYear));
      if (filterSection) filtered = filtered.filter((s: any) => String(s.section) === String(filterSection));

      // Program Overview (Totals) — no Present or Attendance % columns
      const progAgg: Record<string, { students: number; scheduled: number; present: number; late: number; absent: number }> = {};
      filtered.forEach((s: any) => {
        const key = String(s.program || 'Unknown');
        if (!progAgg[key]) progAgg[key] = { students: 0, scheduled: 0, present: 0, late: 0, absent: 0 };
        progAgg[key].students += 1;
        progAgg[key].scheduled += Number(s.totalScheduled || 0);
        progAgg[key].present += Number(s.presentCount || 0);
        progAgg[key].late += Number(s.lateCount || 0);
        progAgg[key].absent += Number(s.absentCount || 0);
      });
      const programRows = Object.keys(progAgg).sort((a, b) => a.localeCompare(b)).map((prog) => {
        const p = progAgg[prog];
        const verified = p.present + p.late;
        return `<tr>
          <td>${esc(prog)}</td>
          <td>${p.students}</td>
          <td>${verified}</td>
          <td>${p.late}</td>
          <td>${p.absent}</td>
        </tr>`;
      }).join('');

      // Student Details grouped by Program -> Year
      const toYearNum = (y: string) => { const n = parseInt(String(y).replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY; };
      const programs = Array.from(new Set(filtered.map((s: any) => String(s.program || 'Unknown')))).sort((a: string, b: string) => a.localeCompare(b));
      let sectionsHtml = '';
      programs.forEach((prog) => {
        const inProg = filtered.filter((s: any) => String(s.program || 'Unknown') === prog);
        const years = Array.from(new Set(inProg.map((s: any) => String(s.year || '')))).sort((a: string, b: string) => { const na = toYearNum(a), nb = toYearNum(b); return na !== nb ? na - nb : a.localeCompare(b); });
        sectionsHtml += `<div class="card"><div class="sec-title">Program: ${esc(prog)}</div>`;
        years.forEach((yr) => {
          const inYear = inProg.filter((s: any) => String(s.year || '') === yr).sort((a: any, b: any) => String(a.last_name || '').localeCompare(String(b.last_name || '')));
          const rows = inYear.map((s: any) => {
            const full = `${s.first_name || ''} ${s.middle_name || ''} ${s.last_name || ''}`.trim();
            return `<tr>
              <td>${esc(full)}</td>
              <td>${esc(s.email || '')}</td>
              <td><span class="badge badge-prog">${esc(s.program || '')}</span></td>
              <td><span class="badge badge-year">${esc(s.year || '')}</span></td>
              <td><span class="badge badge-sec">${esc(s.section || '')}</span></td>
              <td>${s.presentCount}</td>
              <td>${s.lateCount}</td>
              <td>${s.absentCount}</td>
            </tr>`;
          }).join('');
          sectionsHtml += `
            <div style="margin:6px 0; font-weight:600;">Year: <span class="badge badge-year">${esc(yr || '—')}</span></div>
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Program</th><th>Year</th><th>Section</th><th>Present</th><th>Late</th><th>Absent</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          `;
        });
        sectionsHtml += `</div>`;
      });

      const titleFilter = [filterProgram, filterYear, filterSection].filter(Boolean).join(' | ');
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: -apple-system, system-ui, Segoe UI, Roboto, Arial, sans-serif; color: #1f2937; margin: 24px; }
              .title { font-size: 22px; font-weight: 800; color: #111827; }
              .subtitle { color: #6b7280; margin-top: 4px; }
              .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-top: 12px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; }
              th { background: #f3f4f6; text-align: left; }
              .sec-title { font-weight: 700; margin-bottom: 8px; }
              .section { margin-top: 18px; }
              .badge { display: inline-block; padding: 2px 6px; border-radius: 9999px; font-size: 11px; font-weight: 700; }
              .badge-prog { background: #dbeafe; color: #1e40af; }
              .badge-year { background: #dcfce7; color: #166534; }
              .badge-sec { background: #fee2e2; color: #991b1b; }
              .badge-count { background: #f3f4f6; color: #111827; }
            </style>
          </head>
          <body>
            <div class="title">Attendance Report — ${esc(reportData.month)} ${esc(reportData.year)}</div>
            <div class="subtitle">College: ${esc(reportData.college)}${titleFilter ? ' • Filters: ' + esc(titleFilter) : ''}</div>

            <div class="section">
              <div class="sec-title">Program Overview (Totals)</div>
              <table>
                <thead>
                  <tr><th>Program</th><th>Students</th><th>Verified</th><th>Late</th><th>Absent</th></tr>
                </thead>
                <tbody>${programRows}</tbody>
              </table>
            </div>

            <div class="section">
              <div class="sec-title">Student Details</div>
              ${sectionsHtml || '<div class="card">No students matched your selected filters.</div>'}
            </div>

          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      const target = FileSystem.documentDirectory + `attendance_report_${reportData.college}_${reportData.month}_${reportData.year}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: target });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, { mimeType: 'application/pdf', dialogTitle: `Attendance Report — ${reportData.month} ${reportData.year}` });
      }
      Alert.alert('Success', `PDF saved to:\n${target}`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to download report');
    }
  };

  

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Attendance Reports</Text>
      </View>
      
      <View style={styles.dropdownRow}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={styles.selectBtn} onPress={() => setOpenDateYearDD(v => !v)}>
            <Ionicons name="calendar" size={20} color="#4e73df" />
            <Text style={styles.selectBtnText}>Year: {selectedYear}</Text>
          </TouchableOpacity>
          {openDateYearDD && (
            <View style={{ marginTop: 8 }}>
              {years.map(year => (
                <TouchableOpacity
                  key={year}
                  style={[styles.optionBtn, selectedYear === year && styles.optionBtnSelected]}
                  onPress={() => { setSelectedYear(year); setOpenDateYearDD(false); }}
                >
                  <Text style={[styles.optionText, selectedYear === year && styles.optionTextSelected]}>{year}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={styles.selectBtn} onPress={() => setOpenDateMonthDD(v => !v)}>
            <Ionicons name="calendar" size={20} color="#4e73df" />
            <Text style={styles.selectBtnText}>Month: {months[selectedMonth]}</Text>
          </TouchableOpacity>
          {openDateMonthDD && (
            <View style={{ marginTop: 8 }}>
              {months.map((month, index) => (
                <TouchableOpacity
                  key={month}
                  style={[styles.optionBtn, selectedMonth === index && styles.optionBtnSelected]}
                  onPress={() => { setSelectedMonth(index); setOpenDateMonthDD(false); }}
                >
                  <Text style={[styles.optionText, selectedMonth === index && styles.optionTextSelected]}>{month}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      <TouchableOpacity style={styles.generateBtn} onPress={generateReport} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="document-text" size={20} color="#fff" />
            <Text style={styles.generateBtnText}>Generate Report</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Date dropdowns are inline above; month/year modal removed */}

      {/* Report Preview Modal */}
      <Modal visible={showPreview} animationType="slide" transparent onRequestClose={() => setShowPreview(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { width: '95%', maxHeight: '90%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modalTitle}>Report Preview</Text>
              <TouchableOpacity onPress={() => setShowPreview(false)}>
                <Ionicons name="close-circle" size={28} color="#e03131" />
              </TouchableOpacity>
            </View>
            
            {reportData && (
              <ScrollView>
                <View style={styles.reportSection}>
                  <Text style={styles.reportTitle}>
                    Attendance Report - {reportData.month} {reportData.year}
                  </Text>
                  <Text style={styles.reportSubtitle}>College: {reportData.college}</Text>
                </View>

                <View style={styles.reportSection}>
                  <Text style={styles.sectionHeader}>What’s included</Text>
                  <Text style={styles.studentInfo}>• Program Overview (Totals per Program)</Text>
                  <Text style={styles.studentInfo}>• Student Details (filtered by Program/Year/Section if set)</Text>
                </View>

                <View style={styles.reportSection}>
                  <Text style={styles.sectionHeader}>Filters</Text>
                  <Text style={styles.label}>Program</Text>
                  <View>
                    <TouchableOpacity
                      style={[styles.optionBtn, !filterProgram && styles.optionBtnSelected]}
                      onPress={() => setFilterProgram(null)}
                    >
                      <Text style={[styles.optionText, !filterProgram && styles.optionTextSelected]}>Any Program</Text>
                    </TouchableOpacity>
                    {programOptions.map((prog) => (
                      <TouchableOpacity
                        key={prog}
                        style={[styles.optionBtn, filterProgram === prog && styles.optionBtnSelected]}
                        onPress={() => setFilterProgram(prog)}
                      >
                        <Text style={[styles.optionText, filterProgram === prog && styles.optionTextSelected]}>{prog}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.label, { marginTop: 12 }]}>Year</Text>
                  <View>
                    <TouchableOpacity
                      style={[styles.optionBtn, !filterYear && styles.optionBtnSelected]}
                      onPress={() => setFilterYear(null)}
                    >
                      <Text style={[styles.optionText, !filterYear && styles.optionTextSelected]}>Any Year</Text>
                    </TouchableOpacity>
                    {yearOptions.map((yr) => (
                      <TouchableOpacity
                        key={yr}
                        style={[styles.optionBtn, String(filterYear) === String(yr) && styles.optionBtnSelected]}
                        onPress={() => setFilterYear(String(yr))}
                      >
                        <Text style={[styles.optionText, String(filterYear) === String(yr) && styles.optionTextSelected]}>{yr}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.label, { marginTop: 12 }]}>Section</Text>
                  <View>
                    <TouchableOpacity
                      style={[styles.optionBtn, !filterSection && styles.optionBtnSelected]}
                      onPress={() => setFilterSection(null)}
                    >
                      <Text style={[styles.optionText, !filterSection && styles.optionTextSelected]}>Any Section</Text>
                    </TouchableOpacity>
                    {sectionOptions.map((sec) => (
                      <TouchableOpacity
                        key={sec}
                        style={[styles.optionBtn, String(filterSection) === String(sec) && styles.optionBtnSelected]}
                        onPress={() => setFilterSection(String(sec))}
                      >
                        <Text style={[styles.optionText, String(filterSection) === String(sec) && styles.optionTextSelected]}>{sec}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity style={styles.downloadBtn} onPress={downloadReport}>
                  <Ionicons name="download" size={20} color="#fff" />
                  <Text style={styles.downloadBtnText}>Download</Text>
                </TouchableOpacity>

                {/* Single Download only; specific flow removed */}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Specific Download modal removed; filters moved into preview */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  header: { marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#2d3748' },
  dropdownRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  selectBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 10, marginBottom: 12 },
  selectBtnText: { fontSize: 15, color: '#2d3748', fontWeight: '600' },
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, backgroundColor: '#4e73df', borderRadius: 10 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '85%', backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#2d3748', marginBottom: 12 },
  label: { color: '#6c757d', fontWeight: '600', fontSize: 14, marginBottom: 8 },
  optionBtn: { padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8, marginBottom: 8 },
  optionBtnSelected: { backgroundColor: '#4e73df' },
  optionText: { color: '#2d3748', fontWeight: '600' },
  optionTextSelected: { color: '#fff' },
  closeBtn: { marginTop: 12, padding: 12, backgroundColor: '#e9ecef', borderRadius: 10, alignItems: 'center' },
  closeBtnText: { color: '#495057', fontWeight: '700' },
  reportSection: { marginBottom: 20 },
  reportTitle: { fontSize: 18, fontWeight: '700', color: '#2d3748' },
  reportSubtitle: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  sectionHeader: { fontSize: 16, fontWeight: '700', color: '#2d3748', marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: '#f8f9fa', padding: 12, borderRadius: 10, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: '#2d3748' },
  statLabel: { fontSize: 12, color: '#6c757d', marginTop: 4 },
  studentRow: { flexDirection: 'row', padding: 12, backgroundColor: '#f8f9fa', borderRadius: 10, marginBottom: 8 },
  studentName: { fontSize: 14, fontWeight: '700', color: '#2d3748' },
  studentInfo: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  attendancePercent: { fontSize: 16, fontWeight: '700', color: '#4e73df' },
  attendanceDetail: { fontSize: 11, color: '#6c757d', marginTop: 2 },
  moreText: { fontSize: 13, color: '#6c757d', fontStyle: 'italic', textAlign: 'center', marginTop: 8 },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, backgroundColor: '#28a745', borderRadius: 10, marginTop: 12 },
  downloadBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
