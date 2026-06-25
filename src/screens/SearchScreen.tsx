import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { MediaItem } from '../types/plugin';
import * as bridge from '../api/cloudStreamBridge';
import MediaCard from '../components/MediaCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  route: any;
  navigation: any;
}

export default function SearchScreen({ route, navigation }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const items = await bridge.search('Cinemeta', q);
      setResults(items);
      if (items.length === 0) {
        setError('No results found for this search.');
      }
    } catch (e: any) {
      const msg = e instanceof bridge.OfflineError
        ? 'No internet connection. Please check your network.'
        : e.message || 'Search failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function onMediaPress(item: MediaItem) {
    navigation.navigate('Detail', {
      providerName: item.provider || 'Cinemeta',
      url: item.url,
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Ambient Glow */}
      <LinearGradient
        colors={['rgba(189, 92, 255, 0.12)', 'transparent']}
        style={styles.ambientGlow}
        pointerEvents="none"
      />

      {/* Custom Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <BlurView intensity={35} tint="dark" style={styles.backButtonBlur}>
            <Text style={styles.backButtonText}>←</Text>
          </BlurView>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Inset Glass Search Bar */}
      <View style={styles.searchContainer}>
        <BlurView intensity={25} tint="dark" style={styles.searchBlur}>
          <TextInput
            style={styles.input}
            placeholder="Search movies & shows..."
            placeholderTextColor="#8e8e93"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setError(null);
              if (text.length > 2) doSearch(text);
            }}
            onSubmitEditing={() => doSearch(query)}
            returnKeyType="search"
          />
        </BlurView>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#bd5cff" />
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          {!(error.includes('No internet') || error.includes('No results')) && (
            <TouchableOpacity style={styles.retryBtn} onPress={() => doSearch(query)}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.grid}
          numColumns={3}
          renderItem={({ item }) => (
            <MediaCard item={item} onPress={onMediaPress} />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query ? 'No results' : 'Type at least 3 characters to search'}
            </Text>
          }
        />
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
    height: 250,
    zIndex: 0,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  backButtonBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  searchContainer: {
    marginHorizontal: 20,
    marginVertical: 12,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchBlur: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  input: {
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  grid: { 
    paddingHorizontal: 12,
    paddingBottom: 40,
  },
  empty: { 
    color: '#666', 
    textAlign: 'center', 
    marginTop: 48, 
    fontSize: 14 
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
