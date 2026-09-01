import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'seoul-district-quiz',
  brand: {
    primaryColor: '#A9433D',
  },
  webViewProps: {
    type: 'game',
  },
  permissions: [],
  webBundleDir: 'dist',
});
