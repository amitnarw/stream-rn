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
import { Check, Radio, Tv } from "lucide-react-native";
import { theme } from "../theme";
import type { PluginProvider } from "../types/plugin";

interface Props {
  visible: boolean;
  onClose: () => void;
  m3uProviders: PluginProvider[];
  csProviders: PluginProvider[];
  activeProvider: string | null;
  onSelect: (name: string) => void;
  onSetDefault?: (name: string) => void;
}

type ListItem =
  | { kind: "header"; key: string; title: string; icon: "radio" | "tv"; count: number }
  | { kind: "row"; key: string; provider: PluginProvider; active: boolean };

const ROW_HEIGHT = 52;

const Row = memo(function Row({
  provider,
  active,
  onSelect,
  onClose,
}: {
  provider: PluginProvider;
  active: boolean;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, active && styles.rowActive]}
      onPress={() => {
        onSelect(provider.name);
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
            {provider.name.substring(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text
          style={[styles.rowText, active && styles.rowTextActive]}
          numberOfLines={1}
        >
          {provider.name}
        </Text>
      </View>
      {active ? (
        <Check size={16} color={theme.colors.accentLight} />
      ) : null}
    </TouchableOpacity>
  );
});

const Header = memo(function Header({
  title,
  icon,
  count,
}: {
  title: string;
  icon: "radio" | "tv";
  count: number;
}) {
  const Icon = icon === "radio" ? Radio : Tv;
  return (
    <View style={styles.groupHeader}>
      <Icon size={12} color={theme.colors.accentLight} />
      <Text style={styles.groupTitle}>{title}</Text>
      <Text style={styles.groupCount}>{count}</Text>
    </View>
  );
});

export default function ProviderPickerSheet({
  visible,
  onClose,
  m3uProviders,
  csProviders,
  activeProvider,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();

  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    if (m3uProviders.length > 0) {
      out.push({
        kind: "header",
        key: "h_m3u",
        title: "M3U SOURCES",
        icon: "radio",
        count: m3uProviders.length,
      });
      m3uProviders.forEach((p) =>
        out.push({
          kind: "row",
          key: `m3u_${p.id}_${p.name}`,
          provider: p,
          active: p.name === activeProvider,
        })
      );
    }
    if (csProviders.length > 0) {
      out.push({
        kind: "header",
        key: "h_cs",
        title: "CLOUDSTREAM PLUGINS",
        icon: "tv",
        count: csProviders.length,
      });
      csProviders.forEach((p) =>
        out.push({
          kind: "row",
          key: `cs_${p.id}_${p.name}`,
          provider: p,
          active: p.name === activeProvider,
        })
      );
    }
    return out;
  }, [m3uProviders, csProviders, activeProvider]);

  const noResults = items.length === 0;

  const getItemLayout = useMemo(() => {
    const offsets: { offset: number; length: number; index: number }[] = [];
    let offset = 0;
    items.forEach((it, i) => {
      const length = it.kind === "header" ? 36 : ROW_HEIGHT;
      offsets.push({ offset, length, index: i });
      offset += length;
    });
    return (_: ArrayLike<ListItem> | null | undefined, index: number) =>
      offsets[index] || { offset: 0, length: ROW_HEIGHT, index };
  }, [items]);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === "header") {
      return (
        <Header title={item.title} icon={item.icon} count={item.count} />
      );
    }
    return (
      <Row
        provider={item.provider}
        active={item.active}
        onSelect={onSelect}
        onClose={onClose}
      />
    );
  };

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
              <Text style={styles.title}>Select IPTV Provider</Text>
              <Text style={styles.subtitle}>
                Tap a provider to load its channels.
              </Text>
            </View>
          </View>

          {noResults ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                No providers available yet.
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(it) => it.key}
              renderItem={renderItem}
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
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
    height: 36,
  },
  groupTitle: {
    color: "#8E8D92",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  groupCount: {
    color: "#8E8D92",
    fontSize: 10,
    fontWeight: "700",
    marginLeft: "auto",
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
