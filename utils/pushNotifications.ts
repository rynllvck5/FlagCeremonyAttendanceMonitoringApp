import { supabase } from '../lib/supabase';

export async function sendPushNotifications(params: {
  userIds: string[];
  title: string;
  body: string;
  data?: any;
}) {
  try {
    const { userIds, title, body, data } = params;
    
    if (userIds.length === 0) return;

    // Get push tokens for these users, but only for users who have push notifications enabled
    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('token, user_id, user_profiles!inner(push_notifications_enabled)')
      .in('user_id', userIds);

    if (error) {
      console.error('[PushNotif] Error fetching tokens:', error);
      return;
    }

    if (!tokens || tokens.length === 0) {
      console.log('[PushNotif] No push tokens found for users');
      return;
    }

    // Filter to only include users who have push notifications enabled
    const enabledTokens = tokens.filter((t: any) => {
      const enabled = t.user_profiles?.push_notifications_enabled ?? true;
      return enabled;
    });

    if (enabledTokens.length === 0) {
      console.log('[PushNotif] No users with push notifications enabled');
      return;
    }

    // Send push notifications to Expo's push notification service
    const messages = enabledTokens.map((tokenData: any) => ({
      to: tokenData.token,
      sound: 'default',
      title: title,
      body: body,
      data: data || {},
      priority: 'high',
      channelId: 'default',
    }));

    console.log('[PushNotif] Sending', messages.length, 'push notifications');

    // Send to Expo Push Notification API
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    console.log('[PushNotif] Response:', result);

    if (result.data) {
      const errors = result.data.filter((item: any) => item.status === 'error');
      if (errors.length > 0) {
        console.error('[PushNotif] Some notifications failed:', errors);
      } else {
        console.log('[PushNotif] All notifications sent successfully');
      }
    }
  } catch (e) {
    console.error('[PushNotif] Error sending push notifications:', e);
  }
}
