import React from 'react';
import {
  TouchableOpacity,
  Image,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import type { MediaItem } from '../types/plugin';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 3;

interface Props {
  item: MediaItem;
  onPress: (item: MediaItem) => void;
}

export default function MediaCard({ item, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)}>
      {item.posterUrl ? (
        <Image
          source={{ uri: item.posterUrl }}
          style={styles.poster}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.poster, styles.placeholder]}>
          <Text style={styles.placeholderText}>?</Text>
        </View>
      )}
      <Text style={styles.title} numberOfLines={2}>
        {item.title}
      </Text>
    </TouchableOpacity>
  );
}

import { View } from 'react-native';

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    marginBottom: 16,
    marginHorizontal: 4,
  },
  poster: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.5,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#666',
    fontSize: 32,
  },
  title: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
});
