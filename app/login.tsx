import { Redirect } from 'expo-router';

export default function LoginScreen() {
  return <Redirect href={"/(auth)/login" as any} />;
}

// legacy styles removed
