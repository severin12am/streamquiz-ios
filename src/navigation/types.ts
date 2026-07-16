export type RootStackParamList = {
  Home: undefined;
  PublicGames: undefined;
  Game: { gameId: string; asHost: boolean; autoJoin?: boolean };
  Paywall: { reason?: 'trial' | 'monthly' } | undefined;
  Debug: { snapshot?: Record<string, unknown> } | undefined;
};
