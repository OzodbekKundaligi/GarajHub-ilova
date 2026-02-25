import mongoose from "mongoose";

const AppStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    revision: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

const AppState = mongoose.model("AppState", AppStateSchema);

export default AppState;
