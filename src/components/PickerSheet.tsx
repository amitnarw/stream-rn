import React, { memo, useMemo } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  options: string[];
  activeOption: string | null;
  onSelect: (option: string) => void;
}

const ROW_HEIGHT = 52;

const Row = memo(function Row({
  option,
  active,
  onSelect,
  onClose,
}: {
  option: string;
  active: boolean;
  onSelect: (option: string) => void;
  onClose: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, active && styles.rowActive]}
      onPress={() => {
        onSelect(option);
        onClose();
      }}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.rowBadge, active && styles.rowBadgeActive]}>
          <Text
            style={[
              styles.rowBadgeText,
              active && styles.rowBadgeTextActive,
            ]}
          >
            {option.substring(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text
          style={[styles.rowText, active && styles.rowTextActive]}
          numberOfLines={1}
        >
          {option}
        </Text>
      </View>
      {active ? <Check size={16} color={theme.colors.accentLight} /> : null}
    </TouchableOpacity>
  );
});

export default function PickerSheet({
  visible,
  onClose,
  title,
  subtitle,
  options,
  activeOption,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();

  const getItemLayout = useMemo(() => {
    return (_: ArrayLike<string> | null | undefined, index: number) => ({
      offset: index * ROW_HEIGHT,
      length: ROW_HEIGHT,
      index,
    });
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 0) },
          ]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? (
                <Text style={styles.subtitle}>{subtitle}</Text>
              ) : null}
            </View>
          </View>

          {options.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No options available.</Text>
            </View>
          ) : (
            <FlatList
              data={options}
              keyExtractor={(item, idx) => item + "_" + idx}
              renderItem={({ item }) => (
                <Row
                  option={item}
                  active={item === activeOption}
                  onSelect={onSelect}
                  onClose={onClose}
                />
              )}
              getItemLayout={getItemLayout}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingBottom: 12 }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0F0F14",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 20,
    paddingTop: 8,
    height: 540,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  subtitle: {
    color: "#8E8D92",
    fontSize: 11,
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
    height: ROW_HEIGHT,
  },
  rowActive: {
    backgroundColor: "rgba(0, 71, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(0, 71, 255, 0.35)",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  rowBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowBadgeActive: {
    backgroundColor: "rgba(0, 71, 255, 0.25)",
    borderColor: "rgba(0, 71, 255, 0.5)",
  },
  rowBadgeText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "800",
  },
  rowBadgeTextActive: {
    color: "#fff",
  },
  rowText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  rowTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  empty: {
    alignItems: "center",
    padding: 30,
  },
  emptyText: {
    color: "#8E8D92",
    fontSize: 13,
  },
});
