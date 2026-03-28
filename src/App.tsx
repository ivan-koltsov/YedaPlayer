import { YedaVideoPlayer } from "./components/YedaVideoPlayer";
import { DEMO_INPUT } from "./demoData";

export default function App() {
  return (
    <div className="app-shell">
      <YedaVideoPlayer input={DEMO_INPUT} />
      <button type="button" className="helpFab" aria-label="Help">
        ?
      </button>
    </div>
  );
}
