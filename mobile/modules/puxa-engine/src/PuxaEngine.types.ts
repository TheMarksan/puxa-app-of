export type QualityOption = {
  id: string;
  label: string;
  note: string;
  size: number | null;
};

export type VideoInfo = {
  id: string;
  title: string;
  channel: string;
  duration: number;
  viewCount: number | null;
  uploadDate: string | null;
  thumbnail: string;
  options: { audio: QualityOption[]; video: QualityOption[] };
};

export type Stage = 'downloading' | 'processing';

export type ProgressEvent = {
  jobId: string;
  stage: Stage;
  downloaded: number;
  total: number;
  speed: number;
  eta: number | null;
};

export type DoneEvent = {
  jobId: string;
  path: string;
  filename: string;
  size: number;
  duration: number;
  mime: string;
};

export type ErrorEvent = { jobId: string; code: string; message: string };

export type ClipResult = { path: string; size: number; filename: string; mime: string };

export type PuxaEngineEvents = {
  onProgress: (event: ProgressEvent) => void;
  onDone: (event: DoneEvent) => void;
  onError: (event: ErrorEvent) => void;
  onSharedText: (event: { text: string }) => void;
};
