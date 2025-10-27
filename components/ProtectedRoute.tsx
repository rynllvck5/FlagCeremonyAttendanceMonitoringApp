import { useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { UserRole } from '../types/user';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles = [] }: ProtectedRouteProps) {
  const { user, profile, role, isLoading } = useAuth();
  const segments = useSegments();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoading) {
      const inAuthGroup = segments[0] === '(auth)';
      
      // If the user is not signed in and the initial segment is not in the auth group
      if (!user && !inAuthGroup) {
        setIsAuthorized(false);
      } 
      // If the user is signed in but doesn't have the required role
      else if (user && allowedRoles.length > 0 && role && !allowedRoles.includes(role)) {
        setIsAuthorized(false);
      } 
      // If the user is signed in and has the required role
      else if (user) {
        setIsAuthorized(true);
      } 
      // If the user is not signed in and the initial segment is in the auth group
      else {
        setIsAuthorized(true);
      }
    }
  }, [user, isLoading, segments, role, allowedRoles]);

  if (isLoading || isAuthorized === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // When unauthorized, render a loader. RootLayout will navigate appropriately.
  if (!isAuthorized) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
