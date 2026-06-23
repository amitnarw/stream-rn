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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { PluginProvider, HomeSection, MediaItem } from '../types/plugin';
import * as bridge from '../api/cloudStreamBridge';
import MediaCard from '../components/MediaCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
        backgroundColor: '#201f20',
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
            <SkeletonBox width={140} height={18} borderRadius={4} />
            <View style={{ height: 12 }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[1, 2, 3].map((_, i) => (
                <View key={i} style={{ marginRight: 12 }}>
                  <SkeletonBox width={120} height={180} borderRadius={16} />
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
              style={styles.searchBtn}
              onPress={() => navigation.navigate('Search', { selectedProvider })}
            >
              <BlurView intensity={20} tint="light" style={styles.searchBtnBlur}>
                <Text style={styles.searchLink}>Search 🔍</Text>
              </BlurView>
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
              contentContainerStyle={{ paddingHorizontal: 12 }}
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Background Glow */}
      <LinearGradient
        colors={['rgba(189, 92, 255, 0.15)', 'transparent']}
        style={styles.ambientGlow}
        pointerEvents="none"
      />

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
                {[1, 2, 3].map((_, i) => (
                  <View key={i} style={{ marginRight: 8 }}>
                    <SkeletonBox width={90} height={36} borderRadius={20} />
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.providerRow}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16 }}
              >
                {providers.map((p) => {
                  const isActive = selectedProvider === p.name;
                  return (
                    <TouchableOpacity
                      key={p.name}
                      style={styles.providerBtnContainer}
                      onPress={() => selectProvider(p.name)}
                    >
                      <BlurView 
                        intensity={isActive ? 60 : 25} 
                        tint="dark" 
                        style={[
                          styles.providerBtnBlur,
                          isActive && styles.providerBtnActiveBorder
                        ]}
                      >
                        <Text
                          style={[
                            styles.providerText,
                            isActive && styles.providerTextActive,
                          ]}
                        >
                          {p.name}
                        </Text>
                      </BlurView>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={styles.contentArea}>
            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator size="large" color="#bd5cff" />
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
  container: { 
    flex: 1, 
    backgroundColor: '#050505' 
  },
  ambientGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    zIndex: 0,
  },
  providerRow: {
    paddingVertical: 12,
    minHeight: 56,
    zIndex: 10,
  },
  providerBtnContainer: {
    marginRight: 10,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  providerBtnBlur: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerBtnActiveBorder: {
    borderColor: '#bd5cff',
    backgroundColor: 'rgba(189, 92, 255, 0.15)',
  },
  providerText: { 
    color: '#A0A0A5', 
    fontSize: 14,
    fontWeight: '500',
  },
  providerTextActive: { 
    color: '#e3b5ff', 
    fontWeight: '700' 
  },
  contentArea: { 
    flex: 1 
  },
  list: { 
    paddingBottom: 40 
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: { 
    color: '#fff', 
    fontSize: 28, 
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  searchBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchBtnBlur: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchLink: { 
    color: '#fff', 
    fontSize: 13,
    fontWeight: '600',
  },
  section: { 
    marginBottom: 20 
  },
  sectionTitle: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: '800', 
    paddingHorizontal: 20, 
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  skeletonCardsContainer: { 
    paddingTop: 16 
  },
  skeletonRow: { 
    marginBottom: 24, 
    paddingHorizontal: 20 
  },
  centerState: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 24 
  },
  errorText: { 
    color: '#ffb4ab', 
    fontSize: 15, 
    textAlign: 'center', 
    marginBottom: 16, 
    lineHeight: 22 
  },
  emptyStateText: { 
    color: '#666', 
    fontSize: 16, 
    textAlign: 'center' 
  },
  retryBtn: {
    backgroundColor: '#bd5cff',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryBtnText: { 
    color: '#fff', 
    fontSize: 15, 
    fontWeight: 'bold' 
  },
});
