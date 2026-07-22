import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MediaItem } from '../types/plugin';

const FAVORITES_KEY = '@zuno_favorites_list';

type FavoritesChangeListener = (favorites: MediaItem[]) => void;
const listeners: Set<FavoritesChangeListener> = new Set();

export function subscribeFavorites(listener: FavoritesChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(favorites: MediaItem[]) {
  listeners.forEach(cb => {
    try {
      cb(favorites);
    } catch (e) {
      console.warn('Error in favorites listener:', e);
    }
  });
}

export async function getFavorites(): Promise<MediaItem[]> {
  try {
    const json = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!json) return [];
    return JSON.parse(json) as MediaItem[];
  } catch (e) {
    console.warn('Failed to get favorites:', e);
    return [];
  }
}

export async function isFavorite(url: string): Promise<boolean> {
  try {
    const favorites = await getFavorites();
    return favorites.some(item => item.url === url);
  } catch (e) {
    console.warn('Failed to check favorite state:', e);
    return false;
  }
}

export async function addFavorite(item: MediaItem): Promise<void> {
  try {
    const favorites = await getFavorites();
    if (favorites.some(fav => fav.url === item.url)) return;
    
    // Add to beginning of list
    const newFavorites = [item, ...favorites];
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
    notifyListeners(newFavorites);
  } catch (e) {
    console.warn('Failed to add favorite:', e);
  }
}

export async function removeFavorite(url: string): Promise<void> {
  try {
    const favorites = await getFavorites();
    const newFavorites = favorites.filter(item => item.url !== url);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
    notifyListeners(newFavorites);
  } catch (e) {
    console.warn('Failed to remove favorite:', e);
  }
}

