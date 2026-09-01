export type ScoreAudioCue = {
  text: string;
  filename: string;
};

export const cueForVisit = (score: number, bust: boolean, checkout: boolean): ScoreAudioCue => {
  if (bust) return { text: "Bust", filename: "bust.mp3" };
  if (checkout) return { text: "Baaaaaaaah!", filename: "checkout.mp3" };
  return { text: `${score} scored`, filename: `score-${score}.mp3` };
};

let activeAudio: HTMLAudioElement | null = null;

export const scoreAudioUrl = (cue: ScoreAudioCue) => `${import.meta.env.BASE_URL}audio/caller/${cue.filename}`;

export const playScoreCue = (cue: ScoreAudioCue) => {
  if (typeof Audio === "undefined") return;

  stopScoreAudio();
  const audio = new Audio(scoreAudioUrl(cue));
  activeAudio = audio;
  audio.addEventListener("ended", () => {
    if (activeAudio === audio) activeAudio = null;
  }, { once: true });
  void audio.play().catch(() => {
    if (activeAudio === audio) activeAudio = null;
  });
};

export const stopScoreAudio = () => {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.currentTime = 0;
  activeAudio = null;
};
