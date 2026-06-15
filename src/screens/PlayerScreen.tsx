import React from "react";
import { View, Text, StyleSheet, SafeAreaView } from "react-native";
import * as bridge from "../api/cloudStreamBridge";

interface Props { route: any }

export default function PlayerScreen({ route }: Props) {
  const { url, headers, title } = route.params;
  bridge.playStream(url, headers, title);
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.text}>Starting player...</Text>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  text: { color: "#fff", fontSize: 18 },
});
