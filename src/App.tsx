import { YedaVideoPlayer } from "./components/YedaVideoPlayer";
import { DEMO_INPUT } from "./demoData";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Course video</h1>
        <p className="app-sub">HLS playback with chapters and quality selection</p>
      </header>
      <YedaVideoPlayer input={DEMO_INPUT} />
    </div>
  );
}
