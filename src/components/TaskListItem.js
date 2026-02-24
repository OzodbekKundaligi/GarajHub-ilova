import React from "react";
import { TouchableOpacity, Text } from "react-native";
import styles from "../styles/appStyles";

export default function TaskListItem({ item, onToggle }) {
  return (
    <TouchableOpacity
      style={[styles.taskItem, item.done && styles.taskDone]}
      onPress={() => onToggle(item.id)}
      activeOpacity={0.8}
    >
      <Text style={[styles.taskText, item.done && styles.taskTextDone]}>{item.title}</Text>
      <Text style={styles.taskState}>{item.done ? "Bajarildi" : "Jarayonda"}</Text>
    </TouchableOpacity>
  );
}
