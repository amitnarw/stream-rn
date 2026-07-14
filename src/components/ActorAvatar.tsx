import React, { useState, useEffect } from "react";
import { View, Text, Image, StyleSheet } from "react-native";

const actorImageCache = new Map<string, string | null>();

interface ActorAvatarProps {
  name: string;
  initials: string;
  style: any;
}

export default function ActorAvatar({ name, initials, style }: ActorAvatarProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    actorImageCache.has(name) ? actorImageCache.get(name) || null : null
  );

  useEffect(() => {
    if (actorImageCache.has(name)) {
      setImageUrl(actorImageCache.get(name) || null);
      return;
    }

    let active = true;
    async function fetchImage() {
      try {
        const cleanName = name.replace(/\s+/g, "_");
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanName)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const img = data.thumbnail?.source || null;
          actorImageCache.set(name, img);
          if (active) setImageUrl(img);
        } else {
          actorImageCache.set(name, null);
        }
      } catch (e) {
        actorImageCache.set(name, null);
      }
    }

    fetchImage();
    return () => {
      active = false;
    };
  }, [name]);

  if (imageUrl) {
    return (
      <Image source={{ uri: imageUrl, cache: "force-cache" }} style={style} />
    );
  }

  return (
    <View style={[style, styles.castPlaceholder]}>
      <Text style={styles.castInitials}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  castPlaceholder: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  castInitials: {
    color: "#E5E2E3",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
