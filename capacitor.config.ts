import type { CapacitorConfig } from '@capacitor/cli'

const APP_NAME = 'تطبيق خروج متوسطة وثانوية نخبة الشمال الأهلية'

const config: CapacitorConfig = {
  appId: 'sa.isteathan.app',
  appName: APP_NAME,
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    backgroundColor: '#0b1f3f',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#0b1f3f',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0b1f3f',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#0b1f3f',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      iconColor: '#0b1f3f',
    },
  },
}

export default config
