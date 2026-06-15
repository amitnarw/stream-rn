import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import type { PluginProvider, HomeSection, MediaItem } from '../types/plugin';
import * as bridge from '../api/cloudStreamBridge';
import MediaCard from '../components/MediaCard';

interface Props {
  navigation: any;
}

export default function HomeScreen({ navigation }: Props) {
  const [providers, setProviders] = useState<PluginProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      setLoading(true);
      await bridge.loadPlugins();
      const provs = await bridge.getProviders();
      setProviders(provs);
      if (provs.length > 0) {
        setSelectedProvider(provs[0].name);
        const secs = await bridge.getMainPage(provs[0].name);
        setSections(secs);
      }
    } catch (e) {
      console.error('init error', e);
    } finally {
      setLoading(false);
    }
  }

  async function selectProvider(name: string) {
    setSelectedProvider(name);
    setLoading(true);
    try {
      const secs = await bridge.getMainPage(name);
      setSections(secs);
    } catch (e) {
      console.error('selectProvider error', e);
    } finally {
      setLoading(false);
    }
  }

  function onMediaPress(item: MediaItem) {
    navigation.navigate('Detail', {
      providerName: item.provider || selectedProvider,
      url: item.url,
    });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.providerRow}>
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
});
