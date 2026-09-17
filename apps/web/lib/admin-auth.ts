export const SESSION_EXPIRED_MESSAGE = "登录已过期，请重新登录";
export const CSRF_EXPIRED_MESSAGE = "安全令牌已失效，请重新登录后重试。本次操作未提交。";

export type AdminFailure =
  | { kind: "session"; message: string; redirect: true; retry: false }
  | { kind: "csrf"; message: string; redirect: false; retry: false }
  | { kind: "other"; message: string; redirect: false; retry: false };

function apiFailure(reason: unknown): { status: number; detail: string } | null {
  if (
    typeof reason === "object"
    && reason !== null
    && "status" in reason
    && "detail" in reason
    && typeof reason.status === "number"
    && typeof reason.detail === "string"
  ) {
    return { status: reason.status, detail: reason.detail };
  }
  return null;
}

export function classifyAdminFailure(reason: unknown): AdminFailure {
  const failure = apiFailure(reason);
  if (failure?.status === 401) {
    return {
      kind: "session",
      message: SESSION_EXPIRED_MESSAGE,
      redirect: true,
      retry: false,
    };
  }
  if (
    failure?.status === 403
    && failure.detail === "CSRF validation failed"
  ) {
    return {
      kind: "csrf",
      message: CSRF_EXPIRED_MESSAGE,
      redirect: false,
      retry: false,
    };
  }
  return {
    kind: "other",
    message: reason instanceof Error ? reason.message : "请求失败",
    redirect: false,
    retry: false,
  };
}
