import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Download, ChevronUp, ChevronDown } from "lucide-react-native";

import { styles } from "../screens/DetailScreen.styles";
import { theme } from "../theme";
import { parseAudioLanguages } from "../utils/detailHelpers";

interface TorrentAccordionProps {
  torrentSources: any[];
  renderRow: (source: any, idx: number) => React.ReactNode;
  alwaysExpanded?: boolean;
}

export function TorrentAccordion({
  torrentSources,
  renderRow,
  alwaysExpanded = false,
}: TorrentAccordionProps) {
  const [accordionHeight, setAccordionHeight] = useState(0);
  const [torrentExpanded, setTorrentExpanded] = useState(alwaysExpanded);
  const accordionExpandShared = useSharedValue(0);

  const [selectedAudio, setSelectedAudio] = useState("All Audios");
  const [selectedSort, setSelectedSort] = useState("Highest Seeders");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [renderLimit, setRenderLimit] = useState(15);

  useEffect(() => {
    setRenderLimit(15);
    const timer = setTimeout(() => {
      setRenderLimit(100);
    }, 120);
    return () => clearTimeout(timer);
  }, [torrentSources, selectedAudio, selectedSort]);

  useEffect(() => {
    if (alwaysExpanded) {
      setTorrentExpanded(true);
    }
  }, [alwaysExpanded]);

  useEffect(() => {
    accordionExpandShared.value = withTiming(torrentExpanded ? 1 : 0, {
      duration: 250,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    });
  }, [torrentExpanded]);

  const accordionAnimatedStyle = useAnimatedStyle(() => ({
    height: accordionExpandShared.value * accordionHeight,
    opacity: accordionExpandShared.value,
    overflow: "hidden",
  }));

  const audioOptions = useMemo(() => {
    const set = new Set<string>();
    torrentSources.forEach((s: any) => {
      parseAudioLanguages(s.host || "")
        .split(",")
        .map((x: string) => x.trim())
        .forEach((l: string) => {
          if (l && l !== "—") set.add(l);
        });
    });
    return ["All Audios", ...Array.from(set).sort()];
  }, [torrentSources]);

  const parseSizeInMB = (host: string): number => {
    const sizeMatch = host.match(/💾\s*([\d.]+)\s*([MGB]+)/i);
    if (!sizeMatch) return 0;
    const val = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toUpperCase();
    if (unit.includes("G")) return val * 1024;
    return val;
  };

  const visibleSources = useMemo(() => {
    // 1. Filter by audio language
    let filtered = torrentSources;
    if (selectedAudio !== "All Audios") {
      filtered = torrentSources.filter((s: any) =>
        parseAudioLanguages(s.host || "")
          .split(",")
          .map((x: string) => x.trim())
          .includes(selectedAudio),
      );
    }

    // 2. Sort the filtered sources
    const sorted = [...filtered];
    if (selectedSort === "Highest Seeders") {
      sorted.sort(
        (a, b) => ((b as any).seeders ?? 0) - ((a as any).seeders ?? 0),
      );
    } else if (selectedSort === "Largest Size") {
      sorted.sort(
        (a, b) => parseSizeInMB(b.host || "") - parseSizeInMB(a.host || ""),
      );
    } else if (selectedSort === "Smallest Size") {
      sorted.sort(
        (a, b) => parseSizeInMB(a.host || "") - parseSizeInMB(b.host || ""),
      );
    }

    return sorted;
  }, [torrentSources, selectedAudio, selectedSort]);

  if (torrentSources.length === 0) return null;

  const renderContent = () => {
    return (
      <View style={{ width: "100%" }}>
        {/* Single horizontal row containing scrollable audio filters on left, and sort dropdown on right */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
            marginBottom: 10,
            paddingHorizontal: 16,
            zIndex: 9999,
          }}
        >
          {/* Horizontal Audio Filter Pills (takes remaining space on left) */}
          {audioOptions.length > 1 ? (
            <View style={{ flex: 1, marginRight: 8, height: 26 }}>
              <MaskedView
                style={{ width: "100%", height: "100%" }}
                maskElement={
                  <LinearGradient
                    colors={["transparent", "black", "black", "transparent"]}
                    locations={[0, 0.08, 0.92, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                }
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}
                >
                  {audioOptions.map((lang) => {
                    const isActive = selectedAudio === lang;
                    return (
                      <TouchableOpacity
                        key={lang}
                        style={[
                          styles.langFilterChip,
                          isActive && styles.langFilterChipActive,
                          {
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 12,
                          },
                        ]}
                        onPress={() => setSelectedAudio(lang)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.langFilterText,
                            isActive && styles.langFilterTextActive,
                            { fontSize: 10 },
                          ]}
                        >
                          {lang === "All Audios" ? "All" : lang}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </MaskedView>
            </View>
          ) : null}

          {/* Sort Dropdown on Right */}
          <View style={{ position: "relative", zIndex: 99999 }}>
            <TouchableOpacity
              style={[
                styles.seasonSelector,
                {
                  minWidth: 95,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  height: 28,
                  marginTop: 0,
                },
              ]}
              activeOpacity={0.7}
              onPress={() => setShowSortDropdown((v) => !v)}
            >
              <Text style={[styles.seasonText, { fontSize: 10 }]}>
                {selectedSort === "Highest Seeders"
                  ? "Seeders"
                  : selectedSort === "Largest Size"
                    ? "Size 💾"
                    : "Size 💾 Min"}
              </Text>
              <Text style={[styles.seasonIcon, { fontSize: 8, marginLeft: 4 }]}>
                ▼
              </Text>
            </TouchableOpacity>

            {showSortDropdown && (
              <View
                style={[
                  styles.floatingDropdown,
                  {
                    position: "absolute",
                    top: 32,
                    right: 0,
                    width: 140,
                    zIndex: 999999,
                  },
                ]}
              >
                <LinearGradient
                  colors={["#1c1c22", "#0f0f12"]}
                  style={StyleSheet.absoluteFillObject}
                />
                {[
                  { label: "Seeders", value: "Highest Seeders" },
                  { label: "Size (Max)", value: "Largest Size" },
                  { label: "Size (Min)", value: "Smallest Size" },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.dropdownItem,
                      selectedSort === opt.value && styles.dropdownItemSelected,
                      { paddingVertical: 8, paddingHorizontal: 12 },
                    ]}
                    onPress={() => {
                      setSelectedSort(opt.value);
                      setShowSortDropdown(false);
                    }}
                  >
                    <Text style={[styles.seasonText, { fontSize: 11 }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {visibleSources
          .slice(0, renderLimit)
          .map((source, idx) => renderRow(source, idx))}
        {visibleSources.length > renderLimit && (
          <Text
            style={{
              color: "rgba(255,255,255,0.3)",
              textAlign: "center",
              marginVertical: 14,
              fontSize: 10,
              fontWeight: "600",
              letterSpacing: 0.5,
            }}
          >
            SHOWING TOP {renderLimit} OF {visibleSources.length} LINKS
          </Text>
        )}
      </View>
    );
  };

  if (alwaysExpanded) {
    return renderContent();
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setTorrentExpanded((v) => !v)}
        style={[
          styles.accordionHeader,
          torrentExpanded && styles.accordionHeaderActive,
        ]}
        activeOpacity={0.8}
      >
        <Download
          size={18}
          color={theme.colors.rose}
          strokeWidth={2}
          style={{ marginRight: 10 }}
        />
        <Text style={styles.accordionTitle}>
          Torrent & Magnet Links ({torrentSources.length} found)
        </Text>
        {torrentExpanded ? (
          <ChevronUp size={18} color="#a0a0a5" strokeWidth={2} />
        ) : (
          <ChevronDown size={18} color="#a0a0a5" strokeWidth={2} />
        )}
      </TouchableOpacity>

      <Animated.View style={accordionAnimatedStyle}>
        <View
          onLayout={(e) => {
            const { height } = e.nativeEvent.layout;
            if (height > 0 && height !== accordionHeight) {
              setAccordionHeight(height);
            }
          }}
          style={{ width: "100%", position: "absolute", top: 0 }}
        >
          {renderContent()}
        </View>
      </Animated.View>
    </>
  );
}

export default TorrentAccordion;
