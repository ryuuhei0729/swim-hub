import React, { Component, ErrorInfo, ReactNode } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * エラーバウンダリコンポーネント
 * アプリ全体のエラーをキャッチして表示
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error,
      errorInfo,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.title}>エラーが発生しました</Text>
            <Text style={styles.message}>
              {this.state.error?.message || '不明なエラーが発生しました'}
            </Text>
            {__DEV__ && this.state.error && (
              <ScrollView style={styles.stackTrace}>
                <Text style={styles.stackTraceText}>
                  {this.state.error.stack}
                </Text>
                {this.state.errorInfo && (
                  <Text style={styles.stackTraceText}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      )
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    maxWidth: 400,
    width: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#DC2626',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 16,
  },
  stackTrace: {
    maxHeight: 200,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    padding: 12,
    marginTop: 12,
  },
  stackTraceText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#6B7280',
  },
})
