import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MediaItem } from '../types/plugin';
import * as bridge from '../api/cloudStreamBridge';
import MediaCard from '../components/MediaCard';

interface Props {
  route: any;
  navigation: any;
}

export default function SearchScreen({ route, navigation }: Props) {
  const providerName = route.params?.selectedProvider;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doSearch(q: string) {
    if (!providerName || !q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const items = await bridge.search(providerName, q);
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
      providerName: item.provider || providerName,
      url: item.url,
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Search..."
        placeholderTextColor="#888"
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setError(null);
          if (text.length > 2) doSearch(text);
        }}
        onSubmitEditing={() => doSearch(query)}
        returnKeyType="search"
      />
      {loading ? (
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 24 }} />
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
              {query ? 'No results' : 'Type to search'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  input: {
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#333',
    borderRadius: 8,
    color: '#fff',
    fontSize: 16,
  },
  grid: { paddingHorizontal: 8 },
  empty: { color: '#666', textAlign: 'center', marginTop: 48, fontSize: 16 },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#e50914', fontSize: 15, textAlign: 'center', marginBottom: 16, lineHeight: 22 },
  retryBtn: {
    backgroundColor: '#e50914',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
