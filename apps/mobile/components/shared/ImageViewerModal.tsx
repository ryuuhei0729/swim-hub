import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Dimensions,
  SafeAreaView,
} from "react-native";
import { Image } from "expo-image";

interface ImageViewerModalProps {
  images: { uri: string }[];
  visible: boolean;
  initialIndex?: number;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const VIEWABILITY_CONFIG = { viewAreaCoveragePercentThreshold: 50 };

function clampIndex(index: number | undefined, length: number): number {
  if (length === 0) return 0;
  if (index == null || index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  images,
  visible,
  initialIndex,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(() =>
    clampIndex(initialIndex, images.length),
  );
  const flatListRef = useRef<FlatList>(null);
  const prevVisibleRef = useRef(false);

  // visible が false → true に切り替わった瞬間にインデックスとスクロール位置を同期する
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      const idx = clampIndex(initialIndex, images.length);
      setCurrentIndex(idx);
      // setState 後の次フレームでスクロールを実行する
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToIndex({ index: idx, animated: false });
      });
    }
    prevVisibleRef.current = visible;
  }, [visible, initialIndex, images.length]);

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    [],
  );

  if (images.length === 0) {
    return (
      <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
        <View style={styles.container}>
          <SafeAreaView style={styles.safeArea}>
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityLabel="閉じる">
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <Text style={styles.indexText}>
              {currentIndex + 1} / {images.length}
            </Text>
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityLabel="閉じる">
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>
        </SafeAreaView>

        <FlatList
          ref={flatListRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={clampIndex(initialIndex, images.length)}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          keyExtractor={(item, index) => `${item.uri}-${index}`}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={VIEWABILITY_CONFIG}
          renderItem={({ item }) => (
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: item.uri }}
                style={styles.image}
                contentFit="contain"
                transition={200}
              />
            </View>
          )}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  safeArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  indexText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    padding: 8,
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
});
