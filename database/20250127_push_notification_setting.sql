-- Add push notification setting to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN DEFAULT true;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_push_enabled 
ON user_profiles(id, push_notifications_enabled);

-- Comment explaining the column
COMMENT ON COLUMN user_profiles.push_notifications_enabled IS 'Whether user wants to receive push notifications on their device';
