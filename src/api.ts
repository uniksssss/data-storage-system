import { transportFetch } from './transport';

export interface Todo {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
}

export async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function getTodo(id: number): Promise<Todo> {
  const response = await transportFetch(`/todos/${id}`, {
    useCache: true,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return parseJson<Todo>(response);
}
