const memory = new Map<string, string>();

export const authStorage =
  typeof globalThis.localStorage !== 'undefined'
    ? globalThis.localStorage
    : {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      };
