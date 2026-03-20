import { useState } from 'react';
import reactLogo from './assets/react.svg';
import './App.css';

function App() {
  const [count, setCount] = useState(0);
  const [apiResult, setApiResult] = useState<string>('');
  const [apiError, setApiError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleApiTest = async () => {
    setIsLoading(true);
    setApiError('');
    setApiResult('');

    try {
      const response = await fetch('https://jsonplaceholder.typicode.com/todos/1');
      const contentType = response.headers.get('content-type') ?? '';

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (contentType.includes('application/json')) {
        const json = (await response.json()) as { message?: string };
        setApiResult(json.message ?? JSON.stringify(json));
      } else {
        const text = await response.text();
        setApiResult(text);
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>count is {count}</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
        <button className="api-button" onClick={() => void handleApiTest()} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Fetch /api/test'}
        </button>
        {apiResult ? <p className="api-result">Result: {apiResult}</p> : null}
        {apiError ? <p className="api-error">Error: {apiError}</p> : null}
      </div>
      <p className="read-the-docs">Click on the Vite and React logos to learn more</p>
    </>
  );
}

export default App;
