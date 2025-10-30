import { useCallback, useState } from 'react'
import { Area } from 'react-easy-crop'

interface UseImageCropProps {
  onCropComplete: (croppedFile: File) => void
  onCancel: () => void
}

export const useImageCrop = ({ onCropComplete, onCancel }: UseImageCropProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSave = useCallback(async (imageSrc: string, fileName: string) => {
    if (!croppedAreaPixels) return

    setIsProcessing(true)
    try {
      // 画像を読み込み
      const { createImage, getCroppedImg } = await import('../utils/imageUtils')
      const image = await createImage(imageSrc)
      
      // トリミング実行
      const croppedFile = await getCroppedImg(
        image,
        croppedAreaPixels,
        fileName
      )

      onCropComplete(croppedFile)
    } catch (error) {
      console.error('画像トリミングエラー:', error)
    } finally {
      setIsProcessing(false)
    }
  }, [croppedAreaPixels, onCropComplete])

  const handleCancel = useCallback(() => {
    onCancel()
  }, [onCancel])

  const resetCrop = useCallback(() => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
  }, [])

  return {
    crop,
    setCrop,
    zoom,
    setZoom,
    croppedAreaPixels,
    isProcessing,
    handleCropComplete,
    handleSave,
    handleCancel,
    resetCrop
  }
}
