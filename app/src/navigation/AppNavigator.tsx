import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import SearchScreen from '../screens/SearchScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ExportScreen from '../screens/ExportScreen';
import SettingsScreen from '../screens/SettingsScreen';

type TabParamList = {
  Search: undefined;
  History: undefined;
  Export: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof TabParamList, { focused: IoniconName; unfocused: IoniconName }> = {
  Search:   { focused: 'search',          unfocused: 'search-outline' },
  History:  { focused: 'time',            unfocused: 'time-outline' },
  Export:   { focused: 'share-social',    unfocused: 'share-social-outline' },
  Settings: { focused: 'settings',        unfocused: 'settings-outline' },
};

export default function AppNavigator() {
  const { theme, colorScheme } = useTheme();
  console.log(`[YidDict] AppNavigator: rendering (colorScheme=${colorScheme})`);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarIcon: ({ focused, size }) => {
          const icons = TAB_ICONS[route.name as keyof TabParamList];
          const name = focused ? icons.focused : icons.unfocused;
          return <Ionicons name={name} size={size} color={focused ? theme.primary : theme.textSecondary} />;
        },
      })}
    >
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Export" component={ExportScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
