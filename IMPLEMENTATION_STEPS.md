# Complete Implementation Steps

Follow these steps in order to implement all fixes and features.

## ✅ Step 1: Install Required Packages

```bash
npx expo install expo-notifications expo-device expo-constants
```

**This will fix the TypeScript errors in `usePushNotifications.ts`**

## ✅ Step 2: Run Database Migrations

Go to your Supabase SQL Editor and run these files in order:

### 2.1 Push Tokens Table
Run: `database/20250127_push_tokens.sql`

### 2.2 Push Notification Setting
Run: `database/20250127_push_notification_setting.sql`

### 2.3 Verify Notifications Table (Already Fixed)
The `database/20250127_notifications.sql` should already be run with the foreign key fix.

## ✅ Step 3: Update app.json

Add the following configuration to your `app.json`:

```json
{
  "expo": {
    "android": {
      "permissions": [
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "com.google.android.c2dm.permission.RECEIVE",
        "POST_NOTIFICATIONS"
      ],
      "useNextNotificationsApi": true
    },
    "ios": {
      "infoPlist": {
        "NSUserNotificationsUsageDescription": "This app uses notifications to alert you about attendance schedules and requirements."
      }
    },
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/images/icon.png",
          "color": "#ffffff",
          "defaultChannel": "default"
        }
      ]
    ],
    "notification": {
      "icon": "./assets/images/icon.png",
      "color": "#4e73df",
      "androidMode": "default",
      "androidCollapsedTitle": "Attendance Monitoring"
    }
  }
}
```

## ✅ Step 4: Test Fixes in Development

### Test Schedule Deletion
1. Run: `npx expo start`
2. Login as admin
3. Create a flag ceremony schedule
4. Toggle flag ceremony OFF
5. Confirm deletion
6. ✅ Schedule should be deleted immediately

### Test Notification Badge
1. Have some unread notifications
2. Check home screen avatar
3. ✅ Badge should show full number (not cropped)

### Test Push Notification Toggle
1. Go to Profile → Settings
2. Find "Push Notifications" toggle
3. Toggle ON/OFF
4. ✅ Setting should save to database

## ✅ Step 5: Build APK for Physical Device Testing

### Option A: Quick Preview Build (Recommended)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Initialize EAS (if first time)
eas build:configure

# Build APK
eas build --profile preview --platform android
```

**Wait 10-15 minutes for build to complete**

### Option B: Development Build (For Live Updates)

```bash
eas build --profile development --platform android
```

Then run: `npx expo start --dev-client`

## ✅ Step 6: Install APK on Phone

1. Download APK from build link (you'll get URL when build completes)
2. Transfer to Android phone
3. Enable "Install from Unknown Sources"
4. Install APK
5. Open app

## ✅ Step 7: Test Push Notifications

### Setup:
1. **Phone 1 (Student/Teacher):**
   - Install APK
   - Login
   - Accept notification permission ✅
   - Go to Settings
   - Ensure "Push Notifications" is ON ✅

2. **Phone 2 or Computer (Admin):**
   - Login as admin
   - Go to Schedule screen
   - Create/edit a schedule
   - Add Phone 1's user to required attendees
   - Click "Save Schedule"

3. **Check Phone 1:**
   - 🔔 Should receive push notification
   - Check device notification tray
   - Tap notification → Opens app
   - Check in-app notifications list
   - Badge count updates

### Test Toggle Feature:
1. On Phone 1, go to Settings
2. Toggle "Push Notifications" OFF
3. On admin device, create another schedule with this user
4. ✅ Phone 1 should NOT receive push notification
5. Toggle back ON
6. Create another schedule
7. ✅ Phone 1 should receive push notification

## ✅ Step 8: Verify All Features

### Checklist:
- [ ] Schedule deletion works immediately
- [ ] Notification badge shows correctly (not cropped)
- [ ] Push notifications arrive on device
- [ ] Push notification toggle in settings works
- [ ] Disabled users don't receive push notifications
- [ ] Notifications bypass Do Not Disturb mode
- [ ] Tapping notification opens app
- [ ] Badge count updates in real-time

## 📋 What Was Implemented

### 1. **Fixed Schedule Deletion**
- Explicitly deletes all related records
- Added detailed logging
- Works immediately upon confirmation

### 2. **Fixed Notification Badge**
- Removed overflow clipping
- Better positioning
- Shows full number

### 3. **Device Push Notifications**
- Full push notification system
- Works when app is closed/background
- Auto-registers device tokens
- Sends to device notification tray

### 4. **Push Notification Toggle**
- User setting in Settings screen
- Stored in database
- Respected when sending notifications
- Only enabled users receive push

### 5. **APK Build System**
- Complete build instructions
- Testing on physical devices
- Production-ready configuration

## 🚨 Important Notes

1. **TypeScript Errors:** The errors in `usePushNotifications.ts` will disappear after installing packages (Step 1)

2. **Physical Device Required:** Push notifications ONLY work on real phones, not simulators

3. **Expo Go Limitations:** For full push notification support, use APK build (not Expo Go)

4. **First Build:** Takes 15-20 minutes, subsequent builds are faster

5. **Push Toggle:** Users can control if they receive device notifications via Settings

## 🔧 Troubleshooting

### TypeScript Errors Persist
```bash
# Clear cache and reinstall
rm -rf node_modules
npm install
npx expo start --clear
```

### Push Notifications Not Working
1. Verify APK is installed (not Expo Go)
2. Check notification permission in device settings
3. Verify push toggle is ON in app settings
4. Check device has internet connection
5. Check database: `SELECT * FROM push_tokens WHERE user_id = 'your-id'`

### Build Fails
```bash
# Check build logs
eas build:list

# View specific build
eas build:view [BUILD_ID]
```

### Schedule Deletion Still Not Working
1. Check browser console for errors
2. Verify database cascade delete is set up
3. Check admin permissions

## 📚 Documentation Files

- `BUILD_APK_GUIDE.md` - Detailed APK build instructions
- `PUSH_NOTIFICATIONS_SETUP.md` - Push notification setup guide
- `FIXES_SUMMARY.md` - Summary of all fixes
- `IMPLEMENTATION_STEPS.md` - This file

## 🎯 Success Criteria

You'll know everything is working when:
1. ✅ Schedule deletes immediately when toggle OFF
2. ✅ Badge shows "12" instead of "1" (cropped)
3. ✅ Push notification appears in device tray
4. ✅ Tapping notification opens app
5. ✅ Toggle OFF = no device notification
6. ✅ Toggle ON = receive device notification

## 🚀 Next Steps After Testing

1. Test on multiple Android devices
2. Build for iOS (if needed)
3. Configure FCM for production
4. Submit to Play Store/App Store
5. Monitor notification delivery rates

---

**Need Help?**
- Check troubleshooting section above
- Review `PUSH_NOTIFICATIONS_SETUP.md`
- Review `BUILD_APK_GUIDE.md`
- Check Expo forums: https://forums.expo.dev/
