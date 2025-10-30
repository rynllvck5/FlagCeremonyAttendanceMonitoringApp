# Push Notifications Setup Guide

## Required Packages

Run these commands to install the necessary packages:

```bash
npx expo install expo-notifications expo-device
```

## Update app.json / app.config.ts

Add the following to your `app.json` or `app.config.ts`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/images/notification-icon.png",
          "color": "#ffffff",
          "sounds": ["./assets/sounds/notification.wav"]
        }
      ]
    ],
    "notification": {
      "icon": "./assets/images/notification-icon.png",
      "color": "#4e73df",
      "androidMode": "default",
      "androidCollapsedTitle": "Attendance Monitoring"
    },
    "android": {
      "permissions": [
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "com.google.android.c2dm.permission.RECEIVE"
      ],
      "useNextNotificationsApi": true
    },
    "ios": {
      "infoPlist": {
        "NSUserNotificationsUsageDescription": "This app uses notifications to alert you about attendance schedules and requirements."
      }
    }
  }
}
```

## Database Migrations

Run these SQL files in your Supabase dashboard:

1. **`database/20250127_push_tokens.sql`** - Creates push_tokens table
2. Already ran: **`database/20250127_notifications.sql`** - Creates notifications table

## Testing Push Notifications

### On Physical Device (Required)
Push notifications **only work on physical devices**, not simulators/emulators.

1. **Build and Install on Device:**
   ```bash
   # For development build
   npx expo run:android
   # or
   npx expo run:ios
   ```

2. **OR Use Expo Go (Limited):**
   ```bash
   npx expo start
   # Scan QR code with Expo Go app
   ```
   Note: Expo Go has limitations for push notifications in production.

### Testing Flow

1. **Login as Student/Teacher**
   - App will request notification permission
   - Accept the permission
   - Device token is automatically registered

2. **Login as Admin on Another Device**
   - Go to Schedule screen
   - Create/edit an attendance schedule
   - Add the student/teacher to required attendees
   - Click "Save Schedule"

3. **Check Student/Teacher Device**
   - Should receive push notification immediately
   - Notification appears in device notification tray
   - Tapping notification opens the app

## How Notifications Work

### 1. **Device Registration**
- When user logs in, `usePushNotifications` hook automatically:
  - Requests notification permission
  - Gets Expo push token
  - Saves token to database (`push_tokens` table)

### 2. **Sending Notifications**
- Admin saves attendance schedule with required attendees
- System detects changes (added/removed users)
- Creates in-app notifications in `notifications` table
- Sends push notifications via Expo Push API to registered devices

### 3. **Receiving Notifications**
- **App in foreground**: Shows alert banner
- **App in background**: Notification appears in tray
- **App closed**: Notification appears in tray
- **Do Not Disturb**: Notifications still delivered (queued)

### 4. **Badge Count**
- Red badge on avatar (home screen)
- Red badge on profile tab (bottom navigation)
- Shows count of unread notifications
- Updates in real-time

## Notification Types

1. **📋 Attendance Required**
   - "You are required to take attendance on [Date]!"
   - Green color indicator

2. **ℹ️ Attendance Not Required**
   - "You are not required to take attendance on [Date]."
   - Red color indicator

## Troubleshooting

### "Must use physical device for Push Notifications"
- Push notifications don't work in iOS Simulator or Android Emulator
- Use a physical device for testing

### "Failed to get push token"
- Make sure you're on a physical device
- Check notification permissions in device settings
- Restart the app and try again

### "Notifications not received"
1. Check if push token is saved in database:
   ```sql
   SELECT * FROM push_tokens WHERE user_id = 'your-user-id';
   ```
2. Check if notification was created:
   ```sql
   SELECT * FROM notifications WHERE user_id = 'your-user-id' ORDER BY created_at DESC;
   ```
3. Check logs for any errors

### "Badge not updating"
- The `useUnreadNotifications` hook uses Supabase real-time subscriptions
- Make sure real-time is enabled in Supabase project settings
- Check browser console for subscription errors

## Production Deployment

For production, you'll need to:

1. **Build Production App:**
   ```bash
   eas build --platform android
   eas build --platform ios
   ```

2. **Configure FCM (Android):**
   - Get FCM server key from Firebase
   - Add to Expo project settings

3. **Configure APNs (iOS):**
   - Get APNs certificates
   - Upload to Expo

4. **Test thoroughly on physical devices**

## Additional Resources

- [Expo Notifications Documentation](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo Push Notifications Guide](https://docs.expo.dev/push-notifications/overview/)
- [Testing Push Notifications](https://docs.expo.dev/push-notifications/sending-notifications/)
