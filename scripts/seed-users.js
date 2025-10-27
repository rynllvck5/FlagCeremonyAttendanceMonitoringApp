// scripts/seed-users.js
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceKey);

const users = [
  {
    email: 'student@example.com',
    password: 'Password123!',
    role: 'student',
    meta: { first_name: 'Student', middle_name: 'D.', last_name: 'Dmmmsu' },
  },
  {
    email: 'teacher@example.com',
    password: 'Password123!',
    role: 'teacher',
    meta: { first_name: 'Teacher', middle_name: 'K.', last_name: 'Dmmmsu' },
  },
  {
    email: 'admin@example.com',
    password: 'Password123!',
    role: 'admin',
    meta: { first_name: 'Admin', middle_name: 'N.', last_name: 'Dmmmsu' },
  },
  {
    email: 'superadmin@dmmmsu.edu.ph',
    password: 'Password123!',
    role: 'superadmin',
    meta: { first_name: 'Super', middle_name: null, last_name: 'Admin' },
  },
];

async function main() {
  for (const u of users) {
    console.log('Creating user:', u.email);
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: u.meta,
    });
    if (error) {
      console.error('createUser error:', u.email, error);
      continue;
    }
    const userId = data.user?.id;
    console.log('User created:', u.email, userId);

    // Wait briefly for trigger to create profile
    await new Promise(res => setTimeout(res, 500));

    // Force role to desired value
    const { error: updErr } = await admin
      .from('user_profiles')
      .update({ role: u.role })
      .eq('id', userId);
    if (updErr) {
      console.error('Update role error:', u.email, updErr);
    } else {
      console.log('Role set to', u.role, 'for', u.email);
    }
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});