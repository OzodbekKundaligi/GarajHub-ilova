import { StyleSheet } from "react-native";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1021",
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 10,
  },
  title: {
    color: "#f8f9ff",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: {
    color: "#b8b9d3",
    marginTop: 4,
    fontSize: 14,
  },
  card: {
    backgroundColor: "#1a1c36",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  cardText: {
    color: "#c7c8e7",
    marginTop: 6,
    marginBottom: 10,
  },
  progressBar: {
    height: 8,
    borderRadius: 8,
    backgroundColor: "#2a2d53",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4ade80",
  },
  inputRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  input: {
    flex: 1,
    backgroundColor: "#191a32",
    color: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#2d3058",
    marginRight: 10,
  },
  addBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  addBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  listContent: {
    paddingBottom: 14,
    flexGrow: 1,
  },
  empty: {
    color: "#9395b8",
    textAlign: "center",
    marginTop: 30,
  },
  taskItem: {
    backgroundColor: "#171830",
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#2a2c4f",
  },
  taskDone: {
    backgroundColor: "#132b20",
    borderColor: "#285b42",
  },
  taskText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  taskTextDone: {
    textDecorationLine: "line-through",
    color: "#a4e3bf",
  },
  taskState: {
    marginTop: 6,
    color: "#b9bbd9",
    fontSize: 12,
  },
  clearBtn: {
    backgroundColor: "#ef4444",
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 18,
  },
  clearBtnText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "700",
  },
});

export default styles;
