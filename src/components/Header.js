import React from "react";
import { View, Text } from "react-native";
import styles from "../styles/appStyles";

export default function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>My Mobile Planner</Text>
      <Text style={styles.subtitle}>React Native alohida fayllar bilan</Text>
    </View>
  );
}
