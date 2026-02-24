const GROQ_API_KEY = String(process.env.EXPO_PUBLIC_GROQ_API_KEY || "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").trim();
const GROQ_MODEL = "llama-3.1-8b-instant";
const REQUEST_TIMEOUT_MS = 15000;

function toGroqMessages(history, promptText) {
  const messages = history.slice(-10).map((message) => ({
    role: message.role === "model" ? "assistant" : "user",
    content: message.text,
  }));

  messages.unshift({
    role: "system",
    content:
      "You are a practical Uzbek startup mentor. Give short, clear, actionable advice in Uzbek.",
  });

  messages.push({
    role: "user",
    content: promptText,
  });

  return messages;
}

function offlineMentorFallback(promptText) {
  const text = String(promptText || "").toLowerCase();

  if (text.includes("mvp")) {
    return "MVP uchun: 1) bitta asosiy muammoni tanlang, 2) 1 haftada chiqadigan eng sodda demo qiling, 3) 10 ta real userdan fikr oling.";
  }
  if (text.includes("pitch") || text.includes("investor")) {
    return "Pitch struktura: muammo -> yechim -> bozor hajmi -> traction -> monetizatsiya -> jamoa -> so'ralayotgan investitsiya.";
  }
  if (text.includes("marketing")) {
    return "Marketing uchun avval 1 kanal tanlang (Telegram/Instagram), keyin 2 haftalik kontent reja + lead yig'ish formasi bilan test qiling.";
  }
  if (text.includes("team") || text.includes("jamoa")) {
    return "Jamoa bo'yicha: rollarni aniq ajrating, haftalik sprint maqsadini yozing va har kuni 10 daqiqalik standup qiling.";
  }

  return "Boshlanish uchun: 1) muammoni aniq yozing, 2) maqsadli auditoriyani toraytiring, 3) 1 haftalik MVP rejani tuzing, 4) dastlabki foydalanuvchi fikrini yig'ing.";
}

export async function getAIMentorResponse(history, promptText) {
  if (!promptText?.trim()) {
    return "Savol kiriting.";
  }

  if (!GROQ_API_KEY) {
    return `${offlineMentorFallback(promptText)}\n\nAI kalit topilmadi. \`.env\` faylga \`EXPO_PUBLIC_GROQ_API_KEY\` qo'shsangiz, to'liq AI javoblar ishlaydi.`;
  }

  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const requestBody = {
    model: GROQ_MODEL,
    messages: toGroqMessages(history, promptText),
    temperature: 0.7,
    max_tokens: 700,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Groq so'rov xatoligi");
    }

    const data = await response.json();
    const candidateText = data?.choices?.[0]?.message?.content;

    if (!candidateText) {
      return "Javob olinmadi. Keyinroq qayta urinib ko'ring.";
    }

    return candidateText.trim();
  } catch {
    return `${offlineMentorFallback(promptText)}\n\nAI serveriga ulanishda muammo bo'ldi, shuning uchun qisqa offline tavsiya berdim.`;
  } finally {
    clearTimeout(timeout);
  }
}
