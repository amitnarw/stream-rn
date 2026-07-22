import { Dimensions, Platform, StyleSheet, View } from "react-native";
import React from "react";
import { BlurView, type BlurViewProps } from "expo-blur";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  Extrapolation,
  useAnimatedProps,
  runOnJS,
  interpolateColor,
  SharedValue,
} from "react-native-reanimated";
import { theme } from "../theme";

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView as any);

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ITEM_WIDTH = SCREEN_WIDTH * 0.75;
const SPACING = 20;
const SIDE_SPACING = (SCREEN_WIDTH - ITEM_WIDTH) / 2;

export interface BlurCarouselItemProps<ItemT> {
  item: ItemT;
  index: number;
  dataLength: number;
  scrollX: SharedValue<number>;
  renderItem: (info: { item: ItemT; index: number }) => React.ReactNode;
  itemWidth?: number;
  spacing?: number;
  cardWidth?: number;
  cardHeight?: number;
  borderRadius?: number;
}

export interface BlurCarouselProps<ItemT> {
  data: ItemT[];
  renderItem: (info: { item: ItemT; index: number }) => React.ReactNode;
  horizontalSpacing?: number;
  itemWidth?: number;
  spacing?: number;
  cardWidth?: number;
  cardHeight?: number;
  borderRadius?: number;
  onIndexChange?: (index: number) => void;
}

const CarouselItem = React.memo(
  function CarouselItem<ItemT,>({
    item,
    index,
    dataLength,
    scrollX,
    renderItem,
    itemWidth = ITEM_WIDTH,
    spacing = SPACING,
    cardWidth,
    cardHeight,
    borderRadius = 20,
  }: BlurCarouselItemProps<ItemT>) {
    const animatedStyle = useAnimatedStyle(() => {
      const inputRange = [
        (index - 1) * itemWidth,
        index * itemWidth,
        (index + 1) * itemWidth,
      ];
      const scale = interpolate(
        scrollX.value,
        inputRange,
        [0.85, 1, 0.85],
        Extrapolation.CLAMP,
      );
      const opacity = interpolate(
        scrollX.value,
        inputRange,
        [0.5, 1, 0.5],
        Extrapolation.CLAMP,
      );
      return {
        transform: [{ scale }],
        opacity,
      };
    });

    const animatedBlurProps = useAnimatedProps<any>(() => {
      const inputRange = [
        (index - 1) * itemWidth,
        index * itemWidth,
        (index + 1) * itemWidth,
      ];
      const blurIntensity = interpolate(
        scrollX.value,
        inputRange,
        [25, 0, 25],
        Extrapolation.CLAMP,
      );
      return {
        intensity: blurIntensity,
      };
    });

    const animateAndroidStylez = useAnimatedStyle(() => {
      return {
        filter: [
          {
            blur: interpolate(
              scrollX.value,
              [
                (index - 1) * itemWidth,
                index * itemWidth,
                (index + 1) * itemWidth,
              ],
              [25, 0, 25],
              Extrapolation.CLAMP,
            ),
          },
        ],
      };
    });

    const actualCardWidth = cardWidth ?? (itemWidth - spacing * 2);
    const actualCardHeight = cardHeight;

    return (
      <Animated.View
        style={[
          styles.itemContainer,
          animatedStyle,
          {
            width: itemWidth,
            overflow: "visible",
          },
        ]}
      >
        <Animated.View
          style={[
            styles.itemContent,
            {
              width: actualCardWidth,
              height: actualCardHeight,
              borderRadius: borderRadius,
            },
            Platform.OS === "android" ? animateAndroidStylez : null,
          ]}
        >
          {renderItem({ item, index: index % dataLength })}
          {Platform.OS === "ios" ? (
            <AnimatedBlurView
              style={[StyleSheet.absoluteFillObject, { borderRadius }]}
              tint="light"
              animatedProps={animatedBlurProps}
            />
          ) : null}
        </Animated.View>
      </Animated.View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.index === nextProps.index &&
      prevProps.dataLength === nextProps.dataLength &&
      prevProps.itemWidth === nextProps.itemWidth &&
      prevProps.spacing === nextProps.spacing &&
      prevProps.cardWidth === nextProps.cardWidth &&
      prevProps.cardHeight === nextProps.cardHeight &&
      prevProps.borderRadius === nextProps.borderRadius &&
      (prevProps.item as any).url === (nextProps.item as any).url
    );
  }
) as <ItemT,>(props: BlurCarouselItemProps<ItemT>) => React.JSX.Element;

export const BlurCarousel = <ItemT,>({
  data,
  renderItem,
  horizontalSpacing = SIDE_SPACING,
  itemWidth = ITEM_WIDTH,
  spacing = SPACING,
  cardWidth,
  cardHeight,
  borderRadius,
  onIndexChange,
}: BlurCarouselProps<ItemT>) => {
  const N = data.length;
  const initialOffset = N > 1 ? N * itemWidth : 0;

  const scrollX = useSharedValue<number>(initialOffset);
  const activeIndex = useSharedValue<number>(0);
  const flatListRef = React.useRef<any>(null);

  const loopData = N > 1 ? [...data, ...data, ...data] : data;

  const [initialScrolled, setInitialScrolled] = React.useState(false);

  const dataKey = React.useMemo(() => data.map((d: any) => d.url || d.id || "").join(","), [data]);

  React.useEffect(() => {
    scrollX.value = N > 1 ? N * itemWidth : 0;
    setInitialScrolled(false);
  }, [dataKey, N, itemWidth]);

  const handleContentSizeChange = React.useCallback(() => {
    if (!initialScrolled && N > 1 && flatListRef.current) {
      setInitialScrolled(true);
      scrollX.value = N * itemWidth;
      flatListRef.current.scrollToOffset({
        offset: N * itemWidth,
        animated: false,
      });
    }
  }, [initialScrolled, N, itemWidth]);

  const handleScrollEnd = React.useCallback((event: any) => {
    if (N <= 1) return;
    const offsetX = event.nativeEvent.contentOffset.x;
    const indexInLoop = Math.max(
      0,
      Math.min(Math.round(offsetX / itemWidth), loopData.length - 1)
    );
    if (indexInLoop < N) {
      flatListRef.current?.scrollToOffset({ offset: (indexInLoop + N) * itemWidth, animated: false });
    } else if (indexInLoop >= 2 * N) {
      flatListRef.current?.scrollToOffset({ offset: (indexInLoop - N) * itemWidth, animated: false });
    }
  }, [N, itemWidth, loopData.length]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      if (N <= 1) {
        const index = Math.max(
          0,
          Math.min(Math.round(event.contentOffset.x / itemWidth), data.length - 1)
        );
        if (index !== activeIndex.value) {
          activeIndex.value = index;
          if (onIndexChange) {
            runOnJS(onIndexChange)(index);
          }
        }
        return;
      }
      
      const indexInLoop = Math.max(
        0,
        Math.min(Math.round(event.contentOffset.x / itemWidth), loopData.length - 1)
      );
      const originalIndex = indexInLoop % N;
      if (originalIndex !== activeIndex.value) {
        activeIndex.value = originalIndex;
        if (onIndexChange) {
          runOnJS(onIndexChange)(originalIndex);
        }
      }
    },
  });

  return (
    <View style={{ alignItems: "center" }}>
      <Animated.FlatList
        ref={flatListRef}
        data={loopData}
        contentOffset={{ x: initialOffset, y: 0 }}
        getItemLayout={(_, index) => ({
          length: itemWidth,
          offset: itemWidth * index,
          index,
        })}
        initialScrollIndex={N > 1 ? N : 0}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(_, index) => index.toString()}
        horizontal
        pagingEnabled={false}
        snapToInterval={itemWidth}
        decelerationRate="fast"
        contentContainerStyle={{
          paddingHorizontal: horizontalSpacing,
        }}
        style={{ flexGrow: 0 }}
        onContentSizeChange={handleContentSizeChange}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        initialNumToRender={loopData.length}
        maxToRenderPerBatch={loopData.length}
        windowSize={loopData.length}
        removeClippedSubviews={false}
        renderItem={({ item, index }) => (
          <CarouselItem
            item={item}
            index={index}
            dataLength={N}
            scrollX={scrollX}
            renderItem={renderItem}
            itemWidth={itemWidth}
            spacing={spacing}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            borderRadius={borderRadius}
          />
        )}
      />

      {N > 1 && (
        <View style={styles.dotsContainer}>
          {data.map((_, i) => {
            const dotStyle = useAnimatedStyle(() => {
              const inputRange = [
                (i + N - 1) * itemWidth,
                (i + N) * itemWidth,
                (i + N + 1) * itemWidth,
              ];
              const width = interpolate(
                scrollX.value,
                inputRange,
                [8, 14, 8],
                Extrapolation.CLAMP
              );
              const opacity = interpolate(
                scrollX.value,
                inputRange,
                [0.4, 1.0, 0.4],
                Extrapolation.CLAMP
              );
              return {
                width,
                opacity,
                backgroundColor: interpolateColor(
                  scrollX.value,
                  inputRange,
                  ['rgba(255,255,255,0.2)', theme.colors.accent, 'rgba(255,255,255,0.2)'],
                )
              };
            });
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  dotStyle,
                ]}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  itemContent: {
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    marginBottom: 16,
    height: 6,
  },
  dot: {
    height: 4,
    borderRadius: 2,
    marginHorizontal: 3,
  },
});
