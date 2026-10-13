import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScanScreen } from '../screens/ScanScreen';
import { AddEditProductScreen } from '../screens/AddEditProductScreen';
import { ProductDetailsScreen } from '../screens/ProductDetailsScreen';
import { LogUsageScreen } from '../screens/LogUsageScreen';
import { InventoryScreen } from '../screens/InventoryScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { HomeMainScreen } from '../screens/HomeMainScreen';
import { FieldDetailScreen } from '../screens/FieldDetailScreen';
import { SchemesScreen } from '../screens/SchemesScreen';
import { LoansScreen } from '../screens/LoansScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { getProfile } from '../db/database';
import { subscribeAuthChanged } from '../store/authBus';
import { FieldCrop } from '../db/types';
import { theme } from '../theme';

// Legacy flat routes (kept for deep compat; Home removed — HomeMain is the entry).
export type RootStackParamList = {
  Scan: { crop?: FieldCrop | 'All' } | undefined;
  AddEdit: { barcode?: string; productId?: string; scannedText?: string };
  Details: { productId: string };
  LogUsage: { productId: string; crop?: string };
  Inventory: undefined;
  Reports: undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
  FieldDetail: { crop: FieldCrop | 'All' };
  Scan: { crop?: FieldCrop | 'All' } | undefined;
  AddEdit: { barcode?: string; productId?: string; scannedText?: string };
  Details: { productId: string };
  LogUsage: { productId: string; crop?: string };
  Inventory: undefined;
  Reports: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();
const Tab = createBottomTabNavigator();

const screenOpts = {
  headerStyle: { backgroundColor: theme.colors.primary },
  headerTintColor: '#fff',
  headerTitleStyle: { fontSize: 22, fontWeight: 'bold' },
} as const;

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={screenOpts}>
      <Stack.Screen name="HomeMain" component={HomeMainScreen} options={{ title: 'Farm Tracker' }} />
      <Stack.Screen name="FieldDetail" component={FieldDetailScreen} options={({ route }) => ({ title: route.params?.crop ?? 'Field' })} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan Product' }} />
      <Stack.Screen name="AddEdit" component={AddEditProductScreen} options={{ title: 'Product Form' }} />
      <Stack.Screen name="Details" component={ProductDetailsScreen} options={{ title: 'Product Details' }} />
      <Stack.Screen name="LogUsage" component={LogUsageScreen} options={{ title: 'Log Usage' }} />
      <Stack.Screen name="Inventory" component={InventoryScreen} options={{ title: 'My Products' }} />
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  async function check() {
    try {
      const p = await getProfile();
      // Login gate: both onboarding AND a verified OTP number are required,
      // so profiles created under the old no-verify flow log in once.
      setOnboarded(p.onboarded && p.phoneVerified);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => { check(); }, []);
  useEffect(() => subscribeAuthChanged(check), []);

  if (!ready) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator size="large" /></View>;

  return (
    <NavigationContainer>
      {!onboarded ? (
        <LoginScreen onDone={() => setOnboarded(true)} />
      ) : (
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: true,
            tabBarActiveTintColor: theme.colors.accent,
            tabBarInactiveTintColor: '#FFFFFF',
            tabBarLabelStyle: { fontSize: 16, fontWeight: '700' },
            tabBarIconStyle: { marginBottom: -2 },
            tabBarStyle: {
              height: 76,
              paddingBottom: 12,
              paddingTop: 8,
              backgroundColor: theme.colors.primary,
              borderTopWidth: 1,
              borderTopColor: theme.colors.primaryDark,
            },
          }}
        >
          <Tab.Screen
            name="HomeTab"
            component={HomeStack}
            options={{
              title: 'Home',
              tabBarLabel: 'Home',
              tabBarAccessibilityLabel: 'Home, హోమ్',
              tabBarIcon: ({ color }) => (
                <Ionicons name="leaf" size={28} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Schemes"
            component={SchemesScreen}
            options={{
              title: 'Schemes',
              tabBarLabel: 'Schemes',
              tabBarAccessibilityLabel: 'Schemes, పథకాలు',
              tabBarIcon: ({ color }) => (
                <Ionicons name="trophy" size={28} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Loans"
            component={LoansScreen}
            options={{
              title: 'Loans',
              tabBarLabel: 'Loans',
              tabBarAccessibilityLabel: 'Loans, రుణాలు',
              tabBarIcon: ({ color }) => (
                <Ionicons name="card" size={28} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Account"
            component={AccountScreen}
            options={{
              title: 'Account',
              tabBarLabel: 'Account',
              tabBarAccessibilityLabel: 'Account, ఖాతా',
              tabBarIcon: ({ color }) => (
                <Ionicons name="settings" size={28} color={color} />
              ),
            }}
          />
        </Tab.Navigator>
      )}
    </NavigationContainer>
  );
}
