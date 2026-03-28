import { YedaVideoPlayer } from "./components/YedaVideoPlayer";
import { DEMO_INPUT } from "./demoData";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">YedaLabs — Assignment</h1>
        <p className="app-sub">Video player (HLS, chapters, quality)</p>
      </header>
      <YedaVideoPlayer input={DEMO_INPUT} />
      <button type="button" className="helpFab" aria-label="Help">
        ?
      </button>
    </div>
  );
}
