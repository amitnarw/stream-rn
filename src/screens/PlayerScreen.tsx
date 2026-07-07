import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from "react-native";
import * as bridge from "../api/cloudStreamBridge";

interface Props { route: any }

export default function PlayerScreen({ route }: Props) {
  const { url, headers, title } = route.params;
  const [status, setStatus] = useState("Checking player preference...");

  useEffect(() => {
    async function startPlayback() {
      try {
        const mode = await bridge.getPlayerMode();
        if (mode === 'external') {
          setStatus("Opening external player...");
          bridge.playInExternalPlayer(url, null, title, typeof headers === "string" ? headers : JSON.stringify(headers));
        } else {
          setStatus("Starting inbuilt player...");
          bridge.playStream(url, headers, title);
        }
      } catch (e) {
        setStatus("Error starting player. Please try again.");
      }
    }
    startPlayback();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color="#fff" />
      <Text style={styles.text}>{status}</Text>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center", gap: 16 },
  text: { color: "#fff", fontSize: 18 },
});
