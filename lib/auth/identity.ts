export function buildAppUserId(provider: string, authSubject: string) {
  return `${provider}:${authSubject}`;
}
