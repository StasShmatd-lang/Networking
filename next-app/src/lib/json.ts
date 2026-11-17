export async function readJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    throw new Error(res.ok ? "Пустой ответ сервера" : `Ошибка ${res.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(res.ok ? "Сервер вернул не JSON" : `Ошибка ${res.status}`);
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function err(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
