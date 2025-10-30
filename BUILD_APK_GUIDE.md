# Build APK for Testing Push Notifications

This guide will help you build an APK file to test push notifications on your Android phone.

## Prerequisites

1. **Node.js and npm** installed
2. **Expo CLI** installed globally
3. **EAS CLI** installed globally
4. **Expo account** (free tier is fine)

## Step 1: Install Required Packages

First, install the push notification packages:

```bash
npx expo install expo-notifications expo-device expo-constants
```

## Step 2: Install EAS CLI

```bash
npm install -g eas-cli
```

## Step 3: Login to Expo

```bash
eas login
```

Enter your Expo credentials (create account at expo.dev if needed).

## Step 4: Configure Your Project

### Update `app.json`

Add/update these fields in your `app.json`:

```json
{
  "expo": {
    "name": "Attendance Monitoring",
    "slug": "attendance-monitoring-expo",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "attendancemonitoring",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/images/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.attendancemonitoring",
      "infoPlist": {
        "NSUserNotificationsUsageDescription": "This app uses notifications to alert you about attendance schedules and requirements."
      }
    },
    "android": {
      "package": "com.yourcompany.attendancemonitoring",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": [
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "com.google.android.c2dm.permission.RECEIVE",
        "POST_NOTIFICATIONS"
      ],
      "useNextNotificationsApi": true
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/images/favicon.png"
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
    },
    "extra": {
      "eas": {
        "projectId": "YOUR_PROJECT_ID_HERE"
      }
    }
  }
}
```

**Note:** Replace `com.yourcompany.attendancemonitoring` with your actual package name.

## Step 5: Initialize EAS Build

```bash
eas build:configure
```

This will create an `eas.json` file. Update it like this:

```json
{
  "cli": {
    "version": ">= 5.2.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

## Step 6: Build Development APK

For testing with push notifications:

```bash
eas build --profile preview --platform android
```

This will:
1. Upload your code to Expo servers
2. Build the APK
3. Provide a download link when complete

**Build time:** Usually 10-20 minutes for first build, 5-10 minutes for subsequent builds.

## Step 7: Download and Install APK

1. **Check build status:**
   ```bash
   eas build:list
   ```

2. **Once complete, you'll get a download URL**

3. **Transfer APK to your Android phone:**
   - Option A: Open the link on your phone browser
   - Option B: Download on PC and transfer via USB/cloud

4. **Install APK:**
   - Enable "Install from Unknown Sources" in Android settings
   - Open the APK file
   - Follow installation prompts

## Step 8: Test Push Notifications

1. **Open the app** on your phone
2. **Login** with your credentials
3. **Accept notification permission** when prompted
4. **On another device (or web):**
   - Login as admin
   - Go to Schedule screen
   - Create/edit a schedule
   - Add yourself to required attendees
   - Click "Save Schedule"
5. **Check your phone:**
   - You should receive a push notification
   - Check device notification tray
   - Tap notification to open app

## Alternative: Faster Development Build

If you want faster builds and live updates, use development build:

```bash
# Build development client
eas build --profile development --platform android

# Once installed on phone, run:
npx expo start --dev-client
```

This allows you to:
- Test changes without rebuilding
- See updates instantly
- Full push notification support

## Troubleshooting

### "Project ID not found"
Run: `eas init` to create a project ID, then update `app.json`

### "Build failed"
Check logs: `eas build:list` then click on the failed build

### "APK won't install"
- Enable "Install from Unknown Sources"
- Check if you have space on device
- Try uninstalling previous version first

### "Notifications not working"
- Make sure you're using the APK, not Expo Go
- Check notification permissions in Android settings
- Verify push notification toggle is ON in app settings
- Check device is connected to internet

### "Build is taking too long"
- First builds take 15-20 minutes
- Subsequent builds are faster (5-10 minutes)
- Check build queue: `eas build:list`

## Quick Reference Commands

```bash
# Check build status
eas build:list

# Build preview APK
eas build --profile preview --platform android

# Build development APK (with live updates)
eas build --profile development --platform android

# Cancel a build
eas build:cancel

# View build logs
eas build:view [BUILD_ID]
```

## Cost

- **Free tier:** 30 builds per month
- **Paid tier:** Unlimited builds

For testing, free tier is sufficient.

## Production Build

When ready for production:

```bash
# Build App Bundle for Play Store
eas build --profile production --platform android

# Submit to Play Store
eas submit --platform android
```

## Notes

- **First build:** Takes longer (~15-20 mins)
- **Subsequent builds:** Faster (~5-10 mins)
- **APK size:** Around 50-80 MB
- **Minimum Android:** 5.0 (API 21)
- **Push notifications:** Only work on physical devices, not emulators

## Support

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Build Troubleshooting](https://docs.expo.dev/build-reference/troubleshooting/)
- [Expo Forums](https://forums.expo.dev/)
