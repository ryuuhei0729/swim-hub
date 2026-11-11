"use client";

// =============================================================================
// BottomDock - スクロールの外 (画面下端・キーボードの真上) に部品を出すための小さなポータル
// =============================================================================
//
// ホームのベストタイム表の入力モードで使う。入力欄を表の下 (スクロールの中) に置くと、
// 表・入力欄・キーボードが1画面に収まらず、見出しの行 (水路・引き継ぎ) が画面外に押し出されていた。
// 入力欄はキーボードの真上に固定し、表はスクロールで見せる。
//
// 画面側に BottomDockHost を1つ置き、その子孫から BottomDockPortal で中身を渡す。
// Host は自分の state だけを更新するので、入力のたびに画面全体を再描画しない。
// Host が無い (テストなど) ときは、Portal はその場にそのまま描画する。

import React, { createContext, useContext, useEffect, useState } from "react";
import { View, StyleSheet, type LayoutChangeEvent } from "react-native";

export type BottomDockSetter = (node: React.ReactNode | null) => void;

export interface BottomDockApi {
  set: BottomDockSetter;
}

const BottomDockContext = createContext<BottomDockApi | null>(null);

export const BottomDockProvider = BottomDockContext.Provider;

/** 子要素を BottomDockHost に出す。Host が無ければその場に出す */
export const BottomDockPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const api = useContext(BottomDockContext);
  // 描画のたびに最新の中身を渡す (入力中の値やエラー表示を反映するため)
  useEffect(() => {
    api?.set(children);
  });
  useEffect(() => () => api?.set(null), [api]);
  return api ? null : <>{children}</>;
};

export interface BottomDockHostProps {
  /** Host の setter を画面側に渡す (BottomDockProvider の value を組み立てるのに使う) */
  register: (setter: BottomDockSetter | null) => void;
  /** 画面の下端からの距離 (キーボードの真上、キーボードが無ければタブバーの上) */
  bottom: number;
  /** 中身の高さ (0 = 何も出していない)。スクロールの下端の余白に使う */
  onHeightChange: (height: number) => void;
}

export const BottomDockHost: React.FC<BottomDockHostProps> = ({
  register,
  bottom,
  onHeightChange,
}) => {
  const [node, setNode] = useState<React.ReactNode | null>(null);

  useEffect(() => {
    register(setNode);
    return () => register(null);
  }, [register]);

  useEffect(() => {
    if (node === null) onHeightChange(0);
  }, [node, onHeightChange]);

  if (node === null) return null;
  return (
    <View
      style={[styles.dock, { bottom }]}
      onLayout={(e: LayoutChangeEvent) => onHeightChange(e.nativeEvent.layout.height)}
    >
      {node}
    </View>
  );
};

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
