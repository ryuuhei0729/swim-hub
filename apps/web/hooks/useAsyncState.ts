import { useCallback, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

interface UseAsyncStateReturn<T> extends AsyncState<T> {
  setData: (data: T | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: Error | null) => void
  execute: (asyncFn: () => Promise<T>) => Promise<T | null>
  reset: () => void
}

export function useAsyncState<T = any>(initialData: T | null = null): UseAsyncStateReturn<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    loading: false,
    error: null
  })

  const setData = useCallback((data: T | null) => {
    setState(prev => ({ ...prev, data, error: null }))
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading }))
  }, [])

  const setError = useCallback((error: Error | null) => {
    setState(prev => ({ ...prev, error, loading: false }))
  }, [])

  const execute = useCallback(async (asyncFn: () => Promise<T>): Promise<T | null> => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await asyncFn()
      setData(result)
      return result
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      setError(errorObj)
      return null
    } finally {
      setLoading(false)
    }
  }, [setData, setError, setLoading])

  const reset = useCallback(() => {
    setState({
      data: initialData,
      loading: false,
      error: null
    })
  }, [initialData])

  return {
    ...state,
    setData,
    setLoading,
    setError,
    execute,
    reset
  }
}
