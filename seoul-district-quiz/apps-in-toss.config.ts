import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'seoul-district-quiz',
  brand: {
    primaryColor: '#A9433D',
  },
  navigationBar: {
    withBackButton: false,
    withHomeButton: false,
    withTitle: false,
    transparentBackground: true,
  },
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
  },
  permissions: [],
  webBundleDir: 'dist',
});
