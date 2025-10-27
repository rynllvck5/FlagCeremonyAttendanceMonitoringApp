# Database Migration Instructions

## Important: Apply the is_admin Function Fix

To fix the issue where newly created admin accounts cannot perform admin actions (like creating attendance schedules), you need to run the migration file:

**File:** `20251027_fix_is_admin_function.sql`

### How to Apply the Migration

1. **Using Supabase Dashboard:**
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor
   - Open the file `database/20251027_fix_is_admin_function.sql`
   - Copy and paste the entire contents into the SQL Editor
   - Click "Run" to execute the migration

2. **Using Supabase CLI:**
   ```bash
   supabase db push
   ```

### What This Migration Does

The migration updates the `is_admin` function to properly check if a user has the `admin` or `superadmin` role in the `user_profiles` table, instead of only checking for hardcoded email addresses.

**Before:** Only users with the email 'superadmin@dmmmsu.edu.ph' were recognized as admins.

**After:** All users with `role = 'admin'` or `role = 'superadmin'` in the `user_profiles` table are recognized as admins.

This fixes the Row Level Security (RLS) policy violations that newly created admin accounts experienced when trying to:
- Create attendance schedules
- Set flag ceremony days
- Edit academic structures
- Access student data
- Generate reports

### Verification

After applying the migration, verify that it worked by:

1. Creating a new admin account using the Admin Management interface
2. Logging in with that new admin account
3. Trying to create an attendance schedule or set a flag day
4. The operation should succeed without any RLS policy errors

If you still encounter issues, check the Supabase logs for any errors.
