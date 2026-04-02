import { registerRootComponent } from 'expo';
import { enableScreens } from 'react-native-screens';

// Disable native screens to work around react-native-screens v4 crash on
// Android New Architecture (java.lang.String cannot be cast to java.lang.Boolean).
// Safe to re-enable once the upstream issue is resolved.
enableScreens(false);

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
