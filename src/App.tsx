import './App.css';
import { BenchmarkPanel } from './benchmark/benchmark-panel';

function App() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem' }}>
      <BenchmarkPanel />
    </div>
  );
}

export default App;
