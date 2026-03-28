export type Chapter = {
  title: string;
  start: number;
  end: number;
};

export type YedaPlayerInput = {
  hlsPlaylistUrl: string;
  videoLength: number;
  chapters: Chapter[];
};
