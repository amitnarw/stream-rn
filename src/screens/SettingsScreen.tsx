import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as bridge from '../api/cloudStreamBridge';

interface Props {
  navigation: any;
}

const homeOptions = [
  { label: 'Always Refresh (No Cache)', value: 0, desc: 'Always load live content from the internet.' },
  { label: '2 Hours (Fast updates)', value: 2 * 60 * 60 * 1000, desc: 'Saves data but updates content frequently.' },
  { label: '6 Hours (Balanced)', value: 6 * 60 * 60 * 1000, desc: 'Good balance of fresh content and speed.' },
  { label: '12 Hours (Recommended)', value: 12 * 60 * 60 * 1000, desc: 'Loads main page instantly, saves data.' },
  { label: '24 Hours (Maximum Speed)', value: 24 * 60 * 60 * 1000, desc: 'Great for slow connections, updates once a day.' },
];

const detailOptions = [
  { label: 'Always Refresh (No Cache)', value: 0, desc: 'Always fetch live movie and show details.' },
  { label: '6 Hours (Fast updates)', value: 6 * 60 * 60 * 1000, desc: 'Updates episode lists four times a day.' },
  { label: '12 Hours (Balanced)', value: 12 * 60 * 60 * 1000, desc: 'Updates episode lists twice a day.' },
  { label: '24 Hours (Recommended)', value: 24 * 60 * 60 * 1000, desc: 'Loads descriptions instantly, updates daily.' },
  { label: '7 Days (Offline Mode)', value: 7 * 24 * 60 * 60 * 1000, desc: 'Best for saving internet data. Updates weekly.' },
];

export default function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [selectedHomeTtl, setSelectedHomeTtl] = useState(12 * 60 * 60 * 1000);
  const [selectedDetailTtl, setSelectedDetailTtl] = useState(24 * 60 * 60 * 1000);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadCurrentSettings();
  }, []);

  async function loadCurrentSettings() {
    try {
      const settings = await bridge.getSettings();
      setSelectedHomeTtl(settings.mainPageTtl);
      setSelectedDetailTtl(settings.detailsTtl);
    } catch (e) {
      console.warn('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleHomeTtlChange(value: number) {
    setSelectedHomeTtl(value);
    try {
      await bridge.saveSettings(value, selectedDetailTtl);
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  async function handleDetailTtlChange(value: number) {
    setSelectedDetailTtl(value);
    try {
      await bridge.saveSettings(selectedHomeTtl, value);
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  function handleClearCache() {
    Alert.alert(
      'Clear Cache',
      'Are you sure you want to clear all cached listings and details? This will free up storage space and force the app to reload fresh data from the internet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await bridge.clearCache();
              Alert.alert('Success', 'Cache has been cleared successfully.');
            } catch (e) {
              Alert.alert('Error', 'Failed to clear cache.');
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e3b5ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Floating Custom Header Bar */}
      <View style={[styles.headerBar, { top: Math.max(insets.top, 16) }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <BlurView 
            intensity={40} 
            tint="dark" 
            style={styles.backButtonBlur}
            blurMethod="dimezisBlurView"
          >
            <Text style={styles.backButtonText}>←</Text>
          </BlurView>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.mainScrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16) + 60,
            paddingBottom: 40 + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Home Screen Cache Settings Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Home Screen Cache</Text>
          <Text style={styles.cardDescription}>
            Controls how long the app remembers the Home Screen content. A longer time makes the home tab load instantly, while a shorter time shows new updates sooner.
          </Text>
          <View style={styles.optionsList}>
            {homeOptions.map((opt) => {
              const isSelected = selectedHomeTtl === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.optionRow, isSelected && styles.optionRowActive]}
                  onPress={() => handleHomeTtlChange(opt.value)}
                >
                  <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.optionDesc}>{opt.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Details Screen Cache Settings Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Show Details Cache</Text>
          <Text style={styles.cardDescription}>
            Controls how long the app remembers details, descriptions, and episode lists. A longer time saves internet data and loads screens instantly, while a shorter time updates episode lists faster.
          </Text>
          <View style={styles.optionsList}>
            {detailOptions.map((opt) => {
              const isSelected = selectedDetailTtl === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.optionRow, isSelected && styles.optionRowActive]}
                  onPress={() => handleDetailTtlChange(opt.value)}
                >
                  <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.optionDesc}>{opt.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Storage Management Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Storage & Cleanup</Text>
          <Text style={styles.cardDescription}>
            Free up storage space on your device. Clearing cached data will force the app to fetch fresh listings and show details next time you browse, without deleting your preferences.
          </Text>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClearCache}
            disabled={clearing}
          >
            {clearing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.clearBtnText}>Clear Cached Data</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#050505',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 20,
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
  mainScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: 'rgba(20, 18, 24, 0.65)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardDescription: {
    color: '#A0A0A5',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  optionsList: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  optionRowActive: {
    borderBottomColor: 'rgba(189, 92, 255, 0.15)',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioCircleActive: {
    borderColor: '#bd5cff',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#bd5cff',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    color: '#E5E2E3',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionLabelActive: {
    color: '#e3b5ff',
  },
  optionDesc: {
    color: '#8E8D92',
    fontSize: 12,
    lineHeight: 16,
  },
  clearBtn: {
    backgroundColor: '#ffb4ab',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  clearBtnText: {
    color: '#601410',
    fontSize: 15,
    fontWeight: '700',
  },
});
