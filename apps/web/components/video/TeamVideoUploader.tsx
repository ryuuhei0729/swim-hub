"use client";

import React, { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { VideoCameraIcon } from "@heroicons/react/24/outline";

const VideoEditor = dynamic(() => import("./VideoEditor"), { ssr: false });

interface TeamVideoUploaderProps {
  targetUserId: string;
  targetUserName: string;
  onVideoReady: (file: File, thumbnail: Blob) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export default function TeamVideoUploader({
  targetUserName,
  onVideoReady,
  onCancel,
  disabled = false,
}: TeamVideoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
  };

  const handleEditorComplete = (editedFile: File, thumbnail: Blob) => {
    onVideoReady(editedFile, thumbnail);
    setSelectedFile(null);
  };

  const handleEditorCancel = () => {
    setSelectedFile(null);
  };

  if (selectedFile) {
    return (
      <VideoEditor
        file={selectedFile}
        onComplete={handleEditorComplete}
        onCancel={handleEditorCancel}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="text-lg font-medium text-gray-900">
          {targetUserName} の動画を選択
        </h3>
        <p className="text-sm text-gray-500">
          動画ファイルを選択して編集・プレビューできます
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <VideoCameraIcon className="h-4 w-4" />
            動画を選択
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/hevc"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    </div>
  );
}
