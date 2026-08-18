import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.ygmeh.gptimageplayground',
  appName: 'GPT Image Playground',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    allowNavigation: ['https://*/*'],
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
