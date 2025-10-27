import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { useAuth } from '../hooks/useAuth';

// Define route types
type RoutePath = '/(auth)/login' | '/home' | '/' | '/_sitemap' | '/(tabs)';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const lastNavRef = useRef<RoutePath | null>(null);
  const { user, isLoading } = useAuth();

  const navigate = (path: RoutePath) => {
    // Skip if already on the target path or recently navigated to the same path
    if (pathname === path || lastNavRef.current === path) {
      return;
    }
    lastNavRef.current = path;
    console.log('Navigating to:', path);
    router.replace(path as any);
  };

  // Reset last navigation guard when the pathname actually changes
  useEffect(() => {
    lastNavRef.current = null;
  }, [pathname]);

  // Drive navigation from useAuth state
  useEffect(() => {
    if (isLoading) return;
    if (user) {
      navigate('/(tabs)');
    } else {
      navigate('/(auth)/login');
    }
  }, [user, isLoading]);

  return (
    <Stack>
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      <Stack.Screen 
        name="(auth)/register" 
        options={{ 
          title: 'Create Account',
          headerBackTitle: 'Back',
        }} 
      />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="_sitemap" options={{ headerShown: false }} />
      {/** Unknown routes are handled by +not-found automatically in Expo Router v2 */}
    </Stack>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});