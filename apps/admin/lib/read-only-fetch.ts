// service role や Stripe / RevenueCat のシークレットキーは書き込みもできる。
// このコンソールは読むだけなので、GET / HEAD 以外のリクエストは送信前に落とす
// (Supabase の rpc も POST なので通らない)。
export const readOnlyFetch: typeof fetch = (input, init) => {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return Promise.reject(
      new Error(`読み取り専用コンソールのため ${method} リクエストは送信しません`),
    );
  }
  return fetch(input, init);
};
