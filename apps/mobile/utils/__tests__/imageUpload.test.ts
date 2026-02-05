// =============================================================================
// imageUpload.test.ts - 画像アップロードユーティリティのユニットテスト
// =============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest'

// expo-crypto をモック
vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(() => 'mocked-uuid-1234-5678-90ab-cdef12345678'),
}))

// base64ToArrayBuffer をモック
vi.mock('../base64', () => ({
  base64ToArrayBuffer: vi.fn(() => new ArrayBuffer(8)),
}))

import {
  generateUUID,
  uploadImage,
  uploadImages,
  deleteImage,
  deleteImages,
  getImagePublicUrl,
  getExistingImagesFromPaths,
  type ImageBucket,
} from '../imageUpload'
import { randomUUID } from 'expo-crypto'

// Supabaseクライアントのモック作成ヘルパー
function createMockSupabaseClient(options?: {
  uploadError?: Error | null
  removeError?: Error | null
  publicUrl?: string
}) {
  const {
    uploadError = null,
    removeError = null,
    publicUrl = 'https://example.com/storage/test.jpg',
  } = options ?? {}

  return {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: uploadError }),
        remove: vi.fn().mockResolvedValue({ error: removeError }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl } })),
      })),
    },
  } as unknown as Parameters<typeof uploadImage>[0]['supabase']
}

describe('generateUUID', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('expo-cryptoのrandomUUIDを呼び出す', () => {
    const result = generateUUID()
    expect(randomUUID).toHaveBeenCalled()
    expect(result).toBe('mocked-uuid-1234-5678-90ab-cdef12345678')
  })

  it('UUID形式の文字列を返す', () => {
    // モックをリセットして実際の形式をテスト
    const mockUUID = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789'
    vi.mocked(randomUUID).mockReturnValueOnce(mockUUID)

    const result = generateUUID()
    // UUID形式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    expect(result).toMatch(uuidRegex)
  })
})

describe('uploadImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('画像を正常にアップロードできる', async () => {
    const mockSupabase = createMockSupabaseClient({
      publicUrl: 'https://storage.example.com/user1/record1/mocked-uuid.jpg',
    })

    const result = await uploadImage({
      supabase: mockSupabase,
      userId: 'user1',
      recordId: 'record1',
      base64: 'base64encodeddata',
      fileExtension: 'jpg',
      bucket: 'practice-images',
    })

    expect(mockSupabase.storage.from).toHaveBeenCalledWith('practice-images')
    expect(result.path).toBe('user1/record1/mocked-uuid-1234-5678-90ab-cdef12345678.jpg')
    expect(result.publicUrl).toBe('https://storage.example.com/user1/record1/mocked-uuid.jpg')
  })

  it('アップロードエラー時に例外をスローする', async () => {
    const mockSupabase = createMockSupabaseClient({
      uploadError: { message: 'Upload failed' } as Error,
    })

    await expect(
      uploadImage({
        supabase: mockSupabase,
        userId: 'user1',
        recordId: 'record1',
        base64: 'base64encodeddata',
        fileExtension: 'jpg',
        bucket: 'practice-images',
      })
    ).rejects.toThrow('画像のアップロードに失敗しました: Upload failed')
  })

  it('異なるバケットを正しく使用する', async () => {
    const mockSupabase = createMockSupabaseClient()

    await uploadImage({
      supabase: mockSupabase,
      userId: 'user1',
      recordId: 'record1',
      base64: 'base64encodeddata',
      fileExtension: 'png',
      bucket: 'competition-images',
    })

    expect(mockSupabase.storage.from).toHaveBeenCalledWith('competition-images')
  })

  it('各ファイル拡張子に正しいcontent-typeを設定する', async () => {
    const testCases: Array<{ ext: string; expectedType: string }> = [
      { ext: 'jpg', expectedType: 'image/jpeg' },
      { ext: 'jpeg', expectedType: 'image/jpeg' },
      { ext: 'png', expectedType: 'image/png' },
      { ext: 'gif', expectedType: 'image/gif' },
      { ext: 'webp', expectedType: 'image/webp' },
      { ext: 'unknown', expectedType: 'image/jpeg' }, // default
    ]

    for (const { ext, expectedType } of testCases) {
      const uploadMock = vi.fn().mockResolvedValue({ error: null })
      const mockSupabase = {
        storage: {
          from: vi.fn(() => ({
            upload: uploadMock,
            getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/test.jpg' } })),
          })),
        },
      } as unknown as Parameters<typeof uploadImage>[0]['supabase']

      await uploadImage({
        supabase: mockSupabase,
        userId: 'user1',
        recordId: 'record1',
        base64: 'data',
        fileExtension: ext,
        bucket: 'practice-images',
      })

      expect(uploadMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(ArrayBuffer),
        expect.objectContaining({ contentType: expectedType })
      )
    }
  })
})

describe('uploadImages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('複数の画像を正常にアップロードできる', async () => {
    const mockSupabase = createMockSupabaseClient()
    const images = [
      { base64: 'data1', fileExtension: 'jpg' },
      { base64: 'data2', fileExtension: 'png' },
    ]

    const results = await uploadImages(mockSupabase, 'user1', 'record1', images, 'practice-images')

    expect(results).toHaveLength(2)
    expect(results[0].path).toContain('user1/record1/')
    expect(results[1].path).toContain('user1/record1/')
  })

  it('空の配列を渡すと空の配列を返す', async () => {
    const mockSupabase = createMockSupabaseClient()
    const results = await uploadImages(mockSupabase, 'user1', 'record1', [], 'practice-images')
    expect(results).toEqual([])
  })

  it('エラー発生時に成功済み画像をロールバックする', async () => {
    const removeMock = vi.fn().mockResolvedValue({ error: null })
    let uploadCount = 0
    const uploadMock = vi.fn().mockImplementation(() => {
      uploadCount++
      if (uploadCount >= 2) {
        return Promise.resolve({ error: { message: 'Second upload failed' } })
      }
      return Promise.resolve({ error: null })
    })

    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          upload: uploadMock,
          remove: removeMock,
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/test.jpg' } })),
        })),
      },
    } as unknown as Parameters<typeof uploadImage>[0]['supabase']

    const images = [
      { base64: 'data1', fileExtension: 'jpg' },
      { base64: 'data2', fileExtension: 'png' },
      { base64: 'data3', fileExtension: 'gif' },
    ]

    await expect(
      uploadImages(mockSupabase, 'user1', 'record1', images, 'practice-images')
    ).rejects.toThrow()

    // ロールバックで削除が呼ばれることを確認
    expect(removeMock).toHaveBeenCalled()
  })
})

describe('deleteImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('画像を正常に削除できる', async () => {
    const removeMock = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          remove: removeMock,
        })),
      },
    } as unknown as Parameters<typeof deleteImage>[0]

    await deleteImage(mockSupabase, 'user1/record1/image.jpg', 'practice-images')

    expect(mockSupabase.storage.from).toHaveBeenCalledWith('practice-images')
    expect(removeMock).toHaveBeenCalledWith(['user1/record1/image.jpg'])
  })

  it('削除エラー時に例外をスローする', async () => {
    const mockSupabase = createMockSupabaseClient({
      removeError: { message: 'Delete failed' } as Error,
    })

    await expect(
      deleteImage(mockSupabase, 'user1/record1/image.jpg', 'practice-images')
    ).rejects.toThrow('画像の削除に失敗しました: Delete failed')
  })
})

describe('deleteImages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('複数の画像を正常に削除できる', async () => {
    const removeMock = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          remove: removeMock,
        })),
      },
    } as unknown as Parameters<typeof deleteImages>[0]

    const paths = ['user1/record1/image1.jpg', 'user1/record1/image2.jpg']
    await deleteImages(mockSupabase, paths, 'competition-images')

    expect(mockSupabase.storage.from).toHaveBeenCalledWith('competition-images')
    expect(removeMock).toHaveBeenCalledWith(paths)
  })

  it('空の配列を渡すと何もしない', async () => {
    const removeMock = vi.fn()
    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          remove: removeMock,
        })),
      },
    } as unknown as Parameters<typeof deleteImages>[0]

    await deleteImages(mockSupabase, [], 'practice-images')

    expect(removeMock).not.toHaveBeenCalled()
  })

  it('削除エラー時に例外をスローする', async () => {
    const mockSupabase = createMockSupabaseClient({
      removeError: { message: 'Batch delete failed' } as Error,
    })

    await expect(
      deleteImages(mockSupabase, ['path1.jpg', 'path2.jpg'], 'practice-images')
    ).rejects.toThrow('画像の削除に失敗しました: Batch delete failed')
  })
})

describe('getImagePublicUrl', () => {
  it('画像のpublicUrlを正しく返す', () => {
    const expectedUrl = 'https://storage.example.com/bucket/user1/image.jpg'
    const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: expectedUrl } }))
    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          getPublicUrl: getPublicUrlMock,
        })),
      },
    } as unknown as Parameters<typeof getImagePublicUrl>[0]

    const result = getImagePublicUrl(mockSupabase, 'user1/image.jpg', 'practice-images')

    expect(mockSupabase.storage.from).toHaveBeenCalledWith('practice-images')
    expect(getPublicUrlMock).toHaveBeenCalledWith('user1/image.jpg')
    expect(result).toBe(expectedUrl)
  })
})

describe('getExistingImagesFromPaths', () => {
  it('パス配列からid/url付きオブジェクト配列を返す', () => {
    const getPublicUrlMock = vi.fn((path: string) => ({
      data: { publicUrl: `https://storage.example.com/${path}` },
    }))
    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          getPublicUrl: getPublicUrlMock,
        })),
      },
    } as unknown as Parameters<typeof getExistingImagesFromPaths>[0]

    const paths = ['user1/image1.jpg', 'user1/image2.png']
    const result = getExistingImagesFromPaths(mockSupabase, paths, 'practice-images')

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 'user1/image1.jpg',
      url: 'https://storage.example.com/user1/image1.jpg',
    })
    expect(result[1]).toEqual({
      id: 'user1/image2.png',
      url: 'https://storage.example.com/user1/image2.png',
    })
  })

  it('nullを渡すと空の配列を返す', () => {
    const mockSupabase = createMockSupabaseClient()
    const result = getExistingImagesFromPaths(mockSupabase, null, 'practice-images')
    expect(result).toEqual([])
  })

  it('undefinedを渡すと空の配列を返す', () => {
    const mockSupabase = createMockSupabaseClient()
    const result = getExistingImagesFromPaths(mockSupabase, undefined, 'practice-images')
    expect(result).toEqual([])
  })

  it('空の配列を渡すと空の配列を返す', () => {
    const mockSupabase = createMockSupabaseClient()
    const result = getExistingImagesFromPaths(mockSupabase, [], 'practice-images')
    expect(result).toEqual([])
  })
})
