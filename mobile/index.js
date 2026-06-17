import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';
import AlarmRingingScreen from './src/screens/AlarmRingingScreen';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

AppRegistry.registerComponent('AlarmRinging', () => AlarmRingingScreen);
