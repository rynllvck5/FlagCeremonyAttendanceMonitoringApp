import 'dotenv/config';
import type { ExpoConfig } from '@expo/config';

// Use app.json as the base and inject env-driven extras
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appJson = require('./app.json');

const config: ExpoConfig = {
  ...appJson.expo,
  extra: {
    ...(appJson.expo?.extra ?? {}),
    // Make the service role key available at runtime via Constants.expoConfig.extra
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    EXPO_PUBLIC_SUPABASE_SERVICE_KEY: process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY,
  },
};

export default config;
