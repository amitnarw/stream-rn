import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PluginProvider, HomeSection, MediaItem } from '../types/plugin';
import * as bridge from '../api/cloudStreamBridge';
import MediaCard from '../components/MediaCard';

function SkeletonBox({ width, height, borderRadius = 4 }: { width: number; height: number; borderRadius?: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: '#333',
        opacity,
      }}
    />
  );
}

interface Props {
  navigation: any;
}

export default function HomeScreen({ navigation }: Props) {
  const [providers, setProviders] = useState<PluginProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    setLoading(true);
    setError(null);
    try {
      await bridge.loadPlugins();
      const provs = await bridge.getProviders();
      setProviders(provs);
      if (provs.length > 0) {
        setSelectedProvider(provs[0].name);
        await loadSections(provs[0].name);
      }
    } catch (e: any) {
      const msg = e instanceof bridge.OfflineError
        ? 'No internet connection. Please check your network.'
        : e.message || 'Failed to load. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadSections(name: string) {
    setSectionsLoading(true);
    setSectionError(null);
    try {
      const secs = await bridge.getMainPage(name);
      setSections(secs);
    } catch (e: any) {
      const msg = e instanceof bridge.OfflineError
        ? 'No internet connection. Please check your network.'
        : e.message || 'Failed to load content. Please try again.';
      setSectionError(msg);
    } finally {
      setSectionsLoading(false);
    }
  }

  async function selectProvider(name: string) {
    setSelectedProvider(name);
    setSections([]);
    setSectionError(null);
    await loadSections(name);
  }

  function onMediaPress(item: MediaItem) {
    navigation.navigate('Detail', {
      providerName: item.provider || selectedProvider,
      url: item.url,
    });
  }

  function renderSkeletonCards() {
    return (
      <View style={styles.skeletonCardsContainer}>
        {[1, 2].map((row) => (
          <View key={row} style={styles.skeletonRow}>
            <SkeletonBox width={180} height={16} borderRadius={4} />
            <View style={{ height: 8 }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[1, 2, 3, 4].map((_, i) => (
                <View key={i} style={{ marginRight: 12 }}>
                  <SkeletonBox width={140} height={210} borderRadius={8} />
                </View>
              ))}
            </ScrollView>
          </View>
        ))}
      </View>
    );
  }

  function renderContent() {
    if (sectionsLoading) {
      return renderSkeletonCards();
    }

    if (sectionError) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{sectionError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => selectedProvider && loadSections(selectedProvider)}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (sections.length === 0) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.emptyStateText}>No data available for this provider</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={sections}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Browse</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Search', { selectedProvider })}
            >
              <Text style={styles.searchLink}>Search</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: section }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{section.name}</Text>
            <FlatList
              horizontal
              data={section.items}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <MediaCard item={item} onPress={onMediaPress} />
              )}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {error && !loading ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={init}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {loading ? (
            <View style={styles.providerRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {[1, 2, 3, 4, 5].map((_, i) => (
                  <View key={i} style={{ marginRight: 8 }}>
                    <SkeletonBox width={90} height={36} borderRadius={20} />
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.providerRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {providers.map((p) => (
                  <TouchableOpacity
                    key={p.name}
                    style={[
                      styles.providerBtn,
                      selectedProvider === p.name && styles.providerBtnActive,
                    ]}
                    onPress={() => selectProvider(p.name)}
                  >
                    <Text
                      style={[
                        styles.providerText,
                        selectedProvider === p.name && styles.providerTextActive,
                      ]}
                    >
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.contentArea}>
            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : (
              renderContent()
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  providerRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    minHeight: 56,
  },
  providerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#333',
    marginRight: 8,
  },
  providerBtnActive: { backgroundColor: '#e50914' },
  providerText: { color: '#ccc', fontSize: 14 },
  providerTextActive: { color: '#fff', fontWeight: 'bold' },
  contentArea: { flex: 1 },
  list: { paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  searchLink: { color: '#e50914', fontSize: 16 },
  section: { marginBottom: 8 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 8 },
  skeletonCardsContainer: { paddingTop: 16 },
  skeletonRow: { marginBottom: 24, paddingHorizontal: 16 },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#e50914', fontSize: 15, textAlign: 'center', marginBottom: 16, lineHeight: 22 },
  emptyStateText: { color: '#666', fontSize: 16, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#e50914',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
