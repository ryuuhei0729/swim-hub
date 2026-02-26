"use client";

import { ArrowLeftIcon } from "@heroicons/react/24/outline";

export function BackButton() {
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      className="inline-flex items-center text-sm text-gray-600 hover:text-blue-600 transition-colors mb-6"
    >
      <ArrowLeftIcon className="w-4 h-4 mr-2" />
      戻る
    </button>
  );
}
