// content.js

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.action !== "fillForm") return;
  console.log("[content] Fill form requested");

  // 1️⃣ Load the raw resume text
  const { resumeRaw } = await chrome.storage.local.get("resumeRaw");
  if (!resumeRaw) {
    alert("❌ No resume stored. Please upload it first in Settings.");
    return;
  }

  // 2️⃣ Extract & normalize all form questions
  const items = Array.from(document.querySelectorAll("div[role='listitem']"))
    .map(item => {
      const qEl = item.querySelector("div[role='heading']");
      if (!qEl) return null;
      // Take only the first line, strip trailing asterisks, trim
      const qText = qEl.innerText
        .split("\n")[0]
        .replace(/\*+$/, "")
        .trim();
      return qText ? { question: qText, item } : null;
    })
    .filter(x => x);
  const questions = items.map(x => x.question);
  console.log("[content] Normalized Questions:", questions);

  // 3️⃣ Build prompts for LLM
  const systemPrompt = `
You are a JSON generator. Given a plain-text resume and a list of form questions,
return ONLY valid JSON mapping each exact question string to a concise answer string.
Do NOT include any markdown or code fences.
  `.trim();
  const userPayload = JSON.stringify({ resume: resumeRaw, questions });
  console.log("[content] Prompt ➡️", systemPrompt, userPayload);

  // 4️⃣ Call the LLM API
  let answersMap;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer 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"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPayload }
        ],
        temperature: 0.0
      })
    });
    const payload = await response.json();
    console.log("[content] Raw LLM response:", payload);
    if (!response.ok) throw new Error(payload.error?.message || "LLM error");

    let raw = payload.choices?.[0]?.message?.content.trim() || "{}";
    raw = raw.replace(/^```json\s*/, "").replace(/```$/, "").trim();
    console.log("[content] Stripped JSON:", raw);
    answersMap = JSON.parse(raw);
    console.log("[content] Parsed answersMap:", answersMap);
  } catch (err) {
    console.error("[content] LLM call failed:", err);
    alert("❌ Failed to get answers from LLM. Check console for details.");
    return;
  }

  // 5️⃣ Fill each field
  const normalize = s => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const { question, item } of items) {
    const answer = answersMap[question];
    if (!answer) continue;
    const aNorm = normalize(answer);
    console.log(`[content] Filling "${question}" → "${answer}"`);

    // — Text / Paragraph —
    let textEl = item.querySelector("textarea")
      || Array.from(item.querySelectorAll("input")).find(i =>
           !["radio","checkbox","date"].includes(i.type)
         );
    if (textEl) {
      textEl.value = answer;
      textEl.dispatchEvent(new Event("input", { bubbles: true }));
      continue;
    }

    // — Radio buttons —
    const radios = item.querySelectorAll("input[type='radio']");
    if (radios.length) {
      radios.forEach(radio => {
        const lbl = item.querySelector(`label[for="${radio.id}"]`);
        if (!lbl) return;
        const lNorm = normalize(lbl.innerText);
        if (lNorm === aNorm || aNorm.includes(lNorm) || lNorm.includes(aNorm)) {
          lbl.click();
        }
      });
      continue;
    }

    // — Checkboxes —
    const checks = item.querySelectorAll("input[type='checkbox']");
    if (checks.length) {
      const parts = answer.split(/[,;]\s*/).map(normalize);
      checks.forEach(chk => {
        const lbl = item.querySelector(`label[for="${chk.id}"]`);
        if (lbl && parts.includes(normalize(lbl.innerText))) {
          lbl.click();
        }
      });
      continue;
    }

    // — Dropdown (role=listbox) —
    const dd = item.querySelector("[role='listbox']");
    if (dd) {
      dd.click();
      await new Promise(r => setTimeout(r, 300));
      for (const opt of document.querySelectorAll("[role='option']")) {
        const oNorm = normalize(opt.innerText);
        if (oNorm === aNorm || aNorm.includes(oNorm) || oNorm.includes(aNorm)) {
          opt.click();
          break;
        }
      }
      continue;
    }

    // — Date field —
    const dateEl = item.querySelector("input[type='date']");
    if (dateEl) {
      dateEl.value = answer;
      dateEl.dispatchEvent(new Event("input", { bubbles: true }));
      continue;
    }
  }

  console.log("[content] fillForm complete");
});
