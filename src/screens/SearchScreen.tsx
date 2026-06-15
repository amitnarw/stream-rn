import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
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

  async function doSearch(q: string) {
    if (!providerName || !q.trim()) return;
    setLoading(true);
    try {
      const items = await bridge.search(providerName, q);
      setResults(items);
    } catch (e) {
      console.error(e);
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
          if (text.length > 2) doSearch(text);
        }}
        onSubmitEditing={() => doSearch(query)}
        returnKeyType="search"
      />
      {loading ? (
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 24 }} />
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
});
