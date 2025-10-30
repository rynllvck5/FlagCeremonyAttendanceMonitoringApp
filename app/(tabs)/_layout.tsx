import { Tabs } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

export default function TabLayout() {
  const { profile } = useAuth();
  const { unreadCount, refetch } = useUnreadNotifications();

  // Ensure badge updates when tab bar regains focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  return (
    <ProtectedRoute allowedRoles={['student', 'teacher', 'admin', 'superadmin']}>
      <Tabs
        key={`tabs-${unreadCount}`}
        screenOptions={{
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#8e8e93',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            height: 60,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            marginTop: 4,
          },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.tabIconContainer}>
                <Ionicons 
                  name={focused ? 'home' : 'home-outline'} 
                  size={24} 
                  color={color} 
                />
              </View>
            ),
          }}
        />

        {/* Middle tab: My QR (students/teachers) OR Scan (admins) */}
        <Tabs.Screen
          name="myqr"
          options={{
            href: ['student', 'teacher'].includes(profile?.role || '') ? undefined : null,
            title: 'My QR',
            tabBarIcon: ({ color }) => (
              <View style={styles.tabIconContainer}>
                <Ionicons name={'qr-code'} size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="scanner"
          options={{
            href: ['admin', 'superadmin'].includes(profile?.role || '') ? undefined : null,
            title: 'Scan',
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.tabIconContainer}>
                <Ionicons name={focused ? 'scan' : 'scan-outline'} size={24} color={color} />
              </View>
            ),
          }}
        />

        {/* Explicit Profile tab to ensure order: Home | (My QR or Scanner) | Profile */}
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.tabIconContainer}>
                <Ionicons 
                  name={focused ? 'person' : 'person-outline'} 
                  size={24} 
                  color={color} 
                />
                {/* Notification Badge */}
                {unreadCount > 0 && (
                  <View style={styles.profileBadge}>
                    <Text style={styles.profileBadgeText}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            ),
          }}
        />

        <Tabs.Screen name="settings" options={{ href: null }} />

        {/** Hidden route for Edit Profile screen */}
        <Tabs.Screen name="edit-profile" options={{ href: null }} />

        {/** Hidden routes for Students list and details */}
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="student/[id]" options={{ href: null }} />
        <Tabs.Screen name="students/[id]" options={{ href: null }} />
        <Tabs.Screen name="students/new" options={{ href: null }} />

        {/** Hidden routes for Teachers list and CRUD */}
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="teachers/[id]" options={{ href: null }} />
        <Tabs.Screen name="teachers/new" options={{ href: null }} />

        <Tabs.Screen name="advisory/[program_code]/[year_name]/[section_name]" options={{ href: null }} />

        {/** Hidden routes for Fingerprint management and Attendance verification */}
        <Tabs.Screen name="students/[id]/fingerprint" options={{ href: null }} />
        <Tabs.Screen name="verify-attendance/[id]" options={{ href: null }} />

        {/** Hidden route for Admin/Superadmin attendance schedule */}
        <Tabs.Screen name="schedule" options={{ href: null }} />

        {/** Hidden route for Student/Teacher read-only schedule view */}
        <Tabs.Screen name="schedule-view" options={{ href: null }} />

        {/** Hidden route for Notifications screen */}
        <Tabs.Screen name="notifications" options={{ href: null }} />

        {/** Hide unused/legacy tabs */}
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="users" options={{ href: null }} />
        <Tabs.Screen name="session" options={{ href: null }} />
        <Tabs.Screen name="scan" options={{ href: null }} />
      </Tabs>
    </ProtectedRoute>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#e03131',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
