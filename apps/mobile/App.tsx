import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text } from 'react-native';
import { AuthProvider } from './contexts/AuthProvider';
import QueryProvider from './providers/QueryProvider';
import { AuthGuard } from './components/auth/AuthGuard';

export default function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <AuthGuard>
          <View style={styles.container}>
            <Text style={styles.text}>認証済みユーザー向けコンテンツ</Text>
            <Text style={styles.subtext}>
              Phase 3でナビゲーションとダッシュボードを実装予定
            </Text>
            <StatusBar style="auto" />
          </View>
        </AuthGuard>
      </AuthProvider>
    </QueryProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
