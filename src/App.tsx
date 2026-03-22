import { useState } from 'react';
import './App.css';
import { Serializer } from './domain/serializer/serializer.service';
import { CacheClient } from './domain/cache-client/cache-client.service';
import { EvictionPolicy } from './domain/eviction-policy/eviction-policy.service';
import { UsageTracker } from './domain/usage-tracker/usage-tracker.service';
import { StorageDriver } from './domain/storage-driver/storage-driver';

function App() {
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
      <div className="card">
        <button className="api-button" onClick={() => void handleApiTest()} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Fetch /api/test'}
        </button>
        {apiResult ? <p className="api-result">Result: {apiResult}</p> : null}
        {apiError ? <p className="api-error">Error: {apiError}</p> : null}
      </div>
    </>
  );
}

export default App;
