// scripts/fix-attendance-data.js
// This script fixes attendance data by:
// 1. Updating student profiles with program/year/section if missing
// 2. Populating required sections for all flag days
// 3. Verifying the setup

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
  console.log('🚀 Starting attendance data fix...\n');

  // Step 1: Check and fix student profiles
  console.log('📋 Step 1: Checking student profiles...');
  const { data: students, error: studErr } = await supabase
    .from('user_profiles')
    .select('id, email, first_name, last_name, program, year, section')
    .eq('role', 'student');

  if (studErr) {
    console.error('❌ Error fetching students:', studErr);
    process.exit(1);
  }

  console.log(`   Found ${students.length} students`);

  const missingData = students.filter(s => !s.program || !s.year || !s.section);
  if (missingData.length > 0) {
    console.log(`   ⚠️  ${missingData.length} students missing program/year/section:`);
    missingData.forEach(s => {
      console.log(`      - ${s.email}: program=${s.program}, year=${s.year}, section=${s.section}`);
    });

    // Auto-fix: Assign default values or prompt
    console.log('\n   🔧 Assigning default values (BSCS/1/A) to students with missing data...');
    for (const student of missingData) {
      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update({
          program: student.program || 'BSCS',
          year: student.year || '1',
          section: student.section || 'A'
        })
        .eq('id', student.id);

      if (updateErr) {
        console.error(`      ❌ Failed to update ${student.email}:`, updateErr);
      } else {
        console.log(`      ✅ Updated ${student.email}`);
      }
    }
  } else {
    console.log('   ✅ All students have complete profiles');
  }

  // Step 2: Get all flag days in the last 60 days
  console.log('\n📅 Step 2: Finding flag days (last 60 days)...');
  const today = new Date();
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(today.getDate() - 60);
  
  const formatDate = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const startDate = formatDate(sixtyDaysAgo);
  const endDate = formatDate(today);

  const { data: schedules, error: schedErr } = await supabase
    .from('attendance_schedules')
    .select('date, is_flag_day, attendance_start, on_time_end, attendance_end')
    .eq('is_flag_day', true)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  if (schedErr) {
    console.error('❌ Error fetching schedules:', schedErr);
    process.exit(1);
  }

  console.log(`   Found ${schedules.length} flag days`);
  if (schedules.length === 0) {
    console.log('   ⚠️  No flag days found! You need to create flag days first.');
    console.log('      Tip: Use the admin Schedule Manager in the app to create flag days.');
    process.exit(0);
  }

  // Step 3: Get unique student sections
  console.log('\n👥 Step 3: Getting student sections...');
  const { data: updatedStudents } = await supabase
    .from('user_profiles')
    .select('program, year, section')
    .eq('role', 'student')
    .not('program', 'is', null)
    .not('year', 'is', null)
    .not('section', 'is', null);

  const uniqueSections = [...new Set(updatedStudents.map(s => 
    JSON.stringify({ program: s.program, year: s.year, section: s.section })
  ))].map(s => JSON.parse(s));

  console.log(`   Found ${uniqueSections.length} unique sections:`);
  uniqueSections.forEach(sec => {
    console.log(`      - ${sec.program} ${sec.year}${sec.section}`);
  });

  // Step 4: Populate required sections for all flag days
  console.log('\n🔧 Step 4: Populating required sections for flag days...');
  let insertCount = 0;
  let errorCount = 0;

  for (const schedule of schedules) {
    console.log(`   Processing ${schedule.date}...`);
    
    for (const section of uniqueSections) {
      const { error: insertErr } = await supabase
        .from('attendance_schedule_required_sections')
        .upsert({
          date: schedule.date,
          program_code: section.program,
          year_name: section.year,
          section_name: section.section
        }, {
          onConflict: 'date,program_code,year_name,section_name',
          ignoreDuplicates: true
        });

      if (insertErr) {
        console.error(`      ❌ Error inserting ${section.program} ${section.year}${section.section}:`, insertErr.message);
        errorCount++;
      } else {
        insertCount++;
      }
    }
  }

  console.log(`   ✅ Inserted/updated ${insertCount} required section records`);
  if (errorCount > 0) {
    console.log(`   ⚠️  ${errorCount} errors occurred`);
  }

  // Step 5: Verify the setup
  console.log('\n✅ Step 5: Verifying setup...');
  
  const { data: reqSections, error: reqErr } = await supabase
    .from('attendance_schedule_required_sections')
    .select('date, program_code, year_name, section_name')
    .gte('date', startDate)
    .lte('date', endDate);

  if (reqErr) {
    console.error('❌ Error fetching required sections:', reqErr);
  } else {
    const byDate = {};
    reqSections.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(`${r.program_code} ${r.year_name}${r.section_name}`);
    });

    console.log(`   Total required section records: ${reqSections.length}`);
    console.log(`   Flag days with requirements: ${Object.keys(byDate).length}`);
    console.log('\n   Sample (latest 3 dates):');
    Object.keys(byDate).sort().reverse().slice(0, 3).forEach(date => {
      console.log(`      ${date}: ${byDate[date].join(', ')}`);
    });
  }

  console.log('\n🎉 Done! Your attendance system is now properly configured.');
  console.log('   Next steps:');
  console.log('   1. Restart your Expo app: npx expo start -c');
  console.log('   2. Login as a student');
  console.log('   3. Check the console logs for [Home] and [ScheduleView] messages');
  console.log('   4. Verify that the attendance card shows correct values');
  console.log('   5. Check that the calendar has color-coded dates\n');
}

main().catch((e) => {
  console.error('❌ Fatal error:', e);
  process.exit(1);
});
