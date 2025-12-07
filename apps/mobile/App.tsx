import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { AuthProvider } from './contexts/AuthProvider';
import QueryProvider from './providers/QueryProvider';
import { LoginScreen } from './screens/LoginScreen';

export default function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <View style={styles.container}>
          <LoginScreen />
          <StatusBar style="auto" />
        </View>
      </AuthProvider>
    </QueryProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
});
