import React from "react";
import { View, TextInput, TouchableOpacity, Text } from "react-native";
import styles from "../styles/appStyles";

export default function TaskInput({ value, onChangeText, onAdd }) {
  return (
    <View style={styles.inputRow}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Vazifa yozing..."
        placeholderTextColor="#8f90a6"
        style={styles.input}
        onSubmitEditing={onAdd}
        returnKeyType="done"
      />
      <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.85}>
        <Text style={styles.addBtnText}>Qoshish</Text>
      </TouchableOpacity>
    </View>
  );
}
