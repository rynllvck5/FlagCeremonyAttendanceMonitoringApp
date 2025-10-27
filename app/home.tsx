import { Redirect } from 'expo-router';

// This route is deprecated. We keep a minimal redirect to tabs.

export default function HomeScreen() {
  return <Redirect href="/(tabs)" />;
}

// No styles needed for redirect-only screen