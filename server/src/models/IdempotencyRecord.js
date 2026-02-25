import mongoose from "mongoose";

const IdempotencyRecordSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    route: { type: String, required: true },
    request_hash: { type: String, required: true },
    status_code: { type: Number, required: true },
    response_body: { type: mongoose.Schema.Types.Mixed, required: true },
    expires_at: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

IdempotencyRecordSchema.index({ route: 1, key: 1 }, { unique: true });

const IdempotencyRecord = mongoose.model("IdempotencyRecord", IdempotencyRecordSchema);

export default IdempotencyRecord;
