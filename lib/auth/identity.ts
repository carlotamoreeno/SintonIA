export function buildAppUserId(provider: string, authSubject: string) {
  return `${provider}:${authSubject}`;
}

export function parseAppUserId(appUserId: string) {
  const separatorIndex = appUserId.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex === appUserId.length - 1) {
    return null;
  }

  return {
    provider: appUserId.slice(0, separatorIndex),
    authSubject: appUserId.slice(separatorIndex + 1),
  };
}
