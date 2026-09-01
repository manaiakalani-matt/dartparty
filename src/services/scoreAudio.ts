export type ScoreAudioCue = {
  text: string;
  filename: string;
};

export const cueForVisit = (score: number, bust: boolean, checkout: boolean): ScoreAudioCue => {
  if (bust) return { text: "Bust", filename: "bust.mp3" };
  if (checkout) return { text: "Got him!", filename: "checkout.mp3" };
  if (score === 180) return { text: "One hundred and eighty", filename: "score-180.mp3" };
  return { text: `${score} scored`, filename: `score-${score}.mp3` };
};

let activeAudio: HTMLAudioElement | null = null;
const CALLER_PACK_VERSION = "2026-09-01-2";

export const scoreAudioUrl = (cue: ScoreAudioCue) =>
  `${import.meta.env.BASE_URL}audio/caller/${cue.filename}?v=${CALLER_PACK_VERSION}`;

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
