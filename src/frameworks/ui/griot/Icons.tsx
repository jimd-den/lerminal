import React from "react";
import { StyleSheet, View } from "react-native";

export function TrashIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <View accessibilityElementsHidden style={[styles.trash, { width: size, height: size }]}> 
      <View style={[styles.lid, { backgroundColor: color }]} />
      <View style={[styles.handle, { borderColor: color }]} />
      <View style={[styles.bin, { borderColor: color }]}>
        <View style={[styles.slot, { backgroundColor: color }]} />
        <View style={[styles.slot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  trash: { position: "relative", alignItems: "center" },
  lid: { position: "absolute", top: 4, width: "82%", height: 2, borderRadius: 1 },
  handle: { position: "absolute", top: 1, width: "32%", height: 5, borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  bin: { position: "absolute", top: 7, width: "66%", height: "65%", borderWidth: 2, borderTopWidth: 0, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, flexDirection: "row", justifyContent: "space-evenly", paddingTop: 3 },
  slot: { width: 2, height: "70%", borderRadius: 1 },
});
