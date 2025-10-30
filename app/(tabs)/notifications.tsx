import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
import { useFocusEffect } from '@react-navigation/native';

type Notification = {
  id: string;
  title: string;
  message: string;
  type: 'attendance_required' | 'attendance_not_required' | 'schedule_update';
  schedule_date: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  metadata: {
    venue?: string;
    attendance_start?: string;
    on_time_end?: string;
    attendance_end?: string;
    description?: string;
  } | null;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { refetch: refetchUnreadCount } = useUnreadNotifications();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      if (!profile?.id) return;
      
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications((data || []) as Notification[]);
    } catch (e) {
      console.error('[Notifications] Failed to load', e);
    }
  }, [profile?.id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadNotifications();
      setLoading(false);
    })();
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    await refetchUnreadCount();
    setRefreshing(false);
  };

  const markAsRead = async (notifId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notifId);

      if (error) throw error;
      
      setNotifications(prev => 
        prev.map(n => n.id === notifId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      );
      
      // Immediately update the unread count badge
      await refetchUnreadCount();
    } catch (e) {
      console.error('[Notifications] Failed to mark as read', e);
    }
  };

  const markAsUnread = async (notifId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: false, read_at: null })
        .eq('id', notifId);

      if (error) throw error;
      
      setNotifications(prev => 
        prev.map(n => n.id === notifId ? { ...n, is_read: false, read_at: null } : n)
      );
      
      // Immediately update the unread count badge
      await refetchUnreadCount();
    } catch (e) {
      console.error('[Notifications] Failed to mark as unread', e);
    }
  };

  const deleteNotification = async (notifId: string) => {
    try {
      Alert.alert(
        'Delete Notification',
        'Are you sure you want to delete this notification?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('id', notifId);

              if (error) throw error;
              
              setNotifications(prev => prev.filter(n => n.id !== notifId));
              
              // Immediately update the unread count badge
              await refetchUnreadCount();
              
              Alert.alert('Deleted', 'Notification deleted successfully');
            }
          }
        ]
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to delete notification');
    }
  };

  const openNotification = async (notif: Notification) => {
    // Mark as read if unread
    if (!notif.is_read) {
      await markAsRead(notif.id);
    }
    
    setSelectedNotif(notif);
    setDetailModalVisible(true);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '—';
    return timeStr;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#4e73df" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#4e73df" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4e73df']} />
          }
        >
          {notifications.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Ionicons name="notifications-off-outline" size={64} color="#adb5bd" />
              <Text style={{ color: '#6c757d', marginTop: 16, fontSize: 16 }}>No notifications yet</Text>
            </View>
          ) : (
            notifications.map((notif) => (
              <TouchableOpacity
                key={notif.id}
                style={[
                  styles.notifCard,
                  !notif.is_read && styles.notifCardUnread
                ]}
                onPress={() => openNotification(notif)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1 }}>
                  {/* Icon */}
                  <View style={[
                    styles.iconContainer,
                    notif.type === 'attendance_required' && { backgroundColor: '#d3f9d8' },
                    notif.type === 'attendance_not_required' && { backgroundColor: '#ffe3e3' },
                    notif.type === 'schedule_update' && { backgroundColor: '#e7f5ff' }
                  ]}>
                    <Ionicons
                      name={
                        notif.type === 'attendance_required' ? 'checkmark-circle' :
                        notif.type === 'attendance_not_required' ? 'close-circle' :
                        'information-circle'
                      }
                      size={24}
                      color={
                        notif.type === 'attendance_required' ? '#2f9e44' :
                        notif.type === 'attendance_not_required' ? '#c92a2a' :
                        '#1c7ed6'
                      }
                    />
                  </View>

                  {/* Content */}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      {!notif.is_read && (
                        <View style={styles.unreadDot} />
                      )}
                      <Text style={[styles.notifTitle, !notif.is_read && { fontWeight: '700' }]}>
                        {notif.title}
                      </Text>
                    </View>
                    <Text style={styles.notifMessage} numberOfLines={2}>
                      {notif.message}
                    </Text>
                    <Text style={styles.notifDate}>
                      {new Date(notif.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </Text>
                  </View>

                  {/* Options Menu */}
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      Alert.alert(
                        'Options',
                        undefined,
                        [
                          {
                            text: notif.is_read ? 'Mark as Unread' : 'Mark as Read',
                            onPress: () => notif.is_read ? markAsUnread(notif.id) : markAsRead(notif.id)
                          },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => deleteNotification(notif.id)
                          },
                          { text: 'Cancel', style: 'cancel' }
                        ]
                      );
                    }}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="ellipsis-vertical" size={20} color="#6c757d" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* Notification Detail Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notification Details</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color="#2d3748" />
              </TouchableOpacity>
            </View>

            {selectedNotif && (
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                {/* Type Badge */}
                <View style={[
                  styles.typeBadge,
                  selectedNotif.type === 'attendance_required' && { backgroundColor: '#d3f9d8' },
                  selectedNotif.type === 'attendance_not_required' && { backgroundColor: '#ffe3e3' },
                  selectedNotif.type === 'schedule_update' && { backgroundColor: '#e7f5ff' }
                ]}>
                  <Text style={[
                    styles.typeBadgeText,
                    selectedNotif.type === 'attendance_required' && { color: '#2f9e44' },
                    selectedNotif.type === 'attendance_not_required' && { color: '#c92a2a' },
                    selectedNotif.type === 'schedule_update' && { color: '#1c7ed6' }
                  ]}>
                    {selectedNotif.type === 'attendance_required' ? '✓ Attendance Required' :
                     selectedNotif.type === 'attendance_not_required' ? '✗ Not Required' :
                     'ⓘ Schedule Update'}
                  </Text>
                </View>

                {/* Title */}
                <Text style={styles.detailTitle}>{selectedNotif.title}</Text>

                {/* Message */}
                <Text style={styles.detailMessage}>{selectedNotif.message}</Text>

                {/* Emphasis Box */}
                <View style={[
                  styles.emphasisBox,
                  selectedNotif.type === 'attendance_required' && { borderColor: '#2f9e44', backgroundColor: '#f1f8f4' },
                  selectedNotif.type === 'attendance_not_required' && { borderColor: '#c92a2a', backgroundColor: '#fff5f5' }
                ]}>
                  <Text style={[
                    styles.emphasisText,
                    selectedNotif.type === 'attendance_required' && { color: '#2f9e44' },
                    selectedNotif.type === 'attendance_not_required' && { color: '#c92a2a' }
                  ]}>
                    {selectedNotif.type === 'attendance_required' 
                      ? '⚠️ You NEED to take attendance on this date!'
                      : '✓ You do NOT need to take attendance on this date.'}
                  </Text>
                </View>

                {/* Schedule Details */}
                <View style={styles.scheduleCard}>
                  <Text style={styles.scheduleCardTitle}>Schedule Details</Text>
                  
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar" size={20} color="#4e73df" />
                    <Text style={styles.detailLabel}>Date:</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedNotif.schedule_date)}</Text>
                  </View>

                  {selectedNotif.metadata?.attendance_start && (
                    <View style={styles.detailRow}>
                      <Ionicons name="time" size={20} color="#4e73df" />
                      <Text style={styles.detailLabel}>Attendance Start:</Text>
                      <Text style={styles.detailValue}>{formatTime(selectedNotif.metadata.attendance_start)}</Text>
                    </View>
                  )}

                  {selectedNotif.metadata?.on_time_end && (
                    <View style={styles.detailRow}>
                      <Ionicons name="timer" size={20} color="#4e73df" />
                      <Text style={styles.detailLabel}>On-time Deadline:</Text>
                      <Text style={styles.detailValue}>{formatTime(selectedNotif.metadata.on_time_end)}</Text>
                    </View>
                  )}

                  {selectedNotif.metadata?.attendance_end && (
                    <View style={styles.detailRow}>
                      <Ionicons name="time-outline" size={20} color="#4e73df" />
                      <Text style={styles.detailLabel}>Attendance End:</Text>
                      <Text style={styles.detailValue}>{formatTime(selectedNotif.metadata.attendance_end)}</Text>
                    </View>
                  )}

                  {selectedNotif.metadata?.venue && (
                    <View style={styles.detailRow}>
                      <Ionicons name="location" size={20} color="#4e73df" />
                      <Text style={styles.detailLabel}>Venue:</Text>
                      <Text style={styles.detailValue}>{selectedNotif.metadata.venue}</Text>
                    </View>
                  )}

                  {selectedNotif.metadata?.description && (
                    <View style={styles.detailRow}>
                      <Ionicons name="document-text" size={20} color="#4e73df" />
                      <Text style={styles.detailLabel}>Description:</Text>
                      <Text style={styles.detailValue}>{selectedNotif.metadata.description}</Text>
                    </View>
                  )}
                </View>

                {/* Timestamp */}
                <Text style={styles.timestamp}>
                  Received: {new Date(selectedNotif.created_at).toLocaleString()}
                </Text>
              </ScrollView>
            )}

            {/* Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fc',
  },
  header: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginRight: 8,
  },
  backText: {
    color: '#4e73df',
    fontWeight: '600',
    marginLeft: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2d3748',
  },
  notifCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  notifCardUnread: {
    borderLeftWidth: 4,
    borderLeftColor: '#4e73df',
    backgroundColor: '#f8f9ff',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4e73df',
    marginRight: 8,
  },
  notifTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    flex: 1,
  },
  notifMessage: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 4,
    lineHeight: 20,
  },
  notifDate: {
    fontSize: 12,
    color: '#adb5bd',
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2d3748',
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  typeBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2d3748',
    marginBottom: 12,
  },
  detailMessage: {
    fontSize: 16,
    color: '#495057',
    lineHeight: 24,
    marginBottom: 16,
  },
  emphasisBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 20,
  },
  emphasisText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  scheduleCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  scheduleCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d3748',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6c757d',
    marginLeft: 8,
    width: 130,
  },
  detailValue: {
    fontSize: 14,
    color: '#2d3748',
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: '#adb5bd',
    textAlign: 'center',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  closeButton: {
    backgroundColor: '#4e73df',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
