export type ScoreAudioCue = {
  text: string;
  rate: number;
  pitch: number;
};

export const cueForVisit = (score: number, bust: boolean, checkout: boolean): ScoreAudioCue => {
  if (bust) return { text: "Bust", rate: 0.82, pitch: 0.82 };
  if (checkout) return { text: "Bwaaaaaaaah!", rate: 0.48, pitch: 0.62 };
  if (score === 180) return { text: "Oooone huuundred and eeeighty!", rate: 0.62, pitch: 0.95 };
  return { text: `${score} scored`, rate: 0.92, pitch: 0.9 };
};

export const playScoreCue = (cue: ScoreAudioCue) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;

  const speech = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(cue.text);
  const voices = speech.getVoices();
  const preferredLanguages = ["en-NZ", "en-AU", "en-GB"];
  const voice = preferredLanguages
    .map((language) => voices.find((item) => item.lang === language))
    .find(Boolean) ?? voices.find((item) => item.lang.toLowerCase().startsWith("en"));

  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-NZ";
  utterance.rate = cue.rate;
  utterance.pitch = cue.pitch;
  utterance.volume = 1;

  speech.cancel();
  speech.speak(utterance);
};

export const stopScoreAudio = () => {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
};
